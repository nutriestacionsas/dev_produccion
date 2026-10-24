# Módulo "Procesos y Mantenimientos" (GMAO / HACCP) — Nutriestacion
## Documento 1: Arquitectura General, Integración en App Existente y Flujo de Procesos (v2)

**Proyecto:** `dev_produccion` (Nutriestacion SAS)  
**Módulo:** Mantenimiento de Equipos (GMAO) y Control de Puntos de Control en Procesos  
**Fecha de Actualización:** Septiembre 2026  
**Autor:** Ingeniero Industrial especialista en Procesos y Mantenimiento de Planta  

---

### 1. Visión General e Integración en la Aplicación Existente (`dev_produccion`)

El nuevo módulo de **Procesos y Mantenimientos** se integra directamente dentro de la aplicación ya creada **`dev_produccion`** de Nutriestacion SAS. No se construye una aplicación separada ni una arquitectura aislada, sino que se adjunta como una extensión nativa sobre el stack tecnológico ya implementado:
* **Frontend:** React 19 + Vite + Tailwind CSS + Shadcn UI + `react-router-dom` v7.
* **Backend:** FastAPI (Python 3.12) + SQLAlchemy ORM + Pydantic v2.
* **Base de Datos:** PostgreSQL (`dev_produccion`), extendiendo las tablas relacionales existentes.
* **Integración ERP:** Pasarela XML-RPC/JSON-RPC con Odoo v19 API.

---

### 2. Estructura de Navegación en Sidebar (Ítem Principal y Sub-ítems)

El módulo se incorpora en la barra lateral (`Sidebar.jsx` y `App.jsx`) bajo un único ítem principal denominado **"Procesos y Mantenimientos"**, el cual despliega sub-ítems para cada uno de los procesos y herramientas de gestión:

```
dev_produccion Sidebar
├── 📊 PLANIFICACIÓN (Planner.jsx, PlannerMOs.jsx)
├── 📦 DESPACHO Y PRODUCCIÓN (Dispatch.jsx, EstablishProduction.jsx)
├── 🏢 PUNTOS DE SERVICIO (ServicePointsDispatch.jsx)
├── 🍳 RECETAS (Recipes.jsx)
├── 📑 INVENTARIO (Inventory.jsx)
├── 🛠️ PROCESOS Y MANTENIMIENTOS (NUEVO MÓDULO INTEGRADO)
│   ├── 📱 Equipos y Activos (/mantenimiento/equipos)
│   ├── 📅 Mantenimiento Preventivo (/mantenimiento/preventivo)
│   ├── 🛠️ Órdenes de Trabajo (/mantenimiento/ordenes-trabajo)
│   ├── 🎯 Puntos de Control y Alertas (/mantenimiento/puntos-control)
│   ├── 📋 Checklists y POES (/mantenimiento/checklists)
│   └── 📈 Analytics & KPI GMAO (/mantenimiento/dashboard)
└── ⚙️ ADMINISTRACIÓN (Users.jsx, Permissions.jsx, Settings.jsx)
```

#### **Diseño Responsivo Multiplataforma (Escritorio, Tablet/Cocina, Móvil/PDA)**
Toda la interfaz del módulo está diseñada para ser 100% responsiva y multiplataforma:
1. **Escritorio / Laptops (Administración y Supervisión):**
   * Tablas de alto rendimiento con ordenamiento, búsqueda rápida, indicadores de semaforización y dashboards gráficos interactivos (MTBF, MTTR, cumplimiento).
2. **Tablets Táctiles (Cocina y Envasado):**
   * Tarjetas (*Cards*) de alto contraste, botones amplios de fácil pulsación táctil (mínimo 48px), formularios interactivos para el registro de mediciones de Puntos de Control.
3. **Smartphones y PDAs Industriales (Técnicos de Campo / Operarios):**
   * Layout vertical responsivo con **escáner QR integrado mediante la cámara del dispositivo** (`html5-qrcode`).
   * Componentes tipo *Drawer / BottomSheet* para carga fluida de evidencia fotográfica in-situ y **captura de firma digital táctil** (`react-signature-canvas`).

---

### 3. Reutilización del Sistema de Usuarios y Roles Existente

