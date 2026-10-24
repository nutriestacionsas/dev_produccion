from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
import os
import shutil
import tempfile
import re
import logging
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import date, datetime, timedelta
from app.core.database import get_db
from app.models.models import (
    Planificacion, 
    DiaPlanificado, 
    MenuDiarioComponente, 
    PedidoCliente, 
    Receta, 
    RecetaIngrediente,
    Despacho,
    DespachoProducto,
    Usuario,
    Cliente,
    OrdenProduccionDia,
    OrdenProduccionItem,
    OrdenImportacionTemporal,
    Turno,
    TipoMenu
)
from app.schemas.schemas import (
    DiaPlanificadoCreate, 
    PlanificacionResponse, 
    DiaPlanificadoResponse,
    ClienteCreate,
    ClienteUpdate,
    ClienteResponse,
    OrdenProduccionDiaImport,
    OrdenProduccionDiaResponse,
    OrdenManualCreate,
    ClientPctUpdate,
    ClientQtyUpdate,
    ClientMsUpdate,
    OrdenImportacionTemporalResponse,
    TurnoCreate,
    TurnoResponse,
    TipoMenuCreate,
    TipoMenuResponse,
    OrdenProduccionDiaAsignacion,
    QuitarClienteRequest
)
from app.api.deps import get_current_user
from app.services.odoo_client import OdooClient
import openpyxl

logger = logging.getLogger(__name__)

router = APIRouter()
odoo_client = OdooClient()

def sort_items_by_tipo(item):
    order = {
        "SOPA": 1,
        "FUERTE #1": 2,
        "GUARNICION #1": 3,
        "GUARNICION": 3,
        "FUERTE #2": 4,
        "GUARNICION #2": 5,
        "ARROZ": 6,
        "JUGO": 7,
        "JUGO #2": 8,
        "POSTRE": 9,
        "ADICION": 10,
        "MENU SALUDABLE": 11,
        "GUARNICION SALUDABLE": 12,
        "SOPA SALUDABLE": 13
    }
    t = str(item.tipo).strip().upper() if item.tipo else ""
    return order.get(t, 99)


