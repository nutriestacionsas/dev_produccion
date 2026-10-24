# Flujo de Integración de Producción con Odoo ERP - dev_produccion

Este documento describe la lógica de integración entre el sistema local y el módulo de Fabricación (MRP) en Odoo ERP. Cubre el ciclo de vida de las Órdenes de Fabricación (MOs), la gestión de dominios de búsqueda y el comportamiento del cierre de órdenes.

**Última actualización:** Septiembre 2026

---

## 1. Ciclo de Vida de las Órdenes de Fabricación

En Odoo, cada receta planificada para el día genera una Orden de Fabricación (MO). Los estados que maneja la integración:

1.  **Draft / Confirmed:** MO creada con base en la planificación teórica.
2.  **Progress (En Proceso):** Materia prima reservada en Odoo.
3.  **To Close (Por Cerrar):** Estado intermedio cuando hay diferencias entre solicitado y consumido. **Intencionalmente evadido** por nuestra automatización.
4.  **Done (Listo):** MO finalizada, stock de ingredientes descontado oficialmente.

---

## 2. Construcción de Dominios Odoo (Notación Polaca Prefija)

### Problema Detectado y Corregido (Septiembre 2026)
Odoo usa **notación polaca prefija** para sus dominios de búsqueda. Para `N` condiciones combinadas con un operador (AND/OR), se necesitan exactamente `N-1` operadores al inicio de la lista.

#### Regla de Construcción Correcta:
```python
# Para N condiciones con AND: necesitamos (N-1) operadores '&'
# Ejemplo: 3 condiciones => 2 operadores '&'
domain = ['&', '&',
    ('state', '!=', 'cancel'),
    ('name', 'not like', 'HIDE/FAB/%'),
    ('origin', 'in', ['NUT-DIA-5', 'Reabastecimiento manual (NUT-DIA-5)'])
]

# Para 2 grupos combinados con OR y luego AND con otra condición:
# ['&', condicion1, '|', condicion2a, condicion2b]
```

#### Implementación en `get_day_components` (`odoo_client.py`):
```python
conditions = [
    ('state', '!=', 'cancel'),
    ('name', 'not like', 'HIDE/FAB/%')
]

bloques = []
if mo_names_filtro:
    bloques.append([('name', 'in', mo_names_filtro)])
if mo_origins_filtro:
    bloques.append([('origin', 'in', mo_origins_filtro)])

if bloques:
    or_prefix = ['|'] * (len(bloques) - 1)
    flat_or = or_prefix
    for b in bloques:
        flat_or.extend(b)
    conditions.append(flat_or)

# Construir con '&' explícitos: (N-1) operadores para N condiciones
domain = ['&'] * (len(conditions) - 1)
for cond in conditions:
    if isinstance(cond, list):
        domain.extend(cond)
    else:
        domain.append(cond)
```

---

## 3. Separación de Órdenes Manuales vs. Órdenes Normales

### Problema Detectado (Septiembre 2026)
Cuando se creaba una orden manual para el mismo turno y tipo de menú que una orden normal, ambas compartían el mismo `OrdenProduccionDia` (misma clave `fecha + turno_id + tipo_menu_id`). Al consultar `despacho-dia`, el backend traía las MOs de ambas y sumaba cantidades en una sola fila.

### Solución Implementada
El endpoint `nueva_produccion` asigna automáticamente el sufijo `" (Manual)"` al nombre del tipo de menú antes de buscar o crear el `OrdenProduccionDia`:

```python
tipo_menu_nombre = payload.tipo_menu.strip()
if "manual" not in tipo_menu_nombre.lower():
    tipo_menu_nombre = f"{tipo_menu_nombre} (Manual)"

tipo_menu_obj = db.query(TipoMenu).filter(TipoMenu.nombre == tipo_menu_nombre).first()
if not tipo_menu_obj:
    tipo_menu_obj = TipoMenu(nombre=tipo_menu_nombre)
    db.add(tipo_menu_obj)
    db.flush()
```

**Efecto:** Se crea un nuevo `TipoMenu` "Almuerzo Tipo 1 (Manual)" y un nuevo `OrdenProduccionDia` con `tipo_menu_id` diferente. En `despacho-dia`, estos aparecen como una pestaña separada, completamente aislada de la producción normal.

---

## 4. Eliminación Selectiva de MOs al Reabastecer

### Problema Detectado (Septiembre 2026)
El filtro de limpieza al reabastecer usaba `('origin', 'ilike', 'Reabastecimiento manual')`, que en Odoo busca cualquier MO cuyo origen **contenga** ese texto. Esto borraba MOs de otros turnos o días que tenían un `origin` similar.