El módulo utiliza **estrictamente el sistema de autenticación, usuarios y roles ya creado** en `dev_produccion`:
* **Tabla `usuarios` y Tabla `roles` Existentes:** No se crean tablas duplicadas de roles. Los usuarios continúan autenticándose con bcrypt JWT y asociándose a los roles estándar (`admin`, `cocina`, `bodega`, `supervisor`).
* **Matriz de Permisos Granular en `Permissions.jsx`:** Se amplía la matriz existente en `Permissions.jsx` agregando el nuevo grupo de permisos **PROCESOS Y MANTENIMIENTOS** al objeto JSON `permisos` de la tabla `usuarios`:

| Grupo de Permisos | Clave JSON (`usuarios.permisos`) | Descripción del Acceso |
| :--- | :--- | :--- |
| **PROCESOS Y MANTENIMIENTOS** | `gmao_assets` | Acceso a gestión de inventario de equipos, hojas de vida y QR. |
| **PROCESOS Y MANTENIMIENTOS** | `gmao_preventive` | Acceso a programación preventivos y frecuencias de mantenimiento. |
| **PROCESOS Y MANTENIMIENTOS** | `gmao_workorders` | Acceso a creación, asignación, ejecución y cierre de OTs. |
| **PROCESOS Y MANTENIMIENTOS** | `gmao_control_points` | Acceso a configuración y registro de Puntos de Control y Alertas. |
| **PROCESOS Y MANTENIMIENTOS** | `gmao_checklists` | Acceso a diligenciamiento y verificación de checklists POES/TPM. |
| **PROCESOS Y MANTENIMIENTOS** | `gmao_dashboard` | Acceso a métricas KPI, costos de mantenimiento y auditorías. |

---

### 4. Parametrización Dinámica de Puntos de Control Crítico y Alertas

En lugar de definir reglas estáticas o rígidas para un solo equipo, el sistema implementa un **Motor Parametrizable de Puntos de Control Crítico (PCC) y Alertas por Proceso**:

* **Definición de Parámetros por Proceso/Equipo:** El supervisor puede configurar cualquier variable operativa para ser monitoreada:
  * *Variables:* Temperatura (°C / °F), Tiempo de Abatimiento/Cocción (min), Presión (PSI), Concentración de Sanitizante (ppm), Humedad (%), etc.
  * *Límites Configurables:* Límite Inferior Crítico, Límite Superior Crítico, Valor Objetivo.
* **Motor de Alertas y Acciones Automáticas:**
  1. Si una medición ingresada se encuentra dentro del rango operativo $\rightarrow$ **Registro Aprobado**.
  2. Si la medición vulnera un límite crítico $\rightarrow$ El sistema exige inmediatamente una **Acción Correctiva Obligatoria**, emite una **Alerta Multicanal** (Push, Email, WhatsApp) y genera de forma automática una **Orden de Trabajo Correctiva** o un Ticket de Desviación de Proceso.

---

### 5. Flujo Operativo Completo (Procesos y Mantenimientos)

```mermaid
graph TD
    A[Alta de Equipo en Inventario / QR] --> B[Carga Histórica Retroactiva de Intervenciones]
    B --> C[Configuración de Planes Preventivos & Puntos de Control Paramétricos]
    
    C --> D{Scheduler / Evaluación de Frecuencias}
    D -->|Vencimiento Cercano / Programado| E[Engine Alertas: Push App / Mail / WhatsApp]
    E --> F[Escaneo QR en PDA o Tablet por Operario/Técnico]
    F --> G[Registro de Medición de Punto de Control o Checklist]
    
    G --> H{¿Medición Dentro de Rango Parametrizado?}
    |Sí - Conforme| I[Cierre de Tarea con Foto & Firma -> Registro Inalterable]
    |No - Desviación| J[Disparo de Alerta Crítica + Registro de Acción Correctiva]
    J --> K[Generación Automática de Ticket de Falla / OT Correctiva]
    
    L[Operario Reporta Falla Inesperada vía QR] --> K
    K --> M[Asignación de Técnico & Bloqueo Preventivo de Producción si Afecta Proceso]
    M --> N[Reparación, Consumo de Repuestos & Cierre OT]
    N --> O[Actualización de Historial & Analytics MTBF / MTTR / Calidad]
```
