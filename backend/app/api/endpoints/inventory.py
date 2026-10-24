from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel
from app.core.database import get_db
from app.models.models import (
    Inventario, 
    InventarioItem, 
    InventarioPesaje, 
    Usuario,
    LogSincronizacionOdoo
)
from app.api.deps import get_current_user
from app.services.odoo_client import OdooClient

router = APIRouter()
odoo_client = OdooClient()

# Schemas locales para Inventario
class InventarioCreate(BaseModel):
    nombre_ajuste_odoo: str
    fecha_programada: datetime
    usuario_asignado_id: Optional[int] = None

class InventarioPesajeCreate(BaseModel):
    inventario_item_id: int
    peso_bruto: float
    tara_odoo_product_id: Optional[int] = None
    peso_tara: float = 0.0

class ItemCorrection(BaseModel):
    id: int
    cantidad_fisica: float
    novedad: Optional[str] = None

class FinalizeAdjustment(BaseModel):
    correcciones: List[ItemCorrection]

@router.get("/")
def list_inventories(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene la lista de todos los inventarios programados, en conteo o finalizados.
    """
    inventarios = db.query(Inventario).options(joinedload(Inventario.usuario_asignado)).all()
    result = []
    for inv in inventarios:
        result.append({
            "id": inv.id,
            "nombre": inv.nombre_ajuste_odoo,
            "fecha_programada": inv.fecha_programada.isoformat(),
            "usuario_asignado": inv.usuario_asignado.nombre if inv.usuario_asignado else "No Asignado",
            "estado": inv.estado
        })
    return result

@router.post("/")
def program_inventory(
    data: InventarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Programa una toma de inventario físico y precarga los productos de compra activos desde Odoo.
    """
    try:
        # 1. Crear cabecera de inventario
        new_inv = Inventario(
            nombre_ajuste_odoo=data.nombre_ajuste_odoo,
            fecha_programada=data.fecha_programada,
            usuario_asignado_id=data.usuario_asignado_id,
            estado="programado"
        )
        db.add(new_inv)
        db.commit()
        db.refresh(new_inv)

        # 2. Descargar productos de compra desde Odoo para precargar planilla
        odoo_products = odoo_client.get_purchase_products()

        # 3. Crear items en local
        for p in odoo_products:
            # Ubicación por defecto de la categoría o WH/Stock
            location = p.get('categ_name') or "WH/Stock"
            qty_teorica = float(p.get('qty_available') or 0.0)

            item = InventarioItem(
                inventario_id=new_inv.id,
                odoo_product_id=p['id'],
                cantidad_teorica=qty_teorica,
                cantidad_fisica=0.0,
                ubicacion_fisica=location
            )
            db.add(item)
        
        db.commit()
        return {
            "status": "success",
            "message": "Inventario físico programado y precargado exitosamente",
            "id": new_inv.id
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo al programar inventario: {str(e)}"
        )

@router.get("/{inventario_id}")
def get_inventory_details(
    inventario_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Detalle de un inventario con todos sus productos, ordenados y agrupados por ubicación física.
    """
    inv = db.query(Inventario).options(
        joinedload(Inventario.usuario_asignado),
        joinedload(Inventario.items).joinedload(InventarioItem.pesajes)
    ).filter(Inventario.id == inventario_id).first()

    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventario no encontrado"
        )

    # Nombres de productos de Odoo
    products = odoo_client.get_purchase_products()
    prod_name_map = {p['id']: p['name'] for p in products}
    prod_uom_map = {p['id']: p.get('uom_name', 'kg') for p in products}

    # Taras
    envases = odoo_client.get_envases()
    envase_map = {e['id']: e['name'] for e in envases}

    items_data = []
    for item in inv.items:
        pesajes_data = []
        for pes in item.pesajes:
            pesajes_data.append({
                "id": pes.id,
                "peso_bruto": float(pes.peso_bruto),
                "peso_tara": float(pes.peso_tara),
                "peso_neto": float(pes.peso_neto),
                "envase_nombre": envase_map.get(pes.tara_odoo_product_id, "Taras Personalizada/Manual") if pes.tara_odoo_product_id else "Ninguno",
                "timestamp": pes.timestamp.isoformat()
            })

        items_data.append({
            "id": item.id,
            "odoo_product_id": item.odoo_product_id,
            "nombre": prod_name_map.get(item.odoo_product_id, f"Producto {item.odoo_product_id}"),
            "uom": prod_uom_map.get(item.odoo_product_id, "kg"),
            "cantidad_teorica": float(item.cantidad_teorica),
            "cantidad_fisica": float(item.cantidad_fisica),
            "diferencia": float(item.cantidad_fisica - item.cantidad_teorica),
            "ubicacion_fisica": item.ubicacion_fisica,
            "novedad": item.novedad,
            "pesajes": pesajes_data
        })

    return {
        "id": inv.id,
        "nombre": inv.nombre_ajuste_odoo,
        "fecha_programada": inv.fecha_programada.isoformat(),
        "usuario_asignado": inv.usuario_asignado.nombre if inv.usuario_asignado else "No Asignado",
        "estado": inv.estado,
        "items": items_data
    }

@router.post("/{inventario_id}/pesaje")
def record_inventory_weighing(
    inventario_id: int,
    data: InventarioPesajeCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Registra una pesada física acumulativa para un producto específico.
    Permite el registro no lineal en bodega (acumulador).
    """
    inv = db.query(Inventario).filter(Inventario.id == inventario_id).first()
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventario no encontrado"
        )

    if inv.estado in ["consolidado", "sincronizado_odoo"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pueden registrar pesajes en un inventario cerrado o sincronizado"
        )

    item = db.query(InventarioItem).filter(
        InventarioItem.id == data.inventario_item_id,
        InventarioItem.inventario_id == inventario_id
    ).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item de inventario no válido"
        )

    # Calcular peso neto
    peso_neto = max(0.0, data.peso_bruto - data.peso_tara)

    # Registrar pesaje
    pesaje = InventarioPesaje(
        inventario_item_id=item.id,
        peso_bruto=data.peso_bruto,
        tara_odoo_product_id=data.tara_odoo_product_id,
        peso_tara=data.peso_tara,
        peso_neto=peso_neto
    )
    db.add(pesaje)
    db.commit()

    # Sumar todos los pesajes de este item para obtener el acumulado
    total_fisico = db.query(InventarioPesaje).filter(
        InventarioPesaje.inventario_item_id == item.id
    ).sum(InventarioPesaje.peso_neto) or 0.0

    item.cantidad_fisica = total_fisico
    
    # Cambiar estado a 'en_conteo'
    if inv.estado == "programado":
        inv.estado = "en_conteo"
        
    db.commit()

    return {
        "status": "success",
        "peso_neto_registrado": peso_neto,
        "cantidad_fisica_acumulada": total_fisico
    }

