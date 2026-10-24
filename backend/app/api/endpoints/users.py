from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.models import Usuario
from app.schemas.schemas import UsuarioCreate, UsuarioResponse
from app.api.deps import get_current_user, require_admin

router = APIRouter()


@router.post("/", response_model=UsuarioResponse)
def create_local_user(
    user_data: UsuarioCreate, 
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin)
):
    """
    Crea un nuevo usuario local para la aplicación (ej: personal de cocina o bodega).
    """
    # Verificar si el usuario ya existe
    existing = db.query(Usuario).filter(Usuario.username == user_data.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="El nombre de usuario ya se encuentra registrado."
        )

    # Si es local y se provee password, hashear la contraseña
    password_hash = None
    if user_data.password:
        password_hash = get_password_hash(user_data.password)

    new_user = Usuario(
        username=user_data.username,
        nombre=user_data.nombre,
        password_hash=password_hash,
        rol=user_data.rol,
        odoo_user_id=user_data.odoo_user_id,
        activo=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/", response_model=List[UsuarioResponse])
def list_local_users(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin)
):
    """
    Obtiene la lista de todos los usuarios registrados.
    """
    return db.query(Usuario).all()

@router.put("/{user_id}", response_model=UsuarioResponse)
def update_local_user(
    user_id: int,
    user_data: UsuarioCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin)
):
    """
    Actualiza la información de un usuario local.
    """
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    # Si se envía contraseña, hashearla
    if user_data.password:
        user.password_hash = get_password_hash(user_data.password)
    
    user.username = user_data.username
    user.nombre = user_data.nombre
    user.rol = user_data.rol
    user.odoo_user_id = user_data.odoo_user_id

    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}", response_model=UsuarioResponse)
def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin)
):
    """
    Elimina un usuario físicamente de la base de datos.
    """
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    db.delete(user)
    db.commit()
    return user

@router.put("/{user_id}/permisos", response_model=UsuarioResponse)
def update_user_permissions(
    user_id: int,
    permisos: dict,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin)
):
    """
    Actualiza la configuración JSON de permisos de un usuario.
    """
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    user.permisos = permisos
    db.commit()
    db.refresh(user)
    return user
