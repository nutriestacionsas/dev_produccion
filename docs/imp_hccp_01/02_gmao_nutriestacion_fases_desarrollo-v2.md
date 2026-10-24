# Módulo "Procesos y Mantenimientos" (GMAO / HACCP) — Nutriestacion
## Documento 2: Plan de Desarrollo por Fases e Implementación Integrada (v2)

**Proyecto Base:** `dev_produccion`  
**Módulo:** Procesos y Mantenimientos  
**Enfoque de Integración:** Adición directa al repositorio existente sin alterar módulos activos (Planner, Dispatch, Recipes).  

---

### 📋 Hoja de Ruta de Desarrollo en 5 Fases

---

### 🟢 FASE 1: Integración Base, Permisos y Catálogo de Activos
**Objetivo:** Conectar el módulo con el esquema de base de datos existente en PostgreSQL, extender la gestión de permisos en `Permissions.jsx` y construir la interfaz responsiva para la gestión de equipos con códigos QR.

#### **Entregables Backend (`backend/app/`):**
1. **Modelos ORM SQLAlchemy (`app/models/gmao.py`):**
   * Tablas `gmao_equipos` y `gmao_mantenimientos_historicos`.
   * Vinculación mediante clave foránea (`FOREIGN KEY`) con la tabla existente `usuarios(id)`.
2. **Esquemas Pydantic (`app/schemas/gmao.py`):**
   * Validadores Pydantic v2 para creación, actualización y filtrado de activos.
3. **Endpoints API (`app/api/endpoints/gmao.py`):**
   * `GET /api/gmao/equipos` (Filtros por ubicación, categoría y estado).
   * `POST /api/gmao/equipos` (Alta de activo + generación de QR).
   * `GET /api/gmao/equipos/{id}` (Hoja de vida completa del activo).
   * `POST /api/gmao/equipos/carga-historica` (Parser para importación masiva en Excel/CSV de mantenimientos pasados).
4. **Registro de Rutas en `app/main.py`:**
   * Incluir `gmao.router` bajo el prefijo `/api/gmao`.
   * Ejecución de auto-migración `Base.metadata.create_all(bind=engine)` en el startup.

#### **Entregables Frontend (`frontend/src/`):**
1. **Página de Activos (`src/pages/Maintenance/Assets.jsx`):**
   * Grilla responsiva de activos con buscador y tarjetas táctiles.
   * Modal con escáner de cámara QR usando `html5-qrcode`.
2. **Integración en Sidebar (`App.jsx` y `Sidebar.jsx`):**
   * Agregar el ítem principal **"Procesos y Mantenimientos"** y sub-ítem **"Equipos y Activos"** protegido por el guard `gmao_assets`.
3. **Gestor de Permisos (`Permissions.jsx`):**
   * Agregar la sección **"PROCESOS Y MANTENIMIENTOS"** con los switches de permisos JSON (`gmao_assets`, `gmao_preventive`, `gmao_workorders`, `gmao_control_points`, `gmao_checklists`, `gmao_dashboard`).

---

### 🟡 FASE 2: Engine de Mantenimiento Preventivo (MPP) y Alertas Multicanal
**Objetivo:** Crear el programador de tareas periódicas y el servidor de notificaciones (Push, Email, WhatsApp) para alertas preventivas.

#### **Entregables Backend:**
1. **Modelos ORM:** Tablas `gmao_planes_preventivos` y `gmao_tareas_preventivas`.
2. **Servicio Scheduler (`app/services/gmao_scheduler.py`):**
   * Tarea asíncrona de fondo que calcula vencimientos y estados de semaforización (`OK`, `PRÓXIMO_VENCIMIENTO`, `VENCIDO`).
3. **Engine de Notificaciones (`app/services/notification_engine.py`):**
   * Integración con WhatsApp Business API, plantillas de correo HTML y notificaciones Push.
4. **Endpoints API:**
   * `GET /api/gmao/preventivo/planes`
   * `POST /api/gmao/preventivo/planes`

#### **Entregables Frontend:**
1. **Vista Preventivo (`src/pages/Maintenance/PreventivePlans.jsx`):**
   * Sub-ítem **"Mantenimiento Preventivo"** en el Sidebar.
   * Calendario/Gantt visual con alertas por color de urgencia.

---

### 🟠 FASE 3: Mantenimiento Correctivo, Órdenes de Trabajo (OT) y Captura Móvil
**Objetivo:** Permitir el reporte inmediato de averías desde smartphones o PDAs mediante escaneo de código QR, asignación a técnicos y cierre con firma digital.

#### **Entregables Backend:**
1. **Modelos ORM:** Tablas `gmao_ordenes_trabajo` y `gmao_repuestos_utilizados`.
2. **Endpoints API:**
   * `POST /api/gmao/ot/reportar-falla` (Escaneo QR de equipo y carga de foto).
   * `GET /api/gmao/ot` (Panel de OTs).
   * `POST /api/gmao/ot/{id}/cerrar` (Registro de solución, repuestos consumidos, fotos de evidencia y firma en Base64).

#### **Entregables Frontend:**
1. **Vista Órdenes de Trabajo (`src/pages/Maintenance/WorkOrders.jsx`):**
   * Sub-ítem **"Órdenes de Trabajo"** en el Sidebar.
   * Tablero Kanban responsivo y modal de captura de firma táctil (`react-signature-canvas`).

---

### 🔴 FASE 4: Parametrización de Puntos de Control Crítico y Checklists POES
**Objetivo:** Implementar la configuración de Puntos de Control Crítico (PCC) parametrizables por proceso y la digitalización de listas de verificación diaria.

#### **Entregables Backend:**
1. **Modelos ORM:** Tablas `gmao_puntos_control_parametros`, `gmao_mediciones_puntos_control` y `gmao_checklists_ejecucion`.
2. **Servicio Validador (`app/services/haccp_validator.py`):**
   * Evalúa la medición contra los rangos parametrizados. Si hay desviación, exige acción correctiva y genera automáticamente una OT o alerta crítica.
3. **Endpoints API:**
   * `POST /api/gmao/puntos-control/medicion`
   * `GET /api/gmao/checklists/diarios`

#### **Entregables Frontend:**
1. **Vista Puntos de Control (`src/pages/Maintenance/ControlPoints.jsx`):**
   * Sub-ítem **"Puntos de Control y Alertas"** en el Sidebar.
   * Formulario táctil optimizado para captura rápida de mediciones paramétricas.
2. **Vista Checklists (`src/pages/Maintenance/Checklists.jsx`):**
   * Sub-ítem **"Checklists y POES"** en el Sidebar.

---

### 🟣 FASE 5: Analytics de Planta, Dashboard GMAO y Exportación de Auditorías
**Objetivo:** Pantalla de control gerencial con indicadores clave (MTBF, MTTR, disponibilidad) y generación de reportes en PDF para inspecciones de calidad.

#### **Entregables Backend:**
1. **Servicio de Analítica (`app/services/gmao_analytics.py`):**
   * Métricas de MTBF, MTTR, % cumplimiento preventivo y costos acumulados de mantenimiento.
2. **Exportador PDF (`app/services/pdf_generator.py`):**
   * Generador de informes sanitarios en PDF.

#### **Entregables Frontend:**
1. **Vista Dashboard (`src/pages/Maintenance/DashboardGMAO.jsx`):**
   * Sub-ítem **"Analytics & KPI GMAO"** en el Sidebar.
   * Gráficos interactivos de rendimiento de planta y botón de exportación a PDF.
