#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de Limpieza Controlada de Orígenes en Odoo ERP
---------------------------------------------------
Filtra órdenes de fabricación (mrp.production) en estado 'done'
entre el 01 y el 15 de octubre que tengan un origen asignado,
y permite limpiar el campo 'origin' para evitar duplicaciones
en 'Establecer Producción'.
"""

import sys
import os
import re
import getpass
import xmlrpc.client
from urllib.parse import urlparse

def limpiar_url(url_input: str) -> str:
    """Limpia la URL eliminando rutas secundarias como /es_EC, /web, etc."""
    url = url_input.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    parsed = urlparse(url)
    clean = f"{parsed.scheme}://{parsed.netloc}"
    return clean

def main():
    print("\n" + "=" * 80)
    print("🧹 LIMPIEZA CONTROLADA DE ORÍGENES EN ODOO (2026-01-01 AL 2026-10-15)")
    print("=" * 80)
    print("Por favor, ingresa los datos de conexión a Odoo:\n")

    # 1. Solicitar URL
    url_input = input("1. URL de Odoo (ej: https://nutriestacion.odoo.com): ").strip()
    while not url_input:
        url_input = input("   -> La URL es requerida: ").strip()
    odoo_url = limpiar_url(url_input)

    # 2. Solicitar Base de Datos
    odoo_db = input("2. Base de Datos (ej: nutriestacion): ").strip()
    while not odoo_db:
        odoo_db = input("   -> La base de datos es requerida: ").strip()

    # 3. Solicitar Correo / Usuario
    odoo_user = input("3. Correo / Usuario de Odoo: ").strip()
    while not odoo_user:
        odoo_user = input("   -> El correo es requerido: ").strip()

    # 4. Solicitar Contraseña / API Key
    odoo_pass = getpass.getpass("4. Contraseña o API Key de Odoo: ").strip()
    while not odoo_pass:
        odoo_pass = getpass.getpass("   -> La contraseña es requerida: ").strip()

    print("\n" + "-" * 80)
    print(f"Conectando a: {odoo_url}")
    print(f"Base de Datos: {odoo_db} | Usuario: {odoo_user}")
    print("-" * 80)

    # Autenticación con Odoo
    try:
        common = xmlrpc.client.ServerProxy(f"{odoo_url}/xmlrpc/2/common", allow_none=True)
        uid = common.authenticate(odoo_db, odoo_user, odoo_pass, {})
        if not uid:
            print("\n❌ Error: Credenciales incorrectas (Usuario o Contraseña inválidos).")
            sys.exit(1)
        print(f"✔ Autenticado con éxito en Odoo (UID: {uid})\n")
    except Exception as e:
        print(f"\n❌ Error al conectar con Odoo: {e}")
        sys.exit(1)

    models = xmlrpc.client.ServerProxy(f"{odoo_url}/xmlrpc/2/object", allow_none=True)

    # Criterio de búsqueda estricto:
    # 1. Estado = 'done' (listo)
    # 2. Fecha planificada/inicio entre 01-01-2026 y 15-10-2026
    # 3. Que tenga origen asignado
    fecha_inicio = "2026-01-01 00:00:00"
    fecha_fin = "2026-10-15 23:59:59"

    domain = [
        ('state', '=', 'done'),
        ('date_start', '>=', fecha_inicio),
        ('date_start', '<=', fecha_fin),
        ('origin', '!=', False)
    ]

    print("=" * 80)
    print("🔎 BUSCANDO ÓRDENES EN ODOO CON LOS CRITERIOS:")
    print(f" - Estado: done (listo)")
    print(f" - Rango de fechas: Desde {fecha_inicio}  hasta  {fecha_fin}")
    print(f" - Campo 'origin' no vacío")
    print("=" * 80)

    try:
        mo_ids = models.execute_kw(
            odoo_db, uid, odoo_pass,
            'mrp.production', 'search',
            [domain],
            {'order': 'date_start asc'}
        )
    except Exception as e:
        print(f"❌ Error en búsqueda de órdenes en Odoo: {e}")
        sys.exit(1)

    if not mo_ids:
        print("\n✔ No se encontraron órdenes 'done' con origen en ese rango de fechas.")
        print("   Tu base de datos de Odoo ya está limpia para ese período.")
        sys.exit(0)

    # Leer información de las órdenes encontradas
    fields = ['id', 'name', 'product_id', 'origin', 'date_start', 'state']
    mos = models.execute_kw(odoo_db, uid, odoo_pass, 'mrp.production', 'read', [mo_ids], {'fields': fields})

    print(f"\nSe encontraron {len(mos)} órdenes de fabricación en estado 'done' con origen:\n")
    print(f"{'FECHA':<12} | {'MO':<16} | {'ORIGEN ACTUAL':<40} | {'PRODUCTO'}")
    print("-" * 105)
    for mo in mos:
        fecha_str = str(mo.get('date_start', ''))[:10]
        name = mo.get('name', '')
        orig = str(mo.get('origin', ''))
        prod = mo['product_id'][1] if mo.get('product_id') else 'Desconocido'
        print(f"{fecha_str:<12} | {name:<16} | {orig:<40} | {prod}")
    print("-" * 105)

    print("\n⚠️  ATENCIÓN:")
    print("El siguiente paso borrará el campo 'origen' de estas órdenes en Odoo")
    print("para evitar que aparezcan duplicadas en Establecer Producción.")
    print("-" * 80)

    try:
        confirmacion = input("\n¿Deseas proceder a borrar los orígenes de estas órdenes? (Escribe 'SI' para confirmar): ").strip()
    except KeyboardInterrupt:
        print("\nOperación cancelada por el usuario.")
        sys.exit(0)

    if confirmacion.upper() != "SI":
        print("\nOperación cancelada. No se modificó ningún dato en Odoo.")
        sys.exit(0)

    # EJECUCIÓN REAL
    print("\n" + "=" * 80)
    print("🚀 EJECUTANDO LIMPIEZA DE ORÍGENES EN ODOO...")
    print("=" * 80)

    exitos = 0
    errores = 0

    for mo in mos:
        mo_id = mo['id']
        mo_name = mo.get('name')
        orig_previo = mo.get('origin')
        try:
            models.execute_kw(
                odoo_db, uid, odoo_pass,
                'mrp.production', 'write',
                [[mo_id], {'origin': False}]
            )
            print(f"✔ Limpiada MO {mo_name} (Origen eliminado: '{orig_previo}')")
            exitos += 1
        except Exception as e:
            print(f"❌ Error al actualizar {mo_name}: {e}")
            errores += 1

    print("\n" + "=" * 80)
    print(f"🎉 RESUMEN FINAL: {exitos} orígenes eliminados con éxito | {errores} errores.")
    print("=" * 80 + "\n")

if __name__ == "__main__":
    main()
