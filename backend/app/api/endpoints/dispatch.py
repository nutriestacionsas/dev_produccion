from fastapi import APIRouter, Depends, HTTPException, status

from sqlalchemy.orm import Session, joinedload

from typing import List, Dict, Any, Optional

from pydantic import BaseModel

from app.core.database import get_db

from app.models.models import (

    Despacho, 

    DespachoProducto, 

    DespachoPesaje, 

    DiaPlanificado, 

    Usuario,

    GrupoDespacho,

    GrupoDespachoCategoria,

    ConfiguracionSistema,

    OrdenProduccionDia,

    Turno,

    TipoMenu,

    HistorialDespacho,

    HistorialDespachoProducto,

    HistorialDespachoAuditoria

)

from app.schemas.schemas import (

    GrupoDespachoCreate,

    GrupoDespachoUpdate,

    GrupoDespachoResponse

)

from app.api.deps import get_current_user

from app.services.odoo_client import OdooClient

import logging



logger = logging.getLogger(__name__)



class EstablecerProduccionProducto(BaseModel):

    odoo_product_id: int

    total_despachado: float



class EstablecerProduccionRequest(BaseModel):

    fecha: str

    turno: Optional[str] = None

    menu: Optional[str] = None

    grupo_id: Optional[int] = None

    productos: List[EstablecerProduccionProducto]



class ProducirTodoRequest(BaseModel):
    fecha: str
    turno: Optional[str] = None
    menu: Optional[str] = None
    ultimos_costos: Optional[Dict[str, float]] = None



class PartialConfigUpdate(BaseModel):
    product_ids: List[int]

router = APIRouter()

odoo_client = OdooClient()



# -----------------------------------------------------------------------------

# Endpoints de Grupos de Despacho

# -----------------------------------------------------------------------------



@router.get("/grupos", response_model=List[GrupoDespachoResponse])

