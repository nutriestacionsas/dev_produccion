from sqlalchemy import Column, Integer, String, Boolean, Numeric, Date, DateTime, ForeignKey, Text, JSON, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Rol(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    nombre = Column(String(150), nullable=False)
    password_hash = Column(String(255), nullable=True)  # Nulo si se autentica exclusivamente vía Odoo
    rol = Column(String(50), nullable=False)            # 'admin', 'cocina', 'bodega', 'supervisor'
    odoo_user_id = Column(Integer, unique=True, nullable=True)
    activo = Column(Boolean, default=True)
    permisos = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    inventarios_asignados = relationship("Inventario", back_populates="usuario_asignado")
    supervision_clientes = relationship("ClienteSupervisor", back_populates="supervisor")

class ClienteSupervisor(Base):
    __tablename__ = "cliente_supervisor"

    id = Column(Integer, primary_key=True, index=True)
    cliente_nombre = Column(String(255), unique=True, nullable=False, index=True)
    supervisor_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    supervisor = relationship("Usuario", back_populates="supervision_clientes")


class Receta(Base):
    __tablename__ = "recetas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), nullable=False)
    base_porciones = Column(Numeric, nullable=False, default=100)
    proteina_dominante = Column(String(100), nullable=False)
    categoria_odoo_id = Column(Integer, nullable=False)
    subcategoria_odoo_id = Column(Integer, nullable=True)
    odoo_product_id = Column(Integer, unique=True, nullable=True)
    is_active = Column(Boolean, default=True)
    pasos_preparacion = Column(JSON, nullable=True, default=list)
    categ_name = Column(String(255), nullable=True)
    bom_cost = Column(Float, nullable=True, default=0.0)
    image_256 = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    ingredientes = relationship("RecetaIngrediente", back_populates="receta", cascade="all, delete-orphan")
    menu_componentes = relationship("MenuDiarioComponente", back_populates="receta")



class RecetaIngrediente(Base):
    __tablename__ = "receta_ingredientes"

    id = Column(Integer, primary_key=True, index=True)
    receta_id = Column(Integer, ForeignKey("recetas.id", ondelete="CASCADE"), nullable=False)
    odoo_product_id = Column(Integer, nullable=False)
    cantidad_proporcional = Column(Numeric, nullable=False)
    unidad_medida = Column(String(50), nullable=False)

    # Relaciones
    receta = relationship("Receta", back_populates="ingredientes")


class RecetaPrueba(Base):
    __tablename__ = "receta_pruebas"

    id = Column(Integer, primary_key=True, index=True)
    nombre_plato = Column(String(255), nullable=False)
    base_prueba = Column(Numeric, nullable=False)
    base_registro_target = Column(Numeric, nullable=False)
    estado = Column(String(50), nullable=False, default="planificada")  # 'planificada', 'en_coccion', 'completada', 'registrada'
    fecha_prueba = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    ingredientes = relationship("RecetaPruebaIngrediente", back_populates="receta_prueba", cascade="all, delete-orphan")
    multimedia = relationship("RecetaPruebaMultimedia", back_populates="receta_prueba", cascade="all, delete-orphan")


class RecetaPruebaIngrediente(Base):
    __tablename__ = "receta_prueba_ingredientes"

    id = Column(Integer, primary_key=True, index=True)
    receta_prueba_id = Column(Integer, ForeignKey("receta_pruebas.id", ondelete="CASCADE"), nullable=False)
    odoo_product_id = Column(Integer, nullable=False)
    cantidad_teorica = Column(Numeric, nullable=False)
    cantidad_real = Column(Numeric, nullable=True)
    unidad_medida = Column(String(50), nullable=False)

    # Relaciones
    receta_prueba = relationship("RecetaPrueba", back_populates="ingredientes")


class RecetaPruebaMultimedia(Base):
    __tablename__ = "receta_prueba_multimedia"

    id = Column(Integer, primary_key=True, index=True)
    receta_prueba_id = Column(Integer, ForeignKey("receta_pruebas.id", ondelete="CASCADE"), nullable=False)
    tipo = Column(String(50), nullable=False)  # 'texto', 'video_url', 'imagen_url'
    contenido = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    receta_prueba = relationship("RecetaPrueba", back_populates="multimedia")


class Planificacion(Base):
    __tablename__ = "planificaciones"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), nullable=False)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    dias = relationship("DiaPlanificado", back_populates="planificacion", cascade="all, delete-orphan")


