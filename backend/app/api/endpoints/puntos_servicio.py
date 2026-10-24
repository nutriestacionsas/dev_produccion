from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Dict, Any

from app.core.database import get_db
from app.models.models import (
    DespachoCliente, DespachoClienteProducto, DespachoClientePesaje,
    OrdenProduccionDia, TipoMenu, Turno, Usuario, ClienteSupervisor
)
from app.api.deps import get_current_user

router = APIRouter()

@router.get("/despachos-planta/fechas-disponibles")
def get_fechas_disponibles(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna el listado de fechas que contienen despachos con estado = 'completado',
    utilizado para construir el carrusel de navegación.
    """
    query = db.query(DespachoCliente).options(
        joinedload(DespachoCliente.orden_dia).joinedload(OrdenProduccionDia.tipo_menu)
    ).filter(DespachoCliente.estado == "completado")
    
    if current_user.rol.lower() not in ["admin", "gerencia", "auditor"]:
        query = query.join(ClienteSupervisor, DespachoCliente.cliente_nombre == ClienteSupervisor.cliente_nombre)\
            .filter(ClienteSupervisor.supervisor_id == current_user.id)
            
    despachos = query.all()

    fechas_dict = {}
    for dc in despachos:
        if not dc.orden_dia:
            continue
        fecha_str = dc.orden_dia.fecha.isoformat()
        if fecha_str not in fechas_dict:
            fechas_dict[fecha_str] = []
        
        # Agregamos los menus disponibles en esta fecha para la UI
        menu_nombre = dc.orden_dia.tipo_menu.nombre if dc.orden_dia.tipo_menu else "Sin Menú"
        if menu_nombre not in [g.get("menu_nombre") for g in fechas_dict[fecha_str]]:
            fechas_dict[fecha_str].append({"menu_nombre": menu_nombre})

    resultado = []
    for f, grupos in fechas_dict.items():
        resultado.append({
            "fecha": f,
            "grupos": grupos
        })
        
    return resultado

@router.get("/despachos-planta")
def get_despachos_planta(
    fecha: str = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna la lista de clientes finalizados en una fecha dada y su detalle consolidado.
    """
    query = db.query(DespachoCliente).options(
        joinedload(DespachoCliente.orden_dia).joinedload(OrdenProduccionDia.tipo_menu),
        joinedload(DespachoCliente.orden_dia).joinedload(OrdenProduccionDia.turno),
        joinedload(DespachoCliente.productos).joinedload(DespachoClienteProducto.orden_item),
        joinedload(DespachoCliente.productos).joinedload(DespachoClienteProducto.pesajes)
    ).filter(DespachoCliente.estado == "completado")
    
    if current_user.rol.lower() not in ["admin", "gerencia", "auditor"]:
        query = query.join(ClienteSupervisor, DespachoCliente.cliente_nombre == ClienteSupervisor.cliente_nombre)\
            .filter(ClienteSupervisor.supervisor_id == current_user.id)
    
    if fecha:
        query = query.join(OrdenProduccionDia).filter(OrdenProduccionDia.fecha == fecha)
        
    despachos_db = query.order_by(DespachoCliente.fecha_finalizacion.desc().nullslast()).all()

    # Estructura agrupada por cliente (como clientesData en ClientDispatchWorkspace)
    clientes_data = {}
    
    for dc in despachos_db:
        productos_formateados = []
        for p in dc.productos:
            delta = p.unidades_despachadas - p.cantidad_teorica
            estado_badge = "exacto"
            if delta > 0:
                estado_badge = "adicional"
            elif delta < 0:
                estado_badge = "faltante"
                
            productos_formateados.append({
                "id": p.id,
                "plato_nombre": p.orden_item.plato_nombre if p.orden_item else "Desconocido",
                "tipo": p.orden_item.tipo if p.orden_item else "Desconocido",
                "cantidad_teorica": p.cantidad_teorica,
                "peso_despachado": p.peso_despachado,
                "unidades_despachadas": p.unidades_despachadas,
                "novedad": p.novedad,
                "estado_badge": estado_badge,
                "delta": delta,
                "pesajes": [
                    {
                        "id": pes.id,
                        "unidades": pes.unidades,
                        "peso_bruto": pes.peso_bruto,
                        "taras_seleccionadas": pes.taras_seleccionadas or [],
                        "peso_tara": pes.peso_tara,
                        "peso_neto": pes.peso_neto,
                        "timestamp": pes.timestamp
                    } for pes in p.pesajes
                ]
            })

        c_name = dc.cliente_nombre
        if c_name not in clientes_data:
            clientes_data[c_name] = []
            
        clientes_data[c_name].append({
            "despacho_cliente_id": dc.id,
            "orden_dia_id": dc.orden_dia_id,
            "tipo_menu": dc.orden_dia.tipo_menu.nombre if dc.orden_dia and dc.orden_dia.tipo_menu else "Sin Menú",
            "turno": dc.orden_dia.turno.nombre if dc.orden_dia and dc.orden_dia.turno else "Sin Turno",
            "fecha_finalizacion": dc.fecha_finalizacion,
            "productos": productos_formateados
        })

    return {"clientes": clientes_data}

