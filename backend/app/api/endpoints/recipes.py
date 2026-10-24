from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
import logging
from app.core.database import get_db
from app.models.models import Receta, RecetaIngrediente, Usuario
from app.schemas.schemas import RecetaCreate, RecetaResponse, RecipeStepsUpdate
from app.api.deps import get_current_user
from app.services.odoo_client import OdooClient

router = APIRouter()
odoo_client = OdooClient()
logger = logging.getLogger(__name__)

@router.post("/", response_model=RecetaResponse)
def create_recipe(
    recipe_data: RecetaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Crea una nueva receta local en la base de datos PostgreSQL.
    """
    # Crear la receta base
    new_recipe = Receta(
        nombre=recipe_data.nombre,
        base_porciones=recipe_data.base_porciones,
        proteina_dominante=recipe_data.proteina_dominante,
        categoria_odoo_id=recipe_data.categoria_odoo_id,
        subcategoria_odoo_id=recipe_data.subcategoria_odoo_id,
        is_active=True
    )
    db.add(new_recipe)
    db.commit()
    db.refresh(new_recipe)

    # Crear los ingredientes asociados
    for ing in recipe_data.ingredientes:
        db_ingredient = RecetaIngrediente(
            receta_id=new_recipe.id,
            odoo_product_id=ing.odoo_product_id,
            cantidad_proporcional=ing.cantidad_proporcional,
            unidad_medida=ing.unidad_medida
        )
        db.add(db_ingredient)
    
    db.commit()
    db.refresh(new_recipe)
    
    # Recargar con relaciones
    return db.query(Receta).options(joinedload(Receta.ingredientes)).filter(Receta.id == new_recipe.id).first()


@router.get("/", response_model=List[RecetaResponse])
def list_recipes(
    active_only: bool = False,
    sync: bool = False,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtiene la lista de todas las recetas registradas en Odoo, sincronizándolas localmente.
    Si sync es False y existen recetas locales, se retorna el listado de la BD local
    evitando bloqueos o latencias por conexión a Odoo.
    """
    local_count = db.query(Receta).count()
    odoo_recipes = []
    
    if sync or local_count == 0:
        try:
            odoo_recipes = odoo_client.get_recipes_from_odoo()
        except Exception as e:
            logger.error(f"Fallo al conectar con Odoo al listar recetas: {str(e)}")
            odoo_recipes = []

    if not odoo_recipes:
        # Fallback/Lectura local
        query = db.query(Receta).options(joinedload(Receta.ingredientes))
        if active_only:
            query = query.filter(Receta.is_active == True)
        return query.all()

    # Sincronizar/Upsert en la base de datos local
    for p in odoo_recipes:
        db_rec = db.query(Receta).filter(Receta.odoo_product_id == p['odoo_product_id']).first()
        if not db_rec:
            name_lower = p['name'].lower()
            prot = 'variada'
            if 'pollo' in name_lower or 'ave' in name_lower:
                prot = 'pollo'
            elif 'carne' in name_lower or 'res' in name_lower or 'bife' in name_lower:
                prot = 'res'
            elif 'cerdo' in name_lower or 'chancho' in name_lower or 'tocino' in name_lower:
                prot = 'cerdo'
            elif 'pescado' in name_lower or 'camaron' in name_lower or 'marisco' in name_lower or 'atun' in name_lower:
                prot = 'pescado'
            
            db_rec = Receta(
                nombre=p['name'],
                base_porciones=100.0,
                proteina_dominante=prot,
                categoria_odoo_id=p['categoria_odoo_id'],
                categ_name=p['categ_name'],
                odoo_product_id=p['odoo_product_id'],
                is_active=p['active'],
                bom_cost=float(p.get('bom_cost', 0.0) or 0.0),
                image_256=p.get('image_256')
            )
            db.add(db_rec)
            db.commit()
            db.refresh(db_rec)
        else:
            changed = False
            if db_rec.nombre != p['name']:
                db_rec.nombre = p['name']
                changed = True
            if db_rec.is_active != p['active']:
                db_rec.is_active = p['active']
                changed = True
            if db_rec.categoria_odoo_id != p['categoria_odoo_id']:
                db_rec.categoria_odoo_id = p['categoria_odoo_id']
                changed = True
            if db_rec.categ_name != p['categ_name']:
                db_rec.categ_name = p['categ_name']
                changed = True
            if db_rec.bom_cost != p.get('bom_cost', 0.0):
                db_rec.bom_cost = float(p.get('bom_cost', 0.0) or 0.0)
                changed = True
            if db_rec.image_256 != p.get('image_256'):
                db_rec.image_256 = p.get('image_256')
                changed = True
            if changed:
                db.commit()
                db.refresh(db_rec)

    # Desactivar recetas locales que ya no vienen activas desde Odoo
    active_odoo_ids = [p['odoo_product_id'] for p in odoo_recipes]
    db.query(Receta).filter(
        Receta.odoo_product_id.isnot(None),
        ~Receta.odoo_product_id.in_(active_odoo_ids)
    ).update({Receta.is_active: False}, synchronize_session=False)
    db.commit()

    # Construir listado de respuesta
    response_list = []
    local_recipes = db.query(Receta).all()
    local_map = {r.odoo_product_id: r for r in local_recipes if r.odoo_product_id}
    
    for p in odoo_recipes:
        db_rec = local_map.get(p['odoo_product_id'])
        if db_rec:
            if active_only and not db_rec.is_active:
                continue
            
            rec_dict = {
                "id": db_rec.id,
                "nombre": db_rec.nombre,
                "base_porciones": float(db_rec.base_porciones),
                "proteina_dominante": db_rec.proteina_dominante,
                "categoria_odoo_id": db_rec.categoria_odoo_id,
                "subcategoria_odoo_id": db_rec.subcategoria_odoo_id,
                "odoo_product_id": db_rec.odoo_product_id,
                "is_active": db_rec.is_active,
                "created_at": db_rec.created_at,
                "ingredientes": [],
                "bom_cost": db_rec.bom_cost,
                "categ_name": db_rec.categ_name,
                "image_256": db_rec.image_256
            }
            response_list.append(rec_dict)

    return response_list


@router.get("/{recipe_id}", response_model=RecetaResponse)
def get_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtiene los detalles de una receta específica por ID.
    """
    recipe = db.query(Receta).options(joinedload(Receta.ingredientes)).filter(Receta.id == recipe_id).first()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Receta no encontrada"
        )
    return recipe


@router.put("/{recipe_id}", response_model=RecetaResponse)
def update_recipe(
    recipe_id: int,
    recipe_data: RecetaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Actualiza la información de una receta y sus ingredientes.
    """
    recipe = db.query(Receta).filter(Receta.id == recipe_id).first()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Receta no encontrada"
        )
    
    # Actualizar campos base
    recipe.nombre = recipe_data.nombre
    recipe.base_porciones = recipe_data.base_porciones
    recipe.proteina_dominante = recipe_data.proteina_dominante
    recipe.categoria_odoo_id = recipe_data.categoria_odoo_id
    recipe.subcategoria_odoo_id = recipe_data.subcategoria_odoo_id

    # Reemplazar ingredientes (borrar anteriores e insertar nuevos)
    db.query(RecetaIngrediente).filter(RecetaIngrediente.receta_id == recipe_id).delete()
    
    for ing in recipe_data.ingredientes:
        db_ingredient = RecetaIngrediente(
            receta_id=recipe.id,
            odoo_product_id=ing.odoo_product_id,
            cantidad_proporcional=ing.cantidad_proporcional,
            unidad_medida=ing.unidad_medida
        )
        db.add(db_ingredient)

    db.commit()
    
    # Recargar con relaciones
    return db.query(Receta).options(joinedload(Receta.ingredientes)).filter(Receta.id == recipe_id).first()


