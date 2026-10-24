# Requerimientos Generales - dev_produccion

Este documento detalla los requerimientos, alcances y flujos operativos del sistema de gestión de producción para **Nutriestacion SAS**, integrándose de forma bidireccional con **Odoo ERP**.

**Última actualización:** Septiembre 2026

---

## 1. Control de Acceso y Gestión de Usuarios

*   **Autenticación Base:**
    *   El login de la aplicación valida credenciales contra la base de datos local usando algoritmos de hasheo `bcrypt`.
    *   El usuario administrador principal es `acalderonl1` / `Nutri005!` y se siembra automáticamente al iniciar el sistema si la base de datos está vacía.
*   **Gestión de Roles y Usuarios:**
    *   **Roles disponibles:** `admin`, `cocina`, `bodega`, `supervisor`.
    *   El administrador dispone de un gestor de usuarios (`Users.jsx`) para crear, editar, activar/desactivar y eliminar usuarios en tiempo real.
*   **Sistema de Permisos Granular por Módulo (`Permissions.jsx`):**
    *   Separado del rol, cada usuario tiene un objeto JSON `permisos` en su registro con flags booleanos por módulo.
    *   Los grupos de permisos están organizados en: **PLANIFICACIÓN, DESPACHO Y PRODUCCIÓN, PUNTOS DE SERVICIO, RECETAS, INVENTARIO, ADMINISTRACIÓN**.
    *   El `App.jsx` lee estos permisos al momento del login y usa guards para proteger cada ruta. Si el usuario no tiene el permiso correspondiente, el módulo no aparece en la barra lateral y la ruta redirige a `/unauthorized`.
    *   Un solo botón "Guardar" persiste todos los cambios del modal de asignación de permisos a la vez.
*   **Configuración Dinámica de Conexión a Odoo:**
    *   La parametrización de la URL, Base de Datos, Usuario y contraseña de Odoo se gestiona desde la pantalla de "Configuración" (accesible solo para `admin`).
    *   Se almacena en la tabla `odoo_config`. Si no está configurada, el backend usa las variables de entorno del `.env` como fallback.
    *   La contraseña se transmite enmascarada (`"********"`); si no se modifica al guardar, la contraseña existente se preserva.

---

## 2. Módulo de Recetas (Listas de Materiales - BoM Odoo)

Las recetas se modelan directamente sobre las **Listas de Materiales (BoM)** de Odoo.

### A. Funcionalidades Principales
*   **Consulta Directa de Odoo:** Las recetas se cargan dinámicamente desde productos de Odoo en la categoría "receta".
*   **Visualización en Cards:** Grilla de 4 columnas con foto circular, nombre técnico, categoría, costo de BoM y switch activo/inactivo.
*   **Barra Lateral de Categorías:** Menú lateral con scroll fijo (`sticky`), ordenado alfabéticamente. En móvil se adapta como carrusel horizontal.
*   **Encabezados Fijos Sólidos:** La cabecera es pegajosa con fondo totalmente opaco para evitar translucidez al hacer scroll.
*   **Cálculo Dinámico de Costos de BoM:** Suma de `standard_price × qty` de cada línea de la BoM de Odoo, dividida entre la cantidad de salida.
*   **Área de Trabajo de Detalle:** Al hacer clic en una tarjeta, panel con materiales de Odoo y pasos de preparación editables (guardados en BD local en JSON).

### B. Buscador Inteligente
*   Búsqueda por nombre de receta.
*   **Búsqueda por Componente:** Filtro para encontrar qué recetas contienen un ingrediente en específico.

### C. Módulo de Pruebas (Creación de Recetas Nuevas)
*   Flujo de prueba física: identificación, fecha, video YouTube embebido, paso a paso, insumos con autocomplete de Odoo.
*   **Escalamiento Proporcional:** Control de porciones con "Base de Prueba" y "Objetivo de Receta".
*   **Cierre de Prueba:** Al finalizar, el administrador ingresa la proteína dominante y categoría de Odoo. El sistema convierte matemáticamente las cantidades reales y crea la Receta Definitiva en la BD local.

---

## 3. Módulo Planificador de Menú

### A. Sub-módulo: Órdenes de Fabricación, Turnos y Menús
*   **Importación desde Excel (.xlsx):** Parser en cliente que extrae fecha, platos, tipos, clientes y cantidades.
*   **Gestión de Turnos y Tipos de Menú:** Paneles de administración para definir turnos (nombre + franja horaria) y tipos de menú.
*   **Tipificación de Clientes:** `porcentaje` (APRACOM, INDEUREC) o `cantidad` (ACOSTASNACKS). Determina cómo se ingresan los pedidos en el planificador.

### B. Jerarquía Visual del Planificador
*   **Navegación:** Turno (Pestaña) → Mes (Acordeón) → Tipo de Menú (Sub-pestaña) → Días (Tarjetas).
*   **Autofocus Inteligente:** Al cambiar de turno, se expande automáticamente el mes actual y el día de hoy.
*   **Inmutabilidad de Asignaciones:** Turno y Tipo de Menú son fijos desde la importación. No se pueden reasignar en caliente.

