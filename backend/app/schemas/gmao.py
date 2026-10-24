from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Dict, Any
from datetime import date, datetime

class GMAOCategoriaBase(BaseModel):
    nombre: str

class GMAOCategoria(GMAOCategoriaBase):
    id: int
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class GMAOUbicacionBase(BaseModel):
    nombre: str

class GMAOUbicacion(GMAOUbicacionBase):
    id: int
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class GMAOEquipoBase(BaseModel):
    codigo_activo: Optional[str] = None
    nombre: str
    categoria: str
    marca: Optional[str] = None
    modelo: Optional[str] = None
    numero_serie: Optional[str] = None
    ubicacion_planta: str
    especificaciones_tecnicas: Optional[Dict[str, Any]] = Field(default_factory=dict)
    criticidad_proceso: Optional[str] = "Media"
    estado: Optional[str] = "Operativo"
    fecha_adquisicion: Optional[date] = None
    garantia_hasta: Optional[date] = None
    qr_code_url: Optional[str] = None
    documento_adjunto: Optional[str] = None

class GMAOEquipoCreate(GMAOEquipoBase):
    pass

class GMAOEquipoUpdate(BaseModel):
    nombre: Optional[str] = None
    categoria: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    numero_serie: Optional[str] = None
    ubicacion_planta: Optional[str] = None
    especificaciones_tecnicas: Optional[Dict[str, Any]] = None
    criticidad_proceso: Optional[str] = None
    estado: Optional[str] = None
    fecha_adquisicion: Optional[date] = None
    garantia_hasta: Optional[date] = None
    qr_code_url: Optional[str] = None

class GMAOEquipo(GMAOEquipoBase):
    id: int
    creado_por: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class GMAOMantenimientoHistoricoBase(BaseModel):
    fecha_intervencion: date
    tipo_mantenimiento: str
    descripcion_trabajo: str
    tecnico_proveedor: Optional[str] = None
    costo_total: Optional[float] = 0.00
    repuestos_cambiados: Optional[str] = None
    es_retroactivo: Optional[bool] = True

class GMAOMantenimientoHistoricoCreate(GMAOMantenimientoHistoricoBase):
    equipo_id: int

class GMAOMantenimientoHistorico(GMAOMantenimientoHistoricoBase):
    id: int
    equipo_id: int
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class GMAOTareaPreventivaBase(BaseModel):
    orden: int = 1
    descripcion: str
    tipo_respuesta: str = "boolean"
    valor_minimo: Optional[float] = None
    valor_maximo: Optional[float] = None

class GMAOTareaPreventivaCreate(GMAOTareaPreventivaBase):
    pass

class GMAOTareaPreventiva(GMAOTareaPreventivaBase):
    id: int
    plan_id: int
    model_config = ConfigDict(from_attributes=True)

class GMAOPlanPreventivoBase(BaseModel):
    titulo_plan: str
    frecuencia_dias: int
    frecuencia_nombre: str
    duracion_estimada_min: int = 60
    responsables_rol: str
    usuario_asignado_id: Optional[int] = None
    instructivo_sop: Optional[str] = None
    proxima_fecha: date
    ultima_fecha: Optional[date] = None
    activo: bool = True

class GMAOPlanPreventivoCreate(GMAOPlanPreventivoBase):
    equipo_id: int
    tareas: List[GMAOTareaPreventivaCreate] = []

class GMAOPlanPreventivo(GMAOPlanPreventivoBase):
    id: int
    equipo_id: int
    created_at: Optional[datetime] = None
    tareas: List[GMAOTareaPreventiva] = []
    
    # Custom property for UI
    estado_vencimiento: Optional[str] = "OK"

    model_config = ConfigDict(from_attributes=True)
