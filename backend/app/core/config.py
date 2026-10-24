import os
from pathlib import Path
from dotenv import load_dotenv

# Directorio Base
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Cargar variables de entorno del archivo .env
load_dotenv(BASE_DIR / ".env")

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/dev_produccion")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "supersecretjwtkeyforlocaldevelopment123!")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    
    ODOO_URL: str = os.getenv("ODOO_URL", "http://localhost:8069")
    ODOO_DB: str = os.getenv("ODOO_DB", "odoo_database_name")
    ODOO_USER: str = os.getenv("ODOO_USER", "admin@nutriestacion.com")
    ODOO_PASSWORD: str = os.getenv("ODOO_PASSWORD", "your_odoo_password_or_api_key")

settings = Settings()
