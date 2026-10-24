from apscheduler.schedulers.background import BackgroundScheduler
from app.core.database import SessionLocal
from app.models.gmao import GMAOPlanPreventivo
from app.services.notification_engine import NotificationEngine
from datetime import datetime
from zoneinfo import ZoneInfo
import logging

logger = logging.getLogger(__name__)
# Configurar logs para que se vean en Docker
logging.basicConfig(level=logging.INFO)

# El contenedor corre en UTC; la revisión diaria se programa en hora de Ecuador
GMAO_TZ = ZoneInfo("America/Guayaquil")
GMAO_HORA_REVISION = 8

def check_preventive_plans():
    """
    Revisa todos los planes preventivos en la base de datos y lanza alertas
    si están a punto de vencer (<= 3 días) o si ya vencieron.
    """
    db = SessionLocal()
    try:
        today = datetime.now(GMAO_TZ).date()
        planes = db.query(GMAOPlanPreventivo).filter(GMAOPlanPreventivo.activo == True).all()
        
        # logger.info(f"Ejecutando check_preventive_plans... Encontrados {len(planes)} planes.")
        
        for plan in planes:
            if not plan.proxima_fecha:
                continue
                
            dias_restantes = (plan.proxima_fecha - today).days
            
            if dias_restantes < 0:
                mensaje = f"URGENTE: El plan preventivo '{plan.titulo_plan}' está VENCIDO por {-dias_restantes} días. Agende la OT de inmediato."
                NotificationEngine.send_alert(mensaje, channel="whatsapp,email")
                
            elif 0 <= dias_restantes <= 3:
                mensaje = f"AVISO: El plan preventivo '{plan.titulo_plan}' vence en {dias_restantes} días. Preparar repuestos y personal."
                NotificationEngine.send_alert(mensaje, channel="email")
                
    except Exception as e:
        logger.error(f"Error en scheduler preventivo: {e}")
    finally:
        db.close()

def start_scheduler():
    scheduler = BackgroundScheduler(timezone=GMAO_TZ)
    # Revisión diaria a las 8:00 (hora Ecuador). Si el backend estaba reiniciándose a esa hora,
    # se ejecuta igual dentro de la hora siguiente (misfire_grace_time) y una sola vez (coalesce).
    scheduler.add_job(
        check_preventive_plans,
        'cron',
        hour=GMAO_HORA_REVISION,
        minute=0,
        id="gmao_check_preventive_plans",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,
    )
    scheduler.start()
    job = scheduler.get_job("gmao_check_preventive_plans")
    logger.info(f"📅 GMAO Preventivo Scheduler Iniciado. Próxima revisión: {job.next_run_time}")