class DiaPlanificado(Base):
    __tablename__ = "dias_planificados"

    id = Column(Integer, primary_key=True, index=True)
    planificacion_id = Column(Integer, ForeignKey("planificaciones.id", ondelete="CASCADE"), nullable=False)
    fecha = Column(Date, nullable=False)
    nombre_odoo_producto = Column(String(150), nullable=False)
    odoo_product_id = Column(Integer, unique=True, nullable=True)
    costo_diario_estimado = Column(Numeric, default=0.0)

    # Relaciones
    planificacion = relationship("Planificacion", back_populates="dias")
    componentes = relationship("MenuDiarioComponente", back_populates="dia_planificado", cascade="all, delete-orphan")
    pedidos = relationship("PedidoCliente", back_populates="dia_planificado", cascade="all, delete-orphan")
    despachos = relationship("Despacho", back_populates="dia_planificado")


class MenuDiarioComponente(Base):
    __tablename__ = "menu_diario_componentes"

    id = Column(Integer, primary_key=True, index=True)
    dia_planificado_id = Column(Integer, ForeignKey("dias_planificados.id", ondelete="CASCADE"), nullable=False)
    componente_tipo = Column(String(100), nullable=False)  # 'sopa', 'fuerte1', 'guarnicion1', etc.
    receta_id = Column(Integer, ForeignKey("recetas.id", ondelete="RESTRICT"), nullable=False)

    # Relaciones
    dia_planificado = relationship("DiaPlanificado", back_populates="componentes")
    receta = relationship("Receta", back_populates="menu_componentes")


class PedidoCliente(Base):
    __tablename__ = "pedidos_clientes"

    id = Column(Integer, primary_key=True, index=True)
    dia_planificado_id = Column(Integer, ForeignKey("dias_planificados.id", ondelete="CASCADE"), nullable=False)
    odoo_partner_id = Column(Integer, nullable=False)
    tipo_pedido = Column(String(50), nullable=False)        # 'numerico' o 'porcentaje'
    valor_pedido = Column(Numeric, nullable=False)
    comensales_calculados = Column(Integer, nullable=False)

    # Relaciones
    dia_planificado = relationship("DiaPlanificado", back_populates="pedidos")


class Despacho(Base):
    __tablename__ = "despachos"

    id = Column(Integer, primary_key=True, index=True)
    dia_planificado_id = Column(Integer, ForeignKey("dias_planificados.id", ondelete="RESTRICT"), nullable=True)  # V1 Legacy
    fecha = Column(Date, nullable=False, default=func.current_date())
    turno_id = Column(Integer, ForeignKey("turnos.id", ondelete="SET NULL"), nullable=True)
    tipo_menu_id = Column(Integer, ForeignKey("tipos_menu.id", ondelete="SET NULL"), nullable=True)
    grupo_id = Column(Integer, ForeignKey("grupos_despacho.id", ondelete="SET NULL"), nullable=True)
    odoo_manufacturing_order_id = Column(Integer, nullable=True)
    estado = Column(String(50), nullable=False, default="borrador")  # 'borrador', 'finalizado'
    novedades = Column(Text, nullable=True)

    # Relaciones
    dia_planificado = relationship("DiaPlanificado", back_populates="despachos")
    turno = relationship("Turno")
    tipo_menu = relationship("TipoMenu")
    grupo = relationship("GrupoDespacho")
    productos = relationship("DespachoProducto", back_populates="despacho", cascade="all, delete-orphan")


class DespachoProducto(Base):
    __tablename__ = "despacho_productos"

    id = Column(Integer, primary_key=True, index=True)
    despacho_id = Column(Integer, ForeignKey("despachos.id", ondelete="CASCADE"), nullable=False)
    odoo_product_id = Column(Integer, nullable=False)
    cantidad_teorica = Column(Numeric, nullable=False)
    cantidad_despachada = Column(Numeric, nullable=False, default=0.0)
    cantidad_devuelta = Column(Numeric, nullable=False, default=0.0)
    partials_data = Column(JSON, nullable=True)
    comentario_diferencia = Column(Text, nullable=True)

    # Relaciones
    despacho = relationship("Despacho", back_populates="productos")
    pesajes = relationship("DespachoPesaje", back_populates="despacho_producto", cascade="all, delete-orphan")


