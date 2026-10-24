import json
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException
from app.api.endpoints.gmao import check_permission, MOD_EQUIPOS, MOD_PREVENTIVO


def make_user(rol="bodega", permisos=None):
    user = MagicMock()
    user.rol = rol
    user.permisos = permisos
    return user


def test_admin_siempre_tiene_acceso():
    assert check_permission(make_user(rol="admin", permisos={}), MOD_EQUIPOS) is True


def test_lee_estructura_modules_del_frontend():
    """El frontend guarda permisos.modules[<Nombre ítem>].view (no claves planas gmao_*)."""
    user = make_user(permisos={"modules": {"Equipos y Activos": {"view": True, "actions": {}}}})
    assert check_permission(user, MOD_EQUIPOS) is True

    with pytest.raises(HTTPException) as exc:
        check_permission(user, MOD_PREVENTIVO)
    assert exc.value.status_code == 403


def test_permisos_como_string_json():
    user = make_user(permisos=json.dumps({"modules": {"Mantenimiento Preventivo": {"view": True}}}))
    assert check_permission(user, MOD_PREVENTIVO) is True


def test_view_false_o_claves_planas_legacy_no_dan_acceso():
    for permisos in [
        {"modules": {"Equipos y Activos": {"view": False}}},
        {"gmao_assets": True},
        {},
        None,
        "no-es-json",
    ]:
        with pytest.raises(HTTPException):
            check_permission(make_user(permisos=permisos), MOD_EQUIPOS)


def test_basta_con_uno_de_varios_modulos():
    """GET /equipos acepta Equipos o Preventivo (PreventivePlans lista equipos en su selector)."""
    user = make_user(permisos={"modules": {"Mantenimiento Preventivo": {"view": True}}})
    assert check_permission(user, MOD_EQUIPOS, MOD_PREVENTIVO) is True
