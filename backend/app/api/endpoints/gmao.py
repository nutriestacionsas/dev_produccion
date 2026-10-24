from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Any
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import Usuario
from app.models.gmao import GMAOEquipo, GMAOMantenimientoHistorico, GMAOPlanPreventivo, GMAOTareaPreventiva, GMAOCategoriaEquipo, GMAOUbicacionEquipo
from app.schemas.gmao import GMAOEquipoCreate, GMAOEquipoUpdate, GMAOEquipo as GMAOEquipoSchema, GMAOMantenimientoHistoricoCreate, GMAOMantenimientoHistorico as GMAOMantenimientoHistoricoSchema, GMAOPlanPreventivoCreate, GMAOPlanPreventivo as GMAOPlanPreventivoSchema, GMAOCategoriaBase, GMAOCategoria, GMAOUbicacionBase, GMAOUbicacion
import json

router = APIRouter()

# Nombres visibles del menú (deben coincidir con menuGroups en App.jsx y MODULES_LIST en Permissions.jsx)
MOD_EQUIPOS = "Equipos y Activos"
MOD_PREVENTIVO = "Mantenimiento Preventivo"

def check_permission(user: Usuario, *module_names: str):
    """Permite el acceso si el usuario es admin o tiene permisos.modules[<nombre>].view en alguno de los módulos."""
    if user.rol == "admin":
        return True
    perms = user.permisos if isinstance(user.permisos, dict) else {}
    if isinstance(user.permisos, str):
        try:
            perms = json.loads(user.permisos)
        except:
            perms = {}
    modules = perms.get("modules") if isinstance(perms, dict) else None
    if not isinstance(modules, dict):
        modules = {}
    for name in module_names:
        mod = modules.get(name)
        if isinstance(mod, dict) and mod.get("view") is True:
            return True
    raise HTTPException(status_code=403, detail="No tienes permisos suficientes para este módulo.")

