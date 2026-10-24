# PROMPT MAESTRO PARA AGENTE ANTIGRAVITY (v2)
## Integración del Módulo "Procesos y Mantenimientos" dentro del Repositorio `dev_produccion`

> **INSTRUCCIONES CRÍTICAS PARA ANTIGRAVITY / CURSOR:**  
> Este módulo **DEBE ADJUNTARSE E INTEGRARSE DIRECTAMENTE** en la estructura de archivos existente del proyecto **`dev_produccion`**. NO crees un proyecto separado, ni una nueva carpeta raíz aislada. Utiliza los modelos, autenticación JWT, usuarios y componentes UI que ya están construidos en la aplicación.

---

### 👤 ROL Y CONTEXTO TÉCNICO
Actúa como un **Desarrollador Senior Fullstack (React 19 + FastAPI + PostgreSQL)**. Vas a codificar el nuevo módulo **"Procesos y Mantenimientos"** que se incorpora al sistema `dev_produccion` de Nutriestacion SAS.

---

### 📂 UBICACIÓN EXACTA DE ARCHIVOS A CREAR Y MODIFICAR EN `dev_produccion`

Debes trabajar **exclusivamente sobre las siguientes rutas del proyecto existente**:

```
dev_produccion/
├── backend/
│   └── app/
│       ├── api/
│       │   └── endpoints/
│       │       └── gmao.py             <-- CREAR: Endpoints API de Activos, OTs, Puntos de Control y Analytics
│       ├── models/
│       │   └── gmao.py             <-- CREAR: Modelos SQLAlchemy (gmao_equipos, gmao_ordenes_trabajo, gmao_puntos_control_parametros, etc.)
│       ├── schemas/
│       │   └── gmao.py             <-- CREAR: Esquemas de validación Pydantic v2
│       ├── services/
│       │   ├── gmao_scheduler.py   <-- CREAR: Programador de alertas preventivas (APScheduler)
│       │   ├── haccp_validator.py  <-- CREAR: Validador de límites críticos paramétricos
│       │   └── notification_engine.py <-- CREAR: Envíos de WhatsApp API, Push y Correo
│       └── main.py                 <-- MODIFICAR: Incluir app.include_router(gmao.router, prefix="/api/gmao")
└── frontend/
    └── src/
        ├── App.jsx                 <-- MODIFICAR: Agregar rutas /mantenimiento/* y la categoría "Procesos y Mantenimientos" en el Sidebar
        ├── pages/
        │   ├── Permissions.jsx     <-- MODIFICAR: Incluir las 6 claves JSON gmao_* en la matriz de permisos
        │   └── Maintenance/        <-- CREAR DIRECTORIO DENTRO DE PAGES
        │       ├── Assets.jsx          <-- Inventario de Equipos, Hoja de Vida y Escáner QR
        │       ├── PreventivePlans.jsx <-- Calendario y Programación Preventiva
        │       ├── WorkOrders.jsx      <-- Kanban Board OTs, Firma Digital y Fotos
        │       ├── ControlPoints.jsx   <-- Formulario Táctil de Puntos de Control y Parametrización
        │       ├── Checklists.jsx      <-- Registro y Verificación de POES/TPM
        │       └── DashboardGMAO.jsx   <-- Gráficos KPI (MTBF, MTTR, Disponibilidad)
```

---

### ⚙️ ESPECIFICACIONES DE IMPLEMENTACIÓN

#### 1. Backend (FastAPI + SQLAlchemy + PostgreSQL)
* **Reutilización de Autenticación y Usuarios:** Usa las dependencias existentes `get_current_user` y el modelo `User` de `app/models/users.py`. Vincula la columna `creado_por`, `reportado_por`, `tecnico_asignado_id` y `registrado_por` mediante Foreign Keys a `usuarios.id`.
* **Guard de Permisos Granular:** En `app/api/endpoints/gmao.py`, valida que el usuario tenga la clave correspondiente en `current_user.permisos` (ej. `gmao_assets`, `gmao_workorders`, `gmao_control_points`).
* **Validador de Puntos de Control Paramétricos:** En el endpoint `POST /api/gmao/puntos-control/medicion`, compara el valor medido contra los rangos parametrizados en `gmao_puntos_control_parametros`. Si vulnera el límite crítico, registra la desviación, exige la acción correctiva y genera automáticamente un Ticket de Falla / OT de prioridad `Crítica`.

#### 2. Frontend (React 19 + Tailwind CSS + Shadcn UI + Lucide Icons)
* **Sidebar Integrado:** En `App.jsx` (o `Sidebar.jsx`), agrega el ítem de navegación principal **"Procesos y Mantenimientos"** con sus 6 sub-ítems:
  * Equipos y Activos (`/mantenimiento/equipos`)
  * Mantenimiento Preventivo (`/mantenimiento/preventivo`)
  * Órdenes de Trabajo (`/mantenimiento/ordenes-trabajo`)
  * Puntos de Control y Alertas (`/mantenimiento/puntos-control`)
  * Checklists y POES (`/mantenimiento/checklists`)
  * Analytics & KPI GMAO (`/mantenimiento/dashboard`)
* **Permisos Dinámicos (`Permissions.jsx`):** Agrega la categoría **"PROCESOS Y MANTENIMIENTOS"** en el modal de gestión de permisos con sus 6 switches booleanos.
* **Componentes Responsivos / Multiplataforma:**
  * Lector QR con la cámara del dispositivo usando `html5-qrcode` en `Assets.jsx`.
  * Captura de firma digital táctil con `react-signature-canvas` en `WorkOrders.jsx`.
  * Forms táctiles con botones de gran dimensión para tablets y móviles en cocina.

---

### 🚀 PASOS DE EJECUCIÓN
1. Crea `backend/app/models/gmao.py` y `backend/app/schemas/gmao.py`.
2. Crea `backend/app/api/endpoints/gmao.py` y registra la ruta en `backend/app/main.py`.
3. Crea la carpeta `frontend/src/pages/Maintenance/` y añade los 6 componentes React.
4. Actualiza `App.jsx` y `Permissions.jsx` para integrar las rutas, la barra lateral y los permisos.

**Procede a implementar los archivos en el repositorio `dev_produccion`.**