@router.post("/{inventario_id}/finalize")
def finalize_and_sync_inventory(
    inventario_id: int,
    data: FinalizeAdjustment,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Finaliza y concilia el inventario. El administrador aplica las correcciones finales
    y sincroniza el conteo físico final en Odoo con el formato 'Ajuste de inventario del DDMMAAAA'.
    """
    inv = db.query(Inventario).options(joinedload(Inventario.items)).filter(Inventario.id == inventario_id).first()
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventario no encontrado"
        )

    if inv.estado == "sincronizado_odoo":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El ajuste ya fue enviado a Odoo previamente"
        )

    # 1. Aplicar correcciones manuales del administrador
    correction_map = {c.id: c for c in data.correcciones}
    lines_to_odoo = []
    
    for item in inv.items:
        if item.id in correction_map:
            corr = correction_map[item.id]
            item.cantidad_fisica = corr.cantidad_fisica
            item.novedad = corr.novedad
            
        # Preparar datos para Odoo
        lines_to_odoo.append({
            "product_id": item.odoo_product_id,
            "qty_counted": float(item.cantidad_fisica)
        })

    inv.estado = "consolidado"
    db.commit()

    # 2. Generar nombre de ajuste formateado: Ajuste de inventario del DDMMAAAA
    formatted_date = datetime.now().strftime('%d%m%Y')
    adjustment_name = f"Ajuste de inventario del {formatted_date}"

    # 3. Subir a Odoo ERP 19
    try:
        adj_id = odoo_client.create_inventory_adjustment(
            name=adjustment_name,
            lines=lines_to_odoo
        )
        inv.odoo_inventory_adjustment_id = adj_id
        inv.estado = "sincronizado_odoo"
        db.commit()

        # Registrar log exitoso
        log = LogSincronizacionOdoo(
            entidad_tipo="inventario",
            entidad_id=inv.id,
            estado="exitoso",
            respuesta_odoo={"message": "Ajuste aplicado", "adjustment_id": adj_id}
        )
        db.add(log)
        db.commit()

        return {
            "status": "success",
            "message": f"Ajuste cargado en Odoo exitosamente como '{adjustment_name}'",
            "odoo_adjustment_id": adj_id
        }

    except Exception as e:
        # Registrar fallo en log de sincronizaciones y lanzar excepción
        log = LogSincronizacionOdoo(
            entidad_tipo="inventario",
            entidad_id=inv.id,
            estado="fallido",
            respuesta_odoo={"error": str(e)}
        )
        db.add(log)
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo al sincronizar con Odoo: {str(e)}"
        )
