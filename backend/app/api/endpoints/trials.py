from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.core.database import get_db
from app.models.models import (
    RecetaPrueba,
    RecetaPruebaIngrediente,
    RecetaPruebaMultimedia,
    Receta,
    RecetaIngrediente,
    Usuario
)
from app.schemas.schemas import (
    RecetaPruebaCreate,
    RecetaPruebaUpdate,
    RecetaPruebaResponse,
    RecetaPruebaFinalize,
    RecetaResponse
)
from app.api.deps import get_current_user

router = APIRouter()

@router.post("/", response_model=RecetaPruebaResponse)
def create_recipe_trial(
    trial_data: RecetaPruebaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Crea una nueva prueba de receta (Receta en fase experimental).
    """
    # 1. Crear la prueba
    db_trial = RecetaPrueba(
        nombre_plato=trial_data.nombre_plato,
        base_prueba=trial_data.base_prueba,
        base_registro_target=trial_data.base_registro_target,
        estado="planificada",
        fecha_prueba=trial_data.fecha_prueba
    )
    db.add(db_trial)
    db.commit()
    db.refresh(db_trial)

    # 2. Agregar ingredientes de prueba
    for ing in trial_data.ingredientes:
        db_ing = RecetaPruebaIngrediente(
            receta_prueba_id=db_trial.id,
            odoo_product_id=ing.odoo_product_id,
            cantidad_teorica=ing.cantidad_teorica,
            cantidad_real=None,  # Se registrará físicamente en cocina
            unidad_medida=ing.unidad_medida
        )
        db.add(db_ing)

    # 3. Agregar multimedia e instrucciones
    if trial_data.multimedia:
        for media in trial_data.multimedia:
            db_media = RecetaPruebaMultimedia(
                receta_prueba_id=db_trial.id,
                tipo=media.tipo,
                contenido=media.contenido
            )
            db.add(db_media)

    db.commit()
    
    # Recargar relaciones
    return db.query(RecetaPrueba)\
        .options(joinedload(RecetaPrueba.ingredientes), joinedload(RecetaPrueba.multimedia))\
        .filter(RecetaPrueba.id == db_trial.id)\
        .first()


@router.get("/", response_model=List[RecetaPruebaResponse])
def list_recipe_trials(
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Lista las pruebas de recetas programadas.
    """
    query = db.query(RecetaPrueba).options(
        joinedload(RecetaPrueba.ingredientes), 
        joinedload(RecetaPrueba.multimedia)
    )
    if estado:
        query = query.filter(RecetaPrueba.estado == estado)
    return query.all()


@router.get("/{trial_id}", response_model=RecetaPruebaResponse)
def get_recipe_trial(
    trial_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtiene el detalle de una prueba de receta.
    """
    trial = db.query(RecetaPrueba)\
        .options(joinedload(RecetaPrueba.ingredientes), joinedload(RecetaPrueba.multimedia))\
        .filter(RecetaPrueba.id == trial_id)\
        .first()
    if not trial:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prueba no encontrada")
    return trial


@router.put("/{trial_id}", response_model=RecetaPruebaResponse)
def update_recipe_trial(
    trial_id: int,
    update_data: RecetaPruebaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Actualiza el estado de la prueba, ajusta la base de porciones obtenida
    o registra los pesajes reales de los ingredientes reportados por cocina.
    """
    trial = db.query(RecetaPrueba).filter(RecetaPrueba.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prueba no encontrada")

    # Actualizar estado y base si se proveen
    if update_data.estado:
        trial.estado = update_data.estado
    if update_data.base_prueba is not None:
        trial.base_prueba = update_data.base_prueba

    # Actualizar cantidades reales de ingredientes
    if update_data.ingredientes:
        for ing_update in update_data.ingredientes:
            db_ing = db.query(RecetaPruebaIngrediente).filter(
                RecetaPruebaIngrediente.id == ing_update.id,
                RecetaPruebaIngrediente.receta_prueba_id == trial_id
            ).first()
            if db_ing:
                db_ing.cantidad_real = ing_update.cantidad_real

    db.commit()

    return db.query(RecetaPrueba)\
        .options(joinedload(RecetaPrueba.ingredientes), joinedload(RecetaPrueba.multimedia))\
        .filter(RecetaPrueba.id == trial_id)\
        .first()


@router.post("/{trial_id}/finalize-to-recipe", response_model=RecetaResponse)
def finalize_trial_to_recipe(
    trial_id: int,
    finalize_data: RecetaPruebaFinalize,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Cierra la prueba y crea la receta definitiva en la base de datos local.
    Aplica el escalamiento matemático:
    cantidad_proporcional = cantidad_real * (base_registro_target / base_prueba)
    """
    trial = db.query(RecetaPrueba).options(joinedload(RecetaPrueba.ingredientes)).filter(RecetaPrueba.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prueba no encontrada")

    if trial.estado == "registrada":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Esta prueba ya ha sido convertida e inscrita como receta definitiva."
        )

    # Validar que los ingredientes tengan cantidades reales o usar la teórica
    # e iniciar transacción
    try:
        # 1. Crear Receta Definitiva
        new_recipe = Receta(
            nombre=trial.nombre_plato,
            base_porciones=trial.base_registro_target, # Escala objetivo definitiva
            proteina_dominante=finalize_data.proteina_dominante,
            categoria_odoo_id=finalize_data.categoria_odoo_id,
            subcategoria_odoo_id=finalize_data.subcategoria_odoo_id,
            is_active=True
        )
        db.add(new_recipe)
        db.commit()
        db.refresh(new_recipe)

        # 2. Escalar e insertar cada ingrediente
        for ing in trial.ingredientes:
            # Si no hay cantidad real registrada, asumimos la teórica de la prueba
            cantidad_real_usada = ing.cantidad_real if ing.cantidad_real is not None else ing.cantidad_teorica
            
            # Evitar división por cero
            base_prueba_val = trial.base_prueba if trial.base_prueba > 0 else 1
            
            # Regla de tres simple: (cantidad_real / base_prueba) * base_registro_target
            cantidad_escalada = (cantidad_real_usada / base_prueba_val) * trial.base_registro_target

            db_ingrediente = RecetaIngrediente(
                receta_id=new_recipe.id,
                odoo_product_id=ing.odoo_product_id,
                cantidad_proporcional=cantidad_escalada,
                unidad_medida=ing.unidad_medida
            )
            db.add(db_ingrediente)

        # 3. Cambiar estado de la prueba
        trial.estado = "registrada"
        db.commit()

        # Retornar la receta creada con sus ingredientes
        return db.query(Receta)\
            .options(joinedload(Receta.ingredientes))\
            .filter(Receta.id == new_recipe.id)\
            .first()

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo durante la conversión y cierre de la prueba: {str(e)}"
        )
