import re
from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import date
from typing import List, Dict, Any, Optional
import base64
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import (
    OrdenProduccionDia, OrdenProduccionItem, TipoMenu, Turno,
    DespachoCliente, DespachoClienteProducto, DespachoClientePesaje,
    Usuario, ChoferHabilitado, PlacaVehiculo, ClienteOdooMapping,
    ClienteSupervisor
)
from app.api.deps import get_current_user
from app.services.odoo_client import OdooClient

router = APIRouter()
config_router = APIRouter()
odoo_client = OdooClient()

# --- Pydantic Schemas ---
class NovedadUpdate(BaseModel):
    novedad: str

class ChoferHabilitadoItem(BaseModel):
    odoo_partner_id: int
    nombre_chofer: str
    activo: bool = True

class PlacaCreate(BaseModel):
    placa: str
    descripcion_vehiculo: Optional[str] = None
    activo: bool = True

class PlacaUpdate(BaseModel):
    descripcion_vehiculo: Optional[str] = None
    activo: Optional[bool] = None

class MapearClienteRequest(BaseModel):
    cliente_local_nombre: str
    odoo_partner_id: int
    odoo_partner_name: str
    odoo_street: Optional[str] = None

class GenerarGuiaRequest(BaseModel):
    transportista_id: Optional[int] = None
    transportista_nombre: Optional[str] = None
    placa_vehiculo: str
    direccion_entrega: Optional[str] = None
    partner_id: Optional[int] = None
    cliente_local_nombre: Optional[str] = None

class FinalizarDespachoRequest(BaseModel):
    fecha: Optional[date] = None
    cliente_nombre: str
    despacho_id: Optional[int] = None

class AsignarSupervisorRequest(BaseModel):
    cliente_nombre: str
    supervisor_id: Optional[int]

class PesajeCreate(BaseModel):
    unidades: int
    peso_bruto: float
    taras_seleccionadas: list = []
    porciones_seleccionadas: list = []
    peso_tara: float = 0.0

class PesajeUpdate(BaseModel):
    unidades: int
    peso_bruto: float
    taras_seleccionadas: list = []
    porciones_seleccionadas: list = []
    peso_tara: float = 0.0