@router.get("/", response_model=List[Dict[str, Any]])
def list_planners(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene la lista de todas las planificaciones del menú.
    """
    planners = db.query(Planificacion).all()
    result = []
    for p in planners:
        result.append({
            "id": p.id,
            "nombre": p.nombre,
            "fecha_inicio": p.fecha_inicio.isoformat(),
            "fecha_fin": p.fecha_fin.isoformat()
        })
    return result

@router.get("/customers", response_model=List[Dict[str, Any]])
def get_customers(current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene la lista de clientes activos de Odoo ERP 19.
    """
    try:
        return odoo_client.get_customers()
    except Exception as e:
        raise HTTPException(
            detail=f"Error al obtener clientes: {str(e)}"
        )


# ----------------- ENDPOINTS DE TURNOS -----------------

@router.get("/turnos", response_model=List[TurnoResponse])
def get_turnos(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene la lista de todos los turnos de trabajo.
    """
    return db.query(Turno).all()

@router.post("/turnos", response_model=TurnoResponse)
def create_turno(turno_data: TurnoCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Crea un nuevo turno de trabajo con su franja horaria.
    """
    existing = db.query(Turno).filter(Turno.nombre == turno_data.nombre).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un turno con este nombre"
        )
    turno = Turno(nombre=turno_data.nombre, franja_horaria=turno_data.franja_horaria)
    db.add(turno)
    db.commit()
    db.refresh(turno)
    return turno

@router.delete("/turnos/{turno_id}", response_model=Dict[str, Any])
def delete_turno(turno_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Elimina un turno de trabajo.
    """
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Turno no encontrado"
        )
    db.delete(turno)
    db.commit()
    return {"status": "success", "message": "Turno de trabajo eliminado exitosamente"}


# ----------------- ENDPOINTS DE TIPOS DE MENU -----------------

@router.get("/tipos-menu", response_model=List[TipoMenuResponse])
def get_tipos_menu(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene la lista de todos los tipos de menú.
    """
    return db.query(TipoMenu).all()

@router.post("/tipos-menu", response_model=TipoMenuResponse)
def create_tipo_menu(tipo_menu_data: TipoMenuCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Crea un nuevo tipo de menú.
    """
    existing = db.query(TipoMenu).filter(TipoMenu.nombre == tipo_menu_data.nombre).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un tipo de menú con este nombre"
        )
    tipo_menu = TipoMenu(nombre=tipo_menu_data.nombre)
    db.add(tipo_menu)
    db.commit()
    db.refresh(tipo_menu)
    return tipo_menu

@router.delete("/tipos-menu/{tipo_menu_id}", response_model=Dict[str, Any])
def delete_tipo_menu(tipo_menu_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Elimina un tipo de menú.
    """
    tipo_menu = db.query(TipoMenu).filter(TipoMenu.id == tipo_menu_id).first()
    if not tipo_menu:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tipo de menú no encontrado"
        )
    db.delete(tipo_menu)
    db.commit()
    return {"status": "success", "message": "Tipo de menú eliminado exitosamente"}


# ----------------- ASIGNACION DE TURNOS/MENU A ORDEN DE FABRICACION -----------------

@router.put("/ordenes-fabricacion/{orden_dia_id}/asignacion", response_model=OrdenProduccionDiaResponse)
def update_orden_dia_asignacion(
    orden_dia_id: int,
    asignacion: OrdenProduccionDiaAsignacion,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Asigna un turno de trabajo y/o un tipo de menú a un día de orden de producción.
    """
    orden_dia = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == orden_dia_id).first()
    if not orden_dia:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orden de producción del día no encontrada"
        )
        
    if asignacion.turno_id is not None:
        turno = db.query(Turno).filter(Turno.id == asignacion.turno_id).first()
        if not turno:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Turno no encontrado"
            )
        orden_dia.turno_id = asignacion.turno_id
    else:
        orden_dia.turno_id = None
        
    if asignacion.tipo_menu_id is not None:
        tipo_menu = db.query(TipoMenu).filter(TipoMenu.id == asignacion.tipo_menu_id).first()
        if not tipo_menu:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tipo de menú no encontrado"
            )
        orden_dia.tipo_menu_id = asignacion.tipo_menu_id
    else:
        orden_dia.tipo_menu_id = None
        
    db.commit()
    db.refresh(orden_dia)
    return orden_dia


# ----------------- ENDPOINTS DE CLIENTES -----------------

@router.get("/clientes", response_model=List[ClienteResponse])
def get_clientes(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene el listado de todos los clientes con su tipificación.
    """
    return db.query(Cliente).all()

@router.post("/clientes", response_model=ClienteResponse)
def create_cliente(data: ClienteCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Crea un nuevo cliente con su tipo.
    """
    existing = db.query(Cliente).filter(Cliente.nombre == data.nombre).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un cliente con este nombre"
        )
    cliente = Cliente(nombre=data.nombre, tipo=data.tipo)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente

@router.put("/clientes/{cliente_id}", response_model=ClienteResponse)
def update_cliente(
    cliente_id: int,
    data: ClienteUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Actualiza la información de un cliente (nombre y/o tipificación).
    """
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado"
        )
    if data.nombre is not None:
        existing = db.query(Cliente).filter(Cliente.nombre == data.nombre, Cliente.id != cliente_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe otro cliente con este nombre"
            )
        cliente.nombre = data.nombre
    if data.tipo is not None:
        cliente.tipo = data.tipo
    db.commit()
    db.refresh(cliente)
    return cliente

@router.delete("/clientes/{cliente_nombre}", response_model=Dict[str, Any])
def delete_cliente_completo(
    cliente_nombre: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Elimina por completo a un cliente del sistema:
    1. Elimina de la tabla Cliente.
    2. Elimina su entrada de cantidades_clientes en todas las órdenes de producción.
    """
    # 1. Eliminar de Cliente
    db.query(Cliente).filter(Cliente.nombre == cliente_nombre).delete(synchronize_session=False)

    # 2. Buscar y actualizar todas las OrdenProduccionItem
    items = db.query(OrdenProduccionItem).all()
    updated_count = 0
    for item in items:
        if item.cantidades_clientes and cliente_nombre in item.cantidades_clientes:
            new_cants = dict(item.cantidades_clientes)
            del new_cants[cliente_nombre]
            item.cantidades_clientes = new_cants
            item.total = sum(c.get("cant", 0) for c in new_cants.values())
            flag_modified(item, "cantidades_clientes")
            updated_count += 1

    db.commit()
    return {
        "status": "success",
        "message": f"Cliente '{cliente_nombre}' eliminado del sistema. Se actualizaron {updated_count} platos."
    }


# ----------------- ENDPOINTS DE ORDENES DE FABRICACION (IMPORTACION) -----------------

@router.post("/ordenes-fabricacion/days/{dia_id}/send-dispatch")
def toggle_send_dispatch(dia_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Alterna el estado de 'enviado_despacho_cliente' para habilitar/deshabilitar la orden en el módulo de Despacho a Cliente.
    """
    orden = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == dia_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de producción no encontrada.")
    
    orden.enviado_despacho_cliente = not orden.enviado_despacho_cliente
    db.commit()
    db.refresh(orden)
    
    return {
        "status": "success",
        "enviado_despacho_cliente": orden.enviado_despacho_cliente,
        "message": "Despacho a cliente habilitado" if orden.enviado_despacho_cliente else "Despacho a cliente deshabilitado"
    }
@router.get("/ordenes-fabricacion", response_model=List[OrdenProduccionDiaResponse])
def get_ordenes_fabricacion(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene todas las órdenes de producción del día importadas, ordenadas por fecha de forma ascendente.
    """
    dias = db.query(OrdenProduccionDia)\
        .options(
            joinedload(OrdenProduccionDia.items),
            joinedload(OrdenProduccionDia.turno),
            joinedload(OrdenProduccionDia.tipo_menu)
        )\
        .order_by(OrdenProduccionDia.fecha.asc())\
        .all()
    
    # Ordenar los ítems por id para mantener el orden original de inserción del Excel
    for dia in dias:
        dia.items.sort(key=lambda x: x.id)

    # Validar ruta_asignada contra Odoo y obtener nombres de productos
    needs_commit = False
    mo_names = [dia.ruta_asignada for dia in dias if dia.ruta_asignada]
    mo_map = {}
    if mo_names:
        try:
            mos = odoo_client.execute('mrp.production', 'search_read', [('name', 'in', mo_names), ('state', '!=', 'cancel')], ['name', 'product_id'])
            for mo in mos:
                mo_map[mo['name']] = mo['product_id'][1] if mo.get('product_id') else ''
        except Exception as e_val:
            logger.warning(f"No se pudo validar MOs en Odoo: {e_val}")

    for dia in dias:
        if dia.ruta_asignada:
            if dia.ruta_asignada not in mo_map:
                logger.info(f"MO '{dia.ruta_asignada}' ya no existe en Odoo. Limpiando ruta_asignada del día {dia.id}.")
                dia.ruta_asignada = None
                needs_commit = True
            else:
                dia.odoo_product_name = mo_map.get(dia.ruta_asignada, '')

    if needs_commit:
        try:
            db.commit()
        except Exception:
            db.rollback()

    return dias

@router.post("/ordenes-fabricacion/importar", response_model=Dict[str, Any])
def importar_ordenes_fabricacion(
    import_data: List[OrdenProduccionDiaImport],
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Importa las órdenes de producción desde el archivo xlsx procesado por el frontend.
    Guarda todos los registros asociados al sector por defecto 'Almuerzo Tipo 1'.
    Sobrescribe si la fecha ya existe para ese sector.
    """
    # 1. Asegurar Tipo de Menú por defecto
    default_menu = db.query(TipoMenu).filter(TipoMenu.nombre == "Almuerzo Tipo 1").first()
    if not default_menu:
        default_menu = TipoMenu(nombre="Almuerzo Tipo 1")
        db.add(default_menu)
        db.commit()
        db.refresh(default_menu)

    try:
        fechas_importadas = []
        for day in import_data:
            # Eliminar existente para esa fecha en el tipo de menú por defecto
            db.query(OrdenProduccionDia).filter(
                OrdenProduccionDia.fecha == day.fecha,
                OrdenProduccionDia.tipo_menu_id == default_menu.id
            ).delete()

            # Crear nuevo registro del día
            db_dia = OrdenProduccionDia(fecha=day.fecha, tipo_menu_id=default_menu.id)
            db.add(db_dia)
            db.commit()
            db.refresh(db_dia)

            # Insertar ítems
            for item in day.items:
                # Asegurar que todos los clientes en cantidades_clientes existan en la tabla clientes
                for c_name in item.cantidades_clientes.keys():
                    if c_name not in ("TOTAL", "CANT TOTAL"):
                        cliente_existente = db.query(Cliente).filter(Cliente.nombre == c_name).first()
                        if not cliente_existente:
                            # Auto-detectar si tiene algún porcentaje mayor a 0 en toda la importación
                            is_pct = False
                            for d_temp in import_data:
                                for it_temp in d_temp.items:
                                    c_info = it_temp.cantidades_clientes.get(c_name)
                                    if c_info and float(c_info.get("pct", 0.0)) > 0.0:
                                        is_pct = True
                                        break
                                if is_pct:
                                    break
                            
                            new_tipo = "porcentaje" if is_pct else "cantidad"
                            cliente_existente = Cliente(nombre=c_name, tipo=new_tipo)
                            db.add(cliente_existente)
                            db.flush()

                db_item = OrdenProduccionItem(
                    orden_dia_id=db_dia.id,
                    plato_nombre=item.plato_nombre,
                    tipo=item.tipo,
                    cantidades_clientes=item.cantidades_clientes,
                    total=item.total
                )
                db.add(db_item)
            
            fechas_importadas.append(day.fecha.isoformat())

        db.commit()
        return {
            "status": "success",
            "message": f"Se importaron con éxito las órdenes para {len(fechas_importadas)} fechas.",
            "fechas": fechas_importadas
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error durante la importación de órdenes: {str(e)}"
        )


def parse_spanish_date(date_str) -> date:
    if not date_str:
        return None
    
    # If openpyxl parsed it directly as a datetime or date object
    if isinstance(date_str, (date, datetime)):
        return date_str if isinstance(date_str, date) else date_str.date()
        
    date_str_s = str(date_str).strip()
    
    # Clean FECHA: if it is there
    clean = re.sub(r'(?i)FECHA:\s*', '', date_str_s)
    
    # Check if format is YYYY-MM-DD
    try:
        if re.match(r'^\d{4}-\d{2}-\d{2}', clean):
            return datetime.strptime(clean[:10], "%Y-%m-%d").date()
    except Exception:
        pass
        
    # Check if format is DD/MM/YYYY
    try:
        match_slash = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', clean)
        if match_slash:
            return date(int(match_slash.group(3)), int(match_slash.group(2)), int(match_slash.group(1)))
    except Exception:
        pass

    # Clean days of week
    clean = re.sub(r'(?i)LUNES|MARTES|MIERCOLES|MIÉRCOLES|JUEVES|VIERNES|SABADO|SÁBADO|DOMINGO', '', clean)
    clean = clean.replace(',', '').strip()
    
    parts = clean.split()
    months = {
        "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
        "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12
    }
    
    day, month, year = None, None, None
    if len(parts) >= 5:
        try:
            day = int(parts[0])
            month = months.get(parts[2].lower())
            year = int(parts[4])
        except (ValueError, IndexError):
            pass
    else:
        match = re.search(r'(\d+)\s+de\s+([a-zA-ZáéíóúÁÉÍÓÚ]+)\s+de\s+(\d+)', clean, re.IGNORECASE)
        if match:
            try:
                day = int(match.group(1))
                month = months.get(match.group(2).lower())
                year = int(match.group(3))
            except ValueError:
                pass
            
    if day and month and year:
        try:
            return date(year, month, day)
        except ValueError:
            return None
    return None


def parse_excel_file(file_path: str):
    from openpyxl import load_workbook
    wb = load_workbook(file_path, data_only=True)
    ws = wb.active
    
    rows = []
    for row in ws.iter_rows(values_only=True):
        rows.append(list(row))
        
    imported_days = []
    current_day = None
    
    i = 0
    while i < len(rows):
        row = rows[i]
        if not row or all(cell is None or str(cell).strip() == '' for cell in row):
            i += 1
            continue
            
        first_cell = str(row[0]).strip() if row[0] is not None else ''
        upper = first_cell.upper()
        
        # 1. Detect Date Row
        parsed_date = parse_spanish_date(row[0]) if row[0] is not None else None
        if parsed_date:
            if current_day:
                imported_days.append(current_day)
            current_day = {
                "fecha": parsed_date,
                "items": []
            }
            i += 1
            continue
            
        # 2. Detect menu items row if inside a date block
        if current_day:
            if first_cell and ("PLATO" in upper or "MENU" in upper or "MENÚ" in upper):
                # Detect subheaders
                row_has_subheaders = any(
                    str(cell).strip().upper() in ('%', 'CANT', 'CANT.') 
                    for cell in row[2:] if cell is not None
                )
                
                if row_has_subheaders:
                    subheaders_row = row
                    # Find client row above
                    clients_row = None
                    for r in range(i - 1, -1, -1):
                        test_row = rows[r]
                        if test_row and any(
                            cell is not None and str(cell).strip() != '' and str(cell).strip() != '%' and str(cell).strip().upper() != 'CANT'
                            for cell in test_row[2:]
                        ):
                            clients_row = test_row
                            break
                else:
                    clients_row = row
                    subheaders_row = rows[i + 1] if i + 1 < len(rows) else []
                    i += 1 # skip next row
                    
                current_day["clients"] = []
                last_client_name = ''
                
                # Find start column
                tipo_index = -1
                for idx, h in enumerate(subheaders_row):
                    if h is not None and str(h).strip().upper() == 'TIPO':
                        tipo_index = idx
                        break
                start_col = tipo_index + 1 if tipo_index != -1 else 2
                
                for c in range(start_col, len(subheaders_row)):
                    header_val = str(subheaders_row[c]).strip().upper().replace('.', '') if subheaders_row[c] is not None else ''
                    client_val = str(clients_row[c]).strip() if (clients_row and c < len(clients_row) and clients_row[c] is not None) else ''
                    
                    if client_val and client_val != '%' and client_val.upper() not in ('CANT', 'TOTAL', 'VALOR'):
                        last_client_name = client_val
                        
                    if header_val == 'CANT' and last_client_name:
                        current_day["clients"].append({
                            "name": last_client_name,
                            "col_pct": c - 1,
                            "col_cant": c
                        })
                        
                total_col = -1
                for idx, h in enumerate(subheaders_row):
                    if h is not None and str(h).strip().upper().replace('.', '') == 'TOTAL':
                        total_col = idx
                        break
                if total_col == -1 and clients_row:
                    for idx, h in enumerate(clients_row):
                        if h is not None and str(h).strip().upper().replace('.', '') == 'TOTAL':
                            total_col = idx
                            break
                current_day["total_col_index"] = total_col
                i += 1
                continue
                
            # Read recipe entries
            if "clients" in current_day and len(current_day["clients"]) > 0:
                tipo_val = str(row[1]).strip() if len(row) > 1 and row[1] is not None else ''
                
                if not first_cell or first_cell == '-' or "SOLICITUD TOTAL" in upper or upper == 'TOTAL' or not tipo_val:
                    i += 1
                    continue
                    
                cantidades_clientes = {}
                for client in current_day["clients"]:
                    raw_pct = row[client["col_pct"]] if client["col_pct"] < len(row) else None
                    raw_cant = row[client["col_cant"]] if client["col_cant"] < len(row) else None
                    
                    pct = 0.0
                    if raw_pct is not None:
                        pct_str = str(raw_pct).strip()
                        if pct_str.endswith('%'):
                            try:
                                pct = float(pct_str.rstrip('%')) / 100.0
                            except ValueError:
                                pct = 0.0
                        else:
                            try:
                                parsed = float(pct_str)
                                pct = parsed / 100.0 if parsed > 1 else parsed
                            except ValueError:
                                pct = 0.0
                                
                    try:
                        cant = int(round(float(raw_cant))) if raw_cant is not None else 0
                    except (ValueError, TypeError):
                        cant = 0
                        
                    cantidades_clientes[client["name"]] = {"pct": pct, "cant": cant}
                    
                total_qty = 0
                if current_day.get("total_col_index", -1) != -1 and current_day["total_col_index"] < len(row) and row[current_day["total_col_index"]] is not None:
                    try:
                        total_qty = int(row[current_day["total_col_index"]])
                    except (ValueError, TypeError):
                        total_qty = sum(c["cant"] for c in cantidades_clientes.values())
                else:
                    total_qty = sum(c["cant"] for c in cantidades_clientes.values())
                    
                current_day["items"].append({
                    "plato_nombre": first_cell,
                    "tipo": tipo_val,
                    "cantidades_clientes": cantidades_clientes,
                    "total": total_qty
                })
        i += 1
        
    if current_day:
        imported_days.append(current_day)
        
    return imported_days


@router.post("/ordenes-fabricacion/cargar-excel", response_model=Dict[str, Any])
def cargar_excel_importacion(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Sube el archivo Excel temporalmente, extrae los datos y los guarda reservados
    en la tabla OrdenImportacionTemporal. Luego elimina el archivo físico.
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de archivo no soportado. Debe ser .xlsx o .xls"
        )
        
    fd, temp_file_path = tempfile.mkstemp(suffix=".xlsx")
    try:
        with os.fdopen(fd, 'wb') as tmp:
            shutil.copyfileobj(file.file, tmp)
            
        days_data = parse_excel_file(temp_file_path)
        if not days_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se encontraron datos válidos de producción en el archivo Excel."
            )
            
        # Permite subir el archivo Excel sin validaciones previas de fecha en el cargue
        # para que el usuario pueda asignar turnos y resolver duplicados en el preview modal.

        db.query(OrdenImportacionTemporal).delete()
        
        for day in days_data:
            for item in day["items"]:
                db_item = OrdenImportacionTemporal(
                    fecha=day["fecha"],
                    plato_nombre=item["plato_nombre"],
                    tipo=item["tipo"],
                    cantidades_clientes=item["cantidades_clientes"],
                    total=item["total"]
                )
                db.add(db_item)
                
        db.commit()
        
        return {
            "status": "success",
            "message": f"Se extrajeron y reservaron exitosamente {len(days_data)} fechas en la base de datos.",
            "fechas": [day["fecha"].isoformat() for day in days_data]
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar el archivo Excel: {str(e)}"
        )
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass


@router.post("/ordenes-fabricacion/cargar-cliente-excel", response_model=Dict[str, Any])
def cargar_cliente_excel(
    turno_id: int = Form(...),
    menu_tipo_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Sube un archivo Excel para un "Nuevo Cliente".
    Valida que las fechas ya existan en la BD para el turno y menú dados.
    Añade las cantidades de los clientes nuevos a las órdenes existentes.
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de archivo no soportado. Debe ser .xlsx o .xls"
        )
        
    fd, temp_file_path = tempfile.mkstemp(suffix=".xlsx")
    try:
        with os.fdopen(fd, 'wb') as tmp:
            shutil.copyfileobj(file.file, tmp)
            
        days_data = parse_excel_file(temp_file_path)
        if not days_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se encontraron datos válidos de producción en el archivo Excel."
            )
            
        excel_fechas = [day["fecha"] for day in days_data]
        
        # Validar que todas las fechas existan en la BD
        existing_days = db.query(OrdenProduccionDia).filter(
            OrdenProduccionDia.fecha.in_(excel_fechas),
            OrdenProduccionDia.turno_id == turno_id,
            OrdenProduccionDia.tipo_menu_id == menu_tipo_id
        ).all()
        
        existing_fechas_set = {d.fecha for d in existing_days}
        missing_fechas = [f.strftime("%Y-%m-%d") for f in excel_fechas if f not in existing_fechas_set]
        
        if missing_fechas:
            missing_str = ", ".join(missing_fechas)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Las siguientes fechas del Excel no existen en la planificación actual: {missing_str}. Solo se permite añadir clientes a fechas existentes."
            )
            
        # Extraer clientes únicos del excel y registrarlos si no existen
        clientes_nuevos_names = set()
        for day in days_data:
            for item in day["items"]:
                if "cantidades_clientes" in item:
                    for c_name in item["cantidades_clientes"].keys():
                        clientes_nuevos_names.add(c_name)
                    
        for c_name in clientes_nuevos_names:
            existing_cliente = db.query(Cliente).filter(Cliente.nombre == c_name).first()
            if not existing_cliente:
                # Modificado a petición del usuario: se asume "porcentaje" para que el parámetro "Total"
                # sea calculado desde SOPA (que es el fallback cuando no se envían % en Excel).
                nuevo_cliente = Cliente(nombre=c_name, tipo="porcentaje") 
                db.add(nuevo_cliente)
                
        db.commit() # Asegurar que los clientes existan

        platos_actualizados = 0
        
        # Actualizar las cantidades en los items
        for day_data in days_data:
            db_day = next(d for d in existing_days if d.fecha == day_data["fecha"])
            
            for excel_item in day_data["items"]:
                if "cantidades_clientes" not in excel_item or not excel_item["cantidades_clientes"]:
                    continue
                    
                # Buscar el item en la base de datos
                db_item = db.query(OrdenProduccionItem).filter(
                    OrdenProduccionItem.orden_dia_id == db_day.id,
                    OrdenProduccionItem.plato_nombre == excel_item["plato_nombre"],
                    OrdenProduccionItem.tipo == excel_item["tipo"]
                ).first()
                
                if db_item:
                    current_cants = dict(db_item.cantidades_clientes) if db_item.cantidades_clientes else {}
                    for c_name, qty in excel_item["cantidades_clientes"].items():
                        current_cants[c_name] = qty
                        
                    db_item.cantidades_clientes = current_cants
                    
                    # Fix TypeError by extracting "cant" from the dict
                    new_total = 0
                    for v in current_cants.values():
                        if isinstance(v, dict):
                            new_total += int(v.get("cant", 0))
                        else:
                            new_total += int(v)
                            
                    db_item.total = new_total
                    flag_modified(db_item, "cantidades_clientes")
                    platos_actualizados += 1
                    
        db.commit()
        
        # Recalcular el total_raciones de cada dia
        for db_day in existing_days:
            db.refresh(db_day)
            total_dia = sum(item.total for item in db_day.items)
            db_day.total_raciones = total_dia
            
        db.commit()
        
        return {
            "status": "success",
            "message": f"Nuevos datos de cliente añadidos exitosamente. Se actualizaron {platos_actualizados} platos y se guardaron {len(clientes_nuevos_names)} clientes."
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar el archivo Excel del nuevo cliente: {str(e)}"
        )
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass


@router.get("/ordenes-fabricacion/importacion-temporal", response_model=List[OrdenImportacionTemporalResponse])
def obtener_importacion_temporal(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna el listado de registros reservados temporalmente en la base de datos.
    """
    items = db.query(OrdenImportacionTemporal).order_by(OrdenImportacionTemporal.fecha, OrdenImportacionTemporal.id).all()
    return items


from pydantic import BaseModel

class ConfirmarImportacionPayload(BaseModel):
    asignaciones: Dict[str, Dict[str, Any]] = {}


@router.post("/ordenes-fabricacion/confirmar-importacion", response_model=Dict[str, Any])
def confirmar_importacion_ordenes(
    payload: ConfirmarImportacionPayload = ConfirmarImportacionPayload(asignaciones={}),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Pasa las órdenes reservadas de la tabla OrdenImportacionTemporal a la planificación real.
    """
    temp_items = db.query(OrdenImportacionTemporal).order_by(OrdenImportacionTemporal.fecha, OrdenImportacionTemporal.id).all()
    if not temp_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay datos de importación reservados para confirmar."
        )
        
    default_menu = db.query(TipoMenu).filter(TipoMenu.nombre == "Almuerzo Tipo 1").first()
    if not default_menu:
        default_menu = TipoMenu(nombre="Almuerzo Tipo 1")
        db.add(default_menu)
        db.commit()
        db.refresh(default_menu)
        
    grouped = {}
    for item in temp_items:
        if item.fecha not in grouped:
            grouped[item.fecha] = []
        grouped[item.fecha].append(item)
        
    try:
        fechas_importadas = []
        for fecha, items_list in grouped.items():
            fecha_str = fecha.isoformat()
            turno_id = None
            tipo_menu_id = default_menu.id
            if payload.asignaciones and fecha_str in payload.asignaciones:
                day_asg = payload.asignaciones[fecha_str]
                if day_asg.get("turno_id"):
                    turno_id = int(day_asg["turno_id"])
                if day_asg.get("tipo_menu_id"):
                    tipo_menu_id = int(day_asg["tipo_menu_id"])

            # Verificar si ya existe esta fecha con este turno en la base de datos activa
            existing = db.query(OrdenProduccionDia).filter(
                OrdenProduccionDia.fecha == fecha,
                OrdenProduccionDia.turno_id == turno_id
            ).first()
            if existing:
                turno_desc = f"'{existing.turno.nombre}'" if existing.turno else "Sin asignar"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"La fecha {fecha_str} ya tiene asignado el turno {turno_desc} en el sistema. Confirmación rechazada para evitar duplicados."
                )
            
            db_dia = OrdenProduccionDia(
                fecha=fecha, 
                turno_id=turno_id,
                tipo_menu_id=tipo_menu_id
            )
            db.add(db_dia)
            db.flush()
            
            for item in items_list:
                for c_name in item.cantidades_clientes.keys():
                    if c_name not in ("TOTAL", "CANT TOTAL"):
                        cliente_existente = db.query(Cliente).filter(Cliente.nombre == c_name).first()
                        if not cliente_existente:
                            is_pct = False
                            for temp_it in temp_items:
                                c_info = temp_it.cantidades_clientes.get(c_name)
                                if c_info and float(c_info.get("pct", 0.0)) > 0.0:
                                    is_pct = True
                                    break
                                    
                            new_tipo = "porcentaje" if is_pct else "cantidad"
                            cliente_existente = Cliente(nombre=c_name, tipo=new_tipo)
                            db.add(cliente_existente)
                            db.flush()
                            
                db_item = OrdenProduccionItem(
                    orden_dia_id=db_dia.id,
                    plato_nombre=item.plato_nombre,
                    tipo=item.tipo,
                    cantidades_clientes=item.cantidades_clientes,
                    total=item.total
                )
                db.add(db_item)
                
            fechas_importadas.append(fecha.isoformat())
            
        db.query(OrdenImportacionTemporal).delete()
        db.commit()
        
        return {
            "status": "success",
            "message": f"Se importaron con éxito las órdenes para {len(fechas_importadas)} fechas.",
            "fechas": fechas_importadas
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error durante la confirmación de importación: {str(e)}"
        )


@router.delete("/ordenes-fabricacion/descartar-importacion", response_model=Dict[str, Any])
def descartar_importacion_temporal(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Limpia (descarta) la tabla de importación temporal de la base de datos.
    """
    try:
        deleted_count = db.query(OrdenImportacionTemporal).delete()
        db.commit()
        return {
            "status": "success",
            "message": f"Se descartaron y eliminaron {deleted_count} registros temporales reservados."
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al descartar la importación: {str(e)}"
        )


@router.post("/ordenes-fabricacion/manual", response_model=Dict[str, Any])
def crear_orden_manual(
    data: OrdenManualCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Crea manualmente una orden de producción para una fecha específica,
    asignándole un turno, tipo de menú, cliente, plato principal y sus acompañamientos.
    """
    # 1. Asegurar Turno
    turno_nombre = data.turno_nombre.strip()
    if not turno_nombre or turno_nombre.lower() == "sin asignar":
        turno = None
    else:
        turno = db.query(Turno).filter(Turno.nombre == turno_nombre).first()
        if not turno:
            turno = Turno(nombre=turno_nombre, franja_horaria="12:00 - 13:00")
            db.add(turno)
            db.flush()
            db.refresh(turno)

    # 2. Asegurar Tipo de Menú
    tipo_menu_nombre = data.tipo_menu_nombre.strip()
    if not tipo_menu_nombre:
        tipo_menu_nombre = "Almuerzo Tipo 1"
        
    if "manual" not in tipo_menu_nombre.lower():
        tipo_menu_nombre = f"{tipo_menu_nombre} (Manual)"
        
    tipo_menu = db.query(TipoMenu).filter(TipoMenu.nombre == tipo_menu_nombre).first()
    if not tipo_menu:
        tipo_menu = TipoMenu(nombre=tipo_menu_nombre)
        db.add(tipo_menu)
        db.flush()
        db.refresh(tipo_menu)

    # 3. Asegurar Cliente
    cliente_existente = db.query(Cliente).filter(Cliente.nombre == data.cliente_nombre).first()
    if not cliente_existente:
        new_tipo = data.cliente_tipo or "porcentaje"
        cliente_existente = Cliente(nombre=data.cliente_nombre, tipo=new_tipo)
        db.add(cliente_existente)
        db.flush()

    # 4. Asegurar OrdenProduccionDia
    dia = db.query(OrdenProduccionDia).filter(
        OrdenProduccionDia.fecha == data.fecha,
        OrdenProduccionDia.turno_id == (turno.id if turno else None),
        OrdenProduccionDia.tipo_menu_id == tipo_menu.id
    ).first()

    if not dia:
        dia = OrdenProduccionDia(fecha=data.fecha, turno_id=(turno.id if turno else None), tipo_menu_id=tipo_menu.id)
        db.add(dia)
        db.flush()
        db.refresh(dia)

    # 5. Plato principal
    item = db.query(OrdenProduccionItem).filter(
        OrdenProduccionItem.orden_dia_id == dia.id,
        OrdenProduccionItem.plato_nombre == data.plato_nombre
    ).first()

    if item:
        new_cantidades = dict(item.cantidades_clientes)
        current_cant = new_cantidades.get(cliente_existente.nombre, {}).get("cant", 0)
        new_cantidades[cliente_existente.nombre] = {"pct": 0.0, "cant": current_cant + data.cantidad}
        new_cantidades["__manual_qty__"] = True
        item.cantidades_clientes = new_cantidades
        item.total = sum(c.get("cant", 0) for k, c in new_cantidades.items() if k != "__manual_qty__")
        flag_modified(item, "cantidades_clientes")
    else:
        item = OrdenProduccionItem(
            orden_dia_id=dia.id,
            plato_nombre=data.plato_nombre,
            tipo=data.tipo,
            cantidades_clientes={
                cliente_existente.nombre: {"pct": 0.0, "cant": data.cantidad},
                "__manual_qty__": True
            },
            total=data.cantidad
        )
        db.add(item)
        db.flush()

    # 6. Acompañamientos existentes
    if data.acompanamientos_existentes:
        for plato_acomp in data.acompanamientos_existentes:
            acomp_item = db.query(OrdenProduccionItem).filter(
                OrdenProduccionItem.orden_dia_id == dia.id,
                OrdenProduccionItem.plato_nombre == plato_acomp
            ).first()
            if acomp_item:
                new_cantidades = dict(acomp_item.cantidades_clientes)
                current_cant = new_cantidades.get(cliente_existente.nombre, {}).get("cant", 0)
                new_cantidades[cliente_existente.nombre] = {"pct": 0.0, "cant": current_cant + data.cantidad}
                new_cantidades["__manual_qty__"] = True
                acomp_item.cantidades_clientes = new_cantidades
                acomp_item.total = sum(c.get("cant", 0) for k, c in new_cantidades.items() if k != "__manual_qty__")
                flag_modified(acomp_item, "cantidades_clientes")

    # 7. Platos adicionales / Acompañamientos extras
    platos_extras = []
    if data.acompanamiento_extra_nombre and data.acompanamiento_extra_tipo:
        platos_extras.append({
            "plato_nombre": data.acompanamiento_extra_nombre,
            "tipo": data.acompanamiento_extra_tipo
        })
    if data.platos_adicionales:
        for p in data.platos_adicionales:
            platos_extras.append({
                "plato_nombre": p.plato_nombre,
                "tipo": p.tipo
            })

    for p_extra in platos_extras:
        extra_name = p_extra["plato_nombre"]
        extra_tipo = p_extra["tipo"]
        if not extra_name or not extra_tipo:
            continue
            
        extra_item = db.query(OrdenProduccionItem).filter(
            OrdenProduccionItem.orden_dia_id == dia.id,
            OrdenProduccionItem.plato_nombre == extra_name
        ).first()
        if extra_item:
            new_cantidades = dict(extra_item.cantidades_clientes)
            current_cant = new_cantidades.get(cliente_existente.nombre, {}).get("cant", 0)
            new_cantidades[cliente_existente.nombre] = {"pct": 0.0, "cant": current_cant + data.cantidad}
            new_cantidades["__manual_qty__"] = True
            extra_item.cantidades_clientes = new_cantidades
            extra_item.total = sum(c.get("cant", 0) for k, c in new_cantidades.items() if k != "__manual_qty__")
            flag_modified(extra_item, "cantidades_clientes")
        else:
            extra_item = OrdenProduccionItem(
                orden_dia_id=dia.id,
                plato_nombre=extra_name,
                tipo=extra_tipo,
                cantidades_clientes={
                    cliente_existente.nombre: {"pct": 0.0, "cant": data.cantidad},
                    "__manual_qty__": True
                },
                total=data.cantidad
            )
            db.add(extra_item)
            db.flush()

    db.commit()
    return {"status": "success", "message": "Orden manual procesada exitosamente."}


class UpdatePlateQuantitySchema(BaseModel):
    cantidad: int

@router.delete("/ordenes-fabricacion/{dia_id}/clientes/{cliente_nombre}/platos/{plato_nombre}")
def delete_client_plate(
    dia_id: int,
    cliente_nombre: str,
    plato_nombre: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    dia = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == dia_id).first()
    if not dia:
        raise HTTPException(status_code=404, detail="Día de producción no encontrado.")
        
    item = db.query(OrdenProduccionItem).filter(
        OrdenProduccionItem.orden_dia_id == dia_id,
        OrdenProduccionItem.plato_nombre == plato_nombre
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Plato no encontrado en este día.")

    tipo_upper = (item.tipo or "").strip().upper().replace("Ó", "O")
    es_fuerte = tipo_upper in ("FUERTE #1", "FUERTE #2", "MENU SALUDABLE", "MENÚ SALUDABLE")

    if es_fuerte:
        # If Fuerte/Principal is deleted, delete ALL plates for this client on this day
        all_items = db.query(OrdenProduccionItem).filter(OrdenProduccionItem.orden_dia_id == dia_id).all()
        for it in all_items:
            new_c = dict(it.cantidades_clientes)
            if cliente_nombre in new_c:
                del new_c[cliente_nombre]
                it.cantidades_clientes = new_c
                it.total = sum(c.get("cant", 0) for c in new_c.values())
                flag_modified(it, "cantidades_clientes")
                if not new_c:
                    db.delete(it)
    else:
        # Just delete this specific plate
        new_c = dict(item.cantidades_clientes)
        if cliente_nombre in new_c:
            del new_c[cliente_nombre]
            item.cantidades_clientes = new_c
            item.total = sum(c.get("cant", 0) for c in new_c.values())
            flag_modified(item, "cantidades_clientes")
            if not new_c:
                db.delete(item)
                
    db.commit()
    return {"status": "success", "message": "Plato eliminado exitosamente."}

@router.delete("/ordenes-fabricacion/vaciar-planificacion", response_model=Dict[str, Any])
def vaciar_planificacion(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Elimina toda la planificación de producción y de importación temporal registrada localmente.
    """
    try:
        db.query(OrdenProduccionItem).delete()
        db.query(OrdenProduccionDia).delete()
        db.query(OrdenImportacionTemporal).delete()
        db.commit()
        return {"status": "success", "message": "Se ha vaciado toda la planificación de producción."}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al vaciar la planificación: {str(e)}"
        )

@router.delete("/ordenes-fabricacion/{dia_id}", response_model=Dict[str, Any])
def delete_production_day(
    dia_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    dia = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == dia_id).first()
    if not dia:
        raise HTTPException(status_code=404, detail="Día de producción no encontrado.")
        
    db.delete(dia)
    db.commit()
    return {"status": "success", "message": "Planificación del día eliminada exitosamente."}

@router.delete("/ordenes-fabricacion/items/{item_id}", response_model=Dict[str, Any])
def delete_production_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    item = db.query(OrdenProduccionItem).filter(OrdenProduccionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
        
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "Plato de la planificación eliminado exitosamente."}
from pydantic import BaseModel

class UpdateItemPlateSchema(BaseModel):
    plato_nombre: str

@router.put("/ordenes-fabricacion/items/{item_id}", response_model=Dict[str, Any])
def update_item_plate(
    item_id: int,
    data: UpdateItemPlateSchema,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    item = db.query(OrdenProduccionItem).filter(OrdenProduccionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
        
    recipe = db.query(Receta).filter(Receta.nombre == data.plato_nombre).first()
    if not recipe:
        raise HTTPException(status_code=404, detail=f"La receta '{data.plato_nombre}' no existe en el catálogo.")
        
    item.plato_nombre = data.plato_nombre
    db.commit()
    db.refresh(item)
    return {"status": "success", "message": "Plato de la planificación actualizado correctamente."}
class AddClientToDaySchema(BaseModel):
    cliente_nombre: str

@router.post("/ordenes-fabricacion/days/{dia_id}/clients", response_model=Dict[str, Any])
def add_client_to_day(
    dia_id: int,
    data: AddClientToDaySchema,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    dia = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == dia_id).first()
    if not dia:
        raise HTTPException(status_code=404, detail="Día de producción no encontrado.")
        
    cliente = db.query(Cliente).filter(Cliente.nombre == data.cliente_nombre).first()
    if not cliente:
        raise HTTPException(status_code=404, detail=f"El cliente '{data.cliente_nombre}' no existe.")
        
    # Check if client already exists in this day's items
    first_item = dia.items[0] if dia.items else None
    if first_item and data.cliente_nombre in first_item.cantidades_clientes:
        pass
    else:
        # Initialize keys on all items
        for item in dia.items:
            new_cantidades = dict(item.cantidades_clientes)
            new_cantidades[data.cliente_nombre] = {"pct": 0.0, "cant": 0}
            item.cantidades_clientes = new_cantidades
            flag_modified(item, "cantidades_clientes")
            
    # Apply default parameters using recalculate_client_quantities
    if cliente.tipo == "porcentaje":
        recalculate_client_quantities(
            db=db,
            items=dia.items,
            cliente_nombre=data.cliente_nombre,
            cliente_tipo="porcentaje",
            new_f1=0.5,
            new_f2=0.5,
            new_ms=0,
            new_total=10, # default total
            new_jugo2=0
        )
    else:
        recalculate_client_quantities(
            db=db,
            items=dia.items,
            cliente_nombre=data.cliente_nombre,
            cliente_tipo="cantidad",
            new_f1=10, # default F1
            new_f2=0,
            new_ms=0,
            new_total=None,
            new_jugo2=0
        )
        
    db.commit()
    return {"status": "success", "message": f"Cliente '{data.cliente_nombre}' agregado a la planificación."}
class AddManualItemSchema(BaseModel):
    plato_nombre: str
    tipo: str

@router.post("/ordenes-fabricacion/days/{dia_id}/items", response_model=Dict[str, Any])
def add_manual_item_to_day(
    dia_id: int,
    data: AddManualItemSchema,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    dia = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == dia_id).first()
    if not dia:
        raise HTTPException(status_code=404, detail="Día de producción no encontrado.")
        
    recipe = db.query(Receta).filter(Receta.nombre == data.plato_nombre).first()
    if not recipe:
        raise HTTPException(status_code=404, detail=f"La receta '{data.plato_nombre}' no existe en el catálogo.")
        
    # Gather all existing clients in this day's planning
    existing_clients = set()
    for item in dia.items:
        for c_name in item.cantidades_clientes.keys():
            if c_name != "__manual_qty__":
                existing_clients.add(c_name)
                
    # Initialize cantidades_clientes with manual flag and 0 quantities for all clients
    c_dict = {"__manual_qty__": True}
    for c_name in existing_clients:
        c_dict[c_name] = {"pct": 0.0, "cant": 0}
        
    new_item = OrdenProduccionItem(
        orden_dia_id=dia_id,
        plato_nombre=data.plato_nombre,
        tipo=data.tipo.strip().upper(),
        cantidades_clientes=c_dict,
        total=0
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return {"status": "success", "message": f"Plato '{data.plato_nombre}' agregado a la planificación."}
class UpdateManualQuantitiesSchema(BaseModel):
    cliente_nombre: str
    quantities: Dict[int, int]

@router.post("/ordenes-fabricacion/items/update-manual-quantities", response_model=Dict[str, Any])
def update_manual_quantities(
    data: UpdateManualQuantitiesSchema,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    for item_id, qty in data.quantities.items():
        item = db.query(OrdenProduccionItem).filter(OrdenProduccionItem.id == item_id).first()
        if item:
            new_cantidades = dict(item.cantidades_clientes)
            if data.cliente_nombre not in new_cantidades:
                new_cantidades[data.cliente_nombre] = {"pct": 0.0, "cant": 0}
            new_cantidades[data.cliente_nombre]["cant"] = qty
            item.cantidades_clientes = new_cantidades
            item.total = sum(c.get("cant", 0) for c in new_cantidades.values() if isinstance(c, dict))
            flag_modified(item, "cantidades_clientes")
            
    db.commit()
    return {"status": "success", "message": "Cantidades manuales actualizadas correctamente."}

class UpdateMathQtySchema(BaseModel):
    item_id: int
    cliente_nombre: str
    new_cant: int
    reset: Optional[bool] = False
    operation: Optional[str] = None
    operation_value: Optional[float] = None
    apply_to_future: Optional[bool] = False
    dia_id: Optional[int] = None

def _apply_math_op(cant: int, op: str, val: float) -> int:
    if op == '+':
        res = cant + val
    elif op == '-':
        res = cant - val
    elif op == '*':
        res = cant * val
    elif op == '/':
        res = cant / val if val != 0 else cant
    else:
        res = cant
    res = round(res)
    return max(0, res)

@router.post("/ordenes-fabricacion/items/update-math-qty", response_model=Dict[str, Any])
def update_math_qty(
    data: UpdateMathQtySchema,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    item = db.query(OrdenProduccionItem).filter(OrdenProduccionItem.id == data.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
        
    def _update_item_cant(it, client_name, is_reset, new_val=None, op=None, op_val=None):
        new_cantidades = dict(it.cantidades_clientes)
        if client_name not in new_cantidades:
            new_cantidades[client_name] = {"pct": 0.0, "cant": 0}

        if is_reset:
            if "base_cant" in new_cantidades[client_name]:
                new_cantidades[client_name]["cant"] = new_cantidades[client_name]["base_cant"]
                del new_cantidades[client_name]["base_cant"]
        else:
            if "base_cant" not in new_cantidades[client_name]:
                new_cantidades[client_name]["base_cant"] = new_cantidades[client_name].get("cant", 0)
            
            if new_val is None and op and op_val is not None:
                # Calculate from base_cant or current cant
                current = new_cantidades[client_name].get("cant", 0)
                new_cantidades[client_name]["cant"] = _apply_math_op(current, op, op_val)
            elif new_val is not None:
                new_cantidades[client_name]["cant"] = new_val
        
        it.cantidades_clientes = new_cantidades
        it.total = sum(c.get("cant", 0) for c in new_cantidades.values() if isinstance(c, dict))
        flag_modified(it, "cantidades_clientes")
        return it

    # Update current item
    _update_item_cant(item, data.cliente_nombre, data.reset, data.new_cant)

    # Apply to future items if requested
    if data.apply_to_future and data.dia_id:
        current_dia = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == data.dia_id).first()
        if current_dia:
            future_days = db.query(OrdenProduccionDia).filter(
                OrdenProduccionDia.fecha > current_dia.fecha,
                OrdenProduccionDia.turno_id == current_dia.turno_id,
                OrdenProduccionDia.tipo_menu_id == current_dia.tipo_menu_id
            ).all()
            
            for f_dia in future_days:
                f_item = db.query(OrdenProduccionItem).filter(
                    OrdenProduccionItem.orden_dia_id == f_dia.id,
                    OrdenProduccionItem.tipo == item.tipo
                ).first()
                if f_item:
                    _update_item_cant(f_item, data.cliente_nombre, data.reset, None, data.operation, data.operation_value)
    
    db.commit()
    return {"status": "success", "message": "Cantidad matemática actualizada correctamente."}

@router.put("/ordenes-fabricacion/{dia_id}/clientes/{cliente_nombre}/platos/{plato_nombre}")
def update_client_plate_quantity(
    dia_id: int,
    cliente_nombre: str,
    plato_nombre: str,
    data: UpdatePlateQuantitySchema,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    dia = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == dia_id).first()
    if not dia:
        raise HTTPException(status_code=404, detail="Día de producción no encontrado.")
        
    item = db.query(OrdenProduccionItem).filter(
        OrdenProduccionItem.orden_dia_id == dia_id,
        OrdenProduccionItem.plato_nombre == plato_nombre
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Plato no encontrado en este día.")

    tipo_upper = (item.tipo or "").strip().upper().replace("Ó", "O")
    es_fuerte = tipo_upper in ("FUERTE #1", "FUERTE #2", "MENU SALUDABLE", "MENÚ SALUDABLE")

    if es_fuerte:
        # If Fuerte/Principal is updated, update all items of this client on this day to match
        all_items = db.query(OrdenProduccionItem).filter(OrdenProduccionItem.orden_dia_id == dia_id).all()
        for it in all_items:
            new_c = dict(it.cantidades_clientes)
            if cliente_nombre in new_c:
                new_c[cliente_nombre] = {"pct": new_c[cliente_nombre].get("pct", 0.0), "cant": data.cantidad}
                it.cantidades_clientes = new_c
                it.total = sum(c.get("cant", 0) for c in new_c.values())
                flag_modified(it, "cantidades_clientes")
    else:
        new_c = dict(item.cantidades_clientes)
        if cliente_nombre in new_c:
            new_c[cliente_nombre] = {"pct": new_c[cliente_nombre].get("pct", 0.0), "cant": data.cantidad}
            item.cantidades_clientes = new_c
            item.total = sum(c.get("cant", 0) for c in new_c.values())
            flag_modified(item, "cantidades_clientes")
            
    db.commit()
    return {"status": "success", "message": "Cantidad actualizada exitosamente."}


@router.post("/ordenes-fabricacion/quitar-cliente", response_model=Dict[str, Any])
def quitar_cliente(
    data: QuitarClienteRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Elimina un cliente de todos los días planificados dentro del rango de fechas especificado.
    """
    dias_en_rango = db.query(OrdenProduccionDia).filter(
        OrdenProduccionDia.fecha >= data.fecha_inicio,
        OrdenProduccionDia.fecha <= data.fecha_fin
    ).all()

    if not dias_en_rango:
        return {"status": "success", "message": "No se encontraron días planificados en ese rango."}

    for dia in dias_en_rango:
        items = db.query(OrdenProduccionItem).filter(OrdenProduccionItem.orden_dia_id == dia.id).all()
        for item in items:
            cantidades = dict(item.cantidades_clientes)
            if data.cliente_nombre in cantidades:
                del cantidades[data.cliente_nombre]
                item.cantidades_clientes = cantidades
                item.total = sum(c.get("cant", 0) for c in cantidades.values())
                flag_modified(item, "cantidades_clientes")
                if not cantidades:
                    db.delete(item)
    
    db.commit()
    return {"status": "success", "message": f"Cliente '{data.cliente_nombre}' eliminado exitosamente en el rango especificado."}


def recalculate_client_quantities(
    db: Session,
    items: List[OrdenProduccionItem],
    cliente_nombre: str,
    cliente_tipo: str,
    new_f1: float,
    new_f2: float,
    new_ms: int,
    new_total: Optional[int] = None,
    new_jugo2: Optional[int] = None
):
    sopa_item = next((it for it in items if it.tipo.upper() == "SOPA"), None)
    arroz_item = next((it for it in items if it.tipo.upper() == "ARROZ"), None)
    postre_item = next((it for it in items if it.tipo.upper() == "POSTRE"), None)
    
    old_total = 0
    if sopa_item and cliente_nombre in sopa_item.cantidades_clientes:
        old_total = sopa_item.cantidades_clientes[cliente_nombre].get("cant", 0)
    elif arroz_item and cliente_nombre in arroz_item.cantidades_clientes:
        old_total = arroz_item.cantidades_clientes[cliente_nombre].get("cant", 0)
    elif postre_item and cliente_nombre in postre_item.cantidades_clientes:
        old_total = postre_item.cantidades_clientes[cliente_nombre].get("cant", 0)
    else:
        # Try finding sum of Jugo 1 + Jugo 2 or fallback to F1 + F2 + MS
        j1_item = next((it for it in items if it.tipo.upper() == "JUGO #1"), None)
        j2_item = next((it for it in items if it.tipo.upper() == "JUGO #2"), None)
        j1_qty = j1_item.cantidades_clientes.get(cliente_nombre, {}).get("cant", 0) if j1_item else 0
        j2_qty = j2_item.cantidades_clientes.get(cliente_nombre, {}).get("cant", 0) if j2_item else 0
        if j1_item or j2_item:
            old_total = j1_qty + j2_qty
        else:
            f1_item = next((it for it in items if it.tipo.upper() == "FUERTE #1"), None)
            f2_item = next((it for it in items if it.tipo.upper() == "FUERTE #2"), None)
            ms_item = next((it for it in items if it.tipo.upper() in ("MENU SALUDABLE", "MENÚ SALUDABLE")), None)
            f1 = f1_item.cantidades_clientes.get(cliente_nombre, {}).get("cant", 0) if f1_item else 0
            f2 = f2_item.cantidades_clientes.get(cliente_nombre, {}).get("cant", 0) if f2_item else 0
            ms = ms_item.cantidades_clientes.get(cliente_nombre, {}).get("cant", 0) if ms_item else 0
            old_total = f1 + f2 + ms
    
    f1_item = next((it for it in items if it.tipo.upper() == "FUERTE #1"), None)
    old_f1 = f1_item.cantidades_clientes.get(cliente_nombre, {}).get("cant", 0) if f1_item else 0
    
    f2_item = next((it for it in items if it.tipo.upper() == "FUERTE #2"), None)
    old_f2 = f2_item.cantidades_clientes.get(cliente_nombre, {}).get("cant", 0) if f2_item else 0
    
    ms_item = next((it for it in items if it.tipo.upper() in ("MENU SALUDABLE", "MENÚ SALUDABLE")), None)
    old_ms = ms_item.cantidades_clientes.get(cliente_nombre, {}).get("cant", 0) if ms_item else 0

    if cliente_tipo == "porcentaje":
        total = new_total if new_total is not None else old_total
        base = total - new_ms
        if base < 0:
            base = 0
        
        f1_qty = int(base * new_f1 + 0.5)
        f2_qty = base - f1_qty
        f1_pct = new_f1
        f2_pct = new_f2
    else:
        f1_qty = int(new_f1)
        f2_qty = int(new_f2)
        total = f1_qty + f2_qty + new_ms
        f1_pct = 0.0
        f2_pct = 0.0

    jugo2_item = next((it for it in items if it.tipo.upper() == "JUGO #2"), None)
    if new_jugo2 is not None:
        jugo2_qty = new_jugo2
    else:
        jugo2_qty = jugo2_item.cantidades_clientes.get(cliente_nombre, {}).get("cant", 0) if jugo2_item else 0
    
    jugo1_qty = total - jugo2_qty
    if jugo1_qty < 0:
        jugo1_qty = 0

    for item in items:
        if item.cantidades_clientes.get("__manual_qty__") is True:
            continue
            
        tipo_upper = item.tipo.strip().upper().replace("Ó", "O").replace("Ú", "U")
        
        if tipo_upper == "AGUA SABORIZADA":
            continue
            
        new_cant = 0
        pct = 0.0
        
        if tipo_upper == "FUERTE #1":
            new_cant = f1_qty
            pct = f1_pct
        elif tipo_upper == "GUARNICION #1":
            new_cant = f1_qty
            pct = f1_pct
        elif tipo_upper == "FUERTE #2":
            new_cant = f2_qty
            pct = f2_pct
        elif tipo_upper == "GUARNICION #2":
            new_cant = f2_qty
            pct = f2_pct
        elif tipo_upper == "MENU SALUDABLE":
            new_cant = new_ms
            pct = 0.0
        elif tipo_upper == "GUARNICION SALUDABLE":
            new_cant = new_ms
            pct = 0.0
        elif tipo_upper == "SOPA":
            new_cant = total
            pct = 0.0
        elif tipo_upper == "ARROZ":
            new_cant = total
            pct = 0.0
        elif tipo_upper == "JUGO #1":
            new_cant = jugo1_qty
            pct = 0.0
        elif tipo_upper == "JUGO #2":
            new_cant = jugo2_qty
            pct = 0.0
        elif tipo_upper in ("ADEREZO", "ADEREZO #1", "ADEREZO #2"):
            old_aderezo = item.cantidades_clientes.get(cliente_nombre, {}).get("cant", 0)
            if old_aderezo == 0:
                new_cant = 0
            elif old_aderezo == old_total and old_total > 0:
                new_cant = total
            elif old_aderezo == old_f1 and old_f1 > 0:
                new_cant = f1_qty
            elif old_aderezo == old_f2 and old_f2 > 0:
                new_cant = f2_qty
            elif old_aderezo == old_ms and old_ms > 0:
                new_cant = new_ms
            elif old_aderezo == old_f1 + old_f2 and old_f1 + old_f2 > 0:
                new_cant = f1_qty + f2_qty
            elif old_aderezo == old_total - old_ms and old_total - old_ms > 0:
                new_cant = total - new_ms
            else:
                new_cant = total
            pct = 0.0
        else:
            old_val = item.cantidades_clientes.get(cliente_nombre, {}).get("cant", 0)
            if old_val > 0 or tipo_upper == "POSTRE":
                new_cant = total
            else:
                new_cant = 0
            pct = 0.0
            
        new_cantidades = dict(item.cantidades_clientes)
        new_cantidades[cliente_nombre] = {"pct": pct, "cant": new_cant}
        item.cantidades_clientes = new_cantidades
        item.total = sum(c.get("cant", 0) for c in new_cantidades.values())
        flag_modified(item, "cantidades_clientes")


@router.post("/ordenes-fabricacion/update-pct", response_model=Dict[str, Any])
def update_cliente_porcentaje(
    data: ClientPctUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    query = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.fecha == data.fecha)
    if data.tipo_menu_id is not None:
        query = query.filter(OrdenProduccionDia.tipo_menu_id == data.tipo_menu_id)
    if data.turno_id is not None:
        query = query.filter(OrdenProduccionDia.turno_id == data.turno_id)
    dias = query.all()
    if not dias:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontraron órdenes de fabricación para la fecha y/o tipo de menú seleccionados."
        )

    items = []
    for d in dias:
        items.extend(d.items)

    f1_item = next((it for it in items if it.tipo.upper() == "FUERTE #1"), None)
    f2_item = next((it for it in items if it.tipo.upper() == "FUERTE #2"), None)
    ms_item = next((it for it in items if it.tipo.upper() in ("MENU SALUDABLE", "MENÚ SALUDABLE")), None)
    
    current_f1_pct = f1_item.cantidades_clientes.get(data.cliente_nombre, {}).get("pct", 0.0) if f1_item else 0.0
    current_f2_pct = f2_item.cantidades_clientes.get(data.cliente_nombre, {}).get("pct", 0.0) if f2_item else 0.0
    ms_qty = ms_item.cantidades_clientes.get(data.cliente_nombre, {}).get("cant", 0) if ms_item else 0
    
    target_tipo = data.tipo.strip().upper()
    new_pct = float(data.nuevo_porcentaje) / 100.0
    
    if target_tipo == "FUERTE #1":
        f1_pct = new_pct
        f2_pct = max(0.0, 1.0 - new_pct)
    else:
        f2_pct = new_pct
        f1_pct = max(0.0, 1.0 - new_pct)
        
    recalculate_client_quantities(
        db=db,
        items=items,
        cliente_nombre=data.cliente_nombre,
        cliente_tipo="porcentaje",
        new_f1=f1_pct,
        new_f2=f2_pct,
        new_ms=ms_qty,
        new_total=data.total_cantidad,
        new_jugo2=data.jugo2_cantidad
    )

    db.commit()
    return {"status": "success", "message": f"Porcentaje actualizado a {data.nuevo_porcentaje}% y cantidades recalculadas."}


@router.post("/ordenes-fabricacion/update-qty", response_model=Dict[str, Any])
def update_cliente_cantidades(
    data: ClientQtyUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    query = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.fecha == data.fecha)
    if data.tipo_menu_id is not None:
        query = query.filter(OrdenProduccionDia.tipo_menu_id == data.tipo_menu_id)
    if data.turno_id is not None:
        query = query.filter(OrdenProduccionDia.turno_id == data.turno_id)
    dias = query.all()
    if not dias:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontraron órdenes de fabricación para la fecha y/o tipo de menú seleccionados."
        )

    items = []
    for d in dias:
        items.extend(d.items)

    for d in dias:
        ms_item = next((it for it in d.items if it.tipo.strip().upper().replace("Ó", "O").replace("Ú", "U") == "MENU SALUDABLE"), None)
        if not ms_item:
            ms_item = OrdenProduccionItem(
                orden_dia_id=d.id,
                plato_nombre="Menú Saludable",
                tipo="MENU SALUDABLE",
                cantidades_clientes={data.cliente_nombre: {"pct": 0.0, "cant": data.ms_cantidad}},
                total=data.ms_cantidad
            )
            db.add(ms_item)
            db.flush()
            items.append(ms_item)

    recalculate_client_quantities(
        db=db,
        items=items,
        cliente_nombre=data.cliente_nombre,
        cliente_tipo="cantidad",
        new_f1=data.f1_cantidad,
        new_f2=data.f2_cantidad,
        new_ms=data.ms_cantidad,
        new_jugo2=data.jugo2_cantidad
    )

    db.commit()
    total_comensales = data.f1_cantidad + data.f2_cantidad + data.ms_cantidad
    return {
        "status": "success", 
        "message": f"Cantidades actualizadas para {data.cliente_nombre}. Total recalculado a {total_comensales}."
    }


@router.post("/ordenes-fabricacion/update-ms", response_model=Dict[str, Any])
def update_cliente_ms(
    data: ClientMsUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    query = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.fecha == data.fecha)
    if data.tipo_menu_id is not None:
        query = query.filter(OrdenProduccionDia.tipo_menu_id == data.tipo_menu_id)
    if data.turno_id is not None:
        query = query.filter(OrdenProduccionDia.turno_id == data.turno_id)
    dias = query.all()
    if not dias:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontraron órdenes de fabricación para la fecha y/o tipo de menú seleccionados."
        )

    items = []
    for d in dias:
        items.extend(d.items)

    for d in dias:
        ms_item = next((it for it in d.items if it.tipo.strip().upper().replace("Ó", "O").replace("Ú", "U") == "MENU SALUDABLE"), None)
        if not ms_item:
            ms_item = OrdenProduccionItem(
                orden_dia_id=d.id,
                plato_nombre="Menú Saludable",
                tipo="MENU SALUDABLE",
                cantidades_clientes={data.cliente_nombre: {"pct": 0.0, "cant": data.ms_cantidad}},
                total=data.ms_cantidad
            )
            db.add(ms_item)
            db.flush()
            items.append(ms_item)

    cliente = db.query(Cliente).filter(Cliente.nombre == data.cliente_nombre).first()
    cliente_tipo = cliente.tipo if cliente else "porcentaje"

    if cliente_tipo == "porcentaje":
        f1_item = next((it for it in items if it.tipo.upper() == "FUERTE #1"), None)
        f2_item = next((it for it in items if it.tipo.upper() == "FUERTE #2"), None)
        
        f1_pct = f1_item.cantidades_clientes.get(data.cliente_nombre, {}).get("pct", 0.0) if f1_item else 0.0
        f2_pct = f2_item.cantidades_clientes.get(data.cliente_nombre, {}).get("pct", 0.0) if f2_item else 0.0
        
        recalculate_client_quantities(
            db=db,
            items=items,
            cliente_nombre=data.cliente_nombre,
            cliente_tipo="porcentaje",
            new_f1=f1_pct,
            new_f2=f2_pct,
            new_ms=data.ms_cantidad
        )
    else:
        f1_item = next((it for it in items if it.tipo.upper() == "FUERTE #1"), None)
        f2_item = next((it for it in items if it.tipo.upper() == "FUERTE #2"), None)
        
        f1_qty = f1_item.cantidades_clientes.get(data.cliente_nombre, {}).get("cant", 0) if f1_item else 0
        f2_qty = f2_item.cantidades_clientes.get(data.cliente_nombre, {}).get("cant", 0) if f2_item else 0
        
        recalculate_client_quantities(
            db=db,
            items=items,
            cliente_nombre=data.cliente_nombre,
            cliente_tipo="cantidad",
            new_f1=f1_qty,
            new_f2=f2_qty,
            new_ms=data.ms_cantidad
        )

    db.commit()
    return {"status": "success", "message": f"Menú Saludable actualizado a {data.ms_cantidad} para {data.cliente_nombre}."}


@router.get("/generate-combinations")
def generate_menu_combinations(
    start_date: date,
    end_date: date,
    current_user: Usuario = Depends(get_current_user)
):
    """
    Algoritmo del generador automático de combinaciones diarias de platos.
    """
    return {
        "restricciones_aplicadas": ["no_repetir_proteina_semanal", "balance_calorico"],
        "combinacion_sugerida": {
            "sopa": "Sopa de Verduras con Consomé",
            "fuerte_1": "Pollo al Horno con Finas Hierbas",
            "guarnicion_1": "Papas al Vapor",
            "fuerte_2": "Carne Asada en salsa de Champiñones",
            "guarnicion_2": "Puré de Camote",
            "arroz": "Arroz Blanco Premium",
            "saludable": "Ensalada César con Pollo Grill",
            "guarnicion_saludable": "Aderezo de Yogurt y Limón",
            "jugo_1": "Limonada Imperial",
            "jugo_2": "Jugo de Naranjilla",
            "postre": "Flan de Leche Casero"
        }
    }


@router.post("/", response_model=Dict[str, Any])
def create_planner(
    name: str,
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Crea una nueva planificación mensual de menús en el calendario.
    """
    try:
        new_plan = Planificacion(
            nombre=name,
            fecha_inicio=start_date,
            fecha_fin=end_date
        )
        db.add(new_plan)
        db.commit()
        db.refresh(new_plan)
        return {
            "id": new_plan.id,
            "nombre": new_plan.nombre,
            "fecha_inicio": new_plan.fecha_inicio.isoformat(),
            "fecha_fin": new_plan.fecha_fin.isoformat()
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creando planificación: {str(e)}"
        )

@router.get("/{planner_id}", response_model=PlanificacionResponse)
def get_planner(
    planner_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtiene los detalles completos de una planificación (días, componentes y pedidos).
    """
    planner = db.query(Planificacion).options(
        joinedload(Planificacion.dias).joinedload(DiaPlanificado.componentes).joinedload(MenuDiarioComponente.receta),
        joinedload(Planificacion.dias).joinedload(DiaPlanificado.pedidos)
    ).filter(Planificacion.id == planner_id).first()

    if not planner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Planificación no encontrada"
        )
    
    # Resolver nombres de recetas de forma segura
    for dia in planner.dias:
        for comp in dia.componentes:
            comp.receta_nombre = comp.receta.nombre if comp.receta else "Receta Desconocida"

    return planner

@router.post("/{planner_id}/days", response_model=DiaPlanificadoResponse)
def create_or_update_day(
    planner_id: int,
    day_data: DiaPlanificadoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Crea o actualiza la planificación de un día específico dentro del calendario.
    Calcula automáticamente el costo diario estimado basado en los comensales y el costo unitario de Odoo.
    """
    # Validar que exista el planificador
    planner = db.query(Planificacion).filter(Planificacion.id == planner_id).first()
    if not planner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Planificación no encontrada"
        )

    # 1. Obtener los precios actuales de compra de Odoo para calcular costos
    odoo_products = odoo_client.get_purchase_products()
    product_price_map = {p['id']: float(p['standard_price']) for p in odoo_products}

    # 2. Calcular costo unitario de porción para cada receta seleccionada
    recipe_ids = [c.receta_id for c in day_data.componentes]
    recipes = db.query(Receta).options(joinedload(Receta.ingredientes)).filter(Receta.id.in_(recipe_ids)).all()
    recipe_map = {r.id: r for r in recipes}

    total_portion_unit_cost = 0.0
    for comp in day_data.componentes:
        recipe = recipe_map.get(comp.receta_id)
        if recipe:
            # Calcular Costo de Porción de Receta
            recipe_cost = 0.0
            for ing in recipe.ingredientes:
                price = product_price_map.get(ing.odoo_product_id, 0.0)
                recipe_cost += float(ing.cantidad_proporcional) * price
            
            # Dividir entre base_porciones parametrizable
            portion_cost = recipe_cost / float(recipe.base_porciones) if recipe.base_porciones > 0 else 0.0
            total_portion_unit_cost += portion_cost

    # 3. Sumar el total de comensales programados
    total_comensales = sum(p.comensales_calculados for p in day_data.pedidos)

    # 4. Calcular el Costo Diario Estimado
    costo_diario_estimado = total_portion_unit_cost * total_comensales

    # 5. Insertar o actualizar DiaPlanificado
    dia = db.query(DiaPlanificado).filter(
        DiaPlanificado.planificacion_id == planner_id,
        DiaPlanificado.fecha == day_data.fecha
    ).first()

    if dia:
        # Actualizar datos base
        dia.nombre_odoo_producto = day_data.nombre_odoo_producto
        dia.costo_diario_estimado = costo_diario_estimado
        
        # Limpiar componentes y pedidos antiguos
        db.query(MenuDiarioComponente).filter(MenuDiarioComponente.dia_planificado_id == dia.id).delete()
        db.query(PedidoCliente).filter(PedidoCliente.dia_planificado_id == dia.id).delete()
    else:
        dia = DiaPlanificado(
            planificacion_id=planner_id,
            fecha=day_data.fecha,
            nombre_odoo_producto=day_data.nombre_odoo_producto,
            costo_diario_estimado=costo_diario_estimado
        )
        db.add(dia)
        db.commit()
        db.refresh(dia)

    # 6. Insertar nuevos componentes
    for comp in day_data.componentes:
        new_comp = MenuDiarioComponente(
            dia_planificado_id=dia.id,
            componente_tipo=comp.componente_tipo,
            receta_id=comp.receta_id
        )
        db.add(new_comp)

    # 7. Insertar nuevos pedidos de clientes
    for ped in day_data.pedidos:
        new_ped = PedidoCliente(
            dia_planificado_id=dia.id,
            odoo_partner_id=ped.odoo_partner_id,
            tipo_pedido=ped.tipo_pedido,
            valor_pedido=ped.valor_pedido,
            comensales_calculados=ped.comensales_calculados
        )
        db.add(new_ped)

    db.commit()
    db.refresh(dia)

    # Recargar con relaciones
    return db.query(DiaPlanificado).options(
        joinedload(DiaPlanificado.componentes).joinedload(MenuDiarioComponente.receta),
        joinedload(DiaPlanificado.pedidos)
    ).filter(DiaPlanificado.id == dia.id).first()

@router.post("/{planner_id}/days/{day_id}/sync-odoo")
def sync_day_to_odoo(
    planner_id: int,
    day_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Sincroniza la combinación aprobada del día en Odoo ERP 19:
    1. Agrupa ingredientes de todas las recetas asignadas.
    2. Crea un producto en Odoo: 'ALMUERZO TIPO 1 AAMMDD' (o nombre personalizado).
    3. Sube la Lista de Materiales (BoM) unitaria a Odoo.
    4. Crea y confirma la Orden de Fabricación por los comensales totales.
    5. Inicializa localmente el Despacho en Bodega con el requerimiento teórico.
    """
    dia = db.query(DiaPlanificado).options(
        joinedload(DiaPlanificado.componentes).joinedload(MenuDiarioComponente.receta).joinedload(Receta.ingredientes),
        joinedload(DiaPlanificado.pedidos)
    ).filter(DiaPlanificado.id == day_id).first()

    if not dia:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Día planificado no encontrado"
        )

    if dia.odoo_product_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este día ya se encuentra sincronizado con Odoo."
        )

    total_comensales = sum(p.comensales_calculados for p in dia.pedidos)
    if total_comensales <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pueden fabricar menús para 0 comensales."
        )

    # 1. Agrupar ingredientes y calcular cantidades unitarias (base 1 porción)
    ingredients_bom = {}
    for comp in dia.componentes:
        recipe = comp.receta
        if recipe:
            base = float(recipe.base_porciones)
            for ing in recipe.ingredientes:
                p_id = ing.odoo_product_id
                qty_per_portion = float(ing.cantidad_proporcional) / base if base > 0 else 0.0
                if p_id in ingredients_bom:
                    ingredients_bom[p_id]['qty'] += qty_per_portion
                else:
                    ingredients_bom[p_id] = {
                        'product_id': p_id,
                        'qty': qty_per_portion,
                        'uom': ing.unidad_medida
                    }

    if not ingredients_bom:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La combinación del día no contiene ingredientes."
        )

    # 2. Sincronizar producto y BoM en Odoo
    try:
        ingredients_list = [{'product_id': k, 'qty': v['qty']} for k, v in ingredients_bom.items()]
        # Creamos en categoría Almuerzos (o categoría genérica ID 1 si no hay)
        sync_res = odoo_client.create_recipe_product(
            name=dia.nombre_odoo_producto,
            category_id=1,
            ingredients=ingredients_list
        )
        
        dia.odoo_product_id = sync_res['product_id']
        db.commit()

        # 3. Lanzar Orden de Fabricación en Odoo
        mo_id = odoo_client.create_manufacturing_order(
            product_id=sync_res['product_id'],
            qty=float(total_comensales),
            bom_id=sync_res['bom_id']
        )

        # 4. Crear registro de Despacho Bodega
        new_despacho = Despacho(
            dia_planificado_id=dia.id,
            odoo_manufacturing_order_id=mo_id,
            estado="borrador",
            fecha_despacho=dia.fecha
        )
        db.add(new_despacho)
        db.commit()
        db.refresh(new_despacho)

        # 5. Rellenar DespachoProducto con la explosión teórica de materiales
        for p_id, ing_data in ingredients_bom.items():
            req_teorico = ing_data['qty'] * total_comensales
            dp = DespachoProducto(
                despacho_id=new_despacho.id,
                odoo_product_id=p_id,
                cantidad_teorica=req_teorico,
                cantidad_despachada=0.0,
                cantidad_devuelta=0.0
            )
            db.add(dp)

        db.commit()
        return {
            "status": "success",
            "message": "Día sincronizado exitosamente con Odoo ERP 19 y orden de fabricación creada.",
            "odoo_product_id": dia.odoo_product_id,
            "odoo_manufacturing_order_id": mo_id,
            "despacho_id": new_despacho.id
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo al sincronizar con Odoo: {str(e)}"
        )