@router.post("/{recipe_id}/toggle", response_model=RecetaResponse)
def toggle_recipe_status(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Alterna el estado is_active (Activo/Suspendido) de una receta.
    Sincroniza el estado en la base de datos local y Odoo ERP.
    """
    recipe = db.query(Receta).filter(Receta.id == recipe_id).first()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Receta no encontrada"
        )
    recipe.is_active = not recipe.is_active
    db.commit()
    db.refresh(recipe)

    # Sincronizar estado activo hacia Odoo si está enlazado
    if recipe.odoo_product_id:
        try:
            odoo_client.execute('product.product', 'write', [recipe.odoo_product_id], {'active': recipe.is_active})
        except Exception as odoo_err:
            logger.warning(f"No se pudo sincronizar el estado activo a Odoo para el producto {recipe.odoo_product_id}: {str(odoo_err)}")

    return {
        "id": recipe.id,
        "nombre": recipe.nombre,
        "base_porciones": float(recipe.base_porciones),
        "proteina_dominante": recipe.proteina_dominante,
        "categoria_odoo_id": recipe.categoria_odoo_id,
        "subcategoria_odoo_id": recipe.subcategoria_odoo_id,
        "odoo_product_id": recipe.odoo_product_id,
        "is_active": recipe.is_active,
        "created_at": recipe.created_at,
        "ingredientes": [],
        "bom_cost": 0.0,
        "categ_name": "",
        "image_256": None
    }


@router.post("/{recipe_id}/sync-odoo", response_model=RecetaResponse)
def sync_recipe_to_odoo(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Sincroniza la receta con Odoo ERP 19, creando el producto plantilla y su Lista de Materiales (BoM).
    Sustituye o asigna el odoo_product_id en la receta local.
    """
    recipe = db.query(Receta).options(joinedload(Receta.ingredientes)).filter(Receta.id == recipe_id).first()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Receta no encontrada"
        )
    
    if recipe.odoo_product_id:
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta receta ya se encuentra sincronizada con Odoo."
        )

    # Preparar datos de ingredientes para Odoo
    # Odoo espera cantidades en base a 1 unidad del producto resultante.
    # Como la receta local está configurada en base a recipe.base_porciones (ej. 100),
    # debemos dividir la cantidad_proporcional de los ingredientes entre la base_porciones
    # para que la BoM en Odoo quede a nivel unitario (base 1 porción).
    ingredients_odoo = []
    for ing in recipe.ingredientes:
        ingredients_odoo.append({
            'product_id': ing.odoo_product_id,
            'qty': float(ing.cantidad_proporcional / recipe.base_porciones)
        })

    try:
        sync_result = odoo_client.create_recipe_product(
            name=recipe.nombre,
            category_id=recipe.categoria_odoo_id,
            ingredients=ingredients_odoo
        )
        # Guardar la relación local
        recipe.odoo_product_id = sync_result['product_id']
        db.commit()
        db.refresh(recipe)
        return recipe
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo al sincronizar con Odoo: {str(e)}"
        )


@router.get("/{recipe_id}/bom")
def get_recipe_bom(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna la lista de ingredientes y costos de la BoM de Odoo para una receta local.
    """
    recipe = db.query(Receta).filter(Receta.id == recipe_id).first()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Receta no encontrada"
        )
    if not recipe.odoo_product_id:
        return []
    
    try:
        bom_details = odoo_client.get_recipe_bom_details(recipe.odoo_product_id)
        return bom_details
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo al conectar con Odoo: {str(e)}"
        )


@router.put("/{recipe_id}/steps", response_model=RecetaResponse)
def update_recipe_steps(
    recipe_id: int,
    steps_data: RecipeStepsUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Actualiza únicamente los pasos de preparación locales de una receta.
    """
    recipe = db.query(Receta).filter(Receta.id == recipe_id).first()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Receta no encontrada"
        )
    recipe.pasos_preparacion = steps_data.pasos_preparacion
    db.commit()
    db.refresh(recipe)
    return recipe

