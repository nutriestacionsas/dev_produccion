import pytest
from unittest.mock import MagicMock, patch
from app.services.odoo_client import OdooClient

@pytest.fixture
def mock_odoo_client():
    with patch.object(OdooClient, '__init__', lambda self: None):
        client = OdooClient()
        client.models = MagicMock()
        client.uid = 1
        client.db = 'test'
        client.password = 'test'
        return client

def test_odoo_client_get_day_components_isolation(mock_odoo_client):
    """
    Prueba que odoo_client.get_day_components respete los filtros mo_origins_filtro
    y no mezcle órdenes de otros menús o producciones manuales.
    """
    # Escenario: Dos producciones en la misma fecha
    # 1. Menú Regular: Master MO NUT/FABAL/00101 (origin: NUT-DIA-101) con hijas FAB/00102 y FAB/00103
    # 2. Producción Manual: Master MO FAB/00201 (origin: NUT-DIA-102) con ingredientes directos

    # Mock execute de Odoo
    def mock_execute(model, method, *args, **kwargs):
        if model == 'mrp.production' and method == 'search':
            domain = args[0]
            # Verificamos si en el domain se busca NUT-DIA-101
            domain_str = str(domain)
            if 'NUT-DIA-101' in domain_str and 'NUT-DIA-102' not in domain_str:
                return [1001, 1002, 1003] # Solo las del Menú Regular
            elif 'NUT-DIA-102' in domain_str and 'NUT-DIA-101' not in domain_str:
                return [2001] # Solo la Producción Manual
            elif 'Reabastecimiento manual (NUT-DIA-101)' in domain_str:
                return [1002, 1003]
            elif 'Reabastecimiento manual (NUT-DIA-102)' in domain_str:
                return []
            return [1001, 1002, 1003, 2001]

        elif model == 'mrp.production' and method == 'read':
            ids = args[0]
            mos_dict = {
                1001: {'id': 1001, 'name': 'NUT/FABAL/00101', 'origin': 'NUT-DIA-101', 'product_id': [501, 'ALMUERZO REGULAR'], 'move_raw_ids': [901, 902]},
                1002: {'id': 1002, 'name': 'FAB/00102', 'origin': 'Reabastecimiento manual (NUT-DIA-101)', 'product_id': [10, 'Sopa'], 'move_raw_ids': [910]},
                1003: {'id': 1003, 'name': 'FAB/00103', 'origin': 'Reabastecimiento manual (NUT-DIA-101)', 'product_id': [11, 'Seco'], 'move_raw_ids': [911, 912]},
                2001: {'id': 2001, 'name': 'FAB/00201', 'origin': 'NUT-DIA-102', 'product_id': [601, 'Evento Manual'], 'move_raw_ids': [920, 921]}
            }
            return [mos_dict[i] for i in ids if i in mos_dict]

        elif model == 'stock.move' and method == 'read':
            ids = args[0]
            moves_dict = {
                901: {'id': 901, 'product_id': [10, 'Sopa'], 'product_uom_qty': 50, 'product_uom': [1, 'Unidades'], 'state': 'confirmed'},
                902: {'id': 902, 'product_id': [11, 'Seco'], 'product_uom_qty': 50, 'product_uom': [1, 'Unidades'], 'state': 'confirmed'},
                910: {'id': 910, 'product_id': [100, 'Pollo Crudo'], 'product_uom_qty': 6.0, 'product_uom': [2, 'kg'], 'state': 'confirmed'},
                911: {'id': 911, 'product_id': [100, 'Pollo Crudo'], 'product_uom_qty': 4.0, 'product_uom': [2, 'kg'], 'state': 'confirmed'},
                912: {'id': 912, 'product_id': [101, 'Arroz Blanco'], 'product_uom_qty': 5.0, 'product_uom': [2, 'kg'], 'state': 'confirmed'},
                920: {'id': 920, 'product_id': [100, 'Pollo Crudo'], 'product_uom_qty': 3.0, 'product_uom': [2, 'kg'], 'state': 'confirmed'},
                921: {'id': 921, 'product_id': [102, 'Carne de Res'], 'product_uom_qty': 7.0, 'product_uom': [2, 'kg'], 'state': 'confirmed'}
            }
            return [moves_dict[i] for i in ids if i in moves_dict]

        elif model == 'product.product' and method == 'read':
            ids = args[0]
            categs = {
                100: {'id': 100, 'categ_id': [1, 'Carnes']},
                101: {'id': 101, 'categ_id': [2, 'Granos']},
                102: {'id': 102, 'categ_id': [1, 'Carnes']}
            }
            return [categs.get(i, {'id': i, 'categ_id': [9, 'General']}) for i in ids]

        return []

    mock_odoo_client.execute = MagicMock(side_effect=mock_execute)

    # 1. Probar llamada aislada para Menú Regular (id local 101)
    res_regular = mock_odoo_client.get_day_components(
        fecha_str="2026-10-20",
        mo_names_filtro=["NUT/FABAL/00101"],
        mo_origins_filtro=["Reabastecimiento manual (NUT-DIA-101)", "NUT-DIA-101", "NUT/FABAL/00101"]
    )
    
    comp_map_reg = {c["odoo_product_id"]: c for c in res_regular}
    assert 100 in comp_map_reg, "Debe tener Pollo Crudo"
    assert comp_map_reg[100]["required_qty"] == 10.0, f"Pollo debe ser 10.0kg, fue {comp_map_reg[100]['required_qty']}"
    assert 101 in comp_map_reg, "Debe tener Arroz"
    assert comp_map_reg[101]["required_qty"] == 5.0
    assert 102 not in comp_map_reg, "Carne de Res NO debe estar en el Menú Regular"

    # 2. Probar llamada aislada para Producción Manual (id local 102)
    res_manual = mock_odoo_client.get_day_components(
        fecha_str="2026-10-20",
        mo_names_filtro=[],
        mo_origins_filtro=["Reabastecimiento manual (NUT-DIA-102)", "NUT-DIA-102"]
    )

    comp_map_man = {c["odoo_product_id"]: c for c in res_manual}
    assert 100 in comp_map_man, "Debe tener Pollo Crudo"
    assert comp_map_man[100]["required_qty"] == 3.0, f"Pollo debe ser 3.0kg, fue {comp_map_man[100]['required_qty']}"
    assert 102 in comp_map_man, "Debe tener Carne de Res"
    assert comp_map_man[102]["required_qty"] == 7.0
    assert 101 not in comp_map_man, "Arroz NO debe estar en la producción manual"