class DespachoPesaje(Base):
    __tablename__ = "despacho_pesajes"

    id = Column(Integer, primary_key=True, index=True)
    despacho_producto_id = Column(Integer, ForeignKey("despacho_productos.id", ondelete="CASCADE"), nullable=False)
    tipo = Column(String(50), nullable=False)  # 'despacho' o 'devolucion'
    peso_bruto = Column(Numeric, nullable=False)
    tara_odoo_product_id = Column(Integer, nullable=True)
    peso_tara = Column(Numeric, nullable=False, default=0.0)
    peso_neto = Column(Numeric, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    despacho_producto = relationship("DespachoProducto", back_populates="pesajes")


class Inventario(Base):
    __tablename__ = "inventarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre_ajuste_odoo = Column(String(255), nullable=False)
    fecha_programada = Column(DateTime(timezone=True), nullable=False)
    usuario_asignado_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    estado = Column(String(50), nullable=False, default="programado")  # 'programado', 'en_conteo', 'consolidado', 'sincronizado_odoo'
    odoo_inventory_adjustment_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    usuario_asignado = relationship("Usuario", back_populates="inventarios_asignados")
    items = relationship("InventarioItem", back_populates="inventario", cascade="all, delete-orphan")


class InventarioItem(Base):
    __tablename__ = "inventario_items"

    id = Column(Integer, primary_key=True, index=True)
    inventario_id = Column(Integer, ForeignKey("inventarios.id", ondelete="CASCADE"), nullable=False)
    odoo_product_id = Column(Integer, nullable=False)
    cantidad_teorica = Column(Numeric, nullable=False, default=0.0)
    cantidad_fisica = Column(Numeric, nullable=False, default=0.0)
    ubicacion_fisica = Column(String(150), nullable=False)
    novedad = Column(Text, nullable=True)

    # Relaciones
    inventario = relationship("Inventario", back_populates="items")
    pesajes = relationship("InventarioPesaje", back_populates="inventario_item", cascade="all, delete-orphan")


class InventarioPesaje(Base):
    __tablename__ = "inventario_pesajes"

    id = Column(Integer, primary_key=True, index=True)
    inventario_item_id = Column(Integer, ForeignKey("inventario_items.id", ondelete="CASCADE"), nullable=False)
    peso_bruto = Column(Numeric, nullable=False)
    tara_odoo_product_id = Column(Integer, nullable=True)
    peso_tara = Column(Numeric, nullable=False, default=0.0)
    peso_neto = Column(Numeric, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    inventario_item = relationship("InventarioItem", back_populates="pesajes")


class LogSincronizacionOdoo(Base):
    __tablename__ = "log_sincronizacion_odoo"

    id = Column(Integer, primary_key=True, index=True)
    entidad_tipo = Column(String(100), nullable=False)  # 'receta', 'produccion', 'inventario'
    entidad_id = Column(Integer, nullable=False)
    estado = Column(String(50), nullable=False)         # 'exitoso', 'fallido'
    respuesta_odoo = Column(JSON, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())


class OdooConfig(Base):
    __tablename__ = "odoo_config"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(255), nullable=False)
    db = Column(String(100), nullable=False)
    username = Column(String(150), nullable=True)
    password = Column(String(255), nullable=True)
    activo = Column(Boolean, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Turno(Base):
    __tablename__ = "turnos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), unique=True, nullable=False)
    franja_horaria = Column(String(255), nullable=False)

    ordenes_dia = relationship("OrdenProduccionDia", back_populates="turno")


class TipoMenu(Base):
    __tablename__ = "tipos_menu"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), unique=True, nullable=False)

    ordenes_dia = relationship("OrdenProduccionDia", back_populates="tipo_menu")


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), unique=True, nullable=False, index=True)
    tipo = Column(String(50), nullable=False, default="porcentaje") # "porcentaje" o "cantidad"


class OrdenProduccionDia(Base):
    __tablename__ = "orden_produccion_dias"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=False)
    turno_id = Column(Integer, ForeignKey("turnos.id", ondelete="SET NULL"), nullable=True)
    tipo_menu_id = Column(Integer, ForeignKey("tipos_menu.id", ondelete="SET NULL"), nullable=True)
    odoo_product_id = Column(Integer, nullable=True)
    ruta_asignada = Column(String(255), nullable=True)
    produccion_establecida = Column(Boolean, default=False)
    enviado_despacho_cliente = Column(Boolean, default=False)
    detalle_produccion = Column(JSON, nullable=True)
    costo_estimado = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    turno = relationship("Turno", back_populates="ordenes_dia")
    tipo_menu = relationship("TipoMenu", back_populates="ordenes_dia")
    items = relationship("OrdenProduccionItem", back_populates="orden_dia", cascade="all, delete-orphan")


