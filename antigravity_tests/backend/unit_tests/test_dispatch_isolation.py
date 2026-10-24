import re
import pytest
from unittest.mock import MagicMock, patch

def parse_dia_id_from_origin(origin: str):
    """
    Función de prueba para validar la extracción robusta de NUT-DIA-{id}
    """
    if not origin:
        return None
    match = re.search(r'NUT-DIA-(\d+)', origin)
    return match.group(1) if match else None


def test_regex_dia_id_extraction():
    """
    Valida que el parsing de origin no se rompa con Reabastecimiento manual
    ni con cadenas compuestas.
    """
    # Caso 1: Master MO creada por el sistema
    assert parse_dia_id_from_origin("NUT-DIA-123") == "123"
    
    # Caso 2: Child MO con reabastecimiento manual
    assert parse_dia_id_from_origin("Reabastecimiento manual (NUT-DIA-123)") == "123"
    
    # Caso 3: Cadenas malformadas o anidadas de versiones anteriores
    assert parse_dia_id_from_origin("Reabastecimiento manual (NUT-DIA-Reabastecimiento manual (123))") is None
    
    # Caso 4: Origen de Odoo nativo sin NUT-DIA
    assert parse_dia_id_from_origin("NUT/FABAL/001479") is None
    assert parse_dia_id_from_origin("") is None
    assert parse_dia_id_from_origin(None) is None


