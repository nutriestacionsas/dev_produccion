# Protocolo de Cierre de Día (End-of-Day Protocol)

Este documento define el estándar y las reglas obligatorias a ejecutar al finalizar cada jornada de desarrollo en el proyecto **dev_produccion**. Su propósito es mantener el repositorio ligero, libre de código muerto o scripts temporales, y asegurar que el sistema quede siempre en un estado funcional, limpio y listo para el siguiente día.

---

## 🎯 Los 6 Pilares del Cierre de Día

```text
[1. Higiene de Testing] ➔ [2. Purga de Basura] ➔ [3. Validación Build] ➔ [4. Seguridad/Git] ➔ [5. Servidor Cloud] ➔ [6. Bitácora]
```

---

## 1. Regla de Oro: Higiene y Purga de Pruebas (`antigravity_tests/`)

Durante el desarrollo diario se crean scripts rápidos para inspeccionar APIs, consultar Odoo o validar queries. Al final del día, estos archivos **no deben quedarse acumulando polvo**:

### Criterio de Conservación vs Eliminación:
- ✅ **CONSERVAR (Pruebas Unitarias de Regresión):**
  - Ubicación: `antigravity_tests/backend/unit_tests/`
  - Archivos que validan lógica de negocio permanente (ej. aislamiento de menús, extracción de IDs regex, congelamiento de costos unitarios).
  - Deben poder ejecutarse con `pytest` en segundos sin depender de internet o IDs específicos que expiren.

- ❌ **ELIMINAR INMEDIATAMENTE (Scripts Desechables):**
  - Scripts `check_*.py`, `scratch_*.py`, `fix_*.py` que usaban IDs quemados para depurar un error puntual ya resuelto (ej. `check_mo_7980.py`, `clean_view_2971.py`).
  - Archivos JSON de prueba (`draft.json`, `res.json`, `day_comp.json`).
  - Copias huérfanas de componentes (ej. `EstablishProduction_copy.jsx`).
  - Volcados de terminal (`logs.txt`, `backend_logs.txt`, `inventory_search.txt`).
  - Bases de datos SQLite temporales (`.db` de 0 bytes o dumps de pruebas locales viejas).
  - Archivos comprimidos `.zip` viejos ya desplegados en el servidor.

---

## 2. Limpieza de Archivos Temporales y Cachés Locales

Ejecutar en la terminal local (PowerShell) para limpiar residuos de ejecución:

```powershell
# 1. Eliminar cachés de Python y Pytest
Get-ChildItem -Path . -Recurse -Directory -Filter "__pycache__" | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
Get-ChildItem -Path . -Recurse -Directory -Filter ".pytest_cache" | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue

# 2. Eliminar bases de datos SQLite vacías de desarrollo en raíz
Get-ChildItem -Path . -File -Filter "*.db" | Where-Object { $_.Length -eq 0 } | Remove-Item -Force
```

---

## 3. Puerta de Validación Técnica (Zero-Error Gate)

Antes de dar por cerrado el día, se debe garantizar que nada de lo modificado rompa la aplicación:

### A. Ejecutar Pruebas Automatizadas (Backend):
```powershell
cd backend
.\venv\Scripts\python -m pytest ..\antigravity_tests\backend\unit_tests
cd ..
```
*Requisito: 100% de las pruebas deben pasar (verde).*

### B. Validar Compilación del Frontend:
```powershell
cd frontend
npm run build
cd ..
```
*Requisito: Build completado con 0 errores de sintaxis o importación.*

---

## 4. Seguridad de Credenciales y Control de Código

- [ ] **Proteger el archivo `.env`:** Verificar que las contraseñas de Odoo, base de datos de producción y secretos JWT nunca se expongan en archivos públicos ni se envíen a repositorios externos.
- [ ] **Sin archivos huérfanos en `backend/app/` o `frontend/src/`:** Asegurarse de no haber dejado comentarios gigantescos comentados, funciones duplicadas o archivos `test.js` sueltos dentro del código de producción.

---

## 5. Verificación del Servidor en la Nube (Si se realizó despliegue)

Si durante el día se subió una nueva versión a Google Cloud:

1. **Verificar estado de los contenedores:**
   ```bash
   docker compose ps
   ```
   *Todos los contenedores (`backend`, `frontend`, `db`) deben estar en estado `Up`.*

2. **Revisar logs en busca de excepciones silenciosas:**
   ```bash
   docker compose logs --tail=50 backend
   ```

3. **Eliminar el archivo ZIP subido en el servidor:**
   ```bash
   rm -f /home/jmaltap/*.zip
   ```

---

## 6. Lista de Verificación Rápida (Checklist Diario)

| Ítem | Acción | Estado |
| :--- | :--- | :---: |
| 1 | Tests unitarios pasando en `antigravity_tests/backend/unit_tests/` | [ ] |
| 2 | Scripts temporales y logs `.txt` desechados | [ ] |
| 3 | Frontend compila limpiamente (`npm run build`) | [ ] |
| 4 | `.env` protegido y respaldado | [ ] |
| 5 | Contenedores en Google Cloud corriendo en `Up` (si aplica) | [ ] |
| 6 | Archivos `.zip` temporales eliminados del servidor | [ ] |
