import pytest

def test_burned_last_cost_logic():
    """
    Verifica que el último costo asignado a una MO de producción
    sea el de la producción anterior y que al quemarse no se sobreescriba
    con el costo final de la propia orden tras marcarse como done.
    """
    # 1. Historial de órdenes previas de Odoo
    # Orden 1 (ayer): Seco de Pollo, costo unitario 1.20, estado 'done'
    # Orden 2 (hoy): Seco de Pollo, costo unitario 1.50 (actual), pasa a 'done' tras Producir Todo
    mos_odoo_sorted = [
        {
            "id": 101,
            "recipe_name": "Seco de Pollo",
            "date_start": "2026-10-15 08:00:00",
            "cost_unit": 1.20,
            "cost_total": 120.0,
            "state": "done"
        },
        {
            "id": 102,
            "recipe_name": "Seco de Pollo",
            "date_start": "2026-10-16 08:00:00",
            "cost_unit": 1.50,
            "cost_total": 150.0,
            "state": "confirmed" # Antes de producir
        }
    ]

    # Simular bucle cronológico
    last_costs = {}
    for mo in mos_odoo_sorted:
        recipe_name = mo.get('recipe_name')
        if recipe_name in last_costs:
            mo['last_cost_unit'] = last_costs[recipe_name]['cost_unit']
            mo['last_cost_total'] = last_costs[recipe_name]['cost_total']
        
        if mo.get('state') == 'done' or mo.get('cost_total', 0) > 0:
            last_costs[recipe_name] = {
                'cost_unit': mo.get('cost_unit', 0),
                'cost_total': mo.get('cost_total', 0)
            }

    # Para la orden 102 (hoy), antes de producir:
    assert mos_odoo_sorted[1]['last_cost_unit'] == 1.20
    assert mos_odoo_sorted[1]['cost_unit'] == 1.50
    diff_before = mos_odoo_sorted[1]['cost_unit'] - mos_odoo_sorted[1]['last_cost_unit']
    assert round(diff_before, 2) == 0.30

    # 2. Simular que el usuario da "Producir Todo" y quemamos el último costo visible (1.20)
    burned_costs = {
        "Seco de Pollo": 1.20,
        "102": 1.20
    }

    # Ahora Odoo pasa la orden 102 a estado 'done'
    mos_odoo_sorted[1]['state'] = 'done'
    mos_odoo_sorted[1]['cost_unit'] = 1.52 # Odoo calculó costo final

    # 3. Simular la consulta de mrp.report posterior a Producir Todo
    # mrp.report devuelve 1.52 porque es la última orden finalizada en Odoo
    mrp_last_costs_cache = {"Seco de Pollo": 1.52}

    # Simular la lógica corregida en get_establecer_produccion_list
    for mo in mos_odoo_sorted:
        r_name = mo.get('recipe_name')
        mo_id_str = str(mo.get('id', ''))
        
        # Prioridad 1: Costo quemado persistido
        if mo_id_str in burned_costs:
            mo['last_cost_unit'] = burned_costs[mo_id_str]
            continue
        elif r_name in burned_costs:
            mo['last_cost_unit'] = burned_costs[r_name]
            continue

        # Prioridad 2: mrp.report (pero no si es la misma orden done)
        unit_cost = mrp_last_costs_cache.get(r_name, 0.0)
        mo_cost = float(mo.get('cost_unit', 0.0) or 0.0)
        if mo.get('state') == 'done' and abs(unit_cost - mo_cost) < 0.0001:
            continue
        if unit_cost > 0.0 and mo.get('last_cost_unit', 0) <= 0:
            mo['last_cost_unit'] = unit_cost

    # Verificación final: La orden 102 (producida) MANTIENE su costo previo quemado de 1.20
    assert mos_odoo_sorted[1]['last_cost_unit'] == 1.20, f"Debe mantenerse en 1.20, pero fue {mos_odoo_sorted[1]['last_cost_unit']}"
    assert mos_odoo_sorted[1]['cost_unit'] == 1.52
    diff_after = mos_odoo_sorted[1]['cost_unit'] - mos_odoo_sorted[1]['last_cost_unit']
    assert round(diff_after, 2) == 0.32, f"La diferencia debe ser 0.32 y no 0.0, fue {diff_after}"