### C. Configuración de Clientes por Día
*   Al clicar el nombre de un cliente en la tabla del día, se abre un modal con sus parámetros:
    *   **Porcentaje:** F1%, F2%, Menú Saludable y Total.
    *   **Cantidad:** F1, F2 y Menú Saludable directos.
*   Al guardar, se recalculan automáticamente todos los platos dependientes del día (guarniciones 1:1, jugos, aderezos por fórmula dinámica, postres y agua saborizada).

### D. Creación Manual de Órdenes
*   **`/ordenes-fabricacion/manual`:** Crea un plato individual para un cliente en una fecha con turno y menú seleccionados. Crea el `OrdenProduccionDia` si no existe, o agrega el plato al existente.
*   **`/ordenes-fabricacion/nueva-produccion`:** Agrega materiales/platos adicionales. Asigna automáticamente el sufijo `" (Manual)"` al tipo de menú para garantizar que el registro quede **en un `OrdenProduccionDia` completamente separado** del menú original del mismo turno y fecha.

---

## 4. Proceso de Producción y Reabastecimiento en Odoo

El wizard de "Sincronizar con Odoo" tiene 3 pasos:

### Paso 1 — Crear Productos (`crear-productos-odoo`)
Crea o actualiza el producto del menú diario en Odoo (ej. "ALMUERZO TIPO 1 280926") con su BoM de platos como componentes.

### Paso 2 — Crear Órdenes de Fabricación (`crear-ordenes-fabricacion-odoo`)
Crea y confirma la MO principal (`NUT/FABAL/XXXXX`) en Odoo:
*   Asigna `picking_type_id` de la ruta "Fabricación Platos de comida".
*   `date_start` en `06:00:00` del día planificado.
*   Guarda el nombre de la MO en `ruta_asignada` (sin esto, el Despacho Diario no funciona).

### Paso 3 — Reabastecer Componentes (`reabastecer-componentes-odoo`)
Por cada plato del menú, lanza reabastecimiento para generar MOs de ingredientes (`NUT/FAB/...`):
*   **Limpieza selectiva antes de crear:** Elimina únicamente las MOs previas cuyo `origin` coincida exactamente con `NUT-DIA-{dia.id}` o `Reabastecimiento manual (NUT-DIA-{dia.id})`. Usa `in [lista_exacta]` en lugar de `ilike` para evitar borrar MOs de otros turnos o días.
*   Asigna `picking_type_id` a las MOs recién creadas.

### Endpoint de Reparación (`reparar-ruta-mos`)
`POST /planner/ordenes-fabricacion/reparar-ruta-mos` — Busca MOs de una fecha sin `picking_type_id` y les asigna la ruta correcta.

---

## 5. Proceso de Bodega, Despacho y Consumos Reales

### A. Despacho a Cocina (`DispatchDayExecution.jsx`)
*   **Filtrado Riguroso por `dia_id`:** Al cargar los componentes del despacho, el backend filtra por el ID local del `OrdenProduccionDia`. Esto garantiza que las MOs mostradas correspondan **exclusivamente** al menú y turno seleccionado, sin mezclar con otros turnos o con órdenes manuales del mismo día.
*   **Construcción de dominio Odoo correcta:** El endpoint `get_day_components` usa notación polaca correcta `['&'] * (N-1)` para combinar condiciones, evitando el bug de ignorar filtros.
*   **Multi-pesajes con taras:** Se pueden registrar múltiples pesajes consecutivos. El neto acumulado se calcula como `Σ(Bruto_j - Tara_j)`.
*   **Devoluciones:** Columna separada para registrar sobrantes de cocina.
*   **Novedades:** Campo de texto para anotaciones del día.

### B. Confirmación de Despacho Total
*   El backend distribuye proporcionalmente el total despachado entre las MOs de Odoo del menú seleccionado usando el prefijo de ruta (`mo_name_prefix`).
*   Al confirmar, marca `produccion_establecida = TRUE` en la BD local.
*   El menú desaparece de la vista de despacho pendiente y aparece en "Producción Establecida".

### C. Producción Establecida (View-Only Mode)
Una vez confirmado:
*   El botón cambia de "Editar Despacho" a **"Ver Despacho"** (sin solicitar contraseña).
*   Al entrar, toda la UI opera en modo `viewOnly=true`: inputs bloqueados, balanzas ocultas, botones de guardar desaparecen, novedades en modo lectura.
*   El botón "Producir Todo" no aparece para evitar envíos duplicados al ERP.