def get_total_raciones_backend(dia, db) -> float:
    # 1. Get all client names for the day
    client_names = set()
    for item in dia.items:
        for c_name in item.cantidades_clientes.keys():
            if c_name not in ("TOTAL", "CANT TOTAL", "__manual_qty__"):
                client_names.add(c_name)

    # 2. Get client objects from DB to check if they are percentage or quantity based
    from app.models.models import Cliente
    clients_dict = {}
    if client_names:
        db_clients = db.query(Cliente).filter(Cliente.nombre.in_(list(client_names))).all()
        clients_dict = {c.nombre: c.tipo for c in db_clients}

    total_raciones = 0.0
    for c_name in client_names:
        c_tipo = clients_dict.get(c_name, 'porcentaje')
        is_pct = c_tipo == 'porcentaje'

        sopa = 0.0
        f1 = 0.0
        f2 = 0.0
        ms = 0.0
        max_cant = 0.0

        for item in dia.items:
            t = (item.tipo or "").strip().upper().replace("Ú", "U").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Á", "A")
            c_info = item.cantidades_clientes.get(c_name)
            if c_info:
                val = float(c_info.get("cant", 0.0))
                if val > max_cant:
                    max_cant = val
                    
                if t == "SOPA":
                    sopa = val
                elif t == "FUERTE #1":
                    f1 = val
                elif t == "FUERTE #2":
                    f2 = val
                elif t == "MENU SALUDABLE":
                    ms = val

        client_total = max(sopa, f1 + f2 + ms) if is_pct else (f1 + f2 + ms)
        
        if client_total == 0:
            client_total = max_cant
            
        total_raciones += client_total

    return total_raciones if total_raciones > 0 else 1.0