def get_grupos(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    grupos = db.query(GrupoDespacho).options(joinedload(GrupoDespacho.categorias)).all()

    return grupos



@router.post("/grupos", response_model=GrupoDespachoResponse)

def create_grupo(data: GrupoDespachoCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    db_grupo = GrupoDespacho(nombre=data.nombre, activo=data.activo)

    db.add(db_grupo)

    db.commit()

    db.refresh(db_grupo)

    

    for cat in data.categorias:

        db_cat = GrupoDespachoCategoria(grupo_id=db_grupo.id, categoria_odoo_nombre=cat)

        db.add(db_cat)

    

    db.commit()

    db.refresh(db_grupo)

    return db_grupo



@router.put("/grupos/{grupo_id}", response_model=GrupoDespachoResponse)

def update_grupo(grupo_id: int, data: GrupoDespachoUpdate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    db_grupo = db.query(GrupoDespacho).filter(GrupoDespacho.id == grupo_id).first()

    if not db_grupo:

        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    

    if data.nombre is not None:

        db_grupo.nombre = data.nombre

    if data.activo is not None:

        db_grupo.activo = data.activo

        

    if data.categorias is not None:

        db.query(GrupoDespachoCategoria).filter(GrupoDespachoCategoria.grupo_id == grupo_id).delete()

        for cat in data.categorias:

            db_cat = GrupoDespachoCategoria(grupo_id=db_grupo.id, categoria_odoo_nombre=cat)

            db.add(db_cat)

            

    db.commit()

    db.refresh(db_grupo)

    return db_grupo



@router.delete("/grupos/{grupo_id}")

def delete_grupo(grupo_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    db_grupo = db.query(GrupoDespacho).filter(GrupoDespacho.id == grupo_id).first()

    if not db_grupo:

        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    

    db.delete(db_grupo)

    db.commit()

    return {"detail": "Grupo eliminado"}



# Schemas locales para Despacho

class PesajeCreate(BaseModel):

    despacho_producto_id: int

    tipo: str  # 'despacho' o 'devolucion'

    peso_bruto: float

    tara_odoo_product_id: Optional[int] = None

    peso_tara: float = 0.0



# -----------------------------------------------------------------------------

# Configuración Global de Despachos

# -----------------------------------------------------------------------------



@router.get("/config/modo-grupos")

def get_modo_grupos(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    config = db.query(ConfiguracionSistema).filter(ConfiguracionSistema.clave == "modo_grupos").first()

    if not config:

        return {"modo_grupos": False}

    return {"modo_grupos": config.valor.get("activo", False)}



class ModoGruposUpdate(BaseModel):

    activo: bool



@router.post("/config/modo-grupos")

def update_modo_grupos(data: ModoGruposUpdate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    if current_user.rol != 'admin':

        raise HTTPException(status_code=403, detail="No autorizado para cambiar esta configuración")

        

    config = db.query(ConfiguracionSistema).filter(ConfiguracionSistema.clave == "modo_grupos").first()

    if not config:

        config = ConfiguracionSistema(clave="modo_grupos", valor={"activo": data.activo})

        db.add(config)

    else:

        config.valor = {"activo": data.activo}

        from sqlalchemy.orm.attributes import flag_modified

        flag_modified(config, "valor")

        

    db.commit()

    return {"modo_grupos": data.activo}





# -----------------------------------------------------------------------------

# Borradores de Despacho

# -----------------------------------------------------------------------------

from typing import Dict, Any



class WeighingData(BaseModel):

    id: str

    gross: float

    tareId: Optional[int] = None

    tareWeight: float

    tareQty: Optional[str] = "1"

    net: float

    timestamp: Optional[str] = None



class ProductDispatchState(BaseModel):

    mode: str

    manualValue: str = ""

    weighings: List[WeighingData] = []

    partials: Optional[Dict[str, Any]] = None  # Almacena desglose: { "NUT-FAB-123": { "peso_neto": 1.5, "mode": "scale", "weighings": [...] } }

    comentario_diferencia: Optional[str] = None



class DraftDispatchRequest(BaseModel):

    fecha: str

    turno: Optional[str] = None

    menu: Optional[str] = None

    grupo_id: Optional[int] = None

    novedades: Optional[str] = None

    dispatchData: Dict[str, ProductDispatchState]

    devolutionData: Dict[str, ProductDispatchState]



@router.get("/draft")

def get_dispatch_draft(

    fecha: str, 

    turno: Optional[str] = None, 

    menu: Optional[str] = None, 

    grupo_id: Optional[int] = None,

    db: Session = Depends(get_db), 

    current_user: Usuario = Depends(get_current_user)

):

    try:

        from datetime import datetime

        fecha_obj = datetime.strptime(fecha, "%Y-%m-%d").date()

    except:

        raise HTTPException(status_code=400, detail="Formato de fecha inválido")

        

    turno_obj = db.query(Turno).filter(Turno.nombre == turno).first() if turno else None

    menu_obj = db.query(TipoMenu).filter(TipoMenu.nombre == menu).first() if menu else None

    

    despacho = db.query(Despacho).filter(

        Despacho.fecha == fecha_obj,

        Despacho.turno_id == (turno_obj.id if turno_obj else None),

        Despacho.tipo_menu_id == (menu_obj.id if menu_obj else None),

        Despacho.grupo_id == grupo_id,

        Despacho.estado.in_(["borrador", "finalizado"])

    ).order_by(Despacho.id.desc()).first()

    

    if not despacho:

        return {"novedades": "", "dispatchData": {}, "devolutionData": {}}

        

    dispatch_data = {}

    devolution_data = {}

    

    for prod in despacho.productos:

        if prod.partials_data:

            d_mode = "partial"

        else:

            d_mode = "scale" if any(p.tipo == "despacho" for p in prod.pesajes) else "manual"

            

        r_mode = "scale" if any(p.tipo == "devolucion" for p in prod.pesajes) else "manual"

        

        d_weighings = []

        r_weighings = []

        

        for p in prod.pesajes:

            w = {

                "id": str(p.id),

                "gross": f"{float(p.peso_bruto):.3f}",

                "tareId": p.tara_odoo_product_id,

                "tareWeight": f"{float(p.peso_tara):.3f}",

                "tareQty": "1",

                "net": f"{float(p.peso_neto):.3f}",

                "timestamp": p.timestamp.isoformat() if p.timestamp else ""

            }

            if p.tipo == "despacho":

                d_weighings.append(w)

            elif p.tipo == "devolucion":

                r_weighings.append(w)

                

        if prod.cantidad_despachada > 0 or d_weighings or d_mode == "partial":

            dispatch_data[str(prod.odoo_product_id)] = {

                "mode": d_mode,

                "manualValue": f"{float(prod.cantidad_despachada):.3f}" if d_mode in ["manual", "partial"] else "",

                "weighings": d_weighings,

                "partials": prod.partials_data if d_mode == "partial" else None,

                "comentario_diferencia": prod.comentario_diferencia

            }

            

        if prod.cantidad_devuelta > 0 or r_weighings:

            devolution_data[str(prod.odoo_product_id)] = {

                "mode": r_mode,

                "manualValue": f"{float(prod.cantidad_devuelta):.3f}" if r_mode == "manual" else "",

                "weighings": r_weighings

            }

            

    # Obtener nombres y uom de Odoo para los productos del borrador (útil para items huérfanos)
    product_names = {}
    odoo_ids = [p.odoo_product_id for p in despacho.productos]
    if odoo_ids:
        try:
            from app.services.odoo_client import OdooClient
            odoo_client = OdooClient()
            prods = odoo_client.execute('product.product', 'read', odoo_ids, ['name', 'uom_id'])
            for p in prods:
                product_names[str(p['id'])] = {
                    "name": p.get('name', f"Producto {p['id']}"),
                    "uom": p.get('uom_id', [0, "kg"])[1] if p.get('uom_id') else "kg"
                }
        except Exception as e:
            logger.warning(f"Error fetching product names for draft: {e}")

    return {
        "novedades": despacho.novedades or "",
        "dispatchData": dispatch_data, 
        "devolutionData": devolution_data,
        "productNames": product_names
    }

@router.delete("/draft")
def delete_dispatch_draft(
    fecha: str, 
    turno: Optional[str] = None, 
    menu: Optional[str] = None, 
    grupo_id: Optional[int] = None,
    db: Session = Depends(get_db), 
    current_user: Usuario = Depends(get_current_user)
):
    try:
        from datetime import datetime
        fecha_obj = datetime.strptime(fecha, "%Y-%m-%d").date()
    except:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido")
        
    turno_obj = db.query(Turno).filter(Turno.nombre == turno).first() if turno else None
    menu_obj = db.query(TipoMenu).filter(TipoMenu.nombre == menu).first() if menu else None
    
    despachos = db.query(Despacho).filter(
        Despacho.fecha == fecha_obj,
        Despacho.turno_id == (turno_obj.id if turno_obj else None),
        Despacho.tipo_menu_id == (menu_obj.id if menu_obj else None),
        Despacho.grupo_id == grupo_id,
        Despacho.estado == "borrador"
    ).all()
    
    for d in despachos:
        db.delete(d)
        
    db.commit()
    return {"message": "Borrador eliminado correctamente"}



@router.post("/draft")

def save_dispatch_draft(data: DraftDispatchRequest, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    print("DRAFT PAYLOAD RECEIVED:", data.json())

    

    try:

        from datetime import datetime

        fecha_obj = datetime.strptime(data.fecha, "%Y-%m-%d").date()

    except:

        raise HTTPException(status_code=400, detail="Formato de fecha inválido")

        

    turno_obj = db.query(Turno).filter(Turno.nombre == data.turno).first() if data.turno else None

    menu_obj = db.query(TipoMenu).filter(TipoMenu.nombre == data.menu).first() if data.menu else None

    

    despacho = db.query(Despacho).filter(

        Despacho.fecha == fecha_obj,

        Despacho.turno_id == (turno_obj.id if turno_obj else None),

        Despacho.tipo_menu_id == (menu_obj.id if menu_obj else None),

        Despacho.grupo_id == data.grupo_id,

        Despacho.estado == "borrador"

    ).first()

    

    if not despacho:

        despacho = Despacho(

            fecha=fecha_obj,

            turno_id=turno_obj.id if turno_obj else None,

            tipo_menu_id=menu_obj.id if menu_obj else None,

            grupo_id=data.grupo_id,

            estado="borrador",

            novedades=data.novedades

        )

        db.add(despacho)

        db.flush()

    else:

        despacho.novedades = data.novedades

        

    # Limpiar productos anteriores de este despacho

    db.query(DespachoProducto).filter(DespachoProducto.despacho_id == despacho.id).delete()

    

    all_product_ids = set(data.dispatchData.keys()).union(set(data.devolutionData.keys()))

    

    for pid_str in all_product_ids:

        pid = int(pid_str)

        d_state = data.dispatchData.get(pid_str)

        r_state = data.devolutionData.get(pid_str)

        

        d_qty = 0.0

        r_qty = 0.0

        

        if d_state:

            if d_state.mode == "partial" and d_state.manualValue:

                try: d_qty = float(d_state.manualValue)

                except: pass

            elif d_state.mode == "manual" and d_state.manualValue:

                try: d_qty = float(d_state.manualValue)

                except: pass

            else:

                d_qty = sum(w.net for w in d_state.weighings)

                

        if r_state:

            if r_state.mode == "manual" and r_state.manualValue:

                try: r_qty = float(r_state.manualValue)

                except: pass

            else:

                r_qty = sum(w.net for w in r_state.weighings)

                

        dp = DespachoProducto(

            despacho_id=despacho.id,

            odoo_product_id=pid,

            cantidad_teorica=0, # This can be fetched if needed, but not strictly required for drafts

            cantidad_despachada=d_qty,

            cantidad_devuelta=r_qty,

            partials_data=d_state.partials if (d_state and d_state.mode == "partial") else None,

            comentario_diferencia=d_state.comentario_diferencia if d_state else None

        )

        db.add(dp)

        db.flush()

        

        if d_state and d_state.mode == "scale":

            for w in d_state.weighings:

                db.add(DespachoPesaje(

                    despacho_producto_id=dp.id,

                    tipo="despacho",

                    peso_bruto=w.gross,

                    tara_odoo_product_id=w.tareId,

                    peso_tara=w.tareWeight,

                    peso_neto=w.net

                ))

                

        if r_state and r_state.mode == "scale":

            for w in r_state.weighings:

                db.add(DespachoPesaje(

                    despacho_producto_id=dp.id,

                    tipo="devolucion",

                    peso_bruto=w.gross,

                    tara_odoo_product_id=w.tareId,

                    peso_tara=w.tareWeight,

                    peso_neto=w.net

                ))

                

    db.commit()

    return {"status": "ok"}





@router.get("/")

def list_dispatches(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    """

    Obtiene todos los despachos registrados.

    """

    despachos = db.query(Despacho).options(joinedload(Despacho.dia_planificado)).all()

    result = []

    for d in despachos:

        result.append({

            "id": d.id,

            "dia_planificado_id": d.dia_planificado_id,

            "fecha": d.fecha_despacho.isoformat() if d.fecha_despacho else None,

            "nombre_menu": d.dia_planificado.nombre_odoo_producto if d.dia_planificado else "Menú Desconocido",

            "odoo_mo_id": d.odoo_manufacturing_order_id,

            "estado": d.estado

        })

    return result



@router.get("/plate-components")

def get_plate_components(

    plato_nombre: str,

    fecha: str,

    dia_id: Optional[int] = None,

    current_user: Usuario = Depends(get_current_user)

):

    """

    Obtiene los componentes (ingredientes) requeridos para cocinar un plato

    en una fecha específica, consultando la Orden de Fabricación (MO) en Odoo.

    Si se proporciona dia_id, se busca por el origin de la MO hija (Reabastecimiento manual).

    """

    try:

        from app.services.odoo_client import OdooClient

        odoo = OdooClient()

        result = odoo.get_mo_components(plato_nombre, fecha, dia_id)

        return result

    except Exception as e:

        raise HTTPException(

            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,

            detail=f"Error obteniendo componentes desde Odoo: {str(e)}"

        )



# -----------------------------------------------------------------------------

# Endpoints de Historial de Despachos

# -----------------------------------------------------------------------------



@router.get("/historial-auditoria")

def get_historial_auditoria(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    auditorias = db.query(HistorialDespachoAuditoria).options(

        joinedload(HistorialDespachoAuditoria.usuario),

        joinedload(HistorialDespachoAuditoria.producto).joinedload(HistorialDespachoProducto.historial).joinedload(HistorialDespacho.turno),

        joinedload(HistorialDespachoAuditoria.producto).joinedload(HistorialDespachoProducto.historial).joinedload(HistorialDespacho.tipo_menu)

    ).order_by(HistorialDespachoAuditoria.timestamp.desc()).all()

    

    result = []

    for a in auditorias:

        hp = a.producto

        h = hp.historial

        result.append({

            "id": a.id,

            "odoo_product_id": hp.odoo_product_id,

            "cantidad_anterior": float(a.cantidad_anterior),

            "cantidad_nueva": float(a.cantidad_nueva),

            "timestamp": a.timestamp.isoformat() if a.timestamp else None,

            "usuario": a.usuario.nombre if a.usuario else "Sistema",

            "fecha_historial": str(h.fecha) if h else None,

            "turno": h.turno.nombre if h and h.turno else None,

            "menu": h.tipo_menu.nombre if h and h.tipo_menu else None

        })

    return result



@router.get("/historial")

def get_historial_despachos(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    historiales = db.query(HistorialDespacho).options(

        joinedload(HistorialDespacho.turno),

        joinedload(HistorialDespacho.tipo_menu),

        joinedload(HistorialDespacho.grupo),

        joinedload(HistorialDespacho.usuario)

    ).order_by(HistorialDespacho.timestamp.desc()).all()

    

    result = []

    for h in historiales:

        result.append({

            "id": h.id,

            "fecha": str(h.fecha),

            "turno": h.turno.nombre if h.turno else None,

            "menu": h.tipo_menu.nombre if h.tipo_menu else None,

            "grupo": h.grupo.nombre if h.grupo else None,

            "usuario": h.usuario.nombre if h.usuario else "Sistema",

            "timestamp": h.timestamp.isoformat() if h.timestamp else None

        })

    return result



@router.get("/historial/{historial_id}")

def get_historial_detalle(historial_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    historial = db.query(HistorialDespacho).options(

        joinedload(HistorialDespacho.turno),

        joinedload(HistorialDespacho.tipo_menu),

        joinedload(HistorialDespacho.grupo),

        joinedload(HistorialDespacho.usuario),

        joinedload(HistorialDespacho.productos).joinedload(HistorialDespachoProducto.auditoria).joinedload(HistorialDespachoAuditoria.usuario)

    ).filter(HistorialDespacho.id == historial_id).first()

    

    if not historial:

        raise HTTPException(status_code=404, detail="Historial no encontrado")

        

    productos_list = []

    for p in historial.productos:

        auditorias = []

        for a in sorted(p.auditoria, key=lambda x: x.timestamp, reverse=True):

            auditorias.append({

                "id": a.id,

                "usuario": a.usuario.nombre if a.usuario else "Sistema",

                "cantidad_anterior": float(a.cantidad_anterior),

                "cantidad_nueva": float(a.cantidad_nueva),

                "timestamp": a.timestamp.isoformat() if a.timestamp else None

            })

            

        productos_list.append({

            "id": p.id,

            "odoo_product_id": p.odoo_product_id,

            "cantidad_establecida": float(p.cantidad_establecida),

            "auditorias": auditorias

        })

        

    return {

        "id": historial.id,

        "fecha": str(historial.fecha),

        "turno": historial.turno.nombre if historial.turno else None,

        "menu": historial.tipo_menu.nombre if historial.tipo_menu else None,

        "grupo": historial.grupo.nombre if historial.grupo else None,

        "usuario": historial.usuario.nombre if historial.usuario else "Sistema",

        "timestamp": historial.timestamp.isoformat() if historial.timestamp else None,

        "productos": productos_list

    }



class RecalcularProductoRequest(BaseModel):

    historial_id: int

    odoo_product_id: int

    nueva_cantidad: float



@router.post("/historial/recalcular")

def recalcular_produccion(req: RecalcularProductoRequest, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    try:

        historial = db.query(HistorialDespacho).filter(HistorialDespacho.id == req.historial_id).first()

        if not historial:

            raise HTTPException(status_code=404, detail="Historial no encontrado")

            

        producto = db.query(HistorialDespachoProducto).filter(

            HistorialDespachoProducto.historial_id == req.historial_id,

            HistorialDespachoProducto.odoo_product_id == req.odoo_product_id

        ).first()

        

        if not producto:

            raise HTTPException(status_code=404, detail="Producto no encontrado en este historial")

            

        cantidad_anterior = producto.cantidad_establecida

        

        if float(cantidad_anterior) == float(req.nueva_cantidad):

            return {"status": "success", "message": "No hay cambios en la cantidad"}

            

        # 1. Guardar auditoría

        auditoria = HistorialDespachoAuditoria(

            historial_producto_id=producto.id,

            usuario_id=current_user.id if current_user else None,

            cantidad_anterior=cantidad_anterior,

            cantidad_nueva=req.nueva_cantidad

        )

        db.add(auditoria)

        

        # 2. Actualizar cantidad establecida

        producto.cantidad_establecida = req.nueva_cantidad

        db.commit()

        

        # 3. Llamar a Odoo para actualizar

        # Necesitamos volver a calcular con base en los mismos filtros

        categorias_filtro = None

        if historial.grupo_id:

            grupo = db.query(GrupoDespacho).options(joinedload(GrupoDespacho.categorias)).filter(GrupoDespacho.id == historial.grupo_id).first()

            if grupo:

                categorias_filtro = [c.categoria_odoo_nombre for c in grupo.categorias]

                

        platos_permitidos = None

        plato_product_ids_filtro = []

        turno_nombre = historial.turno.nombre if historial.turno else None
        master_mo_names = []

        turno = historial.turno.nombre if historial.turno else None

        menu = historial.tipo_menu.nombre if historial.tipo_menu else None

        fecha = historial.fecha

        

        if turno and menu:

            from app.models.models import OrdenProduccionDia, Turno, TipoMenu

            ordenes = db.query(OrdenProduccionDia).options(

                joinedload(OrdenProduccionDia.items),

                joinedload(OrdenProduccionDia.turno),

                joinedload(OrdenProduccionDia.tipo_menu)

            ).join(Turno).join(TipoMenu).filter(

                OrdenProduccionDia.fecha == fecha,

                Turno.nombre == turno,

                TipoMenu.nombre == menu

            ).all()

            

            if ordenes:

                for orden in ordenes:

                    platos_permitidos.extend([item.plato_nombre for item in orden.items])

                    plato_product_ids_filtro.extend([item.odoo_product_id for item in orden.items if item.odoo_product_id])

                    

                    if orden.ruta_asignada:

                        master_mo_names.append(orden.ruta_asignada)

                    

                    # Tambin aadir el origen de las ordenes manuales de este da/turno/menu

                    master_mo_names.append(f"Reabastecimiento manual (NUT-DIA-{orden.id})")

                    master_mo_names.append(f"NUT-DIA-{orden.id}")

                

        payload = [{"odoo_product_id": req.odoo_product_id, "total_despachado": req.nueva_cantidad}]

        

        result = odoo_client.distribute_dispatch_to_mos(

            fecha=str(historial.fecha),

            categorias_filtro=categorias_filtro,

            totals_payload=payload,

            platos_permitidos=platos_permitidos,

            plato_product_ids_filtro=plato_product_ids_filtro if plato_product_ids_filtro else None

        )

        

        return {"status": "success", "message": "Cantidad recalculada en Odoo exitosamente", "data": result}

        

    except HTTPException:

        raise

    except Exception as e:

        db.rollback()

        logger.error(f"Error al recalcular: {e}")

        raise HTTPException(status_code=500, detail=str(e))



class AddMoLineRequest(BaseModel):

    product_id: int

    quantity: float



@router.get("/day-mos")

def get_day_mos(

    fecha: str,

    turno: Optional[str] = None,

    menu: Optional[str] = None,

    db: Session = Depends(get_db),

    current_user: Usuario = Depends(get_current_user)

):

    try:

        from app.models.models import OrdenProduccionDia

        dias_locales = db.query(OrdenProduccionDia).options(

            joinedload(OrdenProduccionDia.turno), 

            joinedload(OrdenProduccionDia.tipo_menu)

        ).filter(OrdenProduccionDia.fecha == fecha).all()

        mo_origins_filtro = []

        turno_buscado = turno.strip().replace('+', ' ').lower() if turno else None

        menu_buscado = menu.strip().replace('+', ' ').lower() if menu else None

        

        logger.info(f"DEBUG get_day_mos: buscando Turno '{turno_buscado}', Menu '{menu_buscado}' para fecha {fecha}")

        

        for d in dias_locales:

            t_nombre = d.turno.nombre.strip().lower() if d.turno and d.turno.nombre else None

            m_nombre = d.tipo_menu.nombre.strip().lower() if d.tipo_menu and d.tipo_menu.nombre else None

            

            t_match = not turno_buscado or (t_nombre == turno_buscado)

            m_match = not menu_buscado or (m_nombre == menu_buscado)

            

            logger.info(f"DEBUG get_day_mos: DiaLocal {d.id} - Turno '{t_nombre}' Match={t_match}, Menu '{m_nombre}' Match={m_match}")

            

            if t_match and m_match:

                if hasattr(d, "id"):

                    mo_origins_filtro.append(f"Reabastecimiento manual (NUT-DIA-{d.id})")

                    mo_origins_filtro.append(f"NUT-DIA-{d.id}")

                else:

                    mo_origins_filtro.append(f"Reabastecimiento manual (NUT-DIA-{d.get('id')})")

                    mo_origins_filtro.append(f"NUT-DIA-{d.get('id')}")

                if d.ruta_asignada:

                    mo_origins_filtro.append(d.ruta_asignada)

                    

        logger.info(f"DEBUG get_day_mos: origins_filtro result = {mo_origins_filtro}")



        if not mo_origins_filtro:

            return []



        odoo_client = OdooClient()

        

        domain = [

            ('origin', 'in', mo_origins_filtro),

            ('state', '!=', 'cancel'),

            ('name', 'not ilike', 'HIDE/FAB/%')

        ]

        

        mos = odoo_client.execute('mrp.production', 'search_read', domain, ['id', 'name', 'product_id', 'product_qty', 'state'])

        logger.info(f"DEBUG get_day_mos: mos encontrados en Odoo = {len(mos)}")

        

        result = []

        for mo in mos:

            result.append({

                'id': mo['id'],

                'name': mo['name'],

                'product_id': mo['product_id'],

                'product_qty': mo['product_qty'],

                'state': mo['state']

            })

            

        return result

    except Exception as e:

        logger.error(f"Error fetching day MOs: {str(e)}")

        raise HTTPException(status_code=500, detail=str(e))



@router.get("/mo-lines/{mo_id}")

def get_mo_lines(

    mo_id: int,

    db: Session = Depends(get_db),

    current_user: Usuario = Depends(get_current_user)

):

    try:

        odoo_client = OdooClient()

        moves = odoo_client.execute('stock.move', 'search_read', [

            ('raw_material_production_id', '=', mo_id),

            ('state', '!=', 'cancel')

        ], ['id', 'product_id', 'product_uom_qty', 'product_uom', 'state'])

        

        result = []

        for move in moves:

            prod_name = move['product_id'][1] if move.get('product_id') else 'Desconocido'

            uom_name = move['product_uom'][1] if move.get('product_uom') else ''

            result.append({

                'id': move['id'],

                'product_name': prod_name,

                'quantity': move['product_uom_qty'],

                'uom': uom_name,

                'state': move['state']

            })

        return result

    except Exception as e:

        logger.error(f"Error fetching MO lines for mo_id {mo_id}: {str(e)}")

        raise HTTPException(status_code=500, detail=str(e))



@router.post("/mo-add-line/{mo_id}")

def add_mo_line(

    mo_id: int,

    data: AddMoLineRequest,

    db: Session = Depends(get_db),

    current_user: Usuario = Depends(get_current_user)

):

    try:

        odoo_client = OdooClient()

        

        mo_data = odoo_client.execute('mrp.production', 'read', [mo_id], ['location_src_id', 'location_dest_id'])

        if not mo_data:

            raise HTTPException(status_code=404, detail="MO no encontrada")

        

        location_src_id = mo_data[0]['location_src_id'][0] if mo_data[0].get('location_src_id') else None

        location_dest_id = mo_data[0]['location_dest_id'][0] if mo_data[0].get('location_dest_id') else None

        

        prod_data = odoo_client.execute('product.product', 'read', [data.product_id], ['uom_id', 'name'])

        if not prod_data:

            raise HTTPException(status_code=404, detail="Producto no encontrado")

            

        uom_id = prod_data[0]['uom_id'][0]

        prod_name = prod_data[0]['name']

        

        move_vals = {

            'raw_material_production_id': mo_id,

            'product_id': data.product_id,

            'product_uom_qty': data.quantity,

            'product_uom': uom_id,

            'location_id': location_src_id,

            'location_dest_id': location_dest_id,

        }

        

        move_id = odoo_client.execute('stock.move', 'create', move_vals)

        

        return {"status": "success", "message": "Linea agregada correctamente", "move_id": move_id}

    except Exception as e:

        logger.error(f"Error adding line to mo_id {mo_id}: {str(e)}")

        raise HTTPException(status_code=500, detail=str(e))

@router.get("/partial-config")
def get_partial_config(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    try:
        config = db.query(ConfiguracionSistema).filter(ConfiguracionSistema.clave == "partial_dispatch_products").first()
        if config and config.valor:
            return {"status": "success", "product_ids": config.valor.get("product_ids", [])}
        return {"status": "success", "product_ids": []}
    except Exception as e:
        logger.error(f"Error getting partial config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/partial-config")
def update_partial_config(
    data: PartialConfigUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    try:
        config = db.query(ConfiguracionSistema).filter(ConfiguracionSistema.clave == "partial_dispatch_products").first()
        if config:
            config.valor = {"product_ids": data.product_ids}
        else:
            config = ConfiguracionSistema(
                clave="partial_dispatch_products",
                valor={"product_ids": data.product_ids}
            )
            db.add(config)
        
        db.commit()
        return {"status": "success", "message": "Configuraci�n actualizada"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating partial config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/odoo-products")
def get_odoo_products(
    purchasable: bool = False, 
    current_user: Usuario = Depends(get_current_user)
):
    try:
        domain = []
        if purchasable:
            domain.append(('purchase_ok', '=', True))
            
        products = odoo_client.execute(
            'product.product', 
            'search_read', 
            domain, 
            ['id', 'name', 'uom_id', 'categ_id']
        )
        return {"status": "success", "products": products}
    except Exception as e:
        logger.error(f"Error fetching odoo products: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _format_and_link_production_mos(
    mos_odoo: list,
    master_to_meta: dict,
    fallback_meta: dict,
    menu_items_map: dict,
    id_to_master: dict,
    established_dates: set = None,
    established_master_names: set = None,
    include_orphans: bool = False
) -> list:
    import re

    if established_dates is None:
        established_dates = set()
    if established_master_names is None:
        established_master_names = set()

    master_mos = {}
    children_mos = []

    # 1. Filtrar Master MOs: Solo incluir si están en estado 'done' (historial finalizado en Odoo)
    # O si corresponden a una orden confirmada/establecida en la app (Confirmar Despacho Total).
    # De esta manera se muestran las confirmadas por el módulo para revisión/producir todo,
    # y se excluyen fechas futuras o no despachadas en Odoo (ej. órdenes MPS no confirmadas).
    for mo in mos_odoo:
        mo_is_main = mo.get('is_main') or (mo.get('name') in established_master_names)
        if mo_is_main:
            is_done = (mo.get('state') == 'done')
            is_established = (mo.get('name') in established_master_names)
            if is_done or is_established:
                mo['children'] = []
                master_mos[mo['name']] = mo
        else:
            children_mos.append(mo)

    # Preparar mapeo para asignación por receta
    master_mo_to_menu = {}
    for m_name, m_mo in master_mos.items():
        date_str = m_mo.get('date_start', '')[:10] if m_mo.get('date_start') else 'Sin Fecha'
        meta = master_to_meta.get(m_name)
        if not meta:
            r_name = m_mo.get('recipe_name', '')
            r_base = re.sub(r'\s+\d{6}$', '', r_name).strip().upper()
            meta = fallback_meta.get((date_str, r_base))
        if meta:
            master_mo_to_menu[m_name] = (date_str, meta['menu'])

    # Ordenar hijas por ID desc para dar prioridad a la versión más reciente/activa del plato
    children_mos.sort(key=lambda x: x.get('id', 0), reverse=True)

    def add_child(target_master, child_mo):
        # Evitar duplicar el mismo plato/receta dentro de la misma orden maestra
        c_rec = child_mo.get('recipe_name', '').strip().lower()
        if c_rec and any(ch.get('recipe_name', '').strip().lower() == c_rec for ch in target_master['children']):
            return False
        target_master['children'].append(child_mo)
        return True

    # 2. Asignar hijas a Master con lógica multinivel de alta precisión
    orphans = []
    for child in children_mos:
        c_date = child.get('date_start', '')[:10] if child.get('date_start') else ''
        c_recipe = child.get('recipe_name', '').strip().lower()
        c_pid = child.get('product_id', [None])[0] if isinstance(child.get('product_id'), (list, tuple)) else child.get('product_id')
        origin = child.get('origin') or ''
        assigned = False

        # Nivel 1: Nativas de Odoo donde el origen es directamente el nombre de la Master MO
        origin_matched = False
        if origin in master_mos:
            origin_matched = True
            assigned = add_child(master_mos[origin], child)

        # Nivel 2: Creadas por App con tag NUT-DIA-X (asignar directamente a la Master MO correspondiente)
        if not origin_matched and "NUT-DIA-" in origin:
            match = re.search(r'NUT-DIA-(\d+)', origin)
            if match:
                orden_id = int(match.group(1))
                master_name = id_to_master.get(orden_id)
                if master_name and master_name in master_mos:
                    origin_matched = True
                    assigned = add_child(master_mos[master_name], child)

        # Si el origin coincide explícitamente con una Master MO pero fue rechazado (ej. duplicado), NO debe pasar a Nivel 3/4
        if origin_matched and not assigned:
            continue

        # Nivel 3: Coincidencia directa por componentes de la Master MO en la misma fecha (Y DEL MISMO MENÚ)
        if not assigned:
            for m_name, m_mo in master_mos.items():
                m_date, m_menu = master_mo_to_menu.get(m_name, (None, None))
                if m_date != c_date:
                    continue
                    
                # VALIDACIÓN CRÍTICA: Asegurar que el plato (c_recipe) pertenezca al menú de la Master MO
                items = menu_items_map.get((m_date, m_menu.strip().upper()), []) if m_menu else []
                if c_recipe and items and not any(c_recipe in item or item in c_recipe for item in items):
                    continue # El plato no pertenece a este menú, saltamos esta Master MO

                for comp in m_mo.get('components', []):
                    comp_pid = comp.get('product_id')
                    comp_name = comp.get('name', '').strip().lower()
                    if (c_pid and comp_pid and c_pid == comp_pid) or (c_recipe and comp_name and (c_recipe in comp_name or comp_name in c_recipe)):
                        assigned = add_child(m_mo, child)
                        break
                if assigned:
                    break

        # Nivel 4: Fallback estricto por coincidencia de receta con menú local (insensible a mayúsculas)
        if not assigned:
            for m_name, m_mo in master_mos.items():
                m_date, m_menu = master_mo_to_menu.get(m_name, (None, None))
                if m_date == c_date and m_menu:
                    items = menu_items_map.get((m_date, m_menu.strip().upper()), [])
                    if any(c_recipe in item or item in c_recipe for item in items):
                        assigned = add_child(m_mo, child)
                        break

        if not assigned:
            orphans.append(child)

    # 4. Forzar el costo de la Master MO para que sea la sumatoria exacta de sus hijas
    for master in master_mos.values():
        if master.get('children'):
            total_children_cost = sum(float(c.get('cost_total', 0.0)) for c in master['children'])
            if total_children_cost > 0:
                master['cost_total'] = total_children_cost
                qty = float(master.get('qty_producing') or master.get('product_qty') or 1.0)
                master['cost_unit'] = total_children_cost / qty if qty > 0 else 0.0

    # 5. Agrupar por Fecha -> Turno -> Menu
    grouped_by_date = {}

    for m_name, m_mo in master_mos.items():
        date_str = m_mo.get('date_start', '')[:10] if m_mo.get('date_start') else 'Sin Fecha'
        if date_str not in grouped_by_date:
            grouped_by_date[date_str] = {}

        meta = master_to_meta.get(m_name)
        if not meta:
            r_name = m_mo.get('recipe_name', '')
            r_base = re.sub(r'\s+\d{6}$', '', r_name).strip().upper()
            meta = fallback_meta.get((date_str, r_base), {
                'turno': 'Sin Turno',
                'menu': r_name if r_name and r_name != 'Desconocido' else 'Sin Menú',
                'costo_estimado': 0.0
            })

        turno_name = meta['turno']
        menu_name = meta['menu']
        m_mo['costo_estimado'] = meta.get('costo_estimado', 0.0)

        key = f"{turno_name}|{menu_name}"
        if key not in grouped_by_date[date_str]:
            grouped_by_date[date_str][key] = {
                'turno_nombre': turno_name,
                'menu_nombre': menu_name,
                'mos': []
            }
        grouped_by_date[date_str][key]['mos'].append(m_mo)

    if include_orphans and orphans:
        for orphan in orphans:
            date_str = orphan.get('date_start', '')[:10] if orphan.get('date_start') else 'Sin Fecha'
            if date_str not in grouped_by_date:
                grouped_by_date[date_str] = {}

            key = "Producción Novedades|Huérfanas"
            if key not in grouped_by_date[date_str]:
                grouped_by_date[date_str][key] = {
                    'turno_nombre': "Producción Novedades",
                    'menu_nombre': "Huérfanas",
                    'mos': []
                }

            dummy = next((m for m in grouped_by_date[date_str][key]['mos'] if m['name'] == f'Producción Extra ({date_str})'), None)
            if not dummy:
                dummy = {
                    "id": f"dummy_{date_str}",
                    "name": f"Producción Extra ({date_str})",
                    "recipe_name": "Órdenes sin Master MO",
                    "state": "done",
                    "origin": "",
                    "is_main": True,
                    "product_qty": 0,
                    "qty_producing": 0,
                    "cost_total": 0.0,
                    "cost_unit": 0.0,
                    "components": [],
                    "children": []
                }
                grouped_by_date[date_str][key]['mos'].append(dummy)

            dummy['children'].append(orphan)
            dummy['cost_total'] += orphan.get('cost_total', 0.0)

    # 6. Formatear para el frontend
    result = []
    for date_str, groups in grouped_by_date.items():
        valid_groups = [g for g in groups.values() if g.get('mos')]
        if valid_groups:
            result.append({
                "fecha": date_str,
                "grupos": valid_groups
            })

    result.sort(key=lambda x: x['fecha'], reverse=True)
    return result


@router.get("/establecer-produccion")
def get_establecer_produccion_list(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Trae el historial completo de los últimos 2 meses directamente de Odoo,
    agrupando Master MOs y sus Hijas (Platos), usando la BD local solo para
    mapear las rutas de los despachos de la app.
    """
    try:
        from app.services.odoo_client import OdooClient
        odoo_client = OdooClient()
        
        # 1. Traer historial plano de Odoo
        mos_odoo = odoo_client.get_production_history_2_months(exclude_done=False)
        
        # Calcular 'ultimo_costo' usando el historial de los ultimos 2 meses (fallback)
        mos_odoo_sorted = sorted(mos_odoo, key=lambda x: x.get('date_start', ''))
        last_costs = {}
        for mo in mos_odoo_sorted:
            recipe_name = mo.get('recipe_name')
            if not recipe_name or recipe_name == "Desconocido": continue
            
            # Asignar costo previo a la orden actual
            if recipe_name in last_costs:
                mo['last_cost_unit'] = last_costs[recipe_name]['cost_unit']
                mo['last_cost_total'] = last_costs[recipe_name]['cost_total']
                
            # Actualizar diccionario con el costo de esta orden (si ya tiene costo/hecho)
            if mo.get('state') == 'done' or mo.get('cost_total', 0) > 0:
                last_costs[recipe_name] = {
                    'cost_unit': mo.get('cost_unit', 0),
                    'cost_total': mo.get('cost_total', 0)
                }

        from datetime import datetime, timedelta
        from sqlalchemy.orm import joinedload
        from app.models.models import DiaPlanificado, OrdenProduccionDia, Receta

        # 1.5 Traer planes y despachos locales (últimos 60 días)
        start_date = (datetime.utcnow() - timedelta(days=60)).date()

        ordenes_locales = db.query(OrdenProduccionDia).options(
            joinedload(OrdenProduccionDia.turno),
            joinedload(OrdenProduccionDia.tipo_menu),
            joinedload(OrdenProduccionDia.items)
        ).filter(OrdenProduccionDia.fecha >= start_date).all()

        # Extraer costos quemados persistidos en base de datos local
        costos_quemados_dict = {}
        for o in ordenes_locales:
            if o.detalle_produccion and isinstance(o.detalle_produccion, dict):
                burned = o.detalle_produccion.get('ultimos_costos_quemados')
                if burned and isinstance(burned, dict):
                    costos_quemados_dict.update(burned)

        # 1.6 Traer último unit_cost oficial desde mrp.report por nombre (fallback de histórico)
        try:
            unique_recipes = list({mo.get('recipe_name') for mo in mos_odoo if mo.get('recipe_name') and mo.get('recipe_name') != "Desconocido"})
            mrp_last_costs_cache = {}
            
            if unique_recipes:
                mrp_last_costs_cache = odoo_client.get_latest_unit_costs_batch(unique_recipes)

            for mo in mos_odoo:
                r_name = mo.get('recipe_name')
                mo_id_str = str(mo.get('id', ''))
                if not r_name or r_name == "Desconocido":
                    continue

                qty = float(mo.get('qty_produced') or mo.get('qty_producing') or mo.get('product_qty') or 1.0)

                # Prioridad 1: Costo quemado persistido en la base de datos local
                if mo_id_str in costos_quemados_dict:
                    val = float(costos_quemados_dict[mo_id_str] or 0.0)
                    if val > 0.0:
                        mo['last_cost_unit'] = val
                        mo['last_cost_total'] = val * qty
                        continue
                elif r_name in costos_quemados_dict:
                    val = float(costos_quemados_dict[r_name] or 0.0)
                    if val > 0.0:
                        mo['last_cost_unit'] = val
                        mo['last_cost_total'] = val * qty
                        continue

                # Prioridad 2: Si no está quemado, consultar mrp.report cuidando no usar el costo propio si ya está done
                unit_cost = mrp_last_costs_cache.get(r_name, 0.0)
                mo_cost = float(mo.get('cost_unit', 0.0) or 0.0)
                is_done = (mo.get('state') == 'done')

                # Si la orden ya está done y el unit_cost de mrp.report es igual a mo_cost,
                # significa que mrp.report leyó esta MISMA orden que acaba de terminar.
                # NO debemos sobreescribir mo['last_cost_unit'] con su propio costo.
                if is_done and abs(unit_cost - mo_cost) < 0.0001:
                    continue

                # Si ya tiene un last_cost_unit previo asignado del historial y es > 0, mantenerlo
                if mo.get('last_cost_unit', 0) > 0:
                    continue

                if unit_cost > 0.0:
                    mo['last_cost_unit'] = unit_cost
                    mo['last_cost_total'] = unit_cost * qty
                    
        except Exception as e:
            logger.error(f"Error consultando mrp.report para ultimo costo por nombre: {e}")

        # 1.7 Traer recetas para extraer bom_cost
        recetas = db.query(Receta).all()
        receta_cost_map = {}
        for r in recetas:
            cost = float(r.bom_cost or 0.0)
            if r.nombre not in receta_cost_map or cost > receta_cost_map[r.nombre]:
                receta_cost_map[r.nombre] = cost

        dias_planificados = db.query(DiaPlanificado).filter(DiaPlanificado.fecha >= start_date).all()
        
        # Pre-armar map de días para fallback antiguo (por si acaso)
        costos_por_dia = {}
        for d in dias_planificados:
            fecha_str = d.fecha.strftime("%Y-%m-%d")
            if fecha_str not in costos_por_dia:
                costos_por_dia[fecha_str] = []
            costos_por_dia[fecha_str].append({
                'nombre_odoo': d.nombre_odoo_producto.strip().upper(),
                'costo': float(d.costo_diario_estimado or 0.0)
            })
        
        historial_despachos = db.query(HistorialDespacho).filter(HistorialDespacho.fecha >= start_date).all()
        established_dates = {o.fecha.strftime("%Y-%m-%d") for o in ordenes_locales if o.produccion_establecida}
        established_dates.update({h.fecha.strftime("%Y-%m-%d") for h in historial_despachos})
        established_master_names = {o.ruta_asignada for o in ordenes_locales if o.produccion_establecida and o.ruta_asignada}
        
        id_to_master = {o.id: o.ruta_asignada for o in ordenes_locales}
        master_to_meta = {}
        fallback_meta = {}
        menu_items_map = {}
        for o in ordenes_locales:
            fecha_str = o.fecha.strftime("%Y-%m-%d")
            menu_nombre = o.tipo_menu.nombre.strip().upper() if o.tipo_menu else "SIN MENU"
            
            key_items = (fecha_str, menu_nombre)
            if key_items not in menu_items_map:
                menu_items_map[key_items] = []
            for item in o.items:
                menu_items_map[key_items].append(item.plato_nombre.lower().strip())
            
            # --- NUEVA LÓGICA: Calcular costo usando los items y recetas (siempre dinámico) ---
            total_cost_sum = 0.0
            for item in o.items:
                unit_cost = receta_cost_map.get(item.plato_nombre, 0.0)
                item_tot = item.total or 0
                total_cost_sum += unit_cost * item_tot
            
            is_internal = "INTERNA" in menu_nombre and "MANUAL" not in menu_nombre
            if is_internal:
                costo_estimado = total_cost_sum
            else:
                try:
                    from app.models.models import Cliente
                    all_clientes = db.query(Cliente).all()
                    client_type_map = {c.nombre: c.tipo for c in all_clientes}
                    
                    clients = set()
                    for item in o.items:
                        if isinstance(item.cantidades_clientes, dict):
                            for c in item.cantidades_clientes.keys():
                                if str(c).upper() not in ["TOTAL", "CANT TOTAL", "CANT. TOTAL"]:
                                    clients.add(c)
                    
                    total_clients = 0
                    for c in clients:
                        sopa_qty = 0; f1_qty = 0; f2_qty = 0; ms_qty = 0
                        for item in o.items:
                            t = item.tipo.strip().upper() if item.tipo else ""
                            c_data = item.cantidades_clientes.get(c, {}) if isinstance(item.cantidades_clientes, dict) else {}
                            if isinstance(c_data, dict):
                                qty = float(c_data.get('base_cant') if c_data.get('base_cant') is not None else (c_data.get('cant') or 0))
                            else:
                                qty = 0
                                
                            if t == 'SOPA': sopa_qty = qty
                            elif t == 'FUERTE #1': f1_qty = qty
                            elif t == 'FUERTE #2': f2_qty = qty
                            elif t.replace("-", "").replace("?", "") == 'MENU SALUDABLE': ms_qty = qty
                            
                        is_pct = (client_type_map.get(c, 'porcentaje') == 'porcentaje')
                        c_total = max(sopa_qty, f1_qty + f2_qty + ms_qty) if is_pct else (f1_qty + f2_qty + ms_qty)
                        
                        if c_total == 0:
                            max_cant = 0
                            for item in o.items:
                                c_data = item.cantidades_clientes.get(c, {}) if isinstance(item.cantidades_clientes, dict) else {}
                                if isinstance(c_data, dict):
                                    qty = float(c_data.get('base_cant') if c_data.get('base_cant') is not None else (c_data.get('cant') or 0))
                                    if qty > max_cant: max_cant = qty
                            c_total = max_cant
                            
                        total_clients += c_total

                    # Fallback si no hay clientes (ej. orden manual pura)
                    if total_clients == 0:
                        sopa_qty = 0; f1_qty = 0; f2_qty = 0; ms_qty = 0; max_qty = 0
                        for item in o.items:
                            t = item.tipo.strip().upper() if item.tipo else ""
                            qty = float(item.total or 0)
                            if t == 'SOPA': sopa_qty += qty
                            elif t == 'FUERTE #1': f1_qty += qty
                            elif t == 'FUERTE #2': f2_qty += qty
                            elif t.replace("-", "").replace("?", "") == 'MENU SALUDABLE': ms_qty += qty
                            if qty > max_qty: max_qty = qty
                        
                        c_total = (f1_qty + f2_qty + ms_qty)
                        if c_total == 0:
                            c_total = max_qty
                        total_clients = c_total
                        
                    costo_estimado = total_cost_sum / total_clients if total_clients > 0 else total_cost_sum
                except Exception as e:
                    logger.error(f"Error calculando costo estimado dinámico: {e}")
                    costo_estimado = total_cost_sum
                    
            # Actualizamos también en BD para no perder la traza
            try:
                o.costo_estimado = costo_estimado
                db.commit()
            except:
                db.rollback()

            logger.info(f"Mapeando costo estimado: fecha={fecha_str}, menu={menu_nombre}, costo={costo_estimado}, ruta={o.ruta_asignada}")
            
            meta_dict = {
                'turno': o.turno.nombre if o.turno else "Sin Turno",
                'menu': o.tipo_menu.nombre if o.tipo_menu else "Sin Menú",
                'costo_estimado': costo_estimado
            }
            if o.ruta_asignada:
                master_to_meta[o.ruta_asignada] = meta_dict
            elif o.tipo_menu and "(Manual)" in o.tipo_menu.nombre:
                # Es una orden sin Master MO (ej. Manual). Inyectamos una Dummy Master MO
                # para que _format_and_link la agrupe correctamente con sus sub-MOs.
                dummy_name = f"MANUAL/NUT-DIA-{o.id}"
                id_to_master[o.id] = dummy_name
                master_to_meta[dummy_name] = meta_dict
                established_master_names.add(dummy_name)  # Forzamos que se considere en el listado
                
                # Asumimos que total_clients ya est calculado correctamente arriba
                qty_prod = total_clients if 'total_clients' in locals() and total_clients > 0 else 1.0
                
                mos_odoo.append({
                    "id": f"dummy_{o.id}",
                    "name": dummy_name,
                    "recipe_name": o.tipo_menu.nombre if o.tipo_menu else "Orden Manual",
                    "date_start": f"{fecha_str} 06:00:00",
                    "state": "done" if o.produccion_establecida else "confirmed",
                    "origin": f"NUT-DIA-{o.id}",
                    "is_main": True,
                    "product_qty": qty_prod,
                    "qty_producing": qty_prod,
                    "cost_total": 0.0,
                    "cost_unit": costo_estimado,
                    "components": []
                })
                
            fallback_meta[(fecha_str, menu_nombre)] = meta_dict
        
        return _format_and_link_production_mos(
            mos_odoo=mos_odoo,
            master_to_meta=master_to_meta,
            fallback_meta=fallback_meta,
            menu_items_map=menu_items_map,
            id_to_master=id_to_master,
            established_dates=established_dates,
            established_master_names=established_master_names,
            include_orphans=False
        )
        
    except Exception as e:
        logger.error(f"Error en establecer-produccion: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{despacho_id}")

def get_dispatch_details(

    despacho_id: int, 

    db: Session = Depends(get_db), 

    current_user: Usuario = Depends(get_current_user)

):

    """

    Obtiene los detalles de un despacho, sus productos e ingredientes teóricos y reales,

    además de los pesajes registrados.

    """

    despacho = db.query(Despacho).options(

        joinedload(Despacho.dia_planificado),

        joinedload(Despacho.productos).joinedload(DespachoProducto.pesajes)

    ).filter(Despacho.id == despacho_id).first()



    if not despacho:

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Despacho no encontrado"

        )



    # Buscar nombres de productos desde Odoo para enriquecer la visualización

    odoo_products = odoo_client.get_purchase_products()

    product_name_map = {p['id']: p['name'] for p in odoo_products}

    product_uom_map = {p['id']: p.get('uom_name', 'kg') for p in odoo_products}



    # Buscar envases/taras para que el frontend los muestre como opciones

    envases = odoo_client.get_envases()

    envase_map = {e['id']: e['name'] for e in envases}



    productos_data = []

    for p in despacho.productos:

        pesajes_data = []

        for pes in p.pesajes:

            pesajes_data.append({

                "id": pes.id,

                "tipo": pes.tipo,

                "peso_bruto": float(pes.peso_bruto),

                "peso_tara": float(pes.peso_tara),

                "peso_neto": float(pes.peso_neto),

                "tara_nombre": envase_map.get(pes.tara_odoo_product_id, "Taras Personalizada/Manual") if pes.tara_odoo_product_id else "Ninguno",

                "timestamp": pes.timestamp.isoformat() if pes.timestamp else None

            })



        productos_data.append({

            "id": p.id,

            "odoo_product_id": p.odoo_product_id,

            "nombre_producto": product_name_map.get(p.odoo_product_id, f"Producto {p.odoo_product_id}"),

            "unidad_medida": product_uom_map.get(p.odoo_product_id, "kg"),

            "cantidad_teorica": float(p.cantidad_teorica),

            "cantidad_despachada": float(p.cantidad_despachada),

            "cantidad_devuelta": float(p.cantidad_devuelta),

            "desvío": float(p.cantidad_despachada - p.cantidad_devuelta - p.cantidad_teorica),

            "pesajes": pesajes_data

        })



    return {

        "id": despacho.id,

        "dia_planificado_id": despacho.dia_planificado_id,

        "fecha": despacho.fecha_despacho.isoformat() if despacho.fecha_despacho else None,

        "nombre_menu": despacho.dia_planificado.nombre_odoo_producto if despacho.dia_planificado else "Menú Desconocido",

        "odoo_mo_id": despacho.odoo_manufacturing_order_id,

        "estado": despacho.estado,

        "productos": productos_data

    }



@router.post("/{despacho_id}/pesaje")

def record_weighing(

    despacho_id: int,

    data: PesajeCreate,

    db: Session = Depends(get_db),

    current_user: Usuario = Depends(get_current_user)

):

    """

    Registra un pesaje (Despacho o Devolución) con cálculo de Peso Neto (Bruto - Tara)

    y actualiza los acumulados del producto.

    """

    despacho = db.query(Despacho).filter(Despacho.id == despacho_id).first()

    if not despacho:

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Despacho no encontrado"

        )

    

    if despacho.estado == "finalizado":

        raise HTTPException(

            status_code=status.HTTP_400_BAD_REQUEST,

            detail="No se pueden registrar pesajes en un despacho ya finalizado"

        )



    prod = db.query(DespachoProducto).filter(

        DespachoProducto.id == data.despacho_producto_id,

        DespachoProducto.despacho_id == despacho_id

    ).first()



    if not prod:

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Producto no asociado a este despacho"

        )



    # Fórmula: Peso Neto = Peso Bruto - Peso Tara

    peso_neto = max(0.0, data.peso_bruto - data.peso_tara)



    # Crear pesaje

    pesaje = DespachoPesaje(

        despacho_producto_id=prod.id,

        tipo=data.tipo,

        peso_bruto=data.peso_bruto,

        tara_odoo_product_id=data.tara_odoo_product_id,

        peso_tara=data.peso_tara,

        peso_neto=peso_neto

    )

    db.add(pesaje)

    db.commit()



    # Recalcular acumulados del DespachoProducto

    # Sumar todos los pesajes de despacho

    total_despachado = db.query(DespachoPesaje).filter(

        DespachoPesaje.despacho_producto_id == prod.id,

        DespachoPesaje.tipo == "despacho"

    ).sum(DespachoPesaje.peso_neto) or 0.0



    # Sumar todos los pesajes de devolucion

    total_devuelto = db.query(DespachoPesaje).filter(

        DespachoPesaje.despacho_producto_id == prod.id,

        DespachoPesaje.tipo == "devolucion"

    ).sum(DespachoPesaje.peso_neto) or 0.0



    prod.cantidad_despachada = total_despachado

    prod.cantidad_devuelta = total_devuelto

    db.commit()



    # Actualizar estado de despacho a "despachando" si está en borrador

    if despacho.estado == "borrador":

        despacho.estado = "despachando"

        db.commit()



    return {"status": "ok", "items": [{"id": p.id, "plato_nombre": p.plato_nombre} for p in db_dia.items]}







@router.post("/{despacho_id}/finalize")

def finalize_dispatch(

    despacho_id: int,

    db: Session = Depends(get_db),

    current_user: Usuario = Depends(get_current_user)

):

    """

    Finaliza el despacho del día, calcula el consumo real (Despachado - Devuelto)

    y actualiza/procesa la Orden de Fabricación correspondiente en Odoo ERP 19.

    """

    despacho = db.query(Despacho).options(joinedload(Despacho.productos)).filter(Despacho.id == despacho_id).first()

    if not despacho:

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Despacho no encontrado"

        )



    if despacho.estado == "finalizado":

        raise HTTPException(

            status_code=status.HTTP_400_BAD_REQUEST,

            detail="El despacho ya fue finalizado previamente"

        )



    # Preparar consumos reales para Odoo

    consumos_odoo = []

    for prod in despacho.productos:

        consumo_real = float(prod.cantidad_despachada - prod.cantidad_devuelta)

        consumos_odoo.append({

            "product_id": prod.odoo_product_id,

            "qty_consumed": max(0.0, consumo_real)

        })



    # Intentar enviar consumos reales y cerrar MO en Odoo

    if despacho.odoo_manufacturing_order_id:

        try:

            odoo_client.update_manufacturing_order_consumption(

                mo_id=despacho.odoo_manufacturing_order_id,

                product_lines=consumos_odoo

            )

        except Exception as e:

            # Registrar el log del fallo pero continuar localmente para no bloquear al usuario

            from app.models.models import LogSincronizacionOdoo

            log = LogSincronizacionOdoo(

                entidad_tipo="produccion",

                entidad_id=despacho.id,

                estado="fallido",

                respuesta_odoo={"error": str(e)}

            )

            db.add(log)

            db.commit()



    # Cambiar estado a finalizado

    despacho.estado = "finalizado"

    db.commit()



    # Log de sincronización exitosa local

    from app.models.models import LogSincronizacionOdoo

    log_ok = LogSincronizacionOdoo(

        entidad_tipo="produccion",

        entidad_id=despacho.id,

        estado="exitoso",

        respuesta_odoo={"message": "Consumos actualizados localmente y finalizados"}

    )

    db.add(log_ok)

    db.commit()



    return {

        "status": "success",

        "message": "Despacho finalizado y consumo reportado a Odoo"

    }




@router.get("/informe-general/{fecha}")
def get_informe_general(
    fecha: str,
    grupo_id: Optional[int] = None,
    turno: Optional[str] = None,
    menu: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtiene la matriz de distribución de ingredientes calculada localmente.
    Filas: Ingredientes (Papa, Sal)
    Columnas Fijas: Solicitado, Despachado, Diferencia
    Columnas Dinámicas: Preparaciones (NUT/FAB/xxx)
    """
    try:
        categorias_filtro = None
        if grupo_id:
            grupo = db.query(GrupoDespacho).options(joinedload(GrupoDespacho.categorias)).filter(GrupoDespacho.id == grupo_id).first()
            if grupo:
                categorias_filtro = [c.categoria_odoo_nombre for c in grupo.categorias]

        platos_permitidos = None
        plato_product_ids_filtro = []
        master_mo_names = []
        
        if turno and menu:
            from app.models.models import OrdenProduccionDia, Turno, TipoMenu
            ordenes = db.query(OrdenProduccionDia).options(
                joinedload(OrdenProduccionDia.items),
                joinedload(OrdenProduccionDia.turno),
                joinedload(OrdenProduccionDia.tipo_menu)
            ).join(Turno).join(TipoMenu).filter(
                OrdenProduccionDia.fecha == fecha,
                Turno.nombre == turno,
                TipoMenu.nombre == menu
            ).all()
            
            if ordenes:
                platos_permitidos = []
                for orden in ordenes:
                    platos_permitidos.extend([item.plato_nombre for item in orden.items])
                    plato_product_ids_filtro.extend([item.odoo_product_id for item in orden.items if item.odoo_product_id])
                    if getattr(orden, 'ruta_asignada', None):
                        master_mo_names.append(orden.ruta_asignada)
                    master_mo_names.append(f"Reabastecimiento manual (NUT-DIA-{orden.id})")
                    master_mo_names.append(f"NUT-DIA-{orden.id}")
                    
        from datetime import datetime
        from app.models.models import Despacho, Turno, TipoMenu
        
        despachos_locales = {}
        try:
            fecha_obj = datetime.strptime(fecha, "%Y-%m-%d").date()
            q_desp = db.query(Despacho).filter(Despacho.fecha == fecha_obj)
            
            if turno:
                t_obj = db.query(Turno).filter(Turno.nombre == turno).first()
                if t_obj:
                    q_desp = q_desp.filter(Despacho.turno_id == t_obj.id)
            if menu:
                m_obj = db.query(TipoMenu).filter(TipoMenu.nombre == menu).first()
                if m_obj:
                    q_desp = q_desp.filter(Despacho.tipo_menu_id == m_obj.id)
            if grupo_id:
                q_desp = q_desp.filter(Despacho.grupo_id == grupo_id)
                
            despachos_all = q_desp.options(joinedload(Despacho.productos)).order_by(Despacho.id.desc()).all()
            
            despachos_unicos = {}
            for d in despachos_all:
                k = (d.turno_id, d.tipo_menu_id, d.grupo_id)
                if k not in despachos_unicos:
                    despachos_unicos[k] = d
                    
            for d in despachos_unicos.values():
                for p in d.productos:
                    despachos_locales[p.odoo_product_id] = despachos_locales.get(p.odoo_product_id, 0.0) + float(p.cantidad_despachada or 0.0)
        except Exception as e:
            logger.error(f"Error extracting local despachos: {e}")
                
        matrix_data = odoo_client.get_informe_general_matrix(
            fecha=fecha,
            categorias_filtro=categorias_filtro,
            platos_permitidos=platos_permitidos,
            plato_product_ids_filtro=plato_product_ids_filtro if plato_product_ids_filtro else None,
            master_mo_names=master_mo_names if master_mo_names else None,
            despachos_locales=despachos_locales
        )
        
        return matrix_data

    except Exception as e:
        logger.error(f"Error en get_informe_general: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/day-components/{fecha}")
def get_day_components(
    fecha: str,
    grupo_id: Optional[int] = None,
    turno: Optional[str] = None,
    menu: Optional[str] = None,
    dia_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtiene la suma consolidada de los componentes de las órdenes de fabricación de una fecha.
    Si se provee grupo_id, filtra por las categorías de ese grupo.
    Si se provee dia_id, turno o menu, filtra solo los componentes de las MO correspondientes.
    """
    try:
        categorias_filtro = None
        if grupo_id:
            grupo = db.query(GrupoDespacho).options(joinedload(GrupoDespacho.categorias)).filter(GrupoDespacho.id == grupo_id).first()
            if grupo:
                categorias_filtro = [c.categoria_odoo_nombre for c in grupo.categorias]

        from app.models.models import OrdenProduccionDia
        dias_locales = db.query(OrdenProduccionDia).options(
            joinedload(OrdenProduccionDia.turno), 
            joinedload(OrdenProduccionDia.tipo_menu),
            joinedload(OrdenProduccionDia.items)
        ).filter(OrdenProduccionDia.fecha == fecha).all()
        
        logger.info(f"DEBUG: Encontrados {len(dias_locales)} dias locales para la fecha {fecha}. Buscando DiaID: {dia_id}, Turno: '{turno}', Menu: '{menu}'")
        
        mo_names_filtro = []
        mo_origins_filtro = []
        plato_product_ids_filtro = []
        turno_buscado = turno.strip().replace('+', ' ').lower() if turno else None
        menu_buscado = menu.strip().replace('+', ' ').lower() if menu else None
        
        for d in dias_locales:
            if dia_id and d.id != dia_id:
                continue

            t_nombre = d.turno.nombre.strip().lower() if d.turno and d.turno.nombre else None
            m_nombre = d.tipo_menu.nombre.strip().lower() if d.tipo_menu and d.tipo_menu.nombre else None
            
            t_match = not turno_buscado or (t_nombre == turno_buscado)
            m_match = not menu_buscado or (m_nombre == menu_buscado)
            
            logger.info(f"DEBUG: Revisando dia local ID {d.id} - Turno DB: '{t_nombre}' -> Match: {t_match} | Menu DB: '{m_nombre}' -> Match: {m_match} | Ruta: {d.ruta_asignada}")
            
            if t_match and m_match:
                mo_origins_filtro.append(f"Reabastecimiento manual (NUT-DIA-{d.id})")
                mo_origins_filtro.append(f"NUT-DIA-{d.id}")

                if hasattr(d, "ruta_asignada") and getattr(d, "ruta_asignada"):
                    ruta = getattr(d, "ruta_asignada").strip()
                    if ruta:
                        mo_names_filtro.append(ruta)
                        mo_origins_filtro.append(ruta)
                
                for item in d.items:
                    if hasattr(item, "odoo_product_id") and getattr(item, "odoo_product_id"):
                        plato_product_ids_filtro.append(item.odoo_product_id)
                
        logger.info(f"DEBUG get_day_mos: origins_filtro result = {mo_origins_filtro}")
        logger.info(f"DEBUG get_day_mos: plato_product_ids_filtro result = {plato_product_ids_filtro}")




        components = odoo_client.get_day_components(

            fecha, 

            categorias_filtro, 

            mo_names_filtro=mo_names_filtro, 

            plato_product_ids_filtro=[], # Ya no filtramos por producto para evitar arrastrar MOs de pruebas anteriores

            mo_origins_filtro=mo_origins_filtro

        )

        mo_names_with_product = []

        if 'mo_names_filtro' in locals() and mo_names_filtro:

            try:

                mos = odoo_client.execute('mrp.production', 'search_read', [('name', 'in', mo_names_filtro)], ['name', 'product_id'])

                mo_map = {mo['name']: (mo['product_id'][1] if mo.get('product_id') else '') for mo in mos}

                for mn in mo_names_filtro:

                    prod_name = mo_map.get(mn, '')

                    if prod_name:

                        mo_names_with_product.append(f"{mn} ({prod_name})")

                    else:

                        mo_names_with_product.append(mn)

            except Exception as e_val:

                logger.warning(f"No se pudo validar MOs en Odoo para day-components: {e_val}")

                mo_names_with_product = mo_names_filtro



        return {

            "fecha": fecha,

            "components": components,

            "mo_names": mo_names_with_product

        }

    except Exception as e:

        logger.error(f"Error al obtener componentes consolidados del día {fecha}: {e}")

        raise HTTPException(

            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,

            detail="Error al obtener los componentes consolidados desde Odoo."

        )



@router.get("/day/component-breakdown/{component_id}")
def get_component_breakdown(
    component_id: int,
    fecha: str,
    grupo_id: Optional[int] = None,
    turno: Optional[str] = None,
    menu: Optional[str] = None,
    dia_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    try:
        from app.models.models import OrdenProduccionDia
        dias_locales = db.query(OrdenProduccionDia).options(
            joinedload(OrdenProduccionDia.turno), 
            joinedload(OrdenProduccionDia.tipo_menu),
            joinedload(OrdenProduccionDia.items)
        ).filter(OrdenProduccionDia.fecha == fecha).all()
        
        mo_names_filtro = []
        mo_origins_filtro = []
        plato_product_ids_filtro = []
        turno_buscado = turno.strip().replace('+', ' ').lower() if turno else None
        menu_buscado = menu.strip().replace('+', ' ').lower() if menu else None
        
        for d in dias_locales:
            if dia_id and d.id != dia_id:
                continue

            t_nombre = d.turno.nombre.strip().lower() if d.turno and d.turno.nombre else None
            m_nombre = d.tipo_menu.nombre.strip().lower() if d.tipo_menu and d.tipo_menu.nombre else None
            
            t_match = not turno_buscado or (t_nombre == turno_buscado)
            m_match = not menu_buscado or (m_nombre == menu_buscado)
            
            if t_match and m_match:
                mo_origins_filtro.append(f"Reabastecimiento manual (NUT-DIA-{d.id})")
                mo_origins_filtro.append(f"NUT-DIA-{d.id}")

                if hasattr(d, "ruta_asignada") and getattr(d, "ruta_asignada"):
                    ruta = getattr(d, "ruta_asignada").strip()
                    if ruta:
                        mo_names_filtro.append(ruta)
                        mo_origins_filtro.append(ruta)
                
                for item in d.items:
                    if hasattr(item, "odoo_product_id") and getattr(item, "odoo_product_id"):
                        plato_product_ids_filtro.append(item.odoo_product_id)



        from app.services.odoo_client import OdooClient

        odoo_client = OdooClient()

        

        breakdown = odoo_client.get_component_mo_breakdown(

            component_id=component_id,

            fecha_str=fecha,

            mo_names_filtro=mo_names_filtro,

            plato_product_ids_filtro=plato_product_ids_filtro,

            mo_origins_filtro=mo_origins_filtro

        )

        # Enriquecer el breakdown con información de menú y parent_mo
        origin_to_menu = {}
        origin_to_parent_name = {}
        for d in dias_locales:
            t_nombre = d.turno.nombre if d.turno and d.turno.nombre else "Sin Turno"
            m_nombre = d.tipo_menu.nombre if d.tipo_menu and d.tipo_menu.nombre else "Sin Menú"
            menu_completo = f"{t_nombre} | {m_nombre}"
            
            origin1 = f"Reabastecimiento manual (NUT-DIA-{d.id})"
            origin2 = f"NUT-DIA-{d.id}"
            
            ruta = getattr(d, "ruta_asignada", "")
            parent_name = ruta if ruta and ruta.startswith("NUT/") else m_nombre
            
            origin_to_menu[origin1] = menu_completo
            origin_to_menu[origin2] = menu_completo
            origin_to_parent_name[origin1] = parent_name
            origin_to_parent_name[origin2] = parent_name
            
            if ruta and ruta.startswith("NUT/"):
                origin_to_menu[ruta] = menu_completo
                origin_to_parent_name[ruta] = ruta

        for b in breakdown:
            o = b.get('origin', '')
            if o in origin_to_menu:
                b['menu_nombre'] = origin_to_menu[o]
                b['parent_mo_name'] = origin_to_parent_name[o]
            else:
                b['menu_nombre'] = "Otros"
                b['parent_mo_name'] = o if o else "Desconocido"

        return {"status": "success", "breakdown": breakdown}

        

    except Exception as e:

        logger.error(f"Error al obtener el desglose del componente {component_id}: {e}")

        raise HTTPException(

            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,

            detail="Error al obtener el desglose desde Odoo."

        )



@router.post("/establecer-produccion")

def establecer_produccion(

    data: EstablecerProduccionRequest,

    db: Session = Depends(get_db),

    current_user: Usuario = Depends(get_current_user)

):

    """

    Distribuye proporcionalmente el total despachado de cada ingrediente

    entre todas las Órdenes de Fabricación (MOs) que lo requieran para el día.

    """

    try:

        # Obtener categorías filtro si hay grupo

        categorias_filtro = None

        if data.grupo_id:

            grupo = db.query(GrupoDespacho).options(joinedload(GrupoDespacho.categorias)).filter(GrupoDespacho.id == data.grupo_id).first()

            if grupo:

                categorias_filtro = [c.categoria_odoo_nombre for c in grupo.categorias]

                

        payload = [{"odoo_product_id": p.odoo_product_id, "total_despachado": p.total_despachado} for p in data.productos]

        

        platos_permitidos = None

        plato_product_ids_filtro = []  # IDs de productos-plato para encontrar sus MOs NUT/FAB/...

        if data.turno and data.menu:

            ordenes = db.query(OrdenProduccionDia).options(
                joinedload(OrdenProduccionDia.items),
                joinedload(OrdenProduccionDia.turno),
                joinedload(OrdenProduccionDia.tipo_menu)
            ).join(Turno).join(TipoMenu).filter(
                OrdenProduccionDia.fecha == data.fecha,
                Turno.nombre == data.turno,
                TipoMenu.nombre == data.menu
            ).all()

            master_mo_names_list = []
            if ordenes:
                platos_permitidos = []
                for orden in ordenes:
                    platos_permitidos.extend([item.plato_nombre for item in orden.items])
                    plato_product_ids_filtro.extend([
                        item.odoo_product_id for item in orden.items if item.odoo_product_id
                    ])
                    if getattr(orden, 'ruta_asignada', None):
                        master_mo_names_list.append(orden.ruta_asignada)
                    master_mo_names_list.append(f"Reabastecimiento manual (NUT-DIA-{orden.id})")
                    master_mo_names_list.append(f"NUT-DIA-{orden.id}")
                    
                logger.info(f"establecer-produccion: platos_permitidos={platos_permitidos}, "
                            f"plato_product_ids_filtro count={len(plato_product_ids_filtro)}")
            else:
                master_mo_names_list = None

        result = odoo_client.distribute_dispatch_to_mos(
            fecha=data.fecha,
            categorias_filtro=categorias_filtro,
            totals_payload=payload,
            platos_permitidos=platos_permitidos,
            plato_product_ids_filtro=plato_product_ids_filtro if plato_product_ids_filtro else None,
            master_mo_names=master_mo_names_list
        )

        

        # Marcar la orden como producción establecida para que no aparezca en Despacho Diario

        try:

            turno_obj = db.query(Turno).filter(Turno.nombre == data.turno).first() if data.turno else None

            menu_obj = db.query(TipoMenu).filter(TipoMenu.nombre == data.menu).first() if data.menu else None



            if data.turno and data.menu:

                orden_a_marcar = db.query(OrdenProduccionDia).filter(

                    OrdenProduccionDia.fecha == data.fecha,

                    OrdenProduccionDia.turno_id == (turno_obj.id if turno_obj else None),

                    OrdenProduccionDia.tipo_menu_id == (menu_obj.id if menu_obj else None)

                ).first()

            else:

                # Sin turno/menú específico, marcar todas las órdenes del día

                ordenes_del_dia = db.query(OrdenProduccionDia).filter(

                    OrdenProduccionDia.fecha == data.fecha

                ).all()

                orden_a_marcar = None

                for o in ordenes_del_dia:

                    o.produccion_establecida = True

            

            if orden_a_marcar:

                orden_a_marcar.produccion_establecida = True

            

            # Guardar el historial de despachos

            from datetime import datetime

            fecha_obj = datetime.strptime(data.fecha, "%Y-%m-%d").date()



            # Marcar el borrador asociado como finalizado y obtener sus datos

            despacho_borrador = db.query(Despacho).options(joinedload(Despacho.productos)).filter(

                Despacho.fecha == fecha_obj,

                Despacho.turno_id == (turno_obj.id if turno_obj else None),

                Despacho.tipo_menu_id == (menu_obj.id if menu_obj else None),

                Despacho.grupo_id == data.grupo_id,

                Despacho.estado == "borrador"

            ).first()

            
            existing_historial = db.query(HistorialDespacho).filter(
                HistorialDespacho.fecha == fecha_obj,
                HistorialDespacho.turno_id == (turno_obj.id if turno_obj else None),
                HistorialDespacho.tipo_menu_id == (menu_obj.id if menu_obj else None),
                HistorialDespacho.grupo_id == data.grupo_id
            ).first()
            if existing_historial:
                db.delete(existing_historial)
                db.flush()

            historial = HistorialDespacho(

                fecha=fecha_obj,

                turno_id=turno_obj.id if turno_obj else None,

                tipo_menu_id=menu_obj.id if menu_obj else None,

                grupo_id=data.grupo_id,

                usuario_id=current_user.id if current_user else None,

                novedades=despacho_borrador.novedades if despacho_borrador else None

            )

            db.add(historial)

            db.flush()



            borrador_prods = {}

            if despacho_borrador:

                despacho_borrador.estado = "finalizado"

                for bp in despacho_borrador.productos:

                    borrador_prods[bp.odoo_product_id] = bp.comentario_diferencia



            for p in payload:

                hp = HistorialDespachoProducto(

                    historial_id=historial.id,

                    odoo_product_id=p["odoo_product_id"],

                    cantidad_establecida=p["total_despachado"],

                    comentario_diferencia=borrador_prods.get(p["odoo_product_id"])

                )

                db.add(hp)



            db.commit()

        except Exception as mark_err:
            import traceback
            logger.error(f"Error fatal guardando historial o produccion_establecida:\n{traceback.format_exc()}")
            db.rollback()
            raise HTTPException(status_code=500, detail=f"No se pudo guardar la confirmación en la BD local: {mark_err}")

        return {"status": "success", "message": "Producción establecida correctamente.", "data": result}

    except Exception as e:

        logger.error(f"Error al establecer producción: {e}")

        raise HTTPException(status_code=500, detail=str(e))



@router.get("/reporte-produccion/historial")
def get_reporte_produccion_historial(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Trae el historial completo de los últimos 2 meses directamente de Odoo,
    agrupando Master MOs y sus Hijas (Platos), usando la BD local solo para
    mapear las rutas de los despachos de la app.
    """
    return get_establecer_produccion_list(db=db, current_user=current_user)


@router.get("/establecer-produccion/{fecha}")

def get_resultados_produccion(

    fecha: str,

    turno: Optional[str] = None,

    menu: Optional[str] = None,

    grupo_id: Optional[int] = None,

    include_unestablished: bool = False,

    db: Session = Depends(get_db),

    current_user: Usuario = Depends(get_current_user)

):

    """

    Obtiene los resultados de la producción para mostrarlos en la UI,

    incluyendo los valores solicitados, consumidos y diferencias por MO.

    """

    try:

        categorias_filtro = None

        if grupo_id:

            grupo = db.query(GrupoDespacho).options(joinedload(GrupoDespacho.categorias)).filter(GrupoDespacho.id == grupo_id).first()

            if grupo:

                categorias_filtro = [c.categoria_odoo_nombre for c in grupo.categorias]

                

        platos_permitidos = []

        query = db.query(OrdenProduccionDia).filter(

            OrdenProduccionDia.fecha == fecha,

            OrdenProduccionDia.ruta_asignada.isnot(None),

            OrdenProduccionDia.ruta_asignada != ""

        )

        

        if not include_unestablished:
            query = query.filter(OrdenProduccionDia.produccion_establecida == True)

        

        if turno and menu:

            query = query.join(Turno).join(TipoMenu).filter(

                Turno.nombre == turno,

                TipoMenu.nombre == menu

            )

            

        ordenes = query.all()

        

        if not ordenes:

            return []

            

        mo_names_permitidos = []
        mo_origins_permitidos = []

        for orden in ordenes:
            for item in orden.items:
                platos_permitidos.append(item.plato_nombre)
            if orden.ruta_asignada:
                mo_names_permitidos.append(orden.ruta_asignada)
            if hasattr(orden, "id"):
                mo_origins_permitidos.append(f"Reabastecimiento manual (NUT-DIA-{orden.id})")
                mo_origins_permitidos.append(f"NUT-DIA-{orden.id}")

        mos_from_odoo = odoo_client.get_production_results(
            fecha=fecha,
            turno=turno,
            menu=menu,
            categorias_filtro=categorias_filtro,
            platos_permitidos=platos_permitidos,
            mo_names_permitidos=mo_names_permitidos,
            mo_origins_permitidos=mo_origins_permitidos
        )

        

        # Build local despachado map from Despacho records (drafts or finalized)
        from datetime import datetime
        local_despachado_map = {}
        novedades_por_grupo = {}
        comentario_map = {}
        
        try:

            fecha_obj = datetime.strptime(fecha, "%Y-%m-%d").date()

            q_desp = db.query(Despacho).filter(Despacho.fecha == fecha_obj)

            if turno:

                t_obj = db.query(Turno).filter(Turno.nombre == turno).first()

                if t_obj:

                    q_desp = q_desp.filter(Despacho.turno_id == t_obj.id)

            if menu:

                m_obj = db.query(TipoMenu).filter(TipoMenu.nombre == menu).first()

                if m_obj:

                    q_desp = q_desp.filter(Despacho.tipo_menu_id == m_obj.id)

            if grupo_id:

                q_desp = q_desp.filter(Despacho.grupo_id == grupo_id)

                

            despachos_all = q_desp.options(joinedload(Despacho.productos)).order_by(Despacho.id.desc()).all()
            
            # Keep only the most recent Despacho for each unique (turno_id, tipo_menu_id, grupo_id)
            despachos_unicos = {}
            for d in despachos_all:
                k = (d.turno_id, d.tipo_menu_id, d.grupo_id)
                if k not in despachos_unicos:
                    despachos_unicos[k] = d
                    
            despachos = list(despachos_unicos.values())

            for d in despachos:
                key = f"{d.turno.nombre if d.turno else 'Sin Turno'}_{d.tipo_menu.nombre if d.tipo_menu else 'Sin Menú'}"
                if d.novedades:
                    novedades_por_grupo[key] = d.novedades
                for p in d.productos:
                    local_despachado_map[p.odoo_product_id] = local_despachado_map.get(p.odoo_product_id, 0.0) + float(p.cantidad_despachada or 0.0)
                    if p.comentario_diferencia:
                        comentario_map[p.odoo_product_id] = p.comentario_diferencia

            for mo in mos_from_odoo:

                for comp in mo.get('components', []):

                    pid = comp.get('product_id')

                    if pid:
                        comp['local_despachado'] = local_despachado_map.get(pid, 0.0)
                        comp['comentario_diferencia'] = comentario_map.get(pid, "")

        except Exception as err_local:

            logger.warning(f"No se pudo cargar local_despachado_map: {err_local}")

        

        grupos = []

        asignados = set()

        

        for orden in ordenes:

            t_nombre = orden.turno.nombre if orden.turno else "Sin Turno"

            m_nombre = orden.tipo_menu.nombre if orden.tipo_menu else "Sin Menú"

            ruta = orden.ruta_asignada or ""

            platos_menu = [item.plato_nombre for item in orden.items]

            

            master_mo = None
            children_mos = []

            for mo in mos_from_odoo:
                if mo["id"] in asignados:
                    continue

                is_main_fabal = bool(ruta and (mo.get("name", "").startswith(ruta) or ruta in mo.get("name", "")))
                
                if is_main_fabal:
                    master_mo = mo
                    asignados.add(mo["id"])
                    continue

                expected_origin = f"Reabastecimiento manual (NUT-DIA-{orden.id})"
                expected_origin_old = f"NUT-DIA-{orden.id}"
                is_sub_mo = (mo.get("origin") == expected_origin) or (mo.get("origin") == expected_origin_old)

                # Para las nuevas que dicen solo "Reabastecimiento manual", usamos el nombre del plato
                if not is_sub_mo and mo.get("recipe_name") in platos_menu:
                    if not ruta:
                        if mo.get("origin") == "Reabastecimiento manual":
                            is_sub_mo = True
                        else:
                            if mo.get("state") != "done":
                                is_sub_mo = True
                
                if is_sub_mo:
                    children_mos.append(mo)
                    asignados.add(mo["id"])
            
            mos_menu = []
            if master_mo:
                master_mo["children"] = children_mos
                mos_menu.append(master_mo)
            else:
                if children_mos:
                    dummy_master = {
                        "id": f"dummy_{orden.id}",
                        "name": f"Producción sin Fabal ({m_nombre})",
                        "recipe_name": "",
                        "state": "done",
                        "product_qty": 0,
                        "qty_producing": 0,
                        "cost_total": sum(c.get("cost_total", 0) for c in children_mos),
                        "cost_unit": 0,
                        "children": children_mos,
                        "components": []
                    }
                    mos_menu.append(dummy_master)


            if mos_menu or True: # Always add if it was scheduled locally

                existing = next((g for g in grupos if g["turno_nombre"] == t_nombre and g["menu_nombre"] == m_nombre), None)

                odoo_product_name = next((mo.get("recipe_name") for mo in mos_menu if ruta and mo.get("name", "").startswith(ruta)), "")

                logger.info(f"DEBUG: ruta={ruta}, odoo_product_name={odoo_product_name}, mos_menu count={len(mos_menu)}")

                

                if existing:

                    existing["mos"].extend(mos_menu)

                    if not existing.get("odoo_product_name") and odoo_product_name:

                        existing["odoo_product_name"] = odoo_product_name

                else:
                    grupos.append({
                        "turno_nombre": t_nombre,
                        "menu_nombre": m_nombre,
                        "ruta_asignada": ruta,
                        "odoo_product_name": odoo_product_name,
                        "mos": mos_menu,
                        "detalle_produccion": orden.detalle_produccion,
                        "novedades": novedades_por_grupo.get(f"{t_nombre}_{m_nombre}", "")
                    })

                    

        return grupos

    except Exception as e:

        logger.error(f"Error al obtener resultados de producción: {e}")

        raise HTTPException(status_code=500, detail=str(e))





@router.post("/producir-todo")

def producir_todo(

    data: ProducirTodoRequest,

    db: Session = Depends(get_db),

    current_user: Usuario = Depends(get_current_user)

):

    """

    Llama a 'Producir todo' (button_mark_done) en Odoo para todas las MOs

    del menú/turno indicado en la fecha dada.

    Equivale a presionar el botón azul 'Producir todo' dentro de cada MO en Odoo.

    """

    try:

        # 1. Obtener los plato_product_ids y la ruta_asignada (MO principal) desde la BD local

        plato_product_ids = []

        platos_permitidos = []

        ruta_asignada = None  # ej: "NUT/FABAL/01550"

        costo_estimado_dia = 0.0



        if data.turno and data.menu:

            ordenes = db.query(OrdenProduccionDia).options(
                joinedload(OrdenProduccionDia.items),
                joinedload(OrdenProduccionDia.turno),
                joinedload(OrdenProduccionDia.tipo_menu)
            ).join(Turno).join(TipoMenu).filter(
                OrdenProduccionDia.fecha == data.fecha,
                Turno.nombre == data.turno,
                TipoMenu.nombre == data.menu
            ).all()

            if ordenes:
                platos_permitidos = []
                plato_product_ids = []
                master_mo_names = []
                
                from app.models.models import Receta
                recetas_db = db.query(Receta).filter(Receta.is_active == True).all()
                receta_cost_map = {}
                for r in recetas_db:
                    cost = float(r.bom_cost or 0.0)
                    if r.nombre not in receta_cost_map or cost > receta_cost_map[r.nombre]:
                        receta_cost_map[r.nombre] = cost

                for orden in ordenes:
                    platos_permitidos.extend([item.plato_nombre for item in orden.items])
                    plato_product_ids.extend([item.odoo_product_id for item in orden.items if item.odoo_product_id])
                    
                    if getattr(orden, 'ruta_asignada', None):
                        master_mo_names.append(orden.ruta_asignada)
                    master_mo_names.append(f"Reabastecimiento manual (NUT-DIA-{orden.id})")
                    master_mo_names.append(f"NUT-DIA-{orden.id}")

                    # Calcular costo estimado per ration
                    try:
                        total_cost_sum = 0.0
                        for item in orden.items:
                            unit_cost = receta_cost_map.get(item.plato_nombre, 0.0)
                            total_cost_sum += unit_cost * (item.total or 0)
                            
                            menu_nombre = orden.tipo_menu.nombre.strip().upper() if orden.tipo_menu else ""
                            if "INTERNA" in menu_nombre:
                                orden.costo_estimado = total_cost_sum
                            else:
                                from app.models.models import Cliente
                                all_clientes = db.query(Cliente).all()
                                client_type_map = {c.nombre: c.tipo for c in all_clientes}
                                
                                clients = set()
                                for item in orden.items:
                                    if isinstance(item.cantidades_clientes, dict):
                                        for c in item.cantidades_clientes.keys():
                                            if str(c).upper() not in ["TOTAL", "CANT TOTAL", "CANT. TOTAL"]:
                                                clients.add(c)
                                                
                                total_clients = 0
                                for c in clients:
                                    sopa_qty = 0; f1_qty = 0; f2_qty = 0; ms_qty = 0
                                    for item in orden.items:
                                        t = item.tipo.strip().upper() if item.tipo else ""
                                        c_data = item.cantidades_clientes.get(c, {}) if isinstance(item.cantidades_clientes, dict) else {}
                                        if isinstance(c_data, dict):
                                            qty = float(c_data.get('base_cant') if c_data.get('base_cant') is not None else (c_data.get('cant') or 0))
                                        else:
                                            qty = 0
                                            
                                        if t == 'SOPA': sopa_qty = qty
                                        elif t == 'FUERTE #1': f1_qty = qty
                                        elif t == 'FUERTE #2': f2_qty = qty
                                        elif t.replace("-", "").replace("?", "") == 'MENU SALUDABLE': ms_qty = qty
                                        
                                    is_pct = (client_type_map.get(c, 'porcentaje') == 'porcentaje')
                                    c_total = max(sopa_qty, f1_qty + f2_qty + ms_qty) if is_pct else (f1_qty + f2_qty + ms_qty)
                                    
                                    if c_total == 0:
                                        max_cant = 0
                                        for item in orden.items:
                                            c_data = item.cantidades_clientes.get(c, {}) if isinstance(item.cantidades_clientes, dict) else {}
                                            if isinstance(c_data, dict):
                                                qty = float(c_data.get('base_cant') if c_data.get('base_cant') is not None else (c_data.get('cant') or 0))
                                                if qty > max_cant: max_cant = qty
                                        c_total = max_cant
                                        
                                    total_clients += c_total
                                    
                                orden.costo_estimado = total_cost_sum / total_clients if total_clients > 0 else total_cost_sum
                    except Exception as e:
                        logger.error(f"Error guardando costo_estimado en producir-todo: {e}")
                        orden.costo_estimado = 0.0
                
                try:
                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.error(f"Error en commit del costo estimado: {e}")

                

                # DiaPlanificado usually doesn't have odoo_product_id set, so we match by fecha

                dias_planificados = db.query(DiaPlanificado).filter(DiaPlanificado.fecha == data.fecha).all()

                dia_planificado = None

                if dias_planificados:

                    if len(dias_planificados) == 1:

                        dia_planificado = dias_planificados[0]

                    else:

                        # Try to match by menu name

                        for d in dias_planificados:

                            if orden.tipo_menu and orden.tipo_menu.nombre.lower() in d.nombre_odoo_producto.lower():

                                dia_planificado = d

                                break

                        if not dia_planificado:

                            dia_planificado = dias_planificados[0]



                if dia_planificado:

                    costo_estimado_dia = float(dia_planificado.costo_diario_estimado or 0.0)





        if not ordenes:
            raise HTTPException(status_code=404, detail="No se encontró la orden local para este menú.")

        # 2a. Buscar las MOs usando master_mo_names
        date_min = f"{data.fecha} 00:00:00"
        date_max = f"{data.fecha} 23:59:59"
        
        # Encontrar la primera ruta asignada válida para usarla como identificador principal
        ruta_asignada = next((o.ruta_asignada for o in ordenes if getattr(o, 'ruta_asignada', None)), None)

        mo_ids = []
        
        domain_old = [
            ('state', 'in', ['draft', 'confirmed', 'progress', 'to_close']),
            '|',
            ('origin', 'in', master_mo_names),
            ('name', 'in', master_mo_names)
        ]
        mo_ids.extend(odoo_client.execute('mrp.production', 'search', domain_old))
        
        # Nuevas (solo dicen Reabastecimiento manual, las asociamos por el producto)
        if plato_product_ids:
            domain_new = [
                ('state', 'in', ['draft', 'confirmed', 'progress', 'to_close']),
                ('origin', '=', 'Reabastecimiento manual'),
                ('product_id', 'in', plato_product_ids)
            ]
            mo_ids.extend(odoo_client.execute('mrp.production', 'search', domain_new))
            
        # Remover duplicados
        mo_ids = list(set(mo_ids))



        if not mo_ids:

            raise HTTPException(

                status_code=404,

                detail=f"No se encontraron MOs activas para los platos del menú en la fecha {data.fecha}."

            )



        logger.info(f"producir-todo: {len(mo_ids)} MOs totales para {data.menu} del {data.fecha}: {mo_ids}")



        # 3. Ordenar MOs para que las hijas se procesen primero y la principal al final
        # (Esto asegura que Odoo use el costo actualizado de las hijas en la principal)
        all_mos_info = odoo_client.execute('mrp.production', 'read', mo_ids, ['name'])
        children_mo_ids = []
        master_mo_ids = []
        for mo_info in all_mos_info:
            mo_id = mo_info['id']
            mo_name = mo_info['name']
            is_main_mo = bool(ruta_asignada and mo_name.startswith(ruta_asignada))
            if is_main_mo:
                master_mo_ids.append(mo_id)
            else:
                children_mo_ids.append(mo_id)
                
        sorted_mo_ids = children_mo_ids + master_mo_ids
        
        # 4. Llamar button_mark_done en cada MO

        results = []

        for mo_id in sorted_mo_ids:

            try:

                mo_info = odoo_client.execute('mrp.production', 'read', [mo_id], ['name', 'state', 'product_qty', 'qty_producing', 'move_raw_ids', 'product_id'])

                mo_name = mo_info[0]['name'] if mo_info else f"MO #{mo_id}"

                mo_state = mo_info[0]['state'] if mo_info else 'unknown'

                mo_qty = mo_info[0].get('product_qty', 1.0) if mo_info else 1.0

                mo_qty_producing = mo_info[0].get('qty_producing', 0.0) if mo_info else 0.0

                move_raw_ids = mo_info[0].get('move_raw_ids', []) if mo_info else []

                

                product_data = mo_info[0].get('product_id', []) if mo_info else []

                product_name = product_data[1] if len(product_data) > 1 else "Desconocido"

                product_id_num = product_data[0] if len(product_data) > 0 else None



                unit_cost_before = 0.0

                is_main_mo = bool(ruta_asignada and mo_name.startswith(ruta_asignada))

                

                if is_main_mo and costo_estimado_dia > 0:

                    unit_cost_before = costo_estimado_dia

                elif move_raw_ids:

                    try:

                        moves = odoo_client.execute('stock.move', 'read', move_raw_ids, ['product_id', 'product_uom_qty'])

                        prod_ids = list(set([m['product_id'][0] for m in moves if m.get('product_id')]))

                        if prod_ids:

                            prods = odoo_client.execute('product.product', 'read', prod_ids, ['standard_price'])

                            price_map = {p['id']: float(p.get('standard_price', 0.0)) for p in prods}

                            total_estimated_cost = 0.0

                            for m in moves:

                                if m.get('product_id'):

                                    qty = float(m.get('product_uom_qty') or 0.0)

                                    price = price_map.get(m['product_id'][0], 0.0)

                                    total_estimated_cost += qty * price

                            if mo_qty > 0:

                                unit_cost_before = total_estimated_cost / mo_qty

                            else:

                                unit_cost_before = total_estimated_cost

                    except Exception as e:

                        logger.warning(f"No se pudo calcular unit_cost_before para MO {mo_name}: {e}")

                

                if unit_cost_before == 0.0 and product_id_num:

                    try:

                        p_info = odoo_client.execute('product.product', 'read', [product_id_num], ['standard_price'])

                        if p_info:

                            unit_cost_before = float(p_info[0].get('standard_price', 0.0))

                    except Exception as e:

                        logger.warning(f"No se pudo obtener costo fallback para {product_name}: {e}")



                if mo_state == 'done':

                    results.append({

                        "mo_id": mo_id, "name": mo_name, "status": "ya_producida", "message": "Ya estaba marcada como producida.", 

                        "product_name": product_name, "unit_cost": unit_cost_before, "unit_cost_before": unit_cost_before, "unit_cost_after": unit_cost_before

                    })

                    continue



                # 3.1. NO SOBRESCRIBIR quantity, porque ya tiene el valor calculado por el despacho.

                if move_raw_ids:

                    # Solo marcarlos como picked si es necesario en Odoo 17

                    odoo_client.execute('stock.move', 'write', move_raw_ids, {'picked': True})

                    logger.info(f"producir-todo: MO {mo_name} - marcados como picked {len(move_raw_ids)} movimientos.")



                # 3.2. Set qty_producing if it is 0 so Odoo respects our already calculated component quantities
                # ELIMINADO: En Odoo 16/17, escribir qty_producing activa un re-cálculo de cantidades que 
                # sobreescribe cualquier quantity manual que hayamos puesto en EstablishProduction!
                # Al dejarlo en 0 y pasar los contexts abajo, Odoo asume las cantidades manuales.
                # if mo_qty_producing == 0:
                #     odoo_client.execute('mrp.production', 'write', [mo_id], {'qty_producing': mo_qty})
                #     logger.info(f"producir-todo: MO {mo_name} - set qty_producing to {mo_qty}")



                # button_mark_done -> marca la MO como 'done'
                res = odoo_client.execute(
                    'mrp.production', 
                    'button_mark_done', 
                    [mo_id], 
                    context={
                        'skip_consumption': True, 
                        'skip_backorder': True,
                        'skip_consumption_warning': True,
                        'button_mark_done_done': True
                    }
                )

                # Si Odoo devuelve un wizard (acción de ventana), procesarlo
                if isinstance(res, dict) and res.get('res_model'):
                    wizard_model = res['res_model']
                    try:
                        if wizard_model == 'mrp.immediate.production':
                            wizard_id = odoo_client.execute(wizard_model, 'create', {'mo_ids': [(4, mo_id)]})
                            odoo_client.execute(wizard_model, 'process', [wizard_id])
                        elif wizard_model == 'mrp.production.backorder':
                            wizard_id = odoo_client.execute(wizard_model, 'create', {'mo_ids': [(4, mo_id)]})
                            odoo_client.execute(wizard_model, 'action_close_mo', [wizard_id])
                    except Exception as w_err:
                        logger.warning(f"producir-todo: MO {mo_name} - Fallo procesando wizard {wizard_model}: {w_err}")



                unit_cost_after = unit_cost_before

                try:

                    # Consultar mrp.report para obtener unit_cost

                    report_info = odoo_client.execute('mrp.report', 'search_read', [('production_id', '=', mo_id)], ['unit_cost'])

                    if report_info:

                        unit_cost_after = float(report_info[0].get('unit_cost', 0.0))

                except Exception as e:

                    logger.warning(f"No se pudo obtener unit_cost de mrp.report para {mo_name}: {e}")



                results.append({

                    "mo_id": mo_id, "name": mo_name, "status": "producida", "message": "Producida exitosamente.",

                    "product_name": product_name, "unit_cost": unit_cost_after, "unit_cost_before": unit_cost_before, "unit_cost_after": unit_cost_after

                })

                logger.info(f"producir-todo: MO {mo_name} marcada como done.")



            except Exception as mo_err:

                mo_name_safe = f"MO #{mo_id}"

                logger.error(f"producir-todo: Error al producir {mo_name_safe}: {mo_err}")

                results.append({

                    "mo_id": mo_id, "name": mo_name_safe, "status": "error", "message": str(mo_err),

                    "product_name": "Desconocido", "unit_cost": 0.0, "unit_cost_before": 0.0, "unit_cost_after": 0.0

                })



        producidas = sum(1 for r in results if r["status"] == "producida")

        errores = sum(1 for r in results if r["status"] == "error")



        result_payload = {

            "status": "success",

            "producidas": producidas,

            "errores": errores,

            "total": len(mo_ids),

            "resultados": results

        }



        if orden:
            detalle = orden.detalle_produccion if isinstance(orden.detalle_produccion, dict) else {}
            costos_quemados = detalle.get('ultimos_costos_quemados', {})
            if data.ultimos_costos and isinstance(data.ultimos_costos, dict):
                costos_quemados.update(data.ultimos_costos)

            for r in results:
                p_name = r.get('product_name')
                c_before = float(r.get('unit_cost_before', 0.0) or 0.0)
                if p_name and c_before > 0:
                    if p_name not in costos_quemados:
                        costos_quemados[p_name] = c_before
                    costos_quemados[str(r.get('mo_id'))] = c_before

            result_payload['ultimos_costos_quemados'] = costos_quemados
            orden.detalle_produccion = result_payload
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(orden, "detalle_produccion")
            db.commit()



        return result_payload



    except HTTPException:

        raise

    except Exception as e:

        logger.error(f"producir-todo: Error general: {e}")

        raise HTTPException(status_code=500, detail=str(e))







