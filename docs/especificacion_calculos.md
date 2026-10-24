# Especificación de Cálculos Matemáticos - dev_produccion

Este documento centraliza todas las fórmulas de cálculo, proporcionalidades y conversiones de unidades utilizadas en los diferentes módulos del sistema de gestión de producción de **Nutriestacion SAS**.

---

## 1. Módulo de Pruebas: Escalamiento Proporcional

Cuando se finaliza una prueba de plato físico en cocina, las cantidades reales de materia prima utilizadas para la **Base de Prueba** ($B_p$) se escalan a la **Base de Registro** definitiva ($B_r$) elegida por el administrador.

### Fórmula de Escalamiento de Ingredientes:
Para cada ingrediente $i$, si se utilizó una cantidad real física $Q_{\text{real}, i}$:

$$Q_{\text{registro}, i} = \frac{Q_{\text{real}, i}}{B_p} \times B_r$$

*   $Q_{\text{real}, i}$: Peso/volumen real utilizado durante la preparación experimental.
*   $B_p$: Cantidad real de comensales/porciones que rindió la preparación finalizada.
*   $B_r$: Base de comensales sobre la que se guardará la receta en la base de datos de recetas (ej. base 100).
*   $Q_{\text{registro}, i}$: Cantidad proporcional registrada en la Lista de Materiales local.

*Nota: Si durante la prueba cocina no especifica una cantidad real física para un ingrediente, el sistema usará como valor por defecto la cantidad teórica inicial programada ($Q_{\text{teorica}, i}$).*

---

## 2. Lógica de Costeo de Recetas

El costo unitario de una porción de comida de una receta se deduce en base a los precios vigentes de la materia prima en Odoo.

### Costo de Porción de Receta:
Dado un conjunto de ingredientes en la receta con sus respectivas cantidades proporcionales y precios de costo unitarios de compra en Odoo ($P_{\text{odoo}, i}$):

$$\text{Costo Unitario Porción} = \frac{\sum_{i=1}^{n} (Q_{\text{registro}, i} \times P_{\text{odoo}, i})}{B_r}$$

### Fallback de Costos (Cálculo Dinámico en Tiempo de Ejecución):
Debido a que Odoo en ciertas configuraciones no devuelve el costo en tiempo real durante la consulta rápida (y los cachés estáticos se vuelven obsoletos si se cambian cantidades), el sistema local procesa un `costo_estimado` completamente dinámico en tiempo de ejecución.
Al cargar el Planificador o consultar el endpoint de órdenes, el Backend itera sobre los ítems activos del menú (`orden_produccion_items`) y multiplica la cantidad estipulada de cada plato por el costo unitario (`standard_price`) más reciente traído de Odoo, sumando el valor final al vuelo.
Si durante la visualización no se detectan diferencias de costo (Diferencia < 0.01), el sistema renderiza un guión neutro (`-`) en la UI para mantener el diseño limpio. Si no existe la orden por estar cerrada o borrada, se recalcula la "Cantidad Real Producida" de la Madre basándose en las lógicas de:
- Platos Fuertes (Ej: Sopas o Arroz) $\Rightarrow \text{Qty} = \text{Total Comensales}$
- Fuerte #1 o Fuerte #2 $\Rightarrow \text{Qty} = \max(\text{F1}, \text{F2})$ (El plato que más raciones tuvo dicta la cantidad total del menú).
- Porcentaje (%) $\Rightarrow \text{Qty} = \text{Porcentaje asignado al cliente}$.

---

## 3. Planificador de Menús: Explosión de Cantidades de Clientes y Dependencias de Platos