def test_odoo_client_date_filtering_cross_date_isolation(mock_odoo_client):
    """
    Valida que si Odoo tiene múltiples MOs con 'NUT-DIA-27' en diferentes fechas
    (ej: Septiembre vs Octubre 19), get_day_components y get_component_mo_breakdown
    SOLO retornen las MOs de la fecha consultada ('2026-10-19').
    """
    captured_searches = []

    def mock_execute(model, method, *args, **kwargs):
        if model == 'mrp.production' and method == 'search':
            domain = args[0]
            captured_searches.append(domain)
            # Si el search filtra por 2026-10-19
            if ('date_start', '>=', '2026-10-19 00:00:00') in domain:
                return [20401] # Solo MO de MASA DE HOJALDRE de Oct 19
            return []

        elif model == 'mrp.production' and method == 'read':
            return [{
                'id': 20401,
                'name': 'NUT/FAB/18491',
                'origin': 'Reabastecimiento manual (NUT-DIA-27)',
                'product_id': [6318, 'MASA DE HOJALDRE'],
                'move_raw_ids': [555]
            }]

        elif model == 'stock.move' and method == 'read':
            return [{
                'id': 555,
                'product_id': [999, 'Harina de Trigo'],
                'product_uom_qty': 10.0,
                'product_uom': [1, 'kg'],
                'state': 'confirmed'
            }]

        elif model == 'product.product' and method == 'read':
            return [{'id': 999, 'categ_id': [1, 'Materia Prima']}]

        return []

    mock_odoo_client.execute = MagicMock(side_effect=mock_execute)

    res = mock_odoo_client.get_day_components(
        fecha_str="2026-10-19",
        mo_names_filtro=["NUT/FABAL/02114"],
        mo_origins_filtro=["Reabastecimiento manual (NUT-DIA-27)", "NUT-DIA-27"]
    )

    # Verificar que el search principal de mrp.production incluyó el filtro de fecha exacto
    main_search = captured_searches[0]
    assert ('date_start', '>=', '2026-10-19 00:00:00') in main_search
    assert ('date_start', '<=', '2026-10-19 23:59:59') in main_search
    
    # Verificar que el resultado solo contenga los ingredientes de Oct 19
    assert len(res) == 1
    assert res[0]["name"] == "Harina de Trigo"
    assert res[0]["required_qty"] == 10.0