### D. Cierre de Producción en Odoo (`/dispatch/producir-todo`)
Ejecuta el ciclo de cierre en 3 sub-pasos **ordenando hijas antes que madres:**
1.  **Sincronización Pre-Cierre:** Actualiza `product_uom_qty` (Solicitado) para que coincida con el consumido registrado.
2.  **Asignación de `qty_producing`:** Declara explícitamente la cantidad total producida en la cabecera de la MO.
3.  **`button_mark_done`** con contexto `skip_consumption`, `skip_backorder`, `skip_consumption_warning`.

---

## 6. Módulo de Puntos de Servicio (Despacho de Planta)

### A. ServicePointsPlantDispatch (`/despacho-planta`)
*   **Filtrado Dinámico de Menús:** Las pestañas de menú se generan únicamente basándose en los tipos de menú que tienen asignados los clientes para la fecha seleccionada. Si un cliente solo tiene "Evento" y no "Almuerzo Tipo 1", la pestaña de "Almuerzo Tipo 1" no aparece para ese cliente.
*   **Asignación de Supervisores:** Modal con lista de usuarios disponibles. Un solo botón "Guardar" persiste la asignación al final del modal.
*   **Filtrado de Historial:** Vista de historial filtrada por fechas y grupos de despacho.

### B. Flujo de Despacho de Planta
1. Seleccionar fecha y menú (solo aparecen los menús con datos reales para esa fecha).
2. Asignar supervisor y configurar el grupo de despacho.
3. Registrar porciones despachadas por cliente.
4. Confirmar y guardar el historial.

---

## 7. Módulo de Toma de Inventario Físico

*   **Filtro de Compra:** Lista de productos configurados como "Productos de Compra" en Odoo.
*   **Agrupación por Ubicación Física:** Ordenados por campo de ubicación de Odoo (Cámara de congelación, Bodega de secos, etc.).
*   **Multi-pesaje no lineal:** Un mismo producto puede recibir múltiples pesajes en sesiones no consecutivas; el sistema los suma al acumulado existente.
*   **Conciliación y Ajuste en Odoo:** Al finalizar, los totales se envían a Odoo como `Ajuste de inventario del DDMMAAAA`.

---

## 8. ACTUALIZACIONES Y CAMBIOS IMPLEMENTADOS

### Agosto 2026
- **Impresión de Matriz de Producción**: Impresión condensada en formato horizontal (Landscape) omitiendo columnas de diferencias.
- **Exportación a WhatsApp**: Copia de la matriz con MOs dependientes (FAB) expandidas bajo sus rutas maestras (FABAL).
- **Animación en Cocina (Producir Todo)**: Animación de chef cocinando a pantalla completa con sonido al confirmar producción.
- **Autenticación Fuerte**: Migración de credenciales por defecto a credenciales con hasheo `bcrypt` (usuario `acalderonl1`).

### Octubre 2026 (ver `migracion_claude241026.md` para el detalle completo)
- **Permisos de GMAO corregidos**: `check_permission` leía claves planas (`gmao_assets`); ahora lee `permisos.modules[<nombre>].view`, igual que el resto de la app.
- **Scheduler GMAO pasado a cron**: de cada 30 s (modo demo) a una revisión diaria a las 8:00, hora de Ecuador.
- **Corrección de `deploy_y_purga.md`**: el respaldo de `.env` apuntaba a la raíz del proyecto en vez de a `backend/.env` (el que realmente usa el compose), y el `rm -rf` del Paso 3 borraba `backend/uploads/` (documentos de GMAO) sin respaldarlos.

### Septiembre 2026
- **Módulo de Permisos Granular**: Implementación de `Permissions.jsx` con grupos por módulo y persistencia en campo JSON `permisos` de la tabla `usuarios`. Botón único "Guardar" en el modal.
- **Separación de Órdenes Manuales**: El endpoint `nueva_produccion` asigna sufijo `" (Manual)"` al tipo de menú, creando un `OrdenProduccionDia` aislado para evitar mezcla en `despacho-dia`.
- **Corrección de Dominio Odoo**: `get_day_components` en `odoo_client.py` construye dominios con notación polaca correcta `['&'] * (N-1)` en lugar de insertar un solo `&` independientemente del número de condiciones.
- **Corrección de Eliminación Selectiva de MOs**: `reabastecer_componentes_odoo` usa `('origin', 'in', [lista_exacta])` en lugar de `('origin', 'ilike', ...)` para evitar borrar MOs de otros turnos.
- **Filtrado Dinámico de Menús en Despacho de Planta**: Las pestañas de `ServicePointsPlantDispatch.jsx` se generan exclusivamente a partir de los menús que tienen clientes asignados para la fecha seleccionada. Se eliminó la pestaña "Todos los Menús".
- **Responsive / Multiplataforma**: Revisión y corrección de layouts para garantizar compatibilidad en pantallas móviles, tablets y escritorio.
- **Despliegue Limpio (Borrón y Cuenta Nueva)**: Procedimiento documentado para reseteo completo del servidor incluyendo `docker-compose down -v`, borrado de carpeta, descompresión con ruta absoluta y restauración del `.env`.