class OrdenProduccionItem(Base):
    __tablename__ = "orden_produccion_items"

    id = Column(Integer, primary_key=True, index=True)
    orden_dia_id = Column(Integer, ForeignKey("orden_produccion_dias.id", ondelete="CASCADE"), nullable=False)
    plato_nombre = Column(String(255), nullable=False)
    tipo = Column(String(100), nullable=False)
    cantidades_clientes = Column(JSON, nullable=False) # JSON: dict client_name -> {cant, pct}
    total = Column(Integer, nullable=False)
    odoo_product_id = Column(Integer, nullable=True) # ID del producto en Odoo (ej. para ingredientes manuales)

    orden_dia = relationship("OrdenProduccionDia", back_populates="items")


class OrdenImportacionTemporal(Base):
    __tablename__ = "orden_importacion_temporal"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=False)
    plato_nombre = Column(String(255), nullable=False)
    tipo = Column(String(100), nullable=False)
    cantidades_clientes = Column(JSON, nullable=False) # JSON: dict client_name -> {cant, pct}
    total = Column(Integer, nullable=False)


class GrupoDespacho(Base):
    __tablename__ = "grupos_despacho"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False, unique=True)
    activo = Column(Boolean, default=True)

    categorias = relationship("GrupoDespachoCategoria", back_populates="grupo", cascade="all, delete-orphan")


class GrupoDespachoCategoria(Base):
    __tablename__ = "grupo_despacho_categorias"

    id = Column(Integer, primary_key=True, index=True)
    grupo_id = Column(Integer, ForeignKey("grupos_despacho.id", ondelete="CASCADE"), nullable=False)
    categoria_odoo_nombre = Column(String(255), nullable=False)

    grupo = relationship("GrupoDespacho", back_populates="categorias")


class ConfiguracionSistema(Base):
    __tablename__ = "configuracion_sistema"

    id = Column(Integer, primary_key=True, index=True)
    clave = Column(String(100), unique=True, nullable=False)
    valor = Column(JSON, nullable=False)