class OdooProductRequestItem(BaseModel):
    special_title: str
    dia_id: int

class CreateOdooProductsRequest(BaseModel):
    products: List[OdooProductRequestItem]

@router.post("/ordenes-fabricacion/crear-productos-odoo")
def create_odoo_products(
    data: CreateOdooProductsRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    results = []
    
    # 1. Get Category ID for "Alimentos"
    try:
        cat_ids = odoo_client.execute('product.category', 'search', [('name', 'ilike', 'Alimentos')])
        cat_id = cat_ids[0] if cat_ids else 1
    except Exception as e:
        logger.warning(f"Error fetching Odoo category Alimentos: {e}")
        cat_id = 1
        
    # 2. Get Route ID for "Fabricación Almuerzos"
    try:
        route_ids = odoo_client.execute('stock.route', 'search', [('name', 'ilike', 'Fabricación Almuerzos')])
        route_id = route_ids[0] if route_ids else None
    except Exception as e:
        logger.warning(f"Error fetching Odoo route Fabricación Almuerzos: {e}")
        route_id = None
        
    # 3. Iterate through items and create products
    for item in data.products:
        dia = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == item.dia_id).first()
        if not dia:
            results.append({
                "dia_id": item.dia_id,
                "special_title": item.special_title,
                "status": "error",
                "message": "Día de producción no encontrado en base de datos local."
            })
            continue
            
        try:
            # Check if product already exists in Odoo
            existing_ids = odoo_client.execute('product.template', 'search', [('name', '=', item.special_title)])
            if existing_ids:
                # Get existing template ID
                tmpl_id = existing_ids[0]
                # Try finding corresponding product.product ID
                product_ids = odoo_client.execute('product.product', 'search', [('product_tmpl_id', '=', tmpl_id)])
                prod_id = product_ids[0] if product_ids else None
                
                # Update dia.odoo_product_id in DB if not set
                if not dia.odoo_product_id and prod_id:
                    dia.odoo_product_id = prod_id
                    db.commit()
                    
                results.append({
                    "dia_id": item.dia_id,
                    "special_title": item.special_title,
                    "status": "exists",
                    "message": "El producto ya existe en Odoo."
                })
                continue
                
            # Create product.template in Odoo
            product_data = {
                'name': item.special_title,
                'type': 'consu',
                'is_storable': True,
                'sale_ok': True,
                'purchase_ok': False,
                'categ_id': cat_id,
            }
            if route_id:
                product_data['route_ids'] = [(6, 0, [route_id])]
                
            tmpl_id = odoo_client.execute('product.template', 'create', product_data)
            
            # Fetch product.product ID corresponding to tmpl_id
            product_ids = odoo_client.execute('product.product', 'search', [('product_tmpl_id', '=', tmpl_id)])
            prod_id = product_ids[0] if product_ids else None
            
            # Save the Odoo product ID in local DB and update odoo_product_id
            if prod_id:
                dia.odoo_product_id = prod_id
                db.commit()
                
                # Create mrp.bom in Odoo
                total_rations = get_total_raciones_backend(dia, db)
                bom_data = {
                    'product_tmpl_id': tmpl_id,
                    'product_id': prod_id,
                    'product_qty': total_rations,
                    'type': 'normal',
                    'ready_to_produce': 'all_available'
                }
                bom_id = odoo_client.execute('mrp.bom', 'create', bom_data)
                
                # Add BoM lines for each planned item with total > 0
                missed_dishes = []
                for p_item in dia.items:
                    if p_item.total <= 0:
                        continue
                    comp_ids = odoo_client.execute('product.product', 'search', [('name', '=', p_item.plato_nombre)])
                    if comp_ids:
                        line_data = {
                            'bom_id': bom_id,
                            'product_id': comp_ids[0],
                            'product_qty': float(p_item.total)
                        }
                        odoo_client.execute('mrp.bom.line', 'create', line_data)
                    else:
                        missed_dishes.append(p_item.plato_nombre)
                
                if missed_dishes:
                    msg = f"Producto creado con BoM, pero no se encontraron platos en Odoo: {', '.join(missed_dishes)}"
                else:
                    msg = f"Producto y Lista de Materiales creados exitosamente en Odoo (ID Odoo: {prod_id})."
            else:
                msg = "Producto creado en Odoo, pero no se pudo recuperar el ID del variante (product.product)."
                
            results.append({
                "dia_id": item.dia_id,
                "special_title": item.special_title,
                "status": "created",
                "message": msg
            })
        except Exception as e:
            results.append({
                "dia_id": item.dia_id,
                "special_title": item.special_title,
                "status": "error",
                "message": f"Error al interactuar con Odoo: {str(e)}"
            })
            
    return {"status": "success", "results": results}