### Solución Implementada
Se reemplazó `ilike` por un listado exacto usando `in`:
```python
comp_mo_ids = odoo_client.execute('mrp.production', 'search', [
    ('product_id', 'in', comp_prod_ids),
    ('date_start', '>=', date_start_min),
    ('date_start', '<=', date_start_max),
    ('origin', 'in', [
        f'NUT-DIA-{dia.id}',
        f'Reabastecimiento manual (NUT-DIA-{dia.id})'
    ])
])
```

---

## 5. Fase 1: Despacho Consolidado

Cuando el usuario en Bodega confirma el "Despacho Total", el sistema calcula el total pesado (descontando taras y devoluciones).

### Inyección de Cantidades Físicas Reales
`distribute_dispatch_to_mos` en `dispatch.py`:
*   Identifica MOs activas (`confirmed`, `progress`) filtradas por el prefijo de ruta (`=like 'NUT/FABAL/%'`).
*   Calcula proporcionalmente cuánto le corresponde a cada MO.
*   Actualiza **únicamente el campo `quantity`** (Consumido) de `stock.move` en Odoo.
*   El campo `product_uom_qty` (Solicitado) **no se modifica en esta fase** para preservar la auditoría.

---

## 6. Fase 2: Establecer Producción — Cierre Limpio (`/dispatch/producir-todo`)

### Orden de Ejecución: Hijas Antes que Madres
Las MOs hijas (sub-recetas: Sopas, Jugos) deben cerrarse **antes** que la MO Maestra (`NUT/FABAL/`). Si la madre se cierra primero, Odoo no puede absorber los costos de los sub-productos (sin `stock.valuation.layer` generado).

### Sub-Paso 1: Sincronización Pre-Cierre
```python
# Forzar Solicitado == Consumido para evitar el asistente mrp.consumption.warning
odoo_client.execute('stock.move', 'write', [move['id']], {'product_uom_qty': cons_qty})
```

### Sub-Paso 2: Declarar Cantidad Producida
```python
# Evitar que Odoo sobreescriba los consumos al hacer Mark as Done
odoo_client.execute('mrp.production', 'write', [mo_id], {'qty_producing': product_qty})
```

### Sub-Paso 3: Cierre Directo
```python
odoo_client.execute(
    'mrp.production',
    'button_mark_done',
    [mo_id],
    context={
        'skip_consumption': True,
        'skip_backorder': True,
        'skip_consumption_warning': True,
        'button_mark_done_done': True
    }
)
```

### Hack de Costos (Rollup de Valoración)
Odoo no suma automáticamente los costos de las MOs hijas en la MO madre. Al cerrar la MO Maestra, el sistema busca los `stock.valuation.layer` (SVL) de las MOs Hijas y fuerza la actualización de `value` y `unit_cost` en el SVL de la Madre para consistencia contable.

---

## 7. Bloqueo de UI Post-Cierre (View-Only Mode)

Una vez que `produccion_establecida = TRUE` en la BD local:
-   El botón **"Editar Despacho"** → **"Ver Despacho"** (sin solicitar contraseña).
-   Al entrar (`viewOnly=true` en la URL):
    -   Inputs de Despacho y Devolución: **bloqueados**.
    -   Botones de Balanza/Tara: **ocultos**.
    -   Botones de guardado de comentarios y novedades: **desaparecen**.
    -   Botón "Producir Todo": **no renderizado**.

---

## 8. Reabastecimiento de Componentes (Planner)

`POST /planner/ordenes-fabricacion/reabastecer-componentes-odoo`:
1.  **Limpieza selectiva** (origin exacto con `in`).
2.  Para cada plato con `total > 0`:
    -   Busca el `product.product` por nombre.
    -   Guarda el `odoo_product_id` en la BD local para que Despacho lo identifique.
    -   Busca la BoM (`mrp.bom`) del producto.
    -   Crea la MO con `date_start`, `picking_type_id` y `origin = "Reabastecimiento manual (NUT-DIA-{dia.id})"`.
3.  **Botón "Limpiar Borrador"** en el frontend: al reabastecer, los valores viejos del `localStorage` deben ser purgados. El botón limpia el caché y llama a `DELETE /dispatch/draft`.

---

## 9. Resultado en UI

*   Las tarjetas de cada Orden de Fabricación muestran el badge verde **"Listo"** al cerrarse.
*   El botón de acción muestra **"✓ Producido"** y se deshabilita para evitar llamadas duplicadas al ERP.
*   El estado del ciclo diario para ese menú y turno queda oficialmente completado a nivel de contabilidad e inventario en Odoo.