class HistorialDespacho(Base):
    __tablename__ = "historial_despachos"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=False)
    turno_id = Column(Integer, ForeignKey("turnos.id", ondelete="SET NULL"), nullable=True)
    tipo_menu_id = Column(Integer, ForeignKey("tipos_menu.id", ondelete="SET NULL"), nullable=True)
    grupo_id = Column(Integer, ForeignKey("grupos_despacho.id", ondelete="SET NULL"), nullable=True)
    grupo_nombre = Column(String(255), nullable=True)
    creado_por = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    novedades = Column(Text, nullable=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    turno = relationship("Turno")
    tipo_menu = relationship("TipoMenu")
    grupo = relationship("GrupoDespacho")
    usuario = relationship("Usuario", foreign_keys=[usuario_id])
    creador = relationship("Usuario", foreign_keys=[creado_por])
    productos = relationship("HistorialDespachoProducto", back_populates="historial", cascade="all, delete-orphan")


class HistorialDespachoProducto(Base):
    __tablename__ = "historial_despacho_productos"

    id = Column(Integer, primary_key=True, index=True)
    historial_id = Column(Integer, ForeignKey("historial_despachos.id", ondelete="CASCADE"), nullable=False)
    odoo_product_id = Column(Integer, nullable=False)
    cantidad_establecida = Column(Numeric, nullable=False)
    comentario_diferencia = Column(Text, nullable=True)

    # Relaciones
    historial = relationship("HistorialDespacho", back_populates="productos")
    auditoria = relationship("HistorialDespachoAuditoria", back_populates="producto", cascade="all, delete-orphan")


class HistorialDespachoAuditoria(Base):
    __tablename__ = "historial_despacho_auditoria"

    id = Column(Integer, primary_key=True, index=True)
    historial_producto_id = Column(Integer, ForeignKey("historial_despacho_productos.id", ondelete="CASCADE"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    cantidad_anterior = Column(Numeric, nullable=False)
    cantidad_nueva = Column(Numeric, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    producto = relationship("HistorialDespachoProducto", back_populates="auditoria")
    usuario = relationship("Usuario")


# --- Tablas Nuevas para el Módulo: Despacho a Cliente ---

class DespachoCliente(Base):
    __tablename__ = "despacho_clientes"

    id = Column(Integer, primary_key=True, index=True)
    orden_dia_id = Column(Integer, ForeignKey("orden_produccion_dias.id", ondelete="CASCADE"), nullable=False)
    cliente_nombre = Column(String(255), nullable=False, index=True)
    ruta_asignada = Column(String(255), nullable=True)
    usuario_id = Column(Integer, nullable=True)
    estado = Column(String(50), nullable=False, default="borrador") # borrador, despachando, completado
    fecha_finalizacion = Column(DateTime(timezone=True), nullable=True)
    
    # Campos de Guía de Remisión Odoo
    guia_remision_creada = Column(Boolean, default=False, nullable=False)
    odoo_picking_id = Column(Integer, nullable=True)
    odoo_picking_name = Column(String(100), nullable=True)
    odoo_ingreso_picking_id = Column(Integer, nullable=True)
    odoo_ingreso_picking_name = Column(String(100), nullable=True)
    transportista_id = Column(Integer, nullable=True)
    transportista_nombre = Column(String(255), nullable=True)
    placa_vehiculo = Column(String(50), nullable=True)
    direccion_entrega = Column(String(255), nullable=True)
    pdf_guia_base64 = Column(Text, nullable=True)
    fecha_guia_remision = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Una orden de producción por día se asocia al despacho del cliente
    orden_dia = relationship("OrdenProduccionDia")
    productos = relationship("DespachoClienteProducto", back_populates="despacho_cliente", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('orden_dia_id', 'cliente_nombre', name='uix_orden_cliente'),
    )


class DespachoClienteProducto(Base):
    __tablename__ = "despacho_cliente_productos"

    id = Column(Integer, primary_key=True, index=True)
    despacho_cliente_id = Column(Integer, ForeignKey("despacho_clientes.id", ondelete="CASCADE"), nullable=False)
    orden_item_id = Column(Integer, ForeignKey("orden_produccion_items.id", ondelete="CASCADE"), nullable=False)
    cantidad_teorica = Column(Float, nullable=False, default=0.0)
    peso_despachado = Column(Float, nullable=False, default=0.0)
    unidades_despachadas = Column(Integer, nullable=False, default=0)
    novedad = Column(String(1000), nullable=True)

    despacho_cliente = relationship("DespachoCliente", back_populates="productos")
    orden_item = relationship("OrdenProduccionItem")
    pesajes = relationship("DespachoClientePesaje", back_populates="despacho_cliente_producto", cascade="all, delete-orphan")


class DespachoClientePesaje(Base):
    __tablename__ = "despacho_cliente_pesajes"

    id = Column(Integer, primary_key=True, index=True)
    despacho_cliente_producto_id = Column(Integer, ForeignKey("despacho_cliente_productos.id", ondelete="CASCADE"), nullable=False)
    unidades = Column(Integer, nullable=False, default=0)
    peso_bruto = Column(Float, nullable=False)
    taras_seleccionadas = Column(JSON, nullable=True)
    peso_tara = Column(Float, nullable=False, default=0.0)
    peso_neto = Column(Float, nullable=False) # Calculado en backend o DB
    porciones_seleccionadas = Column(JSON, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    despacho_cliente_producto = relationship("DespachoClienteProducto", back_populates="pesajes")


class ChoferHabilitado(Base):
    __tablename__ = "choferes_habilitados"

    id = Column(Integer, primary_key=True, index=True)
    odoo_partner_id = Column(Integer, unique=True, nullable=False, index=True)
    nombre_chofer = Column(String(255), nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PlacaVehiculo(Base):
    __tablename__ = "placas_vehiculos"

    id = Column(Integer, primary_key=True, index=True)
    placa = Column(String(50), unique=True, nullable=False, index=True)
    descripcion_vehiculo = Column(String(255), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ClienteOdooMapping(Base):
    __tablename__ = "cliente_odoo_mapping"

    id = Column(Integer, primary_key=True, index=True)
    cliente_local_nombre = Column(String(255), unique=True, nullable=False, index=True)
    odoo_partner_id = Column(Integer, nullable=False, index=True)
    odoo_partner_name = Column(String(255), nullable=False)
    odoo_street = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

