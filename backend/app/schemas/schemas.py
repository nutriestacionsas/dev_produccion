from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict
from datetime import datetime, date

# ----------------- SCHEMAS DE USUARIOS Y AUTH -----------------

class RolBase(BaseModel):
    nombre: str

class RolCreate(RolBase):
    pass

class RolResponse(RolBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class LoginRequest(BaseModel):
    username: str = Field(..., description="Nombre de usuario local o correo de Odoo")
    password: str = Field(..., description="Contraseña de Odoo o contraseña local")

class UsuarioCreate(BaseModel):
    username: str
    nombre: str
    password: Optional[str] = None
    rol: str # 'admin', 'cocina', 'bodega', 'supervisor'
    odoo_user_id: Optional[int] = None

class UsuarioResponse(BaseModel):
    id: int
    username: str
    nombre: str
    rol: str
    odoo_user_id: Optional[int]
    activo: bool
    permisos: Optional[dict] = {}

    class Config:
        from_attributes = True

# ----------------- SCHEMAS DE RECETAS -----------------

class RecetaIngredienteCreate(BaseModel):
    odoo_product_id: int
    cantidad_proporcional: float
    unidad_medida: str

class RecetaIngredienteResponse(BaseModel):
    id: int
    receta_id: int
    odoo_product_id: int
    cantidad_proporcional: float
    unidad_medida: str

    class Config:
        from_attributes = True

class RecetaCreate(BaseModel):
    nombre: str
    base_porciones: float
    proteina_dominante: str
    categoria_odoo_id: int
    subcategoria_odoo_id: Optional[int] = None
    ingredientes: List[RecetaIngredienteCreate]

class RecipeStepsUpdate(BaseModel):
    pasos_preparacion: List[str]

class RecetaResponse(BaseModel):
    id: int
    nombre: str
    base_porciones: float
    proteina_dominante: str
    categoria_odoo_id: int
    subcategoria_odoo_id: Optional[int]
    odoo_product_id: Optional[int]
    is_active: bool
    pasos_preparacion: Optional[List[str]] = []
    created_at: datetime
    ingredientes: List[RecetaIngredienteResponse] = []
    
    # Campos dinámicos de Odoo
    bom_cost: Optional[float] = None
    categ_name: Optional[str] = None
    image_256: Optional[str] = None

    class Config:
        from_attributes = True


# ----------------- SCHEMAS DE PRUEBAS DE RECETAS -----------------

class RecetaPruebaIngredienteCreate(BaseModel):
    odoo_product_id: int
    cantidad_teorica: float
    unidad_medida: str

class RecetaPruebaIngredienteUpdate(BaseModel):
    id: int
    cantidad_real: float

class RecetaPruebaIngredienteResponse(BaseModel):
    id: int
    receta_prueba_id: int
    odoo_product_id: int
    cantidad_teorica: float
    cantidad_real: Optional[float]
    unidad_medida: str

    class Config:
        from_attributes = True

class RecetaPruebaMultimediaCreate(BaseModel):
    tipo: str # 'texto', 'video_url', 'imagen_url'
    contenido: str

class RecetaPruebaMultimediaResponse(BaseModel):
    id: int
    receta_prueba_id: int
    tipo: str
    contenido: str
    created_at: datetime

    class Config:
        from_attributes = True

class RecetaPruebaCreate(BaseModel):
    nombre_plato: str
    base_prueba: float
    base_registro_target: float
    fecha_prueba: date
    ingredientes: List[RecetaPruebaIngredienteCreate]
    multimedia: Optional[List[RecetaPruebaMultimediaCreate]] = []

class RecetaPruebaUpdate(BaseModel):
    base_prueba: Optional[float] = None
    estado: Optional[str] = None # 'planificada', 'en_coccion', 'completada'
    ingredientes: Optional[List[RecetaPruebaIngredienteUpdate]] = []

class RecetaPruebaResponse(BaseModel):
    id: int
    nombre_plato: str
    base_prueba: float
    base_registro_target: float
    estado: str
    fecha_prueba: date
    created_at: datetime
    ingredientes: List[RecetaPruebaIngredienteResponse] = []
    multimedia: List[RecetaPruebaMultimediaResponse] = []

    class Config:
        from_attributes = True

class RecetaPruebaFinalize(BaseModel):
    proteina_dominante: str
    categoria_odoo_id: int
    subcategoria_odoo_id: Optional[int] = None


# ----------------- SCHEMAS DE PLANIFICADOR DE MENU -----------------

class MenuDiarioComponenteCreate(BaseModel):
    componente_tipo: str
    receta_id: int

class PedidoClienteCreate(BaseModel):
    odoo_partner_id: int
    tipo_pedido: str  # 'numerico' o 'porcentaje'
    valor_pedido: float
    comensales_calculados: int

class DiaPlanificadoCreate(BaseModel):
    fecha: date
    nombre_odoo_producto: str
    componentes: List[MenuDiarioComponenteCreate]
    pedidos: List[PedidoClienteCreate]

class MenuDiarioComponenteResponse(BaseModel):
    id: int
    dia_planificado_id: int
    componente_tipo: str
    receta_id: int
    receta_nombre: Optional[str] = None

    class Config:
        from_attributes = True

class PedidoClienteResponse(BaseModel):
    id: int
    dia_planificado_id: int
    odoo_partner_id: int
    tipo_pedido: str
    valor_pedido: float
    comensales_calculados: int
    partner_name: Optional[str] = None

    class Config:
        from_attributes = True

class DiaPlanificadoResponse(BaseModel):
    id: int
    planificacion_id: int
    fecha: date
    nombre_odoo_producto: str
    odoo_product_id: Optional[int] = None
    costo_diario_estimado: float
    componentes: List[MenuDiarioComponenteResponse] = []
    pedidos: List[PedidoClienteResponse] = []

    class Config:
        from_attributes = True

class PlanificacionResponse(BaseModel):
    id: int
    nombre: str
    fecha_inicio: date
    fecha_fin: date
    created_at: datetime
    dias: List[DiaPlanificadoResponse] = []

    class Config:
        from_attributes = True


class OdooConfigCreate(BaseModel):
    url: str
    db: str
    username: Optional[str] = None
    password: Optional[str] = None

class OdooConfigResponse(BaseModel):
    url: str
    db: str
    username: Optional[str] = None
    activo: bool
    updated_at: datetime

    class Config:
        from_attributes = True


# ----------------- SCHEMAS DE ORDENES DE FABRICACION Y TIPOS DE MENU -----------------

class ClienteCreate(BaseModel):
    nombre: str
    tipo: str  # 'porcentaje' o 'cantidad'

class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    tipo: Optional[str] = None

class ClienteResponse(BaseModel):
    id: int
    nombre: str
    tipo: str

    class Config:
        from_attributes = True

class OrdenProduccionItemSchema(BaseModel):
    plato_nombre: str
    tipo: str
    cantidades_clientes: dict
    total: int

class OrdenProduccionDiaImport(BaseModel):
    fecha: date
    items: List[OrdenProduccionItemSchema]

class OrdenProduccionItemResponse(BaseModel):
    id: int
    orden_dia_id: int
    plato_nombre: str
    tipo: str
    cantidades_clientes: dict
    total: int

    class Config:
        from_attributes = True

class TurnoCreate(BaseModel):
    nombre: str
    franja_horaria: str

class TurnoResponse(BaseModel):
    id: int
    nombre: str
    franja_horaria: str

    class Config:
        from_attributes = True

class TipoMenuCreate(BaseModel):
    nombre: str

class TipoMenuResponse(BaseModel):
    id: int
    nombre: str

    class Config:
        from_attributes = True

class OrdenProduccionDiaAsignacion(BaseModel):
    turno_id: Optional[int] = None
    tipo_menu_id: Optional[int] = None

class OrdenProduccionDiaResponse(BaseModel):
    id: int
    fecha: date
    turno_id: Optional[int] = None
    tipo_menu_id: Optional[int] = None
    turno: Optional[TurnoResponse] = None
    tipo_menu: Optional[TipoMenuResponse] = None
    odoo_product_id: Optional[int] = None
    odoo_product_name: Optional[str] = None
    ruta_asignada: Optional[str] = None
    produccion_establecida: Optional[bool] = False
    enviado_despacho_cliente: Optional[bool] = False
    created_at: datetime
    items: List[OrdenProduccionItemResponse] = []
    detalle_produccion: Optional[dict] = None

    class Config:
        from_attributes = True


class ClientDateSelection(BaseModel):
    f1_pct: Optional[int] = None
    f2_pct: Optional[int] = None
    f1_qty: Optional[int] = None
    f2_qty: Optional[int] = None
    ms_qty: Optional[int] = None

class PlatoAdicionalCreate(BaseModel):
    plato_nombre: str
    tipo: str

class OrdenManualCreate(BaseModel):
    fecha: date
    turno_nombre: str
    tipo_menu_nombre: str
    cliente_nombre: str
    cliente_tipo: Optional[str] = None  # "porcentaje" o "cantidad" (si es nuevo)
    plato_nombre: str
    tipo: str
    cantidad: int
    acompanamientos_existentes: Optional[List[str]] = None
    acompanamiento_extra_nombre: Optional[str] = None
    acompanamiento_extra_tipo: Optional[str] = None
    platos_adicionales: Optional[List[PlatoAdicionalCreate]] = []


class ClientPctUpdate(BaseModel):
    fecha: date
    cliente_nombre: str
    tipo: str
    nuevo_porcentaje: int
    tipo_menu_id: Optional[int] = None
    turno_id: Optional[int] = None
    total_cantidad: Optional[int] = None
    jugo2_cantidad: Optional[int] = None


class ClientQtyUpdate(BaseModel):
    fecha: date
    cliente_nombre: str
    f1_cantidad: int
    f2_cantidad: int
    ms_cantidad: int
    tipo_menu_id: Optional[int] = None
    turno_id: Optional[int] = None
    jugo2_cantidad: Optional[int] = None


class ClientMsUpdate(BaseModel):
    fecha: date
    cliente_nombre: str
    ms_cantidad: int
    tipo_menu_id: Optional[int] = None
    turno_id: Optional[int] = None

class QuitarClienteRequest(BaseModel):
    cliente_nombre: str
    fecha_inicio: date
    fecha_fin: date

class OrdenImportacionTemporalResponse(BaseModel):
    id: int
    fecha: date
    plato_nombre: str
    tipo: str
    cantidades_clientes: dict
    total: int

    class Config:
        from_attributes = True

# ----------------- SCHEMAS DE GRUPOS DE DESPACHO -----------------

class GrupoDespachoCategoriaBase(BaseModel):
    categoria_odoo_nombre: str

class GrupoDespachoCategoriaResponse(GrupoDespachoCategoriaBase):
    id: int
    grupo_id: int

    class Config:
        from_attributes = True

class GrupoDespachoBase(BaseModel):
    nombre: str
    activo: Optional[bool] = True

class GrupoDespachoCreate(GrupoDespachoBase):
    categorias: List[str] = []

class GrupoDespachoUpdate(BaseModel):
    nombre: Optional[str] = None
    activo: Optional[bool] = None
    categorias: Optional[List[str]] = None

class GrupoDespachoResponse(GrupoDespachoBase):
    id: int
    categorias: List[GrupoDespachoCategoriaResponse] = []

    class Config:
        from_attributes = True
