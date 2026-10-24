from fastapi import APIRouter
from app.api.endpoints import auth, users, odoo, recipes, trials, planner, dispatch, inventory, roles, dispatch_cliente, puntos_servicio, gmao

api_router = APIRouter()

# Registrar los routers
api_router.include_router(auth.router, prefix="/auth", tags=["Autenticación"])
api_router.include_router(users.router, prefix="/users", tags=["Usuarios"])
api_router.include_router(odoo.router, prefix="/odoo", tags=["Integración Odoo"])
api_router.include_router(recipes.router, prefix="/recipes", tags=["Recetas"])
api_router.include_router(trials.router, prefix="/trials", tags=["Pruebas de Recetas"])
api_router.include_router(planner.router, prefix="/planner", tags=["Planificador"])
api_router.include_router(dispatch.router, prefix="/dispatch", tags=["Despacho"])
api_router.include_router(dispatch_cliente.config_router, prefix="/dispatch/config", tags=["Configuración Despacho"])
api_router.include_router(dispatch_cliente.router, prefix="/dispatch-cliente", tags=["Despacho Cliente"])
api_router.add_api_route("/dispatch/cliente/{despacho_id}/generar-guia", dispatch_cliente.generar_guia_remision, methods=["POST"], tags=["Despacho Cliente"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["Inventario"])
api_router.include_router(roles.router, prefix="/roles", tags=["Roles"])
api_router.include_router(puntos_servicio.router, prefix="/puntos-servicio", tags=["Puntos de Servicio"])
api_router.include_router(gmao.router, prefix="/gmao", tags=["GMAO Procesos y Mantenimientos"])
