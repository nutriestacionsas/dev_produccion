from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.api import api_router
from app.core.database import engine, Base
from app.models.models import (
    Usuario, Receta, RecetaIngrediente, RecetaPrueba,
    RecetaPruebaIngrediente, RecetaPruebaMultimedia,
    Planificacion, DiaPlanificado, MenuDiarioComponente,
    PedidoCliente, Despacho, DespachoProducto, DespachoPesaje,
    Inventario, InventarioItem, InventarioPesaje, LogSincronizacionOdoo,
    OdooConfig, Cliente, OrdenProduccionDia, OrdenProduccionItem, OrdenImportacionTemporal, Turno, TipoMenu,
    ConfiguracionSistema, Rol
)
from app.models.gmao import (
    GMAOCategoriaEquipo, GMAOUbicacionEquipo,
    GMAOEquipo, GMAOMantenimientoHistorico, GMAOPlanPreventivo,
    GMAOTareaPreventiva, GMAOOrdenTrabajo, GMAORepuestoUtilizado,
    GMAOPuntoControlParametro, GMAOMedicionPuntoControl
)

# Crear tablas en base de datos si no existen
Base.metadata.create_all(bind=engine)

# Asegurar que la columna bom_cost exista en la tabla recetas
from sqlalchemy import text
from app.core.database import SessionLocal
alter_session = SessionLocal()
try:
    alter_session.execute(text("ALTER TABLE recetas ADD COLUMN IF NOT EXISTS bom_cost FLOAT DEFAULT 0.0;"))
    alter_session.execute(text("ALTER TABLE orden_produccion_dias ADD COLUMN IF NOT EXISTS ruta_asignada VARCHAR(255);"))
    alter_session.execute(text("ALTER TABLE orden_produccion_items ADD COLUMN IF NOT EXISTS odoo_product_id INTEGER;"))
    alter_session.execute(text("ALTER TABLE historial_despachos ADD COLUMN IF NOT EXISTS grupo_nombre VARCHAR(255);"))
    alter_session.execute(text("ALTER TABLE historial_despachos ADD COLUMN IF NOT EXISTS creado_por INTEGER;"))
    alter_session.execute(text("ALTER TABLE historial_despachos ADD COLUMN IF NOT EXISTS novedades TEXT;"))
    
    # Agregar columna permisos en tabla usuarios
    alter_session.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permisos JSON DEFAULT '{}'::json;"))
    
    # Agregar columna porciones_seleccionadas
    alter_session.execute(text("ALTER TABLE despacho_cliente_pesajes ADD COLUMN IF NOT EXISTS porciones_seleccionadas JSON;"))
    
    alter_session.commit()
except Exception as alter_err:
    print(f"Error al agregar columna bom_cost: {alter_err}")
    alter_session.rollback()
finally:
    alter_session.close()

# Sembrar usuario administrador y tipo de menú principal por defecto si la base está vacía
from app.core.database import SessionLocal
from app.core.security import get_password_hash
db_session = SessionLocal()
try:
    admin_exists = db_session.query(Usuario).filter(Usuario.username == "acalderonl1").first()
    if not admin_exists:
        # Seeding de roles predefinidos
        default_roles = ["admin", "cocina", "bodega", "supervisor"]
        for role_name in default_roles:
            role = db_session.query(Rol).filter(Rol.nombre == role_name).first()
            if not role:
                db_session.add(Rol(nombre=role_name))
        db_session.commit()

        db_session.add(Usuario(
            username="acalderonl1",
            nombre="Administrador General",
            password_hash=get_password_hash("Nutri005!"),
            rol="admin",
            activo=True
        ))
        db_session.commit()
    
    # Sembrar tipo de menú principal
    menu_type_exists = db_session.query(TipoMenu).filter(TipoMenu.nombre == "Almuerzo Tipo 1").first()
    if not menu_type_exists:
        db_session.add(TipoMenu(nombre="Almuerzo Tipo 1"))
        db_session.commit()
finally:
    db_session.close()

app = FastAPI(
    title="Nutriestacion SAS - Engine de Producción",
    description="Backend en FastAPI para gestionar recetas, planificaciones, despachos e inventarios con sincronización a Odoo.",
    version="1.0.0"
)

# Configuración de CORS para el cliente de React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En producción cambiar por la URL del cliente React
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    logger.error(f"Validation Error: {exc}")
    logger.error(f"Body: {await request.body()}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

# Registrar la API central bajo el prefijo /api
from app.services.gmao_scheduler import start_scheduler

# Evento de inicio
@app.on_event("startup")
def startup_event():
    start_scheduler()
    print("Aplicación iniciada. Scheduler de GMAO corriendo.")

app.include_router(api_router, prefix="/api")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "app": "Nutriestacion SAS - Engine de Producción",
        "version": "1.0.0"
    }