def test_menu_and_manual_production_isolation_logic():
    """
    Simula la lógica de get_day_components verificando que:
    1. Un Menú Regular con 'Pollo' y 'Arroz' NO sume los ingredientes de la Producción Manual.
    2. La Producción Manual con 'Pollo', 'Carne' y 'Papa' NO sume los del Menú Regular.
    """
    # Datos simulados de Base de Datos local
    dias_locales = [
        {
            "id": 101,
            "fecha": "2026-10-20",
            "turno": "Almuerzo",
            "tipo_menu": "Normal",
            "ruta_asignada": "NUT/FABAL/00101",
            "items": [{"odoo_product_id": 10, "nombre": "Sopa de Pollo"}, {"odoo_product_id": 11, "nombre": "Arroz con Pollo"}]
        },
        {
            "id": 102,
            "fecha": "2026-10-20",
            "turno": "Almuerzo",
            "tipo_menu": "Normal (Manual)",
            "ruta_asignada": "Evento Boda",
            "items": [{"odoo_product_id": 20, "nombre": "Pechuga Asada Evento"}]
        }
    ]

    # Datos simulados de Odoo para el día
    # MO 1001: Master MO del Menú Regular (id local 101)
    # MO 1002: Child MO del plato Sopa (origen NUT-DIA-101) -> Ingrediente: Pollo 6 kg
    # MO 1003: Child MO del plato Arroz (origen NUT-DIA-101) -> Ingrediente: Pollo 4 kg, Arroz 5 kg
    # MO 2001: Master MO de la Producción Manual (id local 102) -> Ingrediente directo: Pollo 4 kg, Carne 8 kg, Papa 12 kg
    mos_en_odoo = [
        {
            "id": 1001,
            "name": "NUT/FABAL/00101",
            "origin": "NUT-DIA-101",
            "product_id": [501, "ALMUERZO NORMAL 201026"],
            "move_raw_ids": [901, 902] # Movimientos de los platos (recetas intermedias)
        },
        {
            "id": 1002,
            "name": "FAB/00102",
            "origin": "Reabastecimiento manual (NUT-DIA-101)",
            "product_id": [10, "Sopa de Pollo"],
            "move_raw_ids": [910] # Pollo 6 kg
        },
        {
            "id": 1003,
            "name": "FAB/00103",
            "origin": "Reabastecimiento manual (NUT-DIA-101)",
            "product_id": [11, "Arroz con Pollo"],
            "move_raw_ids": [911, 912] # Pollo 4 kg, Arroz 5 kg
        },
        {
            "id": 2001,
            "name": "FAB/00201",
            "origin": "NUT-DIA-102",
            "product_id": [601, "Evento Boda"],
            "move_raw_ids": [920, 921, 922] # Pollo 4 kg, Carne 8 kg, Papa 12 kg
        }
    ]

    stock_moves_db = {
        901: {"product_id": [10, "Sopa de Pollo"], "product_uom_qty": 50, "product_uom": [1, "Unidades"], "state": "confirmed"},
        902: {"product_id": [11, "Arroz con Pollo"], "product_uom_qty": 50, "product_uom": [1, "Unidades"], "state": "confirmed"},
        910: {"product_id": [100, "Pollo Crudo"], "product_uom_qty": 6.0, "product_uom": [2, "kg"], "state": "confirmed"},
        911: {"product_id": [100, "Pollo Crudo"], "product_uom_qty": 4.0, "product_uom": [2, "kg"], "state": "confirmed"},
        912: {"product_id": [101, "Arroz Blanco"], "product_uom_qty": 5.0, "product_uom": [2, "kg"], "state": "confirmed"},
        920: {"product_id": [100, "Pollo Crudo"], "product_uom_qty": 4.0, "product_uom": [2, "kg"], "state": "confirmed"},
        921: {"product_id": [102, "Carne de Res"], "product_uom_qty": 8.0, "product_uom": [2, "kg"], "state": "confirmed"},
        922: {"product_id": [103, "Papa Chola"], "product_uom_qty": 12.0, "product_uom": [2, "kg"], "state": "confirmed"},
    }

    def simular_get_day_components(turno_req, menu_req):
        turno_buscado = turno_req.strip().replace('+', ' ').lower() if turno_req else None
        menu_buscado = menu_req.strip().replace('+', ' ').lower() if menu_req else None

        mo_origins_filtro = []
        mo_names_filtro = []

        for d in dias_locales:
            t_nombre = d["turno"].strip().lower() if d.get("turno") else None
            m_nombre = d["tipo_menu"].strip().lower() if d.get("tipo_menu") else None

            t_match = not turno_buscado or (t_nombre == turno_buscado)
            m_match = not menu_buscado or (m_nombre == menu_buscado)

            if t_match and m_match:
                mo_origins_filtro.append(f"Reabastecimiento manual (NUT-DIA-{d['id']})")
                mo_origins_filtro.append(f"NUT-DIA-{d['id']}")
                ruta = d.get("ruta_asignada", "")
                if ruta:
                    mo_names_filtro.append(ruta)
                    mo_origins_filtro.append(ruta)

        # Simular Odoo execute con filtros
        # Las MOs a considerar deben coincidir en name o en origin con los filtros
        filtered_mos = []
        for mo in mos_en_odoo:
            match_name = mo["name"] in mo_names_filtro
            match_origin = mo["origin"] in mo_origins_filtro
            if match_name or match_origin:
                filtered_mos.append(mo)

        all_move_ids = []
        manual_dia_ids = []
        for mo in filtered_mos:
            all_move_ids.extend(mo.get("move_raw_ids", []))
            dia_id = parse_dia_id_from_origin(mo.get("origin"))
            if dia_id and dia_id not in manual_dia_ids:
                manual_dia_ids.append(dia_id)

        # Buscar hijas solo para los dia_ids autorizados por el filtro
        child_products = set()
        if manual_dia_ids:
            allowed_origins = [f"Reabastecimiento manual (NUT-DIA-{d})" for d in manual_dia_ids]
            child_mos = [m for m in mos_en_odoo if m["origin"] in allowed_origins]
            for c_mo in child_mos:
                if c_mo.get("product_id"):
                    child_products.add(c_mo["product_id"][0])
                all_move_ids.extend(c_mo.get("move_raw_ids", []))

        all_move_ids = list(set(all_move_ids))
        product_map = {}
        for m_id in all_move_ids:
            m = stock_moves_db[m_id]
            p_id = m["product_id"][0]
            # Excluir platos (recetas intermedias) para dejar materias primas crudas
            if p_id not in child_products:
                if p_id not in product_map:
                    product_map[p_id] = {
                        "name": m["product_id"][1],
                        "qty": 0.0,
                        "uom": m["product_uom"][1]
                    }
                product_map[p_id]["qty"] += m["product_uom_qty"]

        return product_map

    # 1. Probar consulta para Menú Regular ("Normal")
    comp_regular = simular_get_day_components("Almuerzo", "Normal")
    
    # Verificaciones para Menú Regular:
    assert 100 in comp_regular, "Debe incluir Pollo Crudo"
    assert comp_regular[100]["qty"] == 10.0, f"Pollo debe ser 10.0 kg (6+4), pero fue {comp_regular[100]['qty']}"
    assert 101 in comp_regular, "Debe incluir Arroz Blanco"
    assert comp_regular[101]["qty"] == 5.0, f"Arroz debe ser 5.0 kg, pero fue {comp_regular[101]['qty']}"
    
    # NO debe incluir Carne ni Papa de la producción manual
    assert 102 not in comp_regular, "Carne de Res NO debe estar en el menú Regular"
    assert 103 not in comp_regular, "Papa Chola NO debe estar en el menú Regular"

    # 2. Probar consulta para Producción Manual ("Normal (Manual)")
    comp_manual = simular_get_day_components("Almuerzo", "Normal (Manual)")
    
    # Verificaciones para Producción Manual:
    assert 100 in comp_manual, "Debe incluir Pollo Crudo"
    assert comp_manual[100]["qty"] == 4.0, f"Pollo debe ser 4.0 kg, pero fue {comp_manual[100]['qty']}"
    assert 102 in comp_manual, "Debe incluir Carne de Res"
    assert comp_manual[102]["qty"] == 8.0, f"Carne debe ser 8.0 kg, pero fue {comp_manual[102]['qty']}"
    assert 103 in comp_manual, "Debe incluir Papa Chola"
    assert comp_manual[103]["qty"] == 12.0, f"Papa debe ser 12.0 kg, pero fue {comp_manual[103]['qty']}"
    
    # NO debe incluir Arroz del menú regular
    assert 101 not in comp_manual, "Arroz Blanco NO debe estar en la producción manual"