class OdooMORequestItem(BaseModel):
    dia_id: int
    special_title: str

class CreateOdooMOsRequest(BaseModel):
    items: List[OdooMORequestItem]

@router.post("/ordenes-fabricacion/crear-ordenes-fabricacion-odoo")
def crear_ordenes_fabricacion_odoo(
    payload: CreateOdooMOsRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Crea y confirma Órdenes de Fabricación (MO) en Odoo para los productos creados.
    """
    results = []
    
    # Obtener el picking_type_id de la ruta de fabricación de platos
    # para asignarlo a las MOs principales y que aparezcan en Despacho de Bodega
    main_picking_type_id = None
    try:
        pt_ids = odoo_client.execute('stock.picking.type', 'search', [('name', 'ilike', '%Fabricación Almuerzo%')])
        if pt_ids:
            main_picking_type_id = pt_ids[0]
            logger.info(f"crear-ordenes-fabricacion: picking_type_id={main_picking_type_id}")
    except Exception as e_pt:
        logger.warning(f"No se pudo leer picking_type_id para MOs principales: {e_pt}")
    
    for item in payload.items:
        dia = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == item.dia_id).first()
        if not dia:
            results.append({
                "dia_id": item.dia_id,
                "special_title": item.special_title,
                "status": "error",
                "message": "Día de producción no encontrado localmente."
            })
            continue

        prod_id = dia.odoo_product_id
        if not prod_id:
            # Fallback: buscar por nombre si no está en base de datos local
            try:
                tmpl_ids = odoo_client.execute('product.template', 'search', [('name', '=', item.special_title)])
                if tmpl_ids:
                    product_ids = odoo_client.execute('product.product', 'search', [('product_tmpl_id', '=', tmpl_ids[0])])
                    if product_ids:
                        prod_id = product_ids[0]
                        dia.odoo_product_id = prod_id
                        db.commit()
            except Exception:
                pass

        if not prod_id:
            results.append({
                "dia_id": item.dia_id,
                "special_title": item.special_title,
                "status": "error",
                "message": "El producto no está sincronizado en Odoo o no tiene variante (product.product)."
            })
            continue

        try:
            # Obtener el product_tmpl_id
            prod_data = odoo_client.execute('product.product', 'read', [prod_id], ['product_tmpl_id', 'uom_id'])
            if not prod_data:
                raise Exception("No se pudo leer la información del producto en Odoo.")
            tmpl_id = prod_data[0]['product_tmpl_id'][0]
            uom_id = prod_data[0]['uom_id'][0]

            # Buscar la Lista de Materiales (BoM)
            bom_ids = odoo_client.execute('mrp.bom', 'search', [('product_tmpl_id', '=', tmpl_id)])
            if not bom_ids:
                raise Exception("No se encontró la Lista de Materiales (BoM) en Odoo para este producto.")
            bom_id = bom_ids[0]

            # Configurar fecha programada (del almuerzo)
            scheduled_date = f"{dia.fecha.strftime('%Y-%m-%d')} 06:00:00"

            # Crear MO (mrp.production) con picking_type_id de la ruta de platos
            total_rations = get_total_raciones_backend(dia, db)
            mo_data = {
                'product_id': prod_id,
                'product_qty': total_rations,
                'bom_id': bom_id,
                'product_uom_id': uom_id,
                'date_start': scheduled_date
            }
            if main_picking_type_id:
                mo_data['picking_type_id'] = main_picking_type_id
            mo_id = odoo_client.execute('mrp.production', 'create', mo_data)

            # Confirmar la orden de fabricación (action_confirm)
            odoo_client.execute('mrp.production', 'action_confirm', [mo_id])
            
            # Forzar la reserva de componentes (Comprobar disponibilidad)
            try:
                odoo_client.execute('mrp.production', 'action_assign', [mo_id])
            except Exception as e_assign:
                logger.warning(f"No se pudo reservar automáticamente los componentes para MO {mo_id}: {e_assign}")

            # Leer la ruta/nombre asignado (ej. NUT/FABAL/01479)
            mo_info = odoo_client.execute('mrp.production', 'read', [mo_id], ['name'])
            mo_name = mo_info[0]['name'] if mo_info else f"MO #{mo_id}"

            # GUARDAR la ruta en la base de datos local para que aparezca en Despacho Diario
            dia.ruta_asignada = mo_name
            dia.produccion_establecida = False
            db.commit()

            results.append({
                "dia_id": item.dia_id,
                "special_title": item.special_title,
                "status": "success",
                "mo_id": mo_id,
                "mo_name": mo_name,
                "message": f"Orden de Fabricación confirmada: {mo_name}"
            })
        except Exception as e:
            results.append({
                "dia_id": item.dia_id,
                "special_title": item.special_title,
                "status": "error",
                "message": f"Error al crear/confirmar MO en Odoo: {str(e)}"
            })

    return {"status": "success", "results": results}


@router.post("/ordenes-fabricacion/reabastecer-componentes-odoo")
def reabastecer_componentes_odoo(
    payload: CreateOdooMOsRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Realiza el reabastecimiento en Odoo para cada uno de los platos planificados en los días.
    """
    results = []
    # No forzamos la ruta, respetamos la configurada en el producto
    route_id = None

    # 2. Obtener Almacén por defecto
    warehouse_id = None
    try:
        warehouse_ids = odoo_client.execute('stock.warehouse', 'search', [])
        if warehouse_ids:
            warehouse_id = warehouse_ids[0]
    except Exception:
        pass

    if not warehouse_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pudo recuperar el almacén de Odoo para el reabastecimiento."
        )

    results = []

    # Una sola vez: buscar el picking_type_id de la ruta para asignarlo a las MOs creadas
    picking_type_id = None
    try:
        # Buscamos el tipo de operación para Fabricación Platos de comida (Prefijo: FAB)
        ptypes = odoo_client.execute('stock.picking.type', 'search', [('sequence_code', '=', 'FAB')])
        if not ptypes:
            ptypes = odoo_client.execute('stock.picking.type', 'search', [('name', 'ilike', 'Platos')])
        if ptypes:
            picking_type_id = ptypes[0]
            logger.info(f"picking_type_id encontrado para Platos: {picking_type_id}")
    except Exception as e_pt:
        logger.warning(f"No se pudo leer el picking_type_id de platos: {e_pt}")

    try:
        for item in payload.items:
            dia = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == item.dia_id).first()
            if not dia:
                results.append({
                    "dia_id": item.dia_id,
                    "special_title": item.special_title,
                    "status": "error",
                    "message": "Día de producción no encontrado localmente."
                })
                continue

            day_results = []
        
            try:
                # Eliminar MOs anteriores de los platos para este día para evitar duplicados
                comp_prod_ids = []
                for p_item in dia.items:
                    if p_item.total > 0 and p_item.odoo_product_id:
                        comp_prod_ids.append(p_item.odoo_product_id)
                    elif p_item.total > 0:
                        comp_ids = odoo_client.execute('product.product', 'search', [('name', '=', p_item.plato_nombre)])
                        if comp_ids:
                            comp_prod_ids.append(comp_ids[0])

                if comp_prod_ids:
                    date_start_min = f"{dia.fecha.strftime('%Y-%m-%d')} 00:00:00"
                    date_start_max = f"{dia.fecha.strftime('%Y-%m-%d')} 23:59:59"
                    comp_mo_ids = odoo_client.execute('mrp.production', 'search', [
                        ('product_id', 'in', comp_prod_ids),
                        ('date_start', '>=', date_start_min),
                        ('date_start', '<=', date_start_max),
                        ('origin', 'in', [f'NUT-DIA-{dia.id}', f'Reabastecimiento manual (NUT-DIA-{dia.id})'])
                    ])
                    if comp_mo_ids:
                        try:
                            odoo_client.execute('mrp.production', 'action_cancel', comp_mo_ids)
                            odoo_client.execute('mrp.production', 'unlink', comp_mo_ids)
                            logger.info(f"Eliminadas {len(comp_mo_ids)} MOs anteriores para evitar duplicados en el día {dia.id}")
                        except Exception as ex_delete:
                            logger.warning(f"No se pudieron eliminar algunas MOs anteriores: {ex_delete}")
            except Exception as e_clean:
                logger.error(f"Error limpiando MOs previas para {dia.id}: {e_clean}")
                # Continuamos aunque falle la limpieza

            # Reabastecer cada plato del día con total > 0
            for p_item in sorted(dia.items, key=sort_items_by_tipo):
                if p_item.total <= 0:
                    continue

                try:
                    # Buscar el producto variante en Odoo
                    comp_ids = odoo_client.execute('product.product', 'search', [('name', '=', p_item.plato_nombre)])
                    if not comp_ids:
                        day_results.append({
                            "plato_nombre": p_item.plato_nombre,
                            "status": "error",
                            "message": "El plato no existe en Odoo."
                        })
                        continue

                    comp_id = comp_ids[0]
                
                    # GUARDAR EL ID DE ODOO LOCALMENTE PARA QUE DESPACHO LO ENCUENTRE
                    p_item.odoo_product_id = comp_id
                
                    # Leer datos básicos
                    prod = odoo_client.execute('product.product', 'read', [comp_id], ['product_tmpl_id', 'uom_id'])
                    if not prod:
                        raise Exception("No se pudo leer la información de UoM del plato en Odoo.")
                
                    tmpl_id = prod[0]['product_tmpl_id'][0]
                    uom_id = prod[0]['uom_id'][0]

                    # Buscar la Lista de Materiales (BoM)
                    bom_ids = odoo_client.execute('mrp.bom', 'search', [('product_tmpl_id', '=', tmpl_id)])
                    if not bom_ids:
                        raise Exception("No se encontró la Lista de Materiales (BoM) en Odoo para este plato.")
                    bom_id = bom_ids[0]

                    # Configurar fecha planeada para la fabricación
                    date_planned = f"{dia.fecha.strftime('%Y-%m-%d')} 11:00:00"

                    mo_data = {
                        'product_id': comp_id,
                        'product_qty': float(p_item.total),
                        'bom_id': bom_id,
                        'product_uom_id': uom_id,
                        'date_start': date_planned,
                        'origin': f"Reabastecimiento manual (NUT-DIA-{dia.id})"
                    }
                
                    if picking_type_id:
                        mo_data['picking_type_id'] = picking_type_id

                    # Crear la MO directamente
                    mo_id = odoo_client.execute('mrp.production', 'create', mo_data)
                
                    # Confirmar la orden de fabricación
                    odoo_client.execute('mrp.production', 'action_confirm', [mo_id])
                
                    # Forzar la reserva de componentes (Comprobar disponibilidad)
                    try:
                        odoo_client.execute('mrp.production', 'action_assign', [mo_id])
                    except Exception as e_assign:
                        logger.warning(f"No se pudo reservar automáticamente los componentes para MO {mo_id}: {e_assign}")
                
                    logger.info(f"Creada MO {mo_id} para el plato '{p_item.plato_nombre}'")

                    day_results.append({
                        "plato_nombre": p_item.plato_nombre,
                        "status": "success",
                        "message": "Reabastecimiento lanzado."
                    })
                except Exception as e:
                    day_results.append({
                        "plato_nombre": p_item.plato_nombre,
                        "status": "error",
                        "message": f"Error: {str(e)}"
                    })

            results.append({
                "dia_id": item.dia_id,
                "special_title": item.special_title,
                "status": "success",
                "components": day_results
            })
        
            # Guardar los cambios (como odoo_product_id) en la base de datos
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Error al guardar odoo_product_id en la base de datos local: {e}")

    except Exception as general_ex:
        logger.error(f"Error crítico en reabastecer_componentes_odoo: {general_ex}")
        return {"status": "error", "message": str(general_ex), "results": results}

    return {"status": "success", "results": results}