Los clientes confirman sus pedidos mensuales a través de cantidades físicas directas o de porcentajes calculados sobre el total de comensales. Al actualizar los parámetros del cliente (Total, F1%, F2%, MS, o Jugo #2) se aplican reglas estrictas de dependencias y recálculos automáticos.

### A. Fórmulas de Recálculo por Plato:
Para cada cliente $C$:

1. **Platos Fuertes (FUERTE #1 y FUERTE #2)**:
   - **Porcentaje**:
     $$Q_{\text{Fuerte 1}, C} = \text{round}((\text{Total}_C - \text{MS}_C) \times \text{F1\%}_C)$$
     $$Q_{\text{Fuerte 2}, C} = \text{round}((\text{Total}_C - \text{MS}_C) \times \text{F2\%}_C)$$
   - **Cantidad**: Ingreso directo de $Q_{\text{Fuerte 1}, C}$ y $Q_{\text{Fuerte 2}, C}$.

2. **Guarniciones**:
   - Asocian su cantidad 1:1 con su plato principal:
     $$Q_{\text{Guarnición 1}, C} = Q_{\text{Fuerte 1}, C}$$
     $$Q_{\text{Guarnición 2}, C} = Q_{\text{Fuerte 2}, C}$$
     $$Q_{\text{Guarnición Saludable}, C} = \text{MS}_C$$

3. **Platos Generales Estándar (SOPA y ARROZ)**:
   - Toman siempre la cantidad total del cliente:
     $$Q_{\text{Sopa}, C} = \text{Total}_C$$
     $$Q_{\text{Arroz}, C} = \text{Total}_C$$

4. **Jugos (Substracción Automática)**:
   - Si se ingresa una cantidad para el Jugo #2 ($Q_{\text{Jugo 2}, C}$), se resta del Jugo #1 para que juntos hagan el total del cliente:
     $$Q_{\text{Jugo 1}, C} = \max(0, \text{Total}_C - Q_{\text{Jugo 2}, C})$$
   - Si no se especifica Jugo #2, $Q_{\text{Jugo 1}, C} = \text{Total}_C$.

5. **Aderezos (Detección de Fórmula Dinámica)**:
   - El sistema analiza la cantidad original del aderezo en comparación con los valores originales de los platos fuertes, sopa, menú saludable o su suma para autodetectar la fórmula de enlace:
     - Si $\text{Aderezo} = \text{Total}_{\text{orig}} \Rightarrow Q_{\text{Aderezo}, C} = \text{Total}_C$
     - Si $\text{Aderezo} = \text{F1}_{\text{orig}} \Rightarrow Q_{\text{Aderezo}, C} = Q_{\text{Fuerte 1}, C}$
     - Si $\text{Aderezo} = \text{F2}_{\text{orig}} \Rightarrow Q_{\text{Aderezo}, C} = Q_{\text{Fuerte 2}, C}$
     - Si $\text{Aderezo} = \text{MS}_{\text{orig}} \Rightarrow Q_{\text{Aderezo}, C} = \text{MS}_C$
     - Si $\text{Aderezo} = \text{F1}_{\text{orig}} + \text{F2}_{\text{orig}} \Rightarrow Q_{\text{Aderezo}, C} = Q_{\text{Fuerte 1}, C} + Q_{\text{Fuerte 2}, C}$
     - Si $\text{Aderezo} = \text{Total}_{\text{orig}} - \text{MS}_{\text{orig}} \Rightarrow Q_{\text{Aderezo}, C} = \text{Total}_C - \text{MS}_C$
     - Fallback: Si $\text{Aderezo} > 0 \Rightarrow Q_{\text{Aderezo}, C} = \text{Total}_C$.

6. **Agua Saborizada**:
   - Inalterada por recálculos (mantiene el valor estático importado del Excel).

7. **Otros Platos Generales (ej. Postre, Bebida)**:
   - Si tenían cantidad $>0$ o son de tipo `POSTRE` $\Rightarrow Q_{\text{Plato}, C} = \text{Total}_C$.

### B. Totalización Diaria de Porciones (Suma de Totales de Clientes):
El gran total de comensales diarios ($T$) es la sumatoria directa de los totales individuales asignados a cada cliente activo:

$$T = \sum_{C} \text{Total}_C$$

---

## 4. Despacho a Cocina (Explosión Teórica)

Basado en el total diario de comensales $T$, se calcula el volumen total de materia prima teórica a despachar de bodega a cocina para cada ingrediente $i$ de las recetas que componen el menú diario.

### Fórmula de Requerimiento de Materia Prima:
$$\text{Requerimiento Insumo}_i = \frac{Q_{\text{registro}, i}}{B_r} \times T$$

---

## 5. Pesajes Físicos con Taras Consecutivas (Bodega)

El sistema de despacho y de inventario permite registrar pesajes acumulados restando las taras de múltiples envases o recipientes.

### Cálculo de Peso Neto de Pesajes Consecutivos:
Si se realizan $M$ pesajes del mismo ingrediente usando recipientes de envase (taras) registrados en Odoo:

$$\text{Peso Neto Total} = \sum_{j=1}^{M} (\text{Peso Bruto}_j - \text{Peso Tara}_j)$$

*   $\text{Peso Bruto}_j$: Peso total medido en la báscula para la pesada $j$.
*   $\text{Peso Tara}_j$: Peso correspondiente al envase utilizado para la pesada $j$ (obtenido de la categoría "Envases" de Odoo).

### Despacho Real Neto:
Considerando las entregas realizadas y las devoluciones físicas al final de la jornada:

$$\text{Despacho Real Neto} = \text{Peso Neto Total}_{\text{despachado}} - \text{Peso Neto Total}_{\text{devuelto}}$$

### Desviación Teórica:
$$\text{Desviación} = \text{Despacho Real Neto} - \text{Requerimiento Insumo}_i$$

*   Si $\text{Desviación} > 0$: Exceso de materia prima despachada.
*   Si $\text{Desviación} < 0$: Faltante de materia prima despachada.

---

## 6. Toma de Inventario Físico

En la toma física de stock, el sistema acumula pesajes no lineales para un mismo producto y calcula las discrepancias teóricas del ERP.

### A. Sumatoria Acumulativa por Producto:
Para un producto $A$, la cantidad física contada se acumula dinámicamente:

$$\text{Cantidad Física Total}_A = \sum_{w \in \text{pesajes}_A} (\text{Peso Bruto}_w - \text{Peso Tara}_w)$$

### B. Cálculo de Novedad (Diferencia de Stock):
Para la sincronización del ajuste en Odoo:

$$\text{Diferencia Stock}_A = \text{Cantidad Física Total}_A - \text{Stock Teórico Odoo}_A$$

*   Si $\text{Diferencia Stock}_A = 0$: Sin novedades.
*   Si $\text{Diferencia Stock}_A \neq 0$: Se registra la novedad e ingresa al flujo de corrección administrativa antes de subir el ajuste a Odoo.
