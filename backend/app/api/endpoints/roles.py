from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.models import Rol, Usuario
from app.schemas.schemas import RolResponse, RolCreate
from app.api.deps import require_admin

router = APIRouter()

@router.get("/", response_model=List[RolResponse])
def get_roles(db: Session = Depends(get_db)):
    """
    Obtiene todos los roles disponibles en el sistema.
    """
    return db.query(Rol).all()

@router.post("/", response_model=RolResponse, status_code=status.HTTP_201_CREATED)
def create_role(rol_in: RolCreate, db: Session = Depends(get_db), admin: Usuario = Depends(require_admin)):
    """
    Crea un nuevo rol (etiqueta). Solo administradores.
    """
    existing_rol = db.query(Rol).filter(Rol.nombre == rol_in.nombre).first()
    if existing_rol:
        raise HTTPException(status_code=400, detail="Este rol ya existe.")
    
    new_rol = Rol(nombre=rol_in.nombre)
    db.add(new_rol)
    db.commit()
    db.refresh(new_rol)
    return new_rol

@router.delete("/{rol_id}", response_model=dict)
def delete_role(rol_id: int, db: Session = Depends(get_db), admin: Usuario = Depends(require_admin)):
    """
    Elimina un rol si no es uno del sistema (admin).
    """
    rol = db.query(Rol).filter(Rol.id == rol_id).first()
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")
    
    system_roles = ["admin", "cocina", "bodega", "supervisor"]
    if rol.nombre in system_roles:
        raise HTTPException(status_code=400, detail="No se pueden eliminar los roles predefinidos del sistema.")
        
    db.delete(rol)
    db.commit()
    return {"message": "Rol eliminado exitosamente."}