class RepararRutaMOsRequest(BaseModel):
    fecha: str  # YYYY-MM-DD
    nombre_ruta: Optional[str] = None  # Si se omite, usa '%Platos%'

@router.post("/ordenes-fabricacion/reparar-ruta-mos")
def reparar_ruta_mos(
    payload: RepararRutaMOsRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Repara las MOs de un día que fueron creadas sin picking_type_id (sin ruta asignada).
    Busca la ruta de fabricación de platos y la aplica a todas las MOs del día
    que no tengan picking_type_id asignado.
    """
    try:
        nombre_busqueda = payload.nombre_ruta or '%Platos%'
        route_ids = odoo_client.execute('stock.route', 'search', [('name', 'ilike', nombre_busqueda)])
        if not route_ids:
            raise HTTPException(status_code=400, detail=f"No se encontró la ruta con nombre similar a '{nombre_busqueda}' en Odoo.")
        route_id = route_ids[0]

        route_rules = odoo_client.execute('stock.rule', 'search_read',
            [('route_id', '=', route_id), ('action', '=', 'manufacture')],
            ['picking_type_id']
        )
        if not route_rules or not route_rules[0].get('picking_type_id'):
            raise HTTPException(status_code=400, detail="No se encontró el tipo de operación de fabricación para la ruta.")
        picking_type_id = route_rules[0]['picking_type_id'][0]

        date_min = f"{payload.fecha} 00:00:00"
        date_max = f"{payload.fecha} 23:59:59"
        mos_sin_ruta = odoo_client.execute('mrp.production', 'search', [
            ('picking_type_id', '=', False),
            ('state', 'in', ['draft', 'confirmed', 'progress']),
            '&', ('date_start', '>=', date_min), ('date_start', '<=', date_max)
        ])

        if not mos_sin_ruta:
            return {"status": "success", "message": "No se encontraron MOs sin ruta para esta fecha.", "reparadas": 0}

        odoo_client.execute('mrp.production', 'write', mos_sin_ruta, {'picking_type_id': picking_type_id})
        logger.info(f"Reparadas {len(mos_sin_ruta)} MOs del {payload.fecha} con picking_type_id={picking_type_id}")

        return {
            "status": "success",
            "message": f"Se repararon {len(mos_sin_ruta)} órdenes de fabricación asignándoles la ruta correcta.",
            "reparadas": len(mos_sin_ruta),
            "mos_ids": mos_sin_ruta
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en reparar_ruta_mos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class UpdateOdooDayRequest(BaseModel):
    dia_id: int

@router.post("/ordenes-fabricacion/actualizar-dia-odoo")
def actualizar_dia_odoo(
    data: UpdateOdooDayRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    try:
        # 1. Fetch local dia
        dia = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == data.dia_id).first()
        if not dia:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Día de producción no encontrado.")

        is_update = bool(dia.odoo_product_id)

        # Get or Create Odoo template ID
        if not is_update:
            # 1. Get Category ID for "Alimentos"
            try:
                cat_ids = odoo_client.execute('product.category', 'search', [('name', 'ilike', 'Alimentos')])
                cat_id = cat_ids[0] if cat_ids else 1
            except Exception:
                cat_id = 1
                
            # 2. Get Route ID for "Fabricación Almuerzos"
            try:
                route_ids = odoo_client.execute('stock.route', 'search', [('name', 'ilike', 'Fabricación Almuerzos')])
                route_id = route_ids[0] if route_ids else None
            except Exception:
                route_id = None

            # Format special title
            if dia.ruta_asignada and not dia.ruta_asignada.startswith('NUT/'):
                special_title = dia.ruta_asignada
            else:
                menu_name = (dia.tipo_menu.nombre if dia.tipo_menu else "SIN MENU").strip().upper()
                day_str = dia.fecha.strftime('%d%m%y')
                special_title = f"{menu_name} {day_str}"

            # Check if template already exists in Odoo
            existing_ids = odoo_client.execute('product.template', 'search', [('name', '=', special_title)])
            if existing_ids:
                tmpl_id = existing_ids[0]
                product_ids = odoo_client.execute('product.product', 'search', [('product_tmpl_id', '=', tmpl_id)])
                if product_ids:
                    prod_id = product_ids[0]
                else:
                    # Template exists but variant was deleted. Recreate the variant.
                    prod_id = odoo_client.execute('product.product', 'create', {'product_tmpl_id': tmpl_id, 'active': True})
            else:
                # Create template
                product_data = {
                    'name': special_title,
                    'type': 'consu',
                    'is_storable': True,
                    'sale_ok': True,
                    'purchase_ok': False,
                    'categ_id': cat_id,
                }
                if route_id:
                    product_data['route_ids'] = [(6, 0, [route_id])]
                tmpl_id = odoo_client.execute('product.template', 'create', product_data)
                product_ids = odoo_client.execute('product.product', 'search', [('product_tmpl_id', '=', tmpl_id)])
                prod_id = product_ids[0] if product_ids else None

            if prod_id:
                dia.odoo_product_id = prod_id
                db.commit()
            else:
                raise HTTPException(status_code=500, detail="No se pudo obtener o crear la variante de producto en Odoo.")
        else:
            prod_id = dia.odoo_product_id

        # Get template details
        prod_data = odoo_client.execute('product.product', 'read', [prod_id], ['product_tmpl_id', 'uom_id'])
        if not prod_data:
            # Si el producto fue eliminado en Odoo, limpiamos el ID local para que se recree
            dia.odoo_product_id = None
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="El producto base fue eliminado en Odoo. El enlace local ha sido restablecido. Por favor, intente sincronizar nuevamente para recrearlo."
            )
        tmpl_id = prod_data[0]['product_tmpl_id'][0]
        uom_id = prod_data[0]['uom_id'][0]

        # 3. Search and update BoM
        bom_ids = odoo_client.execute('mrp.bom', 'search', [('product_tmpl_id', '=', tmpl_id)])
        total_rations = get_total_raciones_backend(dia, db)
        if not bom_ids:
            bom_data = {
                'product_tmpl_id': tmpl_id,
                'product_id': prod_id,
                'product_qty': total_rations,
                'type': 'normal',
                'ready_to_produce': 'all_available'
            }
            bom_id = odoo_client.execute('mrp.bom', 'create', bom_data)
        else:
            bom_id = bom_ids[0]
            # Delete existing BoM lines
            bom_line_ids = odoo_client.execute('mrp.bom.line', 'search', [('bom_id', '=', bom_id)])
            if bom_line_ids:
                odoo_client.execute('mrp.bom.line', 'unlink', bom_line_ids)

            # Update BoM template qty to the new total rations of the day
            odoo_client.execute('mrp.bom', 'write', [bom_id], {'product_qty': total_rations})

        # 4. Create new BoM lines from updated dishes (total > 0)
        missed_dishes = []
        for p_item in sorted(dia.items, key=sort_items_by_tipo):
            if p_item.total <= 0:
                continue
            comp_ids = odoo_client.execute('product.product', 'search', [('name', '=', p_item.plato_nombre)])
            if comp_ids:
                comp_id = comp_ids[0]
                line_data = {
                    'bom_id': bom_id,
                    'product_id': comp_id,
                    'product_qty': float(p_item.total)
                }
                odoo_client.execute('mrp.bom.line', 'create', line_data)
            else:
                missed_dishes.append(p_item.plato_nombre)

        # 5. Cancel existing Master MOs to recreate them clean
        mo_ids = odoo_client.execute('mrp.production', 'search', [('product_id', '=', prod_id)])
        if mo_ids:
            for m_id in mo_ids:
                # Check if it's done before attempting
                mo_info = odoo_client.execute('mrp.production', 'read', [m_id], ['state'])
                if mo_info and mo_info[0].get('state') == 'done':
                    raise HTTPException(status_code=400, detail="No se puede sincronizar: La Orden Maestra ya está finalizada ('done') en Odoo.")
                    
                try:
                    odoo_client.execute('mrp.production', 'action_cancel', [m_id])
                    odoo_client.execute('mrp.production', 'unlink', [m_id])
                    logger.info(f"Master MO {m_id} eliminada para recreación limpia.")
                except Exception as e:
                    logger.warning(f"No se pudo eliminar la Master MO {m_id}: {e}")
                    raise HTTPException(status_code=400, detail="No se puede sincronizar: No se pudo eliminar la Orden Maestra anterior porque ya tiene movimientos.")
                    
        # 6. Recreate Master MO
        scheduled_date = f"{dia.fecha.strftime('%Y-%m-%d')} 06:00:00"
        picking_type_id = None
        try:
            pt_ids = odoo_client.execute('stock.picking.type', 'search', [('name', 'ilike', '%Fabricación Almuerzo%')])
            if pt_ids:
                picking_type_id = pt_ids[0]
        except Exception:
            pass

        mo_data = {
            'product_id': prod_id,
            'product_qty': total_rations,
            'bom_id': bom_id,
            'product_uom_id': uom_id,
            'date_start': scheduled_date,
            'origin': f'NUT-DIA-{dia.id}'
        }
        if picking_type_id:
            mo_data['picking_type_id'] = picking_type_id

        new_mo_id = odoo_client.execute('mrp.production', 'create', mo_data)
        odoo_client.execute('mrp.production', 'action_confirm', [new_mo_id])
        mo_info = odoo_client.execute('mrp.production', 'read', [new_mo_id], ['name'])
        mo_name = mo_info[0]['name'] if mo_info else f"MO #{new_mo_id}"
        logger.info(f"Master MO creada: {mo_name}")
        dia.ruta_asignada = mo_name
        dia.produccion_establecida = False
        db.commit()

        # 7. Smart Update: Create, Update or Delete explicit MOs for each dish (child MOs)
        child_picking_type_id = None
        try:
            ptypes = odoo_client.execute('stock.picking.type', 'search', [('sequence_code', '=', 'FAB')])
            if not ptypes:
                ptypes = odoo_client.execute('stock.picking.type', 'search', [('name', 'ilike', 'Platos')])
            if ptypes:
                child_picking_type_id = ptypes[0]
        except Exception:
            pass
            
        # Load existing child MOs from Odoo for this day
        origin_str = f"Reabastecimiento manual (NUT-DIA-{dia.id})"
        existing_mo_ids = odoo_client.execute('mrp.production', 'search', [('origin', '=', origin_str)])
        
        existing_mos_by_product = {}
        if existing_mo_ids:
            mo_data_list = odoo_client.execute('mrp.production', 'read', existing_mo_ids, ['product_id', 'state', 'product_qty'])
            for mo in mo_data_list:
                mo_prod_id = mo['product_id'][0]
                existing_mos_by_product[mo_prod_id] = mo

        replenish_results = []
        processed_product_ids = set()

        for p_item in sorted(dia.items, key=sort_items_by_tipo):
            comp_ids = odoo_client.execute('product.product', 'search', [('name', '=', p_item.plato_nombre)])
            if not comp_ids:
                if p_item.total > 0:
                    replenish_results.append({
                        "plato_nombre": p_item.plato_nombre,
                        "status": "error",
                        "message": "Producto no encontrado en Odoo"
                    })
                continue
                
            comp_id = comp_ids[0]
            processed_product_ids.add(comp_id)
            
            existing_mo = existing_mos_by_product.get(comp_id)

            if p_item.total <= 0:
                # If quantity is 0, we must cancel/unlink the MO if it exists
                if existing_mo:
                    try:
                        odoo_client.execute('mrp.production', 'action_cancel', [existing_mo['id']])
                        odoo_client.execute('mrp.production', 'unlink', [existing_mo['id']])
                        replenish_results.append({
                            "plato_nombre": p_item.plato_nombre,
                            "status": "success",
                            "message": "Orden eliminada (cantidad 0)."
                        })
                    except Exception as e_del:
                        logger.warning(f"Error eliminando MO {existing_mo['id']}: {e_del}")
                continue
                
            # If quantity > 0
            if existing_mo:
                if existing_mo.get('state') == 'done':
                    logger.warning(f"Child MO {existing_mo['id']} ya está finalizada ('done'), no se puede recrear. Omitiendo.")
                    replenish_results.append({
                        "plato_nombre": p_item.plato_nombre,
                        "status": "warning",
                        "message": f"Ya está finalizada en Odoo, no se actualizó."
                    })
                    continue
                
                # CANCEL & UNLINK existing child MO to recreate it clean
                try:
                    odoo_client.execute('mrp.production', 'action_cancel', [existing_mo['id']])
                    odoo_client.execute('mrp.production', 'unlink', [existing_mo['id']])
                except Exception as e_del:
                    logger.warning(f"Error eliminando Child MO {existing_mo['id']} para recrearla: {e_del}")
                    replenish_results.append({
                        "plato_nombre": p_item.plato_nombre,
                        "status": "warning",
                        "message": f"No se pudo reemplazar, ignorado para evitar duplicados."
                    })
                    continue

            # CREATE: MO doesn't exist (or was just deleted), create it clean
            try:
                prod_info = odoo_client.execute('product.product', 'read', [comp_id], ['product_tmpl_id', 'uom_id'])
                c_tmpl_id = prod_info[0]['product_tmpl_id'][0]
                c_uom_id = prod_info[0]['uom_id'][0]

                bom_ids = odoo_client.execute('mrp.bom', 'search', [('product_tmpl_id', '=', c_tmpl_id)])
                if not bom_ids:
                    raise Exception(f"No se encontró BoM para {p_item.plato_nombre}")
                c_bom_id = bom_ids[0]

                date_planned = f"{dia.fecha.strftime('%Y-%m-%d')} 11:00:00"
                
                mo_data = {
                    'product_id': comp_id,
                    'product_qty': float(p_item.total),
                    'bom_id': c_bom_id,
                    'product_uom_id': c_uom_id,
                    'date_start': date_planned,
                    'origin': origin_str
                }
                if child_picking_type_id:
                    mo_data['picking_type_id'] = child_picking_type_id

                child_mo_id = odoo_client.execute('mrp.production', 'create', mo_data)
                odoo_client.execute('mrp.production', 'action_confirm', [child_mo_id])
                
                try:
                    odoo_client.execute('mrp.production', 'action_assign', [child_mo_id])
                except Exception as e_assign:
                    logger.warning(f"No se pudo reservar componentes para {child_mo_id}: {e_assign}")

                replenish_results.append({
                    "plato_nombre": p_item.plato_nombre,
                    "status": "success",
                    "message": f"MO Creada/Actualizada ({p_item.total})."
                })
            except Exception as e_rep:
                logger.error(f"Error procesando {p_item.plato_nombre}: {e_rep}")
                replenish_results.append({
                    "plato_nombre": p_item.plato_nombre,
                    "status": "error",
                    "message": str(e_rep)
                })

        # Cleanup any MOs that were in Odoo for this day but are no longer in local dia.items at all
        for prod_id, mo in existing_mos_by_product.items():
            if prod_id not in processed_product_ids:
                try:
                    odoo_client.execute('mrp.production', 'action_cancel', [mo['id']])
                    odoo_client.execute('mrp.production', 'unlink', [mo['id']])
                except Exception as e_del:
                    logger.warning(f"Error eliminando MO sobrante {mo['id']}: {e_del}")

        msg_detail = "re-sincronizado" if is_update else "sincronizado"
        dia.ruta_asignada = mo_name
        dia.produccion_establecida = False
        db.commit()

        return {
            "status": "success",
            "message": f"Día {msg_detail} exitosamente en Odoo ERP 19 y MO {mo_name} confirmada.",
            "mo_id": new_mo_id,
            "mo_name": mo_name,
            "missed_dishes": missed_dishes,
            "replenish_results": replenish_results
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error in actualizar_dia_odoo: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo al actualizar en Odoo: {str(e)}"
        )

class MaterialProduccion(BaseModel):
    product_id: int
    qty: float
    nombre: str = ""  # Nombre del producto en Odoo (para persistir como plato)
    tipo: Optional[str] = None  # Tipo del producto (SOPA, FUERTE, etc)

@router.get("/ordenes-fabricacion/mo-detalle")
def get_mo_detalle(
    mo_name: str,
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna los detalles de una Orden de Fabricación de Odoo por su nombre (ej. NUT/FABAL/01534).
    Incluye: producto, cantidad, estado, fecha, y lista de componentes.
    """
    try:
        # Buscar la MO por nombre
        mo_ids = odoo_client.execute('mrp.production', 'search', [('name', '=', mo_name)])
        if not mo_ids:
            raise HTTPException(status_code=404, detail=f"Orden de fabricación '{mo_name}' no encontrada en Odoo.")
        
        mo_id = mo_ids[0]
        mo_fields = ['name', 'product_id', 'product_qty', 'product_uom_id', 'state', 'date_start', 'bom_id']
        mo_data = odoo_client.execute('mrp.production', 'read', [mo_id], mo_fields)
        if not mo_data:
            raise HTTPException(status_code=404, detail="No se pudo leer la MO.")
        mo = mo_data[0]

        # Leer las líneas de movimiento de componentes (stock.move)
        move_ids = odoo_client.execute('stock.move', 'search', [
            ('raw_material_production_id', '=', mo_id)
        ])
        components = []
        if move_ids:
            move_fields = ['product_id', 'product_uom_qty', 'quantity', 'product_uom', 'state']
            moves = odoo_client.execute('stock.move', 'read', move_ids, move_fields)
            for mv in moves:
                components.append({
                    'product_id': mv['product_id'][0] if mv.get('product_id') else None,
                    'product_name': mv['product_id'][1] if mv.get('product_id') else '?',
                    'qty_to_consume': mv.get('product_uom_qty', 0),
                    'qty_consumed': mv.get('quantity', 0),
                    'uom': mv['product_uom'][1] if mv.get('product_uom') else 'Und',
                    'state': mv.get('state', '')
                })

        state_map = {
            'draft': 'Borrador',
            'confirmed': 'Confirmado',
            'progress': 'En progreso',
            'to_close': 'Por cerrar',
            'done': 'Hecho',
            'cancel': 'Cancelado'
        }

        return {
            'mo_id': mo_id,
            'name': mo.get('name', mo_name),
            'product_name': mo['product_id'][1] if mo.get('product_id') else '?',
            'qty': mo.get('product_qty', 0),
            'uom': mo['product_uom_id'][1] if mo.get('product_uom_id') else 'Und',
            'state': state_map.get(mo.get('state', ''), mo.get('state', '')),
            'date_start': str(mo.get('date_start', '')),
            'bom_name': mo['bom_id'][1] if mo.get('bom_id') else None,
            'components': components
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al leer MO {mo_name} de Odoo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class NuevaProduccionRequest(BaseModel):
    nombre: str
    fecha: str
    turno: str
    tipo_menu: str
    cliente_nombre: str
    cantidad: int = 1
    materiales: List[MaterialProduccion]

@router.post("/ordenes-fabricacion/nueva-produccion")
def nueva_produccion(
    payload: NuevaProduccionRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Agrega platos/materiales manualmente al día.
    En lugar de crear un producto "combo", ahora agrega cada material como un plato individual
    en la tabla del planificador y genera sus respectivas órdenes en Odoo.
    """
    try:
        # 1. Asegurar Turno y Tipo de Menú (agregando " (Manual)" para separar en Despacho Día)
        fecha_obj = datetime.strptime(payload.fecha, "%Y-%m-%d").date()
        turno_obj = db.query(Turno).filter(Turno.nombre == payload.turno).first()
        
        tipo_menu_nombre = payload.tipo_menu.strip()
        if "manual" not in tipo_menu_nombre.lower():
            tipo_menu_nombre = f"{tipo_menu_nombre} (Manual)"
            
        tipo_menu_obj = db.query(TipoMenu).filter(TipoMenu.nombre == tipo_menu_nombre).first()
        if not tipo_menu_obj:
            tipo_menu_obj = TipoMenu(nombre=tipo_menu_nombre)
            db.add(tipo_menu_obj)
            db.flush()

        turno_id = turno_obj.id if turno_obj else None
        tipo_menu_id = tipo_menu_obj.id
        
        # 2. Persistir localmente en OrdenProduccionDia e ItemOrdenProduccion
        dia = db.query(OrdenProduccionDia).filter(
            OrdenProduccionDia.fecha == fecha_obj,
            OrdenProduccionDia.turno_id == turno_id,
            OrdenProduccionDia.tipo_menu_id == tipo_menu_id
        ).first()
        
        if not dia:
            dia = OrdenProduccionDia(
                fecha=fecha_obj, 
                turno_id=turno_id,
                tipo_menu_id=tipo_menu_id
            )
            db.add(dia)
            db.commit()
            db.refresh(dia)
            
        # 2b. Crear múltiples OrdenProduccionItem, uno por cada ingrediente
        for mat in payload.materiales:
            item = OrdenProduccionItem(
                orden_dia_id=dia.id,
                plato_nombre=mat.nombre,
                tipo=mat.tipo or "COMPONENTE",
                total=mat.qty,
                cantidades_clientes={
                    payload.cliente_nombre: {"cant": mat.qty, "pct": 100},
                    "_meta": {"is_manual_child": True, "master_mo": payload.nombre.strip()}
                },
                odoo_product_id=mat.product_id
            )
            db.add(item)
        db.commit()
        
        if not dia.ruta_asignada:
            dia.ruta_asignada = payload.nombre.strip()
            db.commit()

        return {"status": "success", "mo_name": dia.ruta_asignada, "product_id": None, "dia_id": dia.id}
    except Exception as e:
        logger.error(f"Error en nueva_produccion: {e}")
        raise HTTPException(status_code=500, detail=str(e))
