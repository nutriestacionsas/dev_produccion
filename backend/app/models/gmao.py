from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text, Date
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.core.database import Base

class GMAOCategoriaEquipo(Base):
    __tablename__ = "gmao_categorias"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class GMAOUbicacionEquipo(Base):
    __tablename__ = "gmao_ubicaciones"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class GMAOEquipo(Base):
    __tablename__ = "gmao_equipos"

    id = Column(Integer, primary_key=True, index=True)
    codigo_activo = Column(String(50), unique=True, nullable=False, index=True)
    nombre = Column(String(150), nullable=False)
    categoria = Column(String(100), nullable=False)
    marca = Column(String(100))
    modelo = Column(String(100))
    numero_serie = Column(String(100))
    ubicacion_planta = Column(String(150), nullable=False)
    especificaciones_tecnicas = Column(JSONB, default=dict)
    criticidad_proceso = Column(String(20), default="Media")
    estado = Column(String(50), default="Operativo")
    fecha_adquisicion = Column(Date)
    garantia_hasta = Column(Date)
    qr_code_url = Column(Text)
    documento_adjunto = Column(String(255), nullable=True)
    creado_por = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    creador = relationship("Usuario")
    mantenimientos_historicos = relationship("GMAOMantenimientoHistorico", back_populates="equipo", cascade="all, delete-orphan")
    planes_preventivos = relationship("GMAOPlanPreventivo", back_populates="equipo", cascade="all, delete-orphan")
    ordenes_trabajo = relationship("GMAOOrdenTrabajo", back_populates="equipo", cascade="all, delete-orphan")
    puntos_control = relationship("GMAOPuntoControlParametro", back_populates="equipo", cascade="all, delete-orphan")

class GMAOMantenimientoHistorico(Base):
    __tablename__ = "gmao_mantenimientos_historicos"

    id = Column(Integer, primary_key=True, index=True)
    equipo_id = Column(Integer, ForeignKey("gmao_equipos.id", ondelete="CASCADE"))
    fecha_intervencion = Column(Date, nullable=False)
    tipo_mantenimiento = Column(String(50), nullable=False)
    descripcion_trabajo = Column(Text, nullable=False)
    tecnico_proveedor = Column(String(150))
    costo_total = Column(Float, default=0.00)
    repuestos_cambiados = Column(Text)
    es_retroactivo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    equipo = relationship("GMAOEquipo", back_populates="mantenimientos_historicos")

class GMAOPlanPreventivo(Base):
    __tablename__ = "gmao_planes_preventivos"

    id = Column(Integer, primary_key=True, index=True)
    equipo_id = Column(Integer, ForeignKey("gmao_equipos.id", ondelete="CASCADE"))
    titulo_plan = Column(String(200), nullable=False)
    frecuencia_dias = Column(Integer, nullable=False)
    frecuencia_nombre = Column(String(50), nullable=False)
    duracion_estimada_min = Column(Integer, default=60)
    responsables_rol = Column(String(50), nullable=False)
    usuario_asignado_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"))
    instructivo_sop = Column(Text)
    proxima_fecha = Column(Date, nullable=False)
    ultima_fecha = Column(Date)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    equipo = relationship("GMAOEquipo", back_populates="planes_preventivos")
    usuario_asignado = relationship("Usuario")
    tareas = relationship("GMAOTareaPreventiva", back_populates="plan", cascade="all, delete-orphan")
    ordenes_trabajo = relationship("GMAOOrdenTrabajo", back_populates="plan_preventivo")

class GMAOTareaPreventiva(Base):
    __tablename__ = "gmao_tareas_preventivas"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("gmao_planes_preventivos.id", ondelete="CASCADE"))
    orden = Column(Integer, nullable=False, default=1)
    descripcion = Column(String(255), nullable=False)
    tipo_respuesta = Column(String(50), default="boolean")
    valor_minimo = Column(Float)
    valor_maximo = Column(Float)

    plan = relationship("GMAOPlanPreventivo", back_populates="tareas")

