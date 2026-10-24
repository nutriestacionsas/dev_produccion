from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.db.database import get_db
from app.models.models import Usuario
from app.schemas.schemas import UsuarioResponse
from app.api.deps import get_current_user

router = APIRouter()

@router.get("/", response_model=List[UsuarioResponse])
def get_all_users(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtiene todos los usuarios.
    """
    if current_user.rol != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos suficientes para ver los usuarios."
        )
    return db.query(Usuario).all()

@router.put("/{usuario_id}/permisos", response_model=UsuarioResponse)
def update_user_permissions(
    usuario_id: int,
    permisos: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Actualiza los permisos de un usuario específico.
    """
    if current_user.rol != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos suficientes para modificar permisos."
        )

    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    usuario.permisos = permisos
    db.commit()
    db.refresh(usuario)
    return usuario
