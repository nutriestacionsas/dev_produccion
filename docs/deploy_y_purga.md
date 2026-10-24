# Guía de Despliegue Limpio y Purga de Servidor (Docker Compose V2)

Esta guía documenta el procedimiento paso a paso para realizar un **despliegue limpio desde cero**, eliminando residuos de caché, imágenes obsoletas de Docker y memoria temporal en servidores Ubuntu/Debian alojados en Google Cloud Compute Engine.

---

## 📌 Consideraciones Previas

- **Docker Compose V2:** En instalaciones modernas de Docker, el comando se ejecuta con espacio: `docker compose` (no con guion `docker-compose`).
- **Persistencia de Base de Datos:**
  - `docker compose down`: Apaga y elimina los contenedores y redes, pero **CONSERVA** los datos de PostgreSQL (`postgres_data`).
  - `docker compose down -v`: Elimina también los volúmenes, lo que **BORRA COMPLETAMENTE** la base de datos de PostgreSQL. *(Usar solo si se desea inicializar la base de datos desde cero)*.

---

## 🛠️ Fase 1: Empaquetado Local (PowerShell en Windows)

Antes de subir al servidor, se genera un archivo ZIP limpio excluyendo carpetas pesadas (`node_modules`, `.git`, `.venv`, pruebas temporales y cachés).

```powershell
# 1. Asegurar build limpio del frontend (opcional para validación)
cd frontend
npm run build
cd ..

# 2. Comprimir excluyendo archivos innecesarios
$exclude = @("node_modules", ".git", ".venv", "__pycache__", ".pytest_cache", "dist", "build", "*.zip", "*.tar.gz")
# Generar ZIP con el código fuente esencial
Compress-Archive -Path backend, frontend, docker-compose.yml, nginx -DestinationPath update_produccion.zip -Force
```

---

## 🚀 Fase 2: Ejecución en el Servidor (Consola SSH Google Cloud)

Acceder a la consola web de Google Cloud por SSH y elevar privilegios a `root`:

```bash
sudo su
```

---

### Paso 1: Apagar Contenedores Actuales

Navegar a la carpeta del proyecto y detener la aplicación:

```bash
cd /home/jmaltap/dev_produccion
```

- **Opción A (Recomendada - Conserva los datos de PostgreSQL):**
  ```bash
  docker compose down
  ```

- **Opción B (Reset Total - Borra la base de datos y volúmenes):**
  ```bash
  docker compose down -v
  ```

---

### Paso 2: Purga Profunda de Docker y Memoria del Sistema

Eliminar imágenes antiguas huérfanas, capas intermedias de caché y liberar memoria RAM del kernel:

```bash
# 1. Eliminar contenedores detenidos, redes en desuso e imágenes no asociadas
docker system prune -a -f

# 2. Limpiar caché del constructor (BuildKit Cache)
docker builder prune -a -f

# 3. Liberar memoria RAM en caché (PageCache, Dentries e Inodos del Kernel)
sync; echo 3 > /proc/sys/vm/drop_caches
```

---

### Paso 3: Limpieza del Directorio del Proyecto (Protegiendo `.env` y `uploads/`)

> ⚠️ **Corrección (24-oct-2026):** el `docker-compose.yml` usa `env_file: ./backend/.env`, es decir, el `.env` que realmente lee el backend está en `backend/.env`, **no** en la raíz del proyecto. Respaldar solo la raíz deja el contenedor sin credenciales de Odoo/JWT tras el `rm -rf`. Además, `backend/uploads/gmao_docs/` guarda los documentos adjuntos de equipos GMAO (volumen `./backend`): si no se respalda, **se pierden** con este mismo paso.

Antes de vaciar la carpeta, respaldar el `.env` real y los documentos de GMAO:

```bash
# 1. Respaldar el .env real (el que usa el backend) y los documentos de GMAO
cp /home/jmaltap/dev_produccion/backend/.env /home/jmaltap/.env.backup
mkdir -p /home/jmaltap/gmao_uploads.backup
cp -r /home/jmaltap/dev_produccion/backend/uploads/. /home/jmaltap/gmao_uploads.backup/ 2>/dev/null || true

# 2. Vaciar el directorio dev_produccion
rm -rf /home/jmaltap/dev_produccion/*
rm -rf /home/jmaltap/dev_produccion/.* 2>/dev_produccion_err.log || true

# 3. Restaurar .env y documentos de GMAO (se restauran DESPUÉS de descomprimir el ZIP, Paso 4)
```

> Las órdenes de restauración de `backend/.env` y `backend/uploads/` se ejecutan en el **Paso 4**, después de descomprimir el ZIP nuevo, porque antes de eso la carpeta `backend/` no existe todavía.

---

### Paso 4: Subida y Descompresión del Nuevo Código

1. En la consola SSH de Google Cloud, hacer clic en la rueda de engranaje o menú superior derecho **⚙️ > Subir archivo**.
2. Seleccionar el archivo ZIP local (ej. `update161026_produccion.zip`). Por defecto se subirá a `/home/jmaltap/`.
3. Descomprimir dentro de `/home/jmaltap/dev_produccion`:

```bash
# Si unzip no está instalado: apt update && apt install -y unzip
unzip -o /home/jmaltap/update161026_produccion.zip -d /home/jmaltap/dev_produccion/

# Restaurar el .env real del backend y los documentos de GMAO (respaldados en el Paso 3)
cp /home/jmaltap/.env.backup /home/jmaltap/dev_produccion/backend/.env
mkdir -p /home/jmaltap/dev_produccion/backend/uploads
cp -r /home/jmaltap/gmao_uploads.backup/. /home/jmaltap/dev_produccion/backend/uploads/ 2>/dev/null || true

# Ajustar permisos
chmod -R 755 /home/jmaltap/dev_produccion
```

---

### Paso 5: Verificar Red Externa y Reconstruir Contenedores

Si el archivo `docker-compose.yml` utiliza una red externa (por ejemplo `web_network` para reverse proxy como Traefik/Nginx externo), asegurarse de que exista:

```bash
docker network inspect web_network >/dev/null 2>&1 || docker network create web_network
```

Construir y levantar todos los servicios en segundo plano forzando reconstrucción limpia:

```bash
cd /home/jmaltap/dev_produccion
docker compose up -d --build --force-recreate
```

---

### Paso 6: Verificación y Monitoreo

Verificar que todos los servicios estén en estado `Up`:

```bash
docker compose ps
```

#### Ver logs en tiempo real:

- **Backend (FastAPI / Uvicorn):**
  ```bash
  docker compose logs -f --tail=50 backend
  ```

- **Frontend (Nginx / React):**
  ```bash
  docker compose logs -f --tail=50 frontend
  ```

- **Base de Datos (PostgreSQL):**
  ```bash
  docker compose logs -f --tail=50 db
  ```

*(Para salir de la vista de logs en tiempo real, presionar `Ctrl + C`)*.

---

## 🧹 Paso 7: Limpieza de Archivos Temporales de Subida

Una vez que la aplicación esté corriendo correctamente, eliminar el archivo ZIP subido para no ocupar espacio en disco:

```bash
rm -f /home/jmaltap/*.zip
rm -f /home/jmaltap/.env.backup
rm -rf /home/jmaltap/gmao_uploads.backup
```