class GMAOOrdenTrabajo(Base):
    __tablename__ = "gmao_ordenes_trabajo"

    id = Column(Integer, primary_key=True, index=True)
    codigo_ot = Column(String(50), unique=True, nullable=False, index=True)
    equipo_id = Column(Integer, ForeignKey("gmao_equipos.id", ondelete="CASCADE"))
    plan_preventivo_id = Column(Integer, ForeignKey("gmao_planes_preventivos.id", ondelete="SET NULL"))
    tipo = Column(String(50), nullable=False)
    prioridad = Column(String(20), default="Media")
    estado = Column(String(50), default="Pendiente")
    descripcion_falla = Column(Text, nullable=False)
    reportado_por = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"))
    tecnico_asignado_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"))
    fecha_reporte = Column(DateTime(timezone=True), server_default=func.now())
    fecha_inicio = Column(DateTime(timezone=True))
    fecha_cierre = Column(DateTime(timezone=True))
    tiempo_parada_horas = Column(Float, default=0.00)
    solucion_aplicada = Column(Text)
    causa_raiz = Column(String(150))
    foto_falla_url = Column(Text)
    foto_solucion_url = Column(Text)
    firma_conformidad_url = Column(Text)
    costo_mano_obra = Column(Float, default=0.00)
    costo_repuestos = Column(Float, default=0.00)
    costo_total = Column(Float, default=0.00)

    equipo = relationship("GMAOEquipo", back_populates="ordenes_trabajo")
    plan_preventivo = relationship("GMAOPlanPreventivo", back_populates="ordenes_trabajo")
    reportador = relationship("Usuario", foreign_keys=[reportado_por])
    tecnico = relationship("Usuario", foreign_keys=[tecnico_asignado_id])
    repuestos_utilizados = relationship("GMAORepuestoUtilizado", back_populates="ot", cascade="all, delete-orphan")

class GMAORepuestoUtilizado(Base):
    __tablename__ = "gmao_repuestos_utilizados"

    id = Column(Integer, primary_key=True, index=True)
    ot_id = Column(Integer, ForeignKey("gmao_ordenes_trabajo.id", ondelete="CASCADE"))
    odoo_product_id = Column(Integer)
    nombre_repuesto = Column(String(150), nullable=False)
    cantidad = Column(Float, nullable=False, default=1.00)
    costo_unitario = Column(Float, default=0.00)
    costo_subtotal = Column(Float, default=0.00)

    ot = relationship("GMAOOrdenTrabajo", back_populates="repuestos_utilizados")

class GMAOPuntoControlParametro(Base):
    __tablename__ = "gmao_puntos_control_parametros"

    id = Column(Integer, primary_key=True, index=True)
    equipo_id = Column(Integer, ForeignKey("gmao_equipos.id", ondelete="CASCADE"))
    nombre_punto = Column(String(150), nullable=False)
    variable_medida = Column(String(50), nullable=False)
    unidad_medida = Column(String(20), nullable=False)
    limite_inferior_critico = Column(Float)
    limite_superior_critico = Column(Float)
    valor_objetivo = Column(Float)
    frecuencia_medicion_horas = Column(Integer, default=4)
    accion_correctiva_sugerida = Column(Text, nullable=False)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    equipo = relationship("GMAOEquipo", back_populates="puntos_control")
    mediciones = relationship("GMAOMedicionPuntoControl", back_populates="punto_control", cascade="all, delete-orphan")

class GMAOMedicionPuntoControl(Base):
    __tablename__ = "gmao_mediciones_puntos_control"

    id = Column(Integer, primary_key=True, index=True)
    punto_control_id = Column(Integer, ForeignKey("gmao_puntos_control_parametros.id", ondelete="CASCADE"))
    equipo_id = Column(Integer, ForeignKey("gmao_equipos.id", ondelete="CASCADE"))
    valor_medido = Column(Float, nullable=False)
    dentro_de_rango = Column(Boolean, nullable=False)
    accion_correctiva_aplicada = Column(Text)
    registrado_por = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"))
    foto_evidencia_url = Column(Text)
    fecha_medicion = Column(DateTime(timezone=True), server_default=func.now())

    punto_control = relationship("GMAOPuntoControlParametro", back_populates="mediciones")
    equipo = relationship("GMAOEquipo")
    registrador = relationship("Usuario")
