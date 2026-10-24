from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.models.models import Usuario
from app.schemas.schemas import Token, LoginRequest, UsuarioResponse
from app.services.odoo_client import OdooClient
from app.api.deps import get_current_user

router = APIRouter()
odoo_client = OdooClient()

@router.post("/login", response_model=Token)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    """
    Inicio de sesión híbrido. Primero busca el usuario en la base de datos local:
    - Si existe y tiene password_hash, valida localmente (usuario cocina/bodega).
    - Si existe y NO tiene password_hash, intenta autenticar vía API de Odoo.
    - Si NO existe localmente, intenta autenticar vía API de Odoo. Si tiene éxito,
      registra al usuario automáticamente en local y le otorga un rol por defecto.
    """
    username = login_data.username
    password = login_data.password

    # 1. Buscar en la base de datos local
    db_user = db.query(Usuario).filter(Usuario.username == username).first()

    if db_user:
        if not db_user.activo:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El usuario está inactivo")
        
        # Si tiene contraseña local, validar localmente
        if db_user.password_hash:
            if verify_password(password, db_user.password_hash):
                access_token = create_access_token(subject=db_user.username)
                return {"access_token": access_token, "token_type": "bearer"}
            else:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contraseña local incorrecta")
        
        # Si no tiene contraseña local, validar contra Odoo
        else:
            odoo_uid = odoo_client.authenticate_user(username, password)
            if odoo_uid:
                # Actualizar el odoo_user_id si por alguna razón no lo tenía
                if db_user.odoo_user_id != odoo_uid:
                    db_user.odoo_user_id = odoo_uid
                    db.commit()
                access_token = create_access_token(subject=db_user.username)
                return {"access_token": access_token, "token_type": "bearer"}
            else:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales de Odoo incorrectas")
    
    # 2. Si no existe localmente, intentar login directo en Odoo
    else:
        # Asumimos que si no existe localmente, debe ser un usuario de Odoo (por ejemplo, admin@nutriestacion.com)
        odoo_uid = odoo_client.authenticate_user(username, password)
        if odoo_uid:
            # Traer información de perfil de Odoo
            user_info = odoo_client.get_odoo_user_info(odoo_uid)
            nombre = user_info.get("name", username) if user_info else username
            
            # Registrar nuevo usuario de Odoo en local
            # Rol por defecto 'admin' o 'supervisor'
            new_user = Usuario(
                username=username,
                nombre=nombre,
                rol="admin",  # Rol administrador para usuarios que vienen de Odoo por defecto
                odoo_user_id=odoo_uid,
                activo=True
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)

            access_token = create_access_token(subject=new_user.username)
            return {"access_token": access_token, "token_type": "bearer"}
        else:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas (no encontrado en local ni en Odoo)")


@router.get("/me", response_model=UsuarioResponse)
def read_current_user(current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene los datos del perfil del usuario actualmente autenticado.
    """
    return current_user


from app.models.models import OdooConfig
from app.schemas.schemas import OdooConfigCreate, OdooConfigResponse

@router.get("/odoo-config", response_model=OdooConfigResponse)
def get_odoo_config(db: Session = Depends(get_db)):
    """
    Obtiene los parámetros actuales de conexión a Odoo. 
    Si no están configurados en BD, retorna los valores por defecto del .env.
    """
    from app.core.config import settings
    cfg = db.query(OdooConfig).filter(OdooConfig.activo == True).first()
    if cfg:
        username_to_return = cfg.username if cfg.username else settings.ODOO_USER
        return {
            "url": cfg.url,
            "db": cfg.db,
            "username": username_to_return,
            "activo": cfg.activo,
            "updated_at": cfg.updated_at
        }
    
    # Si no existe en la base de datos, retornamos los valores de settings (.env)
    import datetime
    return {
        "url": settings.ODOO_URL,
        "db": settings.ODOO_DB,
        "username": settings.ODOO_USER,
        "activo": True,
        "updated_at": datetime.datetime.now()
    }


@router.get("/odoo-status")
def get_odoo_status():
    """
    Verifica rápidamente si Odoo está en línea y conectado.
    """
    try:
        if odoo_client.ping():
            return {"status": "online"}
        else:
            return {"status": "offline"}
    except Exception:
        return {"status": "offline"}


@router.post("/odoo-config", response_model=OdooConfigResponse)
def save_odoo_config(config_data: OdooConfigCreate, db: Session = Depends(get_db)):
    """
    Guarda o actualiza la configuración de conexión a Odoo.
    """
    cfg = db.query(OdooConfig).filter(OdooConfig.activo == True).first()
    if not cfg:
        cfg = OdooConfig()
        db.add(cfg)
        
    cleaned_url = odoo_client.clean_url(config_data.url)
    cfg.url = cleaned_url
    cfg.db = config_data.db
    cfg.activo = True
    
    if config_data.username:
        cfg.username = config_data.username
        
    if config_data.password and config_data.password != "********" and config_data.password.strip() != "":
        cfg.password = config_data.password
        
    db.commit()
    db.refresh(cfg)
    
    # Forzar recarga de configuración en el cliente global de Odoo
    from app.core.config import settings
    odoo_client.url = cfg.url
    odoo_client.db = cfg.db
    if cfg.username:
        odoo_client.username = cfg.username
    if cfg.password:
        odoo_client.password = cfg.password
    odoo_client._uid = None
    odoo_client._models = None
    
    username_to_return = cfg.username if cfg.username else settings.ODOO_USER
    return {
        "url": cfg.url,
        "db": cfg.db,
        "username": username_to_return,
        "activo": cfg.activo,
        "updated_at": cfg.updated_at
    }


@router.post("/odoo-config/test")
def test_odoo_config(config_data: OdooConfigCreate, db: Session = Depends(get_db)):
    """
    Prueba una conexión a Odoo con los parámetros proporcionados y las credenciales del .env como fallback.
    """
    import xmlrpc.client
    from app.core.config import settings
    
    cfg = db.query(OdooConfig).filter(OdooConfig.activo == True).first()
    cleaned_url = odoo_client.clean_url(config_data.url)
    
    test_user = config_data.username
    if not test_user:
        test_user = cfg.username if cfg else None
    if not test_user:
        test_user = settings.ODOO_USER
        
    test_password = config_data.password
    if test_password == "********" or not test_password:
        test_password = cfg.password if cfg else None
    if not test_password:
        test_password = settings.ODOO_PASSWORD
        
    try:
        common = xmlrpc.client.ServerProxy(f"{cleaned_url}/xmlrpc/2/common")
        uid = common.authenticate(config_data.db, test_user, test_password, {})
        if uid:
            return {"status": "success", "message": f"Conexión exitosa a Odoo utilizando el usuario {test_user}."}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Autenticación fallida con las credenciales provistas. Verifica el usuario y la contraseña/API Key."
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Error de conexión a Odoo: " + str(e)
        )

