from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any, Optional
from app.services.odoo_client import OdooClient
from app.api.deps import get_current_user
from app.models.models import Usuario

router = APIRouter()
odoo_client = OdooClient()

@router.get("/products", response_model=List[Dict[str, Any]])
def get_odoo_purchase_products(current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene la lista de productos de compra activos desde Odoo.
    """
    try:
        products = odoo_client.get_purchase_products()
        return products
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error obteniendo productos de Odoo: {str(e)}"
        )

@router.get("/envases", response_model=List[Dict[str, Any]])
def get_odoo_envases(
    force_refresh: bool = False,
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtiene los productos configurados como envases/taras de Odoo con sus fotos e información técnica.
    """
    try:
        envases = odoo_client.get_envases(force_refresh=force_refresh)
        return envases
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error obteniendo envases de Odoo: {str(e)}"
        )

@router.get("/categories", response_model=List[Dict[str, Any]])
def get_odoo_categories(
    parent_name: Optional[str] = None,
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtiene las categorías de productos vigentes en Odoo.
    Puede filtrar por el nombre de una categoría padre.
    """
    try:
        categories = odoo_client.get_categories(parent_name_filter=parent_name)
        return categories
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error obteniendo categorías de Odoo: {str(e)}"
        )