@router.get("/equipos", response_model=List[GMAOEquipoSchema])
def get_equipos(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    # Mantenimiento Preventivo también lista equipos para su selector
    check_permission(current_user, MOD_EQUIPOS, MOD_PREVENTIVO)
    equipos = db.query(GMAOEquipo).all()
    return equipos

import shutil
import os

@router.get("/equipos/next-code")
def get_next_code(categoria: str, db: Session = Depends(get_db)):
    prefijo = categoria[:3].upper() if categoria else "EQP"
    count = db.query(GMAOEquipo).filter(GMAOEquipo.categoria == categoria).count()
    nuevo_codigo = f"{prefijo}-{count + 1:03d}"
    
    # Asegurar que sea único
    while db.query(GMAOEquipo).filter(GMAOEquipo.codigo_activo == nuevo_codigo).first():
        count += 1
        nuevo_codigo = f"{prefijo}-{count + 1:03d}"
        
    return {"next_code": nuevo_codigo}

@router.post("/equipos", response_model=GMAOEquipoSchema)
def create_equipo(equipo_in: GMAOEquipoCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_EQUIPOS)
    
    # Si el frontend lo manda, comprobamos que no exista, si no lo manda, lo generamos
    if not equipo_in.codigo_activo:
        prefijo = equipo_in.categoria[:3].upper() if equipo_in.categoria else "EQP"
        count = db.query(GMAOEquipo).filter(GMAOEquipo.categoria == equipo_in.categoria).count()
        nuevo_codigo = f"{prefijo}-{count + 1:03d}"
        while db.query(GMAOEquipo).filter(GMAOEquipo.codigo_activo == nuevo_codigo).first():
            count += 1
            nuevo_codigo = f"{prefijo}-{count + 1:03d}"
        equipo_in.codigo_activo = nuevo_codigo
    else:
        existing = db.query(GMAOEquipo).filter(GMAOEquipo.codigo_activo == equipo_in.codigo_activo).first()
        if existing:
            # Re-generamos si ya está tomado para evitar choques de concurrencia
            prefijo = equipo_in.categoria[:3].upper() if equipo_in.categoria else "EQP"
            count = db.query(GMAOEquipo).filter(GMAOEquipo.categoria == equipo_in.categoria).count()
            nuevo_codigo = f"{prefijo}-{count + 1:03d}"
            while db.query(GMAOEquipo).filter(GMAOEquipo.codigo_activo == nuevo_codigo).first():
                count += 1
                nuevo_codigo = f"{prefijo}-{count + 1:03d}"
            equipo_in.codigo_activo = nuevo_codigo
    
    db_equipo = GMAOEquipo(**equipo_in.model_dump())
    db_equipo.creado_por = current_user.id
    db.add(db_equipo)
    db.commit()
    db.refresh(db_equipo)
    return db_equipo

@router.post("/equipos/{equipo_id}/upload-documento")
def upload_documento(equipo_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_EQUIPOS)
    equipo = db.query(GMAOEquipo).filter(GMAOEquipo.id == equipo_id).first()
    if not equipo:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
        
    upload_dir = "uploads/gmao_docs"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = f"{upload_dir}/{equipo_id}_{file.filename}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    equipo.documento_adjunto = file_path
    db.commit()
    return {"filename": file.filename, "path": file_path}

@router.get("/categorias", response_model=List[GMAOCategoria])
def get_categorias(db: Session = Depends(get_db)):
    return db.query(GMAOCategoriaEquipo).all()

@router.post("/categorias", response_model=GMAOCategoria)
def create_categoria(cat_in: GMAOCategoriaBase, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_EQUIPOS)
    db_cat = GMAOCategoriaEquipo(nombre=cat_in.nombre)
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

@router.delete("/categorias/{cat_id}")
def delete_categoria(cat_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_EQUIPOS)
    db_cat = db.query(GMAOCategoriaEquipo).filter(GMAOCategoriaEquipo.id == cat_id).first()
    if db_cat:
        db.delete(db_cat)
        db.commit()
    return {"ok": True}

@router.get("/ubicaciones", response_model=List[GMAOUbicacion])
def get_ubicaciones(db: Session = Depends(get_db)):
    return db.query(GMAOUbicacionEquipo).all()

@router.post("/ubicaciones", response_model=GMAOUbicacion)
def create_ubicacion(ub_in: GMAOUbicacionBase, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_EQUIPOS)
    db_ub = GMAOUbicacionEquipo(nombre=ub_in.nombre)
    db.add(db_ub)
    db.commit()
    db.refresh(db_ub)
    return db_ub

@router.delete("/ubicaciones/{ub_id}")
def delete_ubicacion(ub_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_EQUIPOS)
    db_ub = db.query(GMAOUbicacionEquipo).filter(GMAOUbicacionEquipo.id == ub_id).first()
    if db_ub:
        db.delete(db_ub)
        db.commit()
    return {"ok": True}

@router.get("/equipos/{equipo_id}", response_model=GMAOEquipoSchema)
def get_equipo(equipo_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_EQUIPOS)
    equipo = db.query(GMAOEquipo).filter(GMAOEquipo.id == equipo_id).first()
    if not equipo:
        raise HTTPException(status_code=404, detail="Equipo no encontrado.")
    return equipo

@router.put("/equipos/{equipo_id}", response_model=GMAOEquipoSchema)
def update_equipo(equipo_id: int, equipo_in: GMAOEquipoUpdate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_EQUIPOS)
    equipo = db.query(GMAOEquipo).filter(GMAOEquipo.id == equipo_id).first()
    if not equipo:
        raise HTTPException(status_code=404, detail="Equipo no encontrado.")
    
    update_data = equipo_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(equipo, field, value)
    
    db.commit()
    db.refresh(equipo)
    return equipo

@router.post("/equipos/carga-historica", response_model=GMAOMantenimientoHistoricoSchema)
def create_mantenimiento_historico(hist_in: GMAOMantenimientoHistoricoCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_EQUIPOS)
    db_hist = GMAOMantenimientoHistorico(**hist_in.model_dump())
    db.add(db_hist)
    db.commit()
    db.refresh(db_hist)
    return db_hist

@router.get("/equipos/{equipo_id}/historial", response_model=List[GMAOMantenimientoHistoricoSchema])
def get_historial_equipo(equipo_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_EQUIPOS)
    historial = db.query(GMAOMantenimientoHistorico).filter(GMAOMantenimientoHistorico.equipo_id == equipo_id).order_by(GMAOMantenimientoHistorico.fecha_intervencion.desc()).all()
    return historial

from datetime import datetime

@router.get("/preventivo/planes", response_model=List[GMAOPlanPreventivoSchema])
def read_preventive_plans(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_PREVENTIVO)
    planes = db.query(GMAOPlanPreventivo).offset(skip).limit(limit).all()
    # Compute estado_vencimiento on the fly
    today = datetime.now().date()
    for plan in planes:
        if plan.proxima_fecha < today:
            plan.estado_vencimiento = "VENCIDO"
        elif (plan.proxima_fecha - today).days <= 3:
            plan.estado_vencimiento = "PRÓXIMO_VENCIMIENTO"
        else:
            plan.estado_vencimiento = "OK"
    return planes

@router.post("/preventivo/planes", response_model=GMAOPlanPreventivoSchema)
def create_preventive_plan(plan: GMAOPlanPreventivoCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    check_permission(current_user, MOD_PREVENTIVO)
    # Create the Plan
    db_plan = GMAOPlanPreventivo(
        equipo_id=plan.equipo_id,
        titulo_plan=plan.titulo_plan,
        frecuencia_dias=plan.frecuencia_dias,
        frecuencia_nombre=plan.frecuencia_nombre,
        duracion_estimada_min=plan.duracion_estimada_min,
        responsables_rol=plan.responsables_rol,
        usuario_asignado_id=plan.usuario_asignado_id,
        instructivo_sop=plan.instructivo_sop,
        proxima_fecha=plan.proxima_fecha,
        ultima_fecha=plan.ultima_fecha,
        activo=plan.activo
    )
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    
    # Create the Tasks
    for index, tarea in enumerate(plan.tareas):
        db_tarea = GMAOTareaPreventiva(
            plan_id=db_plan.id,
            orden=tarea.orden if tarea.orden else (index + 1),
            descripcion=tarea.descripcion,
            tipo_respuesta=tarea.tipo_respuesta,
            valor_minimo=tarea.valor_minimo,
            valor_maximo=tarea.valor_maximo
        )
        db.add(db_tarea)
    
    db.commit()
    db.refresh(db_plan)
    return db_plan