@router.get("/dias-habilitados")
def get_dias_habilitados(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna la lista de fechas habilitadas para despacho a cliente.
    Estructura esperada por el UI:
    [
      {
         "fecha": "YYYY-MM-DD",
         "grupos": [
             {
                 "turno_nombre": "Mañana",
                 "menu_nombre": "Almuerzo Tipo 1",
                 "items": [...] 
             }
         ]
      }
    ]
    """
    ordenes = db.query(OrdenProduccionDia).options(
        joinedload(OrdenProduccionDia.tipo_menu),
        joinedload(OrdenProduccionDia.turno),
        joinedload(OrdenProduccionDia.items)
    ).filter(OrdenProduccionDia.enviado_despacho_cliente == True).all()

    # Agrupar por fecha
    fechas_dict = {}
    for o in ordenes:
        fecha_str = o.fecha.isoformat()
        if fecha_str not in fechas_dict:
            fechas_dict[fecha_str] = []
        
        fechas_dict[fecha_str].append({
            "turno_nombre": o.turno.nombre if o.turno else "Sin Turno",
            "menu_nombre": o.tipo_menu.nombre if o.tipo_menu else "Sin Menú",
            "items": [{"plato_nombre": i.plato_nombre, "tipo": i.tipo} for i in o.items]
        })

    resultado = []
    for f, grupos in fechas_dict.items():
        resultado.append({
            "fecha": f,
            "grupos": grupos
        })
        
    return resultado


@router.get("/transportistas")
def get_transportistas(
    q: str = "",
    force_refresh: bool = False,
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna la lista de todos los contactos de Odoo para la selección de chofer / transportista.
    """
    return odoo_client.search_transportistas(query=q, force_refresh=force_refresh)


# =========================================================================
# CONFIGURACIÓN: CHOFERES HABILITADOS Y PLACAS VEHICULARES
# =========================================================================

PLACA_REGEX = r"^[A-Z0-9]{1,5}-[A-Z0-9]+$"

@config_router.get("/choferes-odoo")
def get_choferes_odoo(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Trae la lista completa de contactos desde Odoo (res.partner) cruzada con 
    los choferes registrados/habilitados en PostgreSQL (choferes_habilitados).
    """
    all_partners = odoo_client.search_transportistas()
    habilitados = db.query(ChoferHabilitado).all()
    habilitados_map = {h.odoo_partner_id: h.activo for h in habilitados}
    
    result = []
    for p in all_partners:
        p_id = p['id']
        is_active = habilitados_map.get(p_id, False)
        result.append({
            "id": p_id,
            "name": p.get('name', ''),
            "vat": p.get('vat', ''),
            "phone": p.get('phone', ''),
            "street": p.get('street', ''),
            "activo": is_active
        })
    return result


@config_router.post("/choferes-habilitados")
def save_choferes_habilitados(
    payload: Any = Body(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Guarda o actualiza las preferencias de choferes habilitados en PostgreSQL.
    Acepta una lista directa o un objeto { choferes: [...] }.
    """
    items = []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict) and "choferes" in payload:
        items = payload["choferes"]
    else:
        raise HTTPException(status_code=400, detail="Formato no válido. Se espera una lista o { choferes: [...] }")

    for item in items:
        partner_id = item.get("odoo_partner_id") if isinstance(item, dict) else getattr(item, "odoo_partner_id", None)
        nombre = item.get("nombre_chofer") if isinstance(item, dict) else getattr(item, "nombre_chofer", "")
        activo = item.get("activo", True) if isinstance(item, dict) else getattr(item, "activo", True)

        if not partner_id:
            continue

        existing = db.query(ChoferHabilitado).filter(ChoferHabilitado.odoo_partner_id == partner_id).first()
        if existing:
            if nombre:
                existing.nombre_chofer = nombre
            existing.activo = bool(activo)
            existing.updated_at = func.now()
        else:
            new_ch = ChoferHabilitado(
                odoo_partner_id=partner_id,
                nombre_chofer=nombre or f"Chofer #{partner_id}",
                activo=bool(activo)
            )
            db.add(new_ch)

    db.commit()
    total_activos = db.query(ChoferHabilitado).filter(ChoferHabilitado.activo == True).count()
    return {
        "status": "success",
        "message": "Preferencias de choferes guardadas exitosamente",
        "total_activos": total_activos
    }


@config_router.get("/choferes-activos")
def get_choferes_activos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna exclusivamente los choferes marcados como habilitados/activos en PostgreSQL.
    Enriquece la información con vat y street desde la memoria/cache de Odoo.
    """
    habilitados = db.query(ChoferHabilitado).filter(ChoferHabilitado.activo == True).order_by(ChoferHabilitado.nombre_chofer.asc()).all()
    if not habilitados:
        return []

    partners = odoo_client.search_transportistas()
    partners_map = {p['id']: p for p in partners}

    result = []
    for h in habilitados:
        odoo_p = partners_map.get(h.odoo_partner_id, {})
        result.append({
            "id": h.odoo_partner_id,
            "name": h.nombre_chofer,
            "vat": odoo_p.get('vat', ''),
            "phone": odoo_p.get('phone', ''),
            "street": odoo_p.get('street', ''),
            "activo": True
        })
    return result


@config_router.get("/placas")
def get_placas(
    solo_activas: bool = True,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna las placas vehiculares registradas en PostgreSQL.
    """
    query = db.query(PlacaVehiculo)
    if solo_activas:
        query = query.filter(PlacaVehiculo.activo == True)
    placas = query.order_by(PlacaVehiculo.placa.asc()).all()

    return [
        {
            "id": p.id,
            "placa": p.placa,
            "descripcion_vehiculo": p.descripcion_vehiculo,
            "activo": p.activo,
            "created_at": p.created_at.isoformat() if p.created_at else None
        }
        for p in placas
    ]


@config_router.post("/placas")
def create_placa(
    data: PlacaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Registra una nueva placa con validación estricta de formato y auto-transformación a mayúsculas.
    Formato: ^[A-Z0-9]{1,5}-[A-Z0-9]+$ con al menos 3 dígitos/caracteres en la segunda parte.
    """
    raw_placa = (data.placa or "").strip().upper()
    if not raw_placa:
        raise HTTPException(status_code=400, detail="La placa no puede estar vacía.")

    # 1. Validación regex general
    if not re.match(PLACA_REGEX, raw_placa):
        raise HTTPException(
            status_code=400,
            detail="Formato inválido. Ejemplo correcto: ABC-1234 (hasta 5 caracteres alfanuméricos, guion y serie numérica)."
        )

    # 2. Validación de partes (debe contener un guión y segunda parte >= 3 caracteres alfanuméricos)
    parts = raw_placa.split("-")
    if len(parts) != 2:
        raise HTTPException(
            status_code=400,
            detail="Formato inválido. Debe contener exactamente un guion separador (ej. ABC-1234)."
        )

    if len(parts[1]) < 3:
        raise HTTPException(
            status_code=400,
            detail="Formato inválido. La numeración después del guion debe contener al menos 3 caracteres (ej. ABC-1234 o GS12-098)."
        )

    # 3. Comprobar si ya existe
    existente = db.query(PlacaVehiculo).filter(PlacaVehiculo.placa == raw_placa).first()
    if existente:
        if not existente.activo:
            existente.activo = True
            if data.descripcion_vehiculo:
                existente.descripcion_vehiculo = data.descripcion_vehiculo.strip()
            db.commit()
            db.refresh(existente)
            return {
                "id": existente.id,
                "placa": existente.placa,
                "descripcion_vehiculo": existente.descripcion_vehiculo,
                "activo": existente.activo,
                "message": "Placa reactivada exitosamente."
            }
        raise HTTPException(status_code=400, detail=f"La placa '{raw_placa}' ya se encuentra registrada.")

    nueva_placa = PlacaVehiculo(
        placa=raw_placa,
        descripcion_vehiculo=data.descripcion_vehiculo.strip() if data.descripcion_vehiculo else None,
        activo=data.activo
    )
    db.add(nueva_placa)
    db.commit()
    db.refresh(nueva_placa)

    return {
        "id": nueva_placa.id,
        "placa": nueva_placa.placa,
        "descripcion_vehiculo": nueva_placa.descripcion_vehiculo,
        "activo": nueva_placa.activo,
        "message": "Placa registrada exitosamente."
    }


@config_router.delete("/placas/{placa_id}")
def delete_placa(
    placa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    p = db.query(PlacaVehiculo).filter(PlacaVehiculo.id == placa_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Placa no encontrada")
    db.delete(p)
    db.commit()
    return {"status": "success", "message": "Placa eliminada correctamente."}


@config_router.put("/placas/{placa_id}/toggle")
def toggle_placa(
    placa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    p = db.query(PlacaVehiculo).filter(PlacaVehiculo.id == placa_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Placa no encontrada")
    p.activo = not p.activo
    db.commit()
    return {"status": "success", "id": p.id, "activo": p.activo}


# =========================================================================
# CONFIGURACIÓN: MAPEO DE CLIENTES LOCALES VS ODOO (res.partner)
# =========================================================================

@config_router.get("/clientes-odoo")
def get_clientes_odoo(
    query: str = "",
    current_user: Usuario = Depends(get_current_user)
):
    """
    Búsqueda en tiempo real de contactos y empresas en Odoo (res.partner).
    """
    return odoo_client.search_clientes_odoo(query=query)


@config_router.post("/mapear-cliente")
def mapear_cliente_odoo(
    data: MapearClienteRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Asocia y persiste un cliente local con su contacto oficial en Odoo (res.partner).
    """
    cliente_local = data.cliente_local_nombre.strip()
    if not cliente_local:
        raise HTTPException(status_code=400, detail="El nombre del cliente local es obligatorio.")
    if not data.odoo_partner_id:
        raise HTTPException(status_code=400, detail="El ID del partner de Odoo es obligatorio.")

    mapping = db.query(ClienteOdooMapping).filter(ClienteOdooMapping.cliente_local_nombre == cliente_local).first()
    if mapping:
        mapping.odoo_partner_id = data.odoo_partner_id
        mapping.odoo_partner_name = data.odoo_partner_name
        mapping.odoo_street = data.odoo_street or ""
        mapping.updated_at = func.now()
    else:
        mapping = ClienteOdooMapping(
            cliente_local_nombre=cliente_local,
            odoo_partner_id=data.odoo_partner_id,
            odoo_partner_name=data.odoo_partner_name,
            odoo_street=data.odoo_street or ""
        )
        db.add(mapping)

    db.commit()
    db.refresh(mapping)
    return {
        "status": "success",
        "message": f"Cliente '{cliente_local}' mapeado exitosamente con Odoo Partner #{data.odoo_partner_id} ({data.odoo_partner_name})",
        "mapping": {
            "id": mapping.id,
            "cliente_local_nombre": mapping.cliente_local_nombre,
            "odoo_partner_id": mapping.odoo_partner_id,
            "odoo_partner_name": mapping.odoo_partner_name,
            "odoo_street": mapping.odoo_street
        }
    }


@config_router.get("/mapeo-cliente")
@config_router.get("/mapeo-cliente/{cliente_local_nombre:path}")
def get_mapeo_cliente_odoo(
    cliente_local_nombre: Optional[str] = None,
    nombre: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna el mapeo existente en PostgreSQL para un cliente local dado.
    Soporta nombres con barras diagonales '/' mediante :path o query parameter.
    """
    target = cliente_local_nombre or nombre or ""
    cliente_local = target.strip()
    mapping = db.query(ClienteOdooMapping).filter(ClienteOdooMapping.cliente_local_nombre == cliente_local).first()
    if not mapping:
        return {"mapped": False, "mapping": None}
    return {
        "mapped": True,
        "mapping": {
            "id": mapping.id,
            "cliente_local_nombre": mapping.cliente_local_nombre,
            "odoo_partner_id": mapping.odoo_partner_id,
            "odoo_partner_name": mapping.odoo_partner_name,
            "odoo_street": mapping.odoo_street
        }
    }


# Incluir config_router en el router principal de dispatch_cliente ANTES de /{fecha}
router.include_router(config_router, prefix="/config")



@router.get("/{fecha}")
def get_client_dispatch_by_date(
    fecha: date,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    # Traemos todas las órdenes de producción del día
    ordenes = db.query(OrdenProduccionDia).options(
        joinedload(OrdenProduccionDia.tipo_menu),
        joinedload(OrdenProduccionDia.turno),
        joinedload(OrdenProduccionDia.items)
    ).filter(OrdenProduccionDia.fecha == fecha).all()

    # Mapearemos a la estructura que espera el frontend
    # { cliente_nombre: [ { orden_dia_id, tipo_menu, turno, items: [...] }, ... ] }
    
    # 1. Aseguramos que existan los DespachoCliente y DespachoClienteProducto
    IGNORED_CLIENT_KEYS = {"__manual_qty__", "TOTAL", "CANT TOTAL"}
    for orden in ordenes:
        # Encontramos todos los clientes únicos en esta orden a partir de las cantidades de los ítems
        clientes_en_orden = set()
        for item in orden.items:
            if isinstance(item.cantidades_clientes, dict):
                for cliente_nombre, val in item.cantidades_clientes.items():
                    if (
                        cliente_nombre
                        and cliente_nombre not in IGNORED_CLIENT_KEYS
                        and not str(cliente_nombre).startswith("__")
                        and isinstance(val, dict)
                    ):
                        clientes_en_orden.add(cliente_nombre)
        
        for cliente_nombre in clientes_en_orden:
            # Buscar o crear DespachoCliente
            despacho_cliente = db.query(DespachoCliente).filter(
                DespachoCliente.orden_dia_id == orden.id,
                DespachoCliente.cliente_nombre == cliente_nombre
            ).first()
            
            if not despacho_cliente:
                despacho_cliente = DespachoCliente(
                    orden_dia_id=orden.id,
                    cliente_nombre=cliente_nombre,
                    estado="borrador",
                    usuario_id=current_user.id,
                    ruta_asignada=orden.ruta_asignada
                )
                db.add(despacho_cliente)
                db.commit()
                db.refresh(despacho_cliente)
            
            # Buscar o crear los Productos de ese Despacho
            for item in orden.items:
                if isinstance(item.cantidades_clientes, dict) and cliente_nombre in item.cantidades_clientes:
                    cant_dict = item.cantidades_clientes[cliente_nombre]
                    if isinstance(cant_dict, dict):
                        cantidad_teorica = float(cant_dict.get('cant', 0))
                        
                        if cantidad_teorica > 0:
                            prod = db.query(DespachoClienteProducto).filter(
                                DespachoClienteProducto.despacho_cliente_id == despacho_cliente.id,
                                DespachoClienteProducto.orden_item_id == item.id
                            ).first()
                            
                            if not prod:
                                prod = DespachoClienteProducto(
                                    despacho_cliente_id=despacho_cliente.id,
                                    orden_item_id=item.id,
                                    cantidad_teorica=cantidad_teorica,
                                    peso_despachado=0.0
                                )
                                db.add(prod)
            db.commit()

    # 2. Re-consultamos los DespachoCliente creados con sus productos y pesajes
    despachos_clientes_db = db.query(DespachoCliente).options(
        joinedload(DespachoCliente.productos).joinedload(DespachoClienteProducto.orden_item),
        joinedload(DespachoCliente.productos).joinedload(DespachoClienteProducto.pesajes)
    ).join(OrdenProduccionDia).filter(
        OrdenProduccionDia.fecha == fecha
    ).all()

    # Construimos la respuesta organizada por cliente
    resultado = {}
    for dc in despachos_clientes_db:
        c_name = dc.cliente_nombre
        if not c_name or c_name in IGNORED_CLIENT_KEYS or str(c_name).startswith("__"):
            continue
            
        productos_formateados = []
        for p in dc.productos:
            productos_formateados.append({
                "id": p.id,
                "orden_item_id": p.orden_item_id,
                "plato_nombre": p.orden_item.plato_nombre,
                "tipo": p.orden_item.tipo,
                "cantidad_teorica": p.cantidad_teorica,
                "peso_despachado": p.peso_despachado,
                "unidades_despachadas": p.unidades_despachadas,
                "novedad": p.novedad,
                "pesajes": [
                    {
                        "id": pes.id,
                        "unidades": pes.unidades,
                        "peso_bruto": pes.peso_bruto,
                        "taras_seleccionadas": pes.taras_seleccionadas or [],
                        "porciones_seleccionadas": pes.porciones_seleccionadas or [],
                        "peso_tara": pes.peso_tara,
                        "peso_neto": pes.peso_neto
                    } for pes in p.pesajes
                ]
            })

        # Solo incluir clientes que tengan productos para despachar
        if not productos_formateados:
            continue

        if c_name not in resultado:
            resultado[c_name] = []
            
        orden_padre = db.query(OrdenProduccionDia).filter(OrdenProduccionDia.id == dc.orden_dia_id).first()
        resultado[c_name].append({
            "despacho_cliente_id": dc.id,
            "orden_dia_id": dc.orden_dia_id,
            "tipo_menu": orden_padre.tipo_menu.nombre if orden_padre.tipo_menu else "Sin Menú",
            "turno": orden_padre.turno.nombre if orden_padre.turno else "Sin Turno",
            "estado": dc.estado,
            "guia_remision_creada": dc.guia_remision_creada,
            "odoo_picking_id": dc.odoo_picking_id,
            "odoo_picking_name": dc.odoo_picking_name,
            "transportista_id": dc.transportista_id,
            "transportista_nombre": dc.transportista_nombre,
            "placa_vehiculo": dc.placa_vehiculo,
            "direccion_entrega": dc.direccion_entrega,
            "productos": productos_formateados
        })
        
    return {"fecha": fecha, "clientes": resultado}


@router.post("/producto/{producto_id}/pesaje")
def add_pesaje_cliente(
    producto_id: int,
    data: PesajeCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    producto = db.query(DespachoClienteProducto).filter(DespachoClienteProducto.id == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto de despacho no encontrado")

    peso_neto = round(data.peso_bruto - data.peso_tara, 3)
    
    nuevo_pesaje = DespachoClientePesaje(
        despacho_cliente_producto_id=producto.id,
        unidades=data.unidades,
        peso_bruto=data.peso_bruto,
        taras_seleccionadas=data.taras_seleccionadas,
        porciones_seleccionadas=data.porciones_seleccionadas,
        peso_tara=data.peso_tara,
        peso_neto=peso_neto
    )
    db.add(nuevo_pesaje)
    
    # Recalculamos el total
    producto.peso_despachado = round(producto.peso_despachado + peso_neto, 3)
    producto.unidades_despachadas += data.unidades
    
    db.commit()
    db.refresh(nuevo_pesaje)
    
    return {"message": "Pesaje agregado", "pesaje": nuevo_pesaje, "peso_despachado": producto.peso_despachado, "unidades_despachadas": producto.unidades_despachadas}


@router.delete("/pesaje/{pesaje_id}")
def delete_pesaje_cliente(
    pesaje_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    pesaje = db.query(DespachoClientePesaje).filter(DespachoClientePesaje.id == pesaje_id).first()
    if not pesaje:
        raise HTTPException(status_code=404, detail="Pesaje no encontrado")
        
    producto = db.query(DespachoClienteProducto).filter(DespachoClienteProducto.id == pesaje.despacho_cliente_producto_id).first()
    
    peso_revertir = pesaje.peso_neto
    unidades_revertir = pesaje.unidades
    db.delete(pesaje)
    
    # Recalculamos
    if producto:
        producto.peso_despachado = round(producto.peso_despachado - peso_revertir, 3)
        producto.unidades_despachadas -= unidades_revertir
        
    db.commit()
    
    return {"message": "Pesaje eliminado", "peso_despachado": producto.peso_despachado if producto else 0, "unidades_despachadas": producto.unidades_despachadas if producto else 0}


@router.put("/pesaje/{pesaje_id}")
def update_pesaje_cliente(
    pesaje_id: int,
    data: PesajeUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    pesaje = db.query(DespachoClientePesaje).filter(DespachoClientePesaje.id == pesaje_id).first()
    if not pesaje:
        raise HTTPException(status_code=404, detail="Pesaje no encontrado")
        
    producto = db.query(DespachoClienteProducto).filter(DespachoClienteProducto.id == pesaje.despacho_cliente_producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto de despacho no encontrado")

    # Revertir totales antiguos
    producto.peso_despachado = round(producto.peso_despachado - pesaje.peso_neto, 3)
    producto.unidades_despachadas -= pesaje.unidades

    # Calcular nuevos valores
    peso_neto_nuevo = round(data.peso_bruto - data.peso_tara, 3)
    
    pesaje.unidades = data.unidades
    pesaje.peso_bruto = data.peso_bruto
    pesaje.taras_seleccionadas = data.taras_seleccionadas
    pesaje.porciones_seleccionadas = data.porciones_seleccionadas
    pesaje.peso_tara = data.peso_tara
    pesaje.peso_neto = peso_neto_nuevo

    # Aplicar nuevos totales
    producto.peso_despachado = round(producto.peso_despachado + peso_neto_nuevo, 3)
    producto.unidades_despachadas += data.unidades

    db.commit()
    db.refresh(pesaje)

    return {
        "message": "Pesaje actualizado",
        "pesaje": pesaje,
        "peso_despachado": producto.peso_despachado,
        "unidades_despachadas": producto.unidades_despachadas
    }


@router.put("/producto/{producto_id}/novedad")
def update_novedad(
    producto_id: int,
    data: NovedadUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    producto = db.query(DespachoClienteProducto).filter(DespachoClienteProducto.id == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto de despacho no encontrado")

    producto.novedad = data.novedad
    db.commit()
    
    return {"message": "Novedad guardada correctamente"}

@router.post("/finalizar")
def finalizar_despacho_cliente_body(
    data: FinalizarDespachoRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Finaliza el despacho para un cliente mediante body JSON (inmune a barras diagonales '/' en el nombre).
    """
    query = db.query(DespachoCliente).join(OrdenProduccionDia)
    if data.fecha:
        query = query.filter(OrdenProduccionDia.fecha == data.fecha)
    if data.despacho_id:
        query = query.filter(DespachoCliente.id == data.despacho_id)
    else:
        query = query.filter(DespachoCliente.cliente_nombre == data.cliente_nombre.strip())
        
    despachos = query.all()
    if not despachos:
        raise HTTPException(status_code=404, detail="No se encontraron despachos para este cliente en la fecha seleccionada.")
        
    for despacho in despachos:
        despacho.estado = "completado"
        despacho.fecha_finalizacion = func.now()
        
    db.commit()
    return {"message": "Despacho finalizado con éxito", "estado": "completado"}


@router.post("/despacho/{despacho_id}/finalizar")
def finalizar_despacho_cliente_por_id(
    despacho_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Finaliza un despacho individual directamente por su ID único.
    """
    despacho = db.query(DespachoCliente).filter(DespachoCliente.id == despacho_id).first()
    if not despacho:
        raise HTTPException(status_code=404, detail="Despacho no encontrado.")
    despacho.estado = "completado"
    despacho.fecha_finalizacion = func.now()
    db.commit()
    return {"message": "Despacho finalizado con éxito", "estado": "completado", "despacho_id": despacho.id}


@router.post("/{fecha}/{cliente_nombre:path}/finalizar")
def finalizar_despacho_cliente(
    fecha: date,
    cliente_nombre: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Finaliza todos los despachos de un cliente para la fecha dada.
    Soporta nombres con '/' gracias al parámetro :path.
    """
    clean_nombre = cliente_nombre.strip()
    despachos = db.query(DespachoCliente).join(OrdenProduccionDia).filter(
        OrdenProduccionDia.fecha == fecha,
        DespachoCliente.cliente_nombre == clean_nombre
    ).all()
    
    if not despachos:
        raise HTTPException(status_code=404, detail=f"No se encontraron despachos para '{clean_nombre}' en la fecha {fecha}.")
        
    for despacho in despachos:
        despacho.estado = "completado"
        despacho.fecha_finalizacion = func.now()
        
    db.commit()
    return {"message": "Despacho finalizado con éxito", "estado": "completado"}


@router.post("/{fecha}/{cliente_nombre:path}/sincronizar-cantidades")
def sincronizar_cantidades_cliente(
    fecha: date,
    cliente_nombre: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Sincroniza las cantidades solicitadas desde las Órdenes de Fabricación hacia el despacho del cliente.
    """
    clean_nombre = cliente_nombre.strip()
    despachos = db.query(DespachoCliente).join(OrdenProduccionDia).filter(
        OrdenProduccionDia.fecha == fecha,
        DespachoCliente.cliente_nombre == clean_nombre
    ).all()
    
    if not despachos:
        raise HTTPException(status_code=404, detail=f"No se encontraron despachos para '{clean_nombre}' en la fecha {fecha}.")
        
    for despacho in despachos:
        orden = db.query(OrdenProduccionDia).options(joinedload(OrdenProduccionDia.items)).filter(OrdenProduccionDia.id == despacho.orden_dia_id).first()
        if not orden:
            continue
            
        nuevas_cantidades = {}
        for item in orden.items:
            if isinstance(item.cantidades_clientes, dict) and clean_nombre in item.cantidades_clientes:
                cant_dict = item.cantidades_clientes[clean_nombre]
                if isinstance(cant_dict, dict):
                    cantidad_teorica = float(cant_dict.get('cant', 0))
                    nuevas_cantidades[item.id] = cantidad_teorica

        # Actualizar existentes
        productos_existentes = db.query(DespachoClienteProducto).filter(DespachoClienteProducto.despacho_cliente_id == despacho.id).all()
        productos_existentes_ids = set()
        for p in productos_existentes:
            productos_existentes_ids.add(p.orden_item_id)
            nueva_cant = nuevas_cantidades.get(p.orden_item_id, 0.0)
            p.cantidad_teorica = nueva_cant
            
        # Añadir nuevos
        for item_id, cant in nuevas_cantidades.items():
            if item_id not in productos_existentes_ids and cant > 0:
                nuevo_prod = DespachoClienteProducto(
                    despacho_cliente_id=despacho.id,
                    orden_item_id=item_id,
                    cantidad_teorica=cant,
                    peso_despachado=0.0
                )
                db.add(nuevo_prod)

    db.commit()
    return {"message": "Cantidades sincronizadas con éxito."}



# --- Endpoints de Guía de Remisión Odoo ---

@router.get("/despacho/{despacho_id}/info-guia")
def get_info_guia(
    despacho_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtiene la información consolidada para generar la guía de remisión de un despacho.
    """
    dc = db.query(DespachoCliente).options(
        joinedload(DespachoCliente.productos).joinedload(DespachoClienteProducto.orden_item),
        joinedload(DespachoCliente.productos).joinedload(DespachoClienteProducto.pesajes)
    ).filter(DespachoCliente.id == despacho_id).first()

    if not dc:
        raise HTTPException(status_code=404, detail="Despacho no encontrado")

    # Dirección y Cliente Odoo:
    # 1. Comprobar si existe mapeo previo en cliente_odoo_mapping
    mapping = db.query(ClienteOdooMapping).filter(ClienteOdooMapping.cliente_local_nombre == dc.cliente_nombre).first()
    if mapping:
        partner_id = mapping.odoo_partner_id
        odoo_partner_name = mapping.odoo_partner_name
        direccion = mapping.odoo_street if mapping.odoo_street else dc.cliente_nombre
        is_mapped = True
    else:
        partner = odoo_client.find_partner_by_name(dc.cliente_nombre)
        if partner:
            partner_id = partner.get('id')
            odoo_partner_name = partner.get('name')
            direccion = partner.get('street') if partner.get('street') else dc.cliente_nombre
            is_mapped = False
        else:
            partner_id = None
            odoo_partner_name = None
            direccion = dc.cliente_nombre
            is_mapped = False

    # Consolidar Platos
    platos = []
    for p in dc.productos:
        platos.append({
            "id": p.id,
            "plato_nombre": p.orden_item.plato_nombre,
            "tipo": p.orden_item.tipo,
            "cantidad_teorica": p.cantidad_teorica,
            "peso_despachado": p.peso_despachado,
            "unidades_despachadas": p.unidades_despachadas
        })

    # Consolidar Taras usadas con fotos de Odoo
    envases_odoo = odoo_client.get_envases()
    envases_map = {e['id']: e for e in envases_odoo}

    taras_map = {}
    for p in dc.productos:
        for pes in p.pesajes:
            for t in (pes.taras_seleccionadas or []):
                t_id = t.get('id')
                if t_id:
                    qty = int(t.get('qty', 1))
                    if t_id not in taras_map:
                        envase_match = envases_map.get(t_id, {})
                        taras_map[t_id] = {
                            "id": t_id,
                            "name": t.get('name', 'Envase'),
                            "peso_tara": float(t.get('peso_tara') or t.get('weight') or 0.0),
                            "cantidad": 0,
                            "photo": t.get('photo') or envase_match.get('photo', '')
                        }
                    taras_map[t_id]["cantidad"] += qty

    taras_resumen = list(taras_map.values())

    return {
        "despacho_id": dc.id,
        "cliente_nombre": dc.cliente_nombre,
        "direccion_entrega": direccion,
        "partner_id": partner_id,
        "odoo_partner_name": odoo_partner_name,
        "is_mapped": is_mapped,
        "guia_remision_creada": dc.guia_remision_creada,
        "odoo_picking_id": dc.odoo_picking_id,
        "odoo_picking_name": dc.odoo_picking_name,
        "transportista_id": dc.transportista_id,
        "transportista_nombre": dc.transportista_nombre,
        "placa_vehiculo": dc.placa_vehiculo,
        "platos": platos,
        "taras": taras_resumen
    }


@router.post("/despacho/{despacho_id}/generar-guia")
@router.post("/cliente/{despacho_id}/generar-guia")
def generar_guia_remision(
    despacho_id: int,
    data: GenerarGuiaRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Ejecuta el flujo de Guía de Remisión en Odoo:
    Paso 1: Ingreso Técnico a NUT/stock
    Paso 2: Despacho / Entrega con Chofer y Placa
    Paso 3: Timbrado oficial EDI con Código de Barras y descarga de PDF
    """
    dc = db.query(DespachoCliente).options(
        joinedload(DespachoCliente.productos).joinedload(DespachoClienteProducto.orden_item),
        joinedload(DespachoCliente.productos).joinedload(DespachoClienteProducto.pesajes)
    ).filter(DespachoCliente.id == despacho_id).first()

    if not dc:
        raise HTTPException(status_code=404, detail="Despacho no encontrado")

    # 1. Resolver partner en Odoo:
    partner_id = data.partner_id
    if not partner_id:
        mapping = db.query(ClienteOdooMapping).filter(ClienteOdooMapping.cliente_local_nombre == dc.cliente_nombre).first()
        if mapping:
            partner_id = mapping.odoo_partner_id
        else:
            client_partner = odoo_client.find_partner_by_name(dc.cliente_nombre)
            partner_id = client_partner['id'] if client_partner else 5 # Fallback a Clientes (id 5)

    # 2. Recolectar productos principales (platos)
    items_para_movimiento = []
    
    for p in dc.productos:
        # Buscar el ID del producto en Odoo por su plato_nombre
        prod_odoo = odoo_client.find_product_by_name(p.orden_item.plato_nombre)
        if prod_odoo:
            p_id = prod_odoo['id']
            uom_id = prod_odoo['uom_id'][0] if isinstance(prod_odoo.get('uom_id'), (list, tuple)) else (prod_odoo.get('uom_id') or 1)
        else:
            # Si no se encuentra en Odoo por nombre, buscamos si tiene odoo_product_id asignado
            p_id = p.orden_item.odoo_product_id
            uom_id = 1
        
        # Tomar Porciones Despachadas (unidades_despachadas) para la Guía de Remisión
        cant_despachada = float(p.unidades_despachadas or 0)
        if p_id and cant_despachada > 0:
            items_para_movimiento.append({
                'product_id': p_id,
                'qty': cant_despachada,
                'uom_id': uom_id
            })

    # 3. Recolectar taras y envases utilizados
    taras_map = {}
    for p in dc.productos:
        for pes in p.pesajes:
            for t in (pes.taras_seleccionadas or []):
                t_id = t.get('id')
                if t_id:
                    qty = int(t.get('qty', 1))
                    taras_map[t_id] = taras_map.get(t_id, 0) + qty

    for t_id, total_qty in taras_map.items():
        if total_qty > 0:
            items_para_movimiento.append({
                'product_id': int(t_id),
                'qty': float(total_qty),
                'uom_id': 1 # Unidades
            })

    if not items_para_movimiento:
        raise HTTPException(status_code=400, detail="No hay productos válidos con ID de Odoo para despachar.")

    try:
        # FASE 1: Ingreso Técnico a NUT/stock
        ingreso = odoo_client.crear_ingreso_nut_stock(
            items=items_para_movimiento,
            origin=f"Ingreso Técnico - {dc.cliente_nombre}"
        )
        dc.odoo_ingreso_picking_id = ingreso['picking_id']
        dc.odoo_ingreso_picking_name = ingreso['picking_name']

        # Resolver dirección de entrega
        dir_entrega = data.direccion_entrega
        if not dir_entrega:
            mapping = db.query(ClienteOdooMapping).filter(ClienteOdooMapping.cliente_local_nombre == dc.cliente_nombre).first()
            dir_entrega = mapping.odoo_street if mapping and mapping.odoo_street else dc.cliente_nombre
        dc.direccion_entrega = dir_entrega

        # FASE 2: Despacho / Guía de Remisión a Cliente
        salida = odoo_client.crear_despacho_guia_remision(
            partner_id=partner_id,
            transporter_id=data.transportista_id,
            plate_number=data.placa_vehiculo,
            items=items_para_movimiento,
            origin=f"Guía Despacho - {dc.cliente_nombre}",
            transfer_reason="Despacho a Cliente",
            delivery_address=dir_entrega
        )
        dc.odoo_picking_id = salida['picking_id']
        dc.odoo_picking_name = salida['picking_name']

        # FASE 3: Descarga del reporte PDF
        pdf_bytes = odoo_client.obtener_pdf_guia_remision(salida['picking_id'])
        pdf_b64 = base64.b64encode(pdf_bytes).decode('utf-8')
        dc.pdf_guia_base64 = pdf_b64

        # Actualizar datos de guía en la BD
        dc.guia_remision_creada = True
        dc.transportista_id = data.transportista_id
        dc.transportista_nombre = data.transportista_nombre
        dc.fecha_guia_remision = func.now()

        db.commit()

        return {
            "status": "ok",
            "message": "Guía de remisión generada exitosamente en Odoo",
            "picking_id": dc.odoo_picking_id,
            "picking_name": dc.odoo_picking_name,
            "ingreso_picking_name": dc.odoo_ingreso_picking_name,
            "pdf_base64": pdf_b64
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error en integración con Odoo: {str(e)}")


@router.get("/despacho/{despacho_id}/guia-pdf")
def get_guia_pdf(
    despacho_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna el documento PDF de la guía de remisión para visualización o descarga.
    """
    dc = db.query(DespachoCliente).filter(DespachoCliente.id == despacho_id).first()
    if not dc:
        raise HTTPException(status_code=404, detail="Despacho no encontrado")

    if not dc.pdf_guia_base64:
        if dc.odoo_picking_id:
            # Reintentar obtenerlo de Odoo
            try:
                pdf_bytes = odoo_client.obtener_pdf_guia_remision(dc.odoo_picking_id)
                dc.pdf_guia_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
                db.commit()
            except Exception as e:
                raise HTTPException(status_code=404, detail=f"No se pudo recuperar el PDF de Odoo: {str(e)}")
        else:
            raise HTTPException(status_code=404, detail="No se ha generado guía de remisión para este despacho")

    pdf_content = base64.b64decode(dc.pdf_guia_base64)
    filename = f"Guia_{dc.odoo_picking_name.replace('/', '_') if dc.odoo_picking_name else dc.id}.pdf"

    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename={filename}"
        }
    )


# =========================================================================
# CONFIGURACIÓN DE SUPERVISORES
# =========================================================================

@config_router.get("/supervisores-clientes")
def get_supervisores_clientes(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna la lista de clientes con sus supervisores asignados.
    """
    if current_user.rol.lower() not in ["admin", "gerencia", "auditor"]:
        raise HTTPException(status_code=403, detail="No autorizado")
        
    clientes_bd = db.query(DespachoCliente.cliente_nombre).distinct().all()
    clientes_lista = [c[0] for c in clientes_bd if c[0]]
    
    mapeos = db.query(ClienteSupervisor).options(joinedload(ClienteSupervisor.supervisor)).all()
    map_dict = {m.cliente_nombre: m for m in mapeos}
    
    supervisores_disp = db.query(Usuario).filter(Usuario.rol.ilike("supervisor"), Usuario.activo == True).all()
    supervisores_list = [{"id": s.id, "nombre": s.nombre, "username": s.username} for s in supervisores_disp]
    
    resultado = []
    for c in sorted(clientes_lista):
        asignacion = map_dict.get(c)
        resultado.append({
            "cliente_nombre": c,
            "supervisor_id": asignacion.supervisor_id if asignacion else None,
            "supervisor_nombre": asignacion.supervisor.nombre if asignacion and asignacion.supervisor else "Sin Asignar"
        })
        
    return {
        "clientes": resultado,
        "supervisores": supervisores_list
    }

@config_router.post("/asigna-supervisor")
def asigna_supervisor(
    req: AsignarSupervisorRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Asigna un supervisor a un cliente.
    """
    if current_user.rol.lower() not in ["admin", "gerencia", "auditor"]:
        raise HTTPException(status_code=403, detail="No autorizado")
        
    asignacion = db.query(ClienteSupervisor).filter(ClienteSupervisor.cliente_nombre == req.cliente_nombre).first()
    if not asignacion:
        asignacion = ClienteSupervisor(cliente_nombre=req.cliente_nombre)
        db.add(asignacion)
        
    asignacion.supervisor_id = req.supervisor_id
    db.commit()
    
    return {"status": "ok"}


@router.get("/validar-supervisores")
def validar_supervisores(
    fecha: date,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Valida si todos los clientes programados para una fecha tienen supervisor.
    """
    clientes_fecha = db.query(DespachoCliente.cliente_nombre)\
        .join(OrdenProduccionDia, DespachoCliente.orden_dia_id == OrdenProduccionDia.id)\
        .filter(func.date(OrdenProduccionDia.fecha) == fecha, OrdenProduccionDia.enviado_despacho_cliente == True)\
        .distinct().all()
    
    clientes_lista = [c[0] for c in clientes_fecha if c[0]]
    
    sin_supervisor = []
    for c in clientes_lista:
        asignacion = db.query(ClienteSupervisor).filter(ClienteSupervisor.cliente_nombre == c).first()
        if not asignacion or not asignacion.supervisor_id:
            sin_supervisor.append(c)
            
    return {
        "valido": len(sin_supervisor) == 0,
        "clientes_sin_supervisor": sin_supervisor
    }

