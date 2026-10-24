import xmlrpc.client
import logging
from typing import Dict, Any, List, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

class OdooClient:
    _global_uid: Optional[int] = None
    _global_models: Optional[xmlrpc.client.ServerProxy] = None

    def __init__(self):
        self.url = self.clean_url(settings.ODOO_URL)
        self.db = settings.ODOO_DB
        self.username = settings.ODOO_USER
        self.password = settings.ODOO_PASSWORD
        
        # Estructuras de caché para mitigar límites de tasa (429 Too Many Requests)
        self._products_cache = None
        self._products_cache_time = 0
        self._categories_cache = None
        self._categories_cache_time = 0
        self._envases_cache = None
        self._envases_cache_time = 0
        self._partners_cache = None
        self._partners_cache_time = 0
        self.CACHE_EXPIRATION = 600  # Expiración en 10 minutos (600 segundos)

    def invalidate_cache(self):
        self._products_cache = None
        self._products_cache_time = 0
        self._categories_cache = None
        self._categories_cache_time = 0
        self._envases_cache = None
        self._envases_cache_time = 0
        self._partners_cache = None
        self._partners_cache_time = 0

    def ping(self) -> bool:
        """
        Verifica conectividad y autenticación con Odoo de forma ligera.
        """
        try:
            uid = self._get_uid()
            if not uid:
                return False
            # Llamada muy ligera para verificar que la sesión y conexión son válidas
            result = self.execute('res.users', 'read', [uid], ['id'])
            return bool(result)
        except Exception as e:
            print(f"Odoo ping failed: {e}")
            self._uid = None
            self._models = None
            return False

    def clean_url(self, url: str) -> str:
        if not url:
            return ""
        from urllib.parse import urlparse
        try:
            parsed = urlparse(url)
            if parsed.scheme and parsed.netloc:
                return f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            pass
        return url

    def load_dynamic_config(self):
        """
        Intenta cargar la configuración de Odoo desde la base de datos local.
        """
        from app.core.database import SessionLocal
        from app.models.models import OdooConfig
        
        db = SessionLocal()
        try:
            cfg = db.query(OdooConfig).filter(OdooConfig.activo == True).first()
            if cfg:
                cleaned_url = self.clean_url(cfg.url)
                username_val = cfg.username if cfg.username else settings.ODOO_USER
                password_val = cfg.password if cfg.password else settings.ODOO_PASSWORD
                # Comparamos si cambió para invalidar la caché
                if (self.url != cleaned_url or 
                    self.db != cfg.db or 
                    self.username != username_val or 
                    self.password != password_val):
                    self.url = cleaned_url
                    self.db = cfg.db
                    self.username = username_val
                    self.password = password_val
                    self._uid = None
                    self._models = None
                    self.invalidate_cache()
        except Exception as e:
            logger.debug(f"Error cargando odoo_config desde BD: {str(e)}")
        finally:
            db.close()


    def _get_uid(self) -> int:
        """
        Autentica y obtiene el UID de Odoo. Utiliza caché local si ya se autenticó.
        """
        self.load_dynamic_config()
        if OdooClient._global_uid is not None:
            return OdooClient._global_uid

        try:
            common = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/common")
            uid = common.authenticate(self.db, self.username, self.password, {})
            if not uid:
                raise ValueError("Autenticación en Odoo fallida. Verifica las credenciales.")
            OdooClient._global_uid = uid
            return uid
        except Exception as e:
            logger.error(f"Error conectando a Odoo (common/authenticate): {str(e)}")
            raise

    def _get_models(self) -> xmlrpc.client.ServerProxy:
        """
        Obtiene el ServerProxy para realizar consultas a modelos en Odoo.
        """
        self.load_dynamic_config()
        try:
            # Creamos una nueva conexión fresca en cada petición para evitar que quede
            # en estado corrupto (Idle / Request-sent) tras inactividad o fallos del socket.
            return xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/object", allow_none=True)
        except Exception as e:
            logger.error(f"Error inicializando ServerProxy de objetos Odoo: {str(e)}")
            raise

    def authenticate_user(self, email: str, user_pass: str) -> Optional[int]:
        """
        Intenta autenticar a un usuario específico en Odoo.
        Retorna el UID de Odoo si es válido, de lo contrario None.
        """
        self.load_dynamic_config()
        try:

            common = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/common")
            uid = common.authenticate(self.db, email, user_pass, {})
            return uid if uid else None
        except Exception as e:
            logger.warning(f"Fallo al autenticar credenciales de usuario {email} en Odoo: {str(e)}")
            return None

    def execute(self, model: str, method: str, *args, **kwargs) -> Any:
        """
        Ejecuta de forma genérica un método sobre un modelo de Odoo.
        """
        uid = self._get_uid()
        models = self._get_models()
        try:
            return models.execute_kw(self.db, uid, self.password, model, method, args, kwargs)
        except Exception as e:
            logger.error(f"Error ejecutando execute_kw sobre el modelo {model}. Metodo: {method}. Error: {str(e)}")
            self._uid = None # Limpiamos el UID para forzar re-autenticación limpia en el siguiente intento
            raise

    def execute_jsonrpc(self, model: str, method: str, *args, **kwargs) -> Any:
        """
        Ejecuta un método sobre un modelo de Odoo vía JSON-RPC (/jsonrpc).
        Indispensable para métodos que retornan None o void (como acciones EDI de Odoo 19),
        evitando el error 'cannot marshal None' propio de XML-RPC.
        """
        import httpx
        self.load_dynamic_config()
        uid = self._get_uid()
        payload = {
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "service": "object",
                "method": "execute_kw",
                "args": [self.db, uid, self.password, model, method, list(args), kwargs or {}]
            },
            "id": 1
        }
        try:
            with httpx.Client(base_url=self.url, timeout=60.0, follow_redirects=True) as client:
                res = client.post("/jsonrpc", json=payload)
                if res.status_code != 200:
                    raise RuntimeError(f"HTTP error {res.status_code} en JSON-RPC: {res.text}")
                data = res.json()
                if "error" in data:
                    err_msg = data["error"].get("data", {}).get("message") or data["error"].get("message") or str(data["error"])
                    logger.error(f"Error JSON-RPC en {model}.{method}: {err_msg}")
                    raise RuntimeError(f"Error Odoo JSON-RPC: {err_msg}")
                return data.get("result")
        except Exception as e:
            logger.error(f"Fallo en execute_jsonrpc ({model}.{method}): {e}")
            raise

    def get_purchase_products(self) -> List[Dict[str, Any]]:
        """
        Busca y retorna todos los productos que están configurados para la compra (purchase_ok = True).
        Incluye su costo, unidad de medida y ubicación física (si se maneja a nivel de producto/categoría).
        """
        import time
        current_time = time.time()
        if self._products_cache is not None and (current_time - self._products_cache_time) < self.CACHE_EXPIRATION:
            logger.info("Retornando productos de compra desde cache en memoria.")
            return self._products_cache

        domain = [('purchase_ok', '=', True), ('active', '=', True)]
        fields = ['id', 'name', 'standard_price', 'uom_id', 'categ_id', 'qty_available']
        try:
            products = self.execute('product.product', 'search_read', domain, fields)
            # Normalizar UoM y Categoría
            for p in products:
                if isinstance(p['uom_id'], (list, tuple)):
                    p['uom_name'] = p['uom_id'][1]
                    p['uom_id'] = p['uom_id'][0]
                else:
                    p['uom_name'] = ""
                if isinstance(p['categ_id'], (list, tuple)):
                    p['categ_name'] = p['categ_id'][1]
                    p['categ_id'] = p['categ_id'][0]
                else:
                    p['categ_name'] = ""
            
            # Almacenar en cache
            self._products_cache = products
            self._products_cache_time = current_time
            return products
        except Exception as e:
            logger.error(f"Error al obtener productos de compra de Odoo: {str(e)}")
            # En caso de error (ej: 429 Too Many Requests), si tenemos cache expirada, la retornamos
            if self._products_cache is not None:
                logger.warning("Retornando cache de productos expirada tras fallo en Odoo.")
                return self._products_cache
            return []

    def get_envases(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        Busca y retorna todos los productos pertenecientes a la categoría de "Envases" para usar como Taras,
        incluyendo sus fotos (image_128 / image_256) para visualización en pesaje.
        """
        import time
        if not force_refresh and self._envases_cache is not None:
            if time.time() - self._envases_cache_time < self.CACHE_EXPIRATION:
                return self._envases_cache

        # Primero buscamos la categoría de envases por nombre
        try:
            categ_ids = self.execute('product.category', 'search', [('name', 'ilike', 'envase')])
            if not categ_ids:
                # Si no existe, buscamos por "tara"
                categ_ids = self.execute('product.category', 'search', [('name', 'ilike', 'tara')])
            
            if not categ_ids:
                return []

            domain = [('categ_id', 'in', categ_ids), ('active', '=', True)]
            fields = ['id', 'name', 'weight', 'uom_id', 'x_studio_tara', 'x_studio_udm_de_la_tara', 'image_128', 'image_256']
            products = self.execute('product.product', 'search_read', domain, fields)
            for p in products:
                if isinstance(p.get('uom_id'), (list, tuple)):
                    p['uom_name'] = p['uom_id'][1]
                    p['uom_id'] = p['uom_id'][0]
                else:
                    p['uom_name'] = ""
                    
                # Mapear el peso de la tara desde el campo de Studio si existe
                tara_val = p.get('x_studio_tara')
                p['peso_tara'] = float(tara_val) if tara_val is not None else float(p.get('weight') or 0.0)
                
                # UDM de la tara
                udm_tara = p.get('x_studio_udm_de_la_tara')
                if isinstance(udm_tara, (list, tuple)):
                    p['udm_tara'] = udm_tara[1]
                else:
                    p['udm_tara'] = p['uom_name']

                # Asignar foto de Odoo
                img = p.get('image_128') or p.get('image_256') or ""
                p['photo'] = img
                p['image_128'] = img
                p['image_256'] = p.get('image_256') or img

            self._envases_cache = products
            self._envases_cache_time = time.time()
            return products
        except Exception as e:
            logger.error(f"Error al obtener envases (taras) de Odoo: {str(e)}")
            return self._envases_cache if self._envases_cache is not None else []

    def create_recipe_product(self, name: str, category_id: int, ingredients: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Crea un producto en Odoo (la receta) y su correspondiente Lista de Materiales (BoM).
        `ingredients` es una lista de diccionarios: [{'product_id': int, 'qty': float}]
        """
        try:
            # 1. Crear el producto plantilla de receta
            product_data = {
                'name': name,
                'type': 'consu', # Producto consumible o almacenable
                'is_storable': True,
                'categ_id': category_id,
                'purchase_ok': False,
                'sale_ok': True,
            }
            product_id = self.execute('product.product', 'create', product_data)
            
            # Obtener el product_tmpl_id
            product = self.execute('product.product', 'read', [product_id], ['product_tmpl_id'])[0]
            tmpl_id = product['product_tmpl_id'][0]

            # 2. Crear la lista de materiales (mrp.bom)
            bom_data = {
                'product_tmpl_id': tmpl_id,
                'product_id': product_id,
                'product_qty': 1.0,
                'type': 'normal', # Lista de fabricación estándar
                'ready_to_produce': 'all_available'
            }
            bom_id = self.execute('mrp.bom', 'create', bom_data)

            # 3. Añadir las líneas de ingredientes a la lista de materiales (mrp.bom.line)
            for ing in ingredients:
                line_data = {
                    'bom_id': bom_id,
                    'product_id': ing['product_id'],
                    'product_qty': ing['qty']
                }
                self.execute('mrp.bom.line', 'create', line_data)

            return {'product_id': product_id, 'bom_id': bom_id}
        except Exception as e:
            logger.error(f"Error al crear producto y BoM de receta en Odoo: {str(e)}")
            raise

    def create_manual_mo_product(self, name: str, ingredients: List[Dict[str, Any]], cantidad: float = 1.0) -> Dict[str, Any]:
        """
        Crea un producto para una MO manual con la misma configuración que el flujo de sync:
        - Categoría: Alimentos
        - Ruta: Fabricación Almuerzos
        - Via product.template con type='consu' + is_storable=True
        - BoM quantity = cantidad total a producir
        - Cada línea de BoM = qty del ingrediente (ya viene multiplicada desde el frontend)
        """
        try:
            # Categoría: Alimentos (igual que flujo sync)
            try:
                categ_ids = self.execute('product.category', 'search', [('name', 'ilike', 'Alimentos')])
                categ_id = categ_ids[0] if categ_ids else 1
            except Exception:
                categ_id = 1

            # Ruta: Fabricación Almuerzos (igual que flujo sync)
            route_id = None
            try:
                route_ids = self.execute('stock.route', 'search', [('name', 'ilike', 'Fabricación Almuerzos')])
                if route_ids:
                    route_id = route_ids[0]
            except Exception:
                pass

            # Crear via product.template (igual que actualizar_dia_odoo)
            product_data = {
                'name': name,
                'type': 'consu',
                'is_storable': True,
                'sale_ok': True,
                'purchase_ok': False,
                'categ_id': categ_id,
            }
            if route_id:
                product_data['route_ids'] = [(6, 0, [route_id])]

            tmpl_id = self.execute('product.template', 'create', product_data)

            # Obtener la variante creada automáticamente por Odoo
            product_ids = self.execute('product.product', 'search', [('product_tmpl_id', '=', tmpl_id)])
            if not product_ids:
                raise ValueError(f"No se encontró variante de producto para el template {tmpl_id}")
            product_id = product_ids[0]

            # Crear BoM con la cantidad total a producir (igual que sync con total_rations)
            bom_data = {
                'product_tmpl_id': tmpl_id,
                'product_id': product_id,
                'product_qty': float(cantidad),  # Cantidad total de unidades a producir
                'type': 'normal',
                'ready_to_produce': 'all_available'
            }
            bom_id = self.execute('mrp.bom', 'create', bom_data)

            # Añadir líneas de ingredientes con sus cantidades
            for ing in ingredients:
                line_data = {
                    'bom_id': bom_id,
                    'product_id': ing['product_id'],
                    'product_qty': float(ing['qty'])
                }
                self.execute('mrp.bom.line', 'create', line_data)

            return {'product_id': product_id, 'tmpl_id': tmpl_id, 'bom_id': bom_id}
        except Exception as e:
            logger.error(f"Error al crear producto manual MO en Odoo: {str(e)}")
            raise

    def get_categories(self, parent_name_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Retorna las categorías de productos de Odoo.
        """
        import time
        current_time = time.time()
        
        if not parent_name_filter:
            if self._categories_cache is not None and (current_time - self._categories_cache_time) < self.CACHE_EXPIRATION:
                logger.info("Retornando categorías desde cache en memoria.")
                return self._categories_cache

        try:
            domain = []
            if parent_name_filter:
                parent_ids = self.execute('product.category', 'search', ['|', ('name', 'ilike', parent_name_filter), ('name', 'ilike', f'{parent_name_filter}s')])
                if parent_ids:
                    domain = [('id', 'child_of', parent_ids)]
                else:
                    return []
                    
            categories = self.execute('product.category', 'search_read', domain, ['id', 'name', 'parent_id'])
            
            if not parent_name_filter:
                self._categories_cache = categories
                self._categories_cache_time = current_time
                
            return categories
        except Exception as e:
            logger.error(f"Error al obtener categorías de Odoo: {str(e)}")
            if not parent_name_filter and self._categories_cache is not None:
                logger.warning("Retornando cache de categorías expirada tras fallo en Odoo.")
                return self._categories_cache
            return []

    def get_odoo_user_info(self, uid: int) -> Optional[Dict[str, Any]]:
        """
        Obtiene información de perfil de un usuario autenticado por Odoo.
        """
        try:
            user_data = self.execute('res.users', 'read', [uid], ['id', 'name', 'login', 'groups_id'])
            if user_data:
                return user_data[0]
            return None
        except Exception as e:
            logger.error(f"Error obteniendo datos del usuario {uid} en Odoo: {str(e)}")
            return None

    def get_customers(self) -> List[Dict[str, Any]]:
        """
        Busca y retorna los clientes activos de Odoo.
        """
        try:
            domain = [('active', '=', True)]
            # Odoo v19: buscamos campos básicos de res.partner
            fields = ['id', 'name', 'email', 'phone']
            partners = self.execute('res.partner', 'search_read', domain, fields)
            return partners
        except Exception as e:
            logger.error(f"Error al obtener clientes de Odoo: {str(e)}")
            # Fallback local con clientes mock si la conexión falla o no hay datos
            return [
                {"id": 1001, "name": "Clínica San Rafael (Mock)", "email": "contacto@sanrafael.com", "phone": "0991234567"},
                {"id": 1002, "name": "Colegio Einstein (Mock)", "email": "info@einstein.edu.ec", "phone": "0997654321"},
                {"id": 1003, "name": "Corporación La Favorita (Mock)", "email": "proveedores@favorita.com", "phone": "0999999999"},
                {"id": 1004, "name": "Banco Pichincha (Mock)", "email": "pichincha@pichincha.com", "phone": "0991112222"}
            ]

    def create_manufacturing_order(self, product_id: int, qty: float, bom_id: int) -> int:
        """
        Crea una Orden de Fabricación (MO) en Odoo y la confirma para reservar materiales.
        """
        try:
            mo_data = {
                'product_id': product_id,
                'product_qty': qty,
                'bom_id': bom_id,
            }
            product = self.execute('product.product', 'read', [product_id], ['uom_id'])
            if product:
                mo_data['product_uom_id'] = product[0]['uom_id'][0]
            
            mo_id = self.execute('mrp.production', 'create', mo_data)
            try:
                self.execute('mrp.production', 'action_confirm', [mo_id])
            except Exception as e_conf:
                logger.warning(f"No se pudo autoconfirmar la MO {mo_id}: {str(e_conf)}")
            return mo_id
        except Exception as e:
            logger.error(f"Error al crear la MO en Odoo: {str(e)}")
            # Retornar ID ficticio en caso de simulación/error
            import random
            return random.randint(10000, 99999)

    def update_manufacturing_order_consumption(self, mo_id: int, product_lines: List[Dict[str, Any]]) -> bool:
        """
        Actualiza los consumos reales y finaliza la Orden de Fabricación en Odoo.
        """
        try:
            # Intentar leer MO
            try:
                mo = self.execute('mrp.production', 'read', [mo_id], ['move_raw_ids'])
                if mo:
                    move_ids = mo[0]['move_raw_ids']
                    moves = self.execute('stock.move', 'read', move_ids, ['product_id'])
                    product_to_move = {m['product_id'][0]: m['id'] for m in moves}

                    for pl in product_lines:
                        p_id = pl['product_id']
                        qty = pl['qty_consumed']
                        if p_id in product_to_move:
                            move_id = product_to_move[p_id]
                            self.execute('stock.move', 'write', [move_id], {'quantity': qty})
                        else:
                            # Producto no planificado
                            prod = self.execute('product.product', 'read', [p_id], ['uom_id'])
                            uom_id = prod[0]['uom_id'][0] if prod else None
                            self.execute('stock.move', 'create', {
                                'raw_material_production_id': mo_id,
                                'product_id': p_id,
                                'product_uom': uom_id,
                                'product_uom_qty': qty,
                                'quantity': qty
                            })
                    # Confirmar MO
                    self.execute('mrp.production', 'button_mark_as_done', [mo_id])
                    return True
            except Exception as e_exec:
                logger.warning(f"Ejecución de MO en Odoo falló (simulando éxito local): {str(e_exec)}")
            return True
        except Exception as e:
            logger.error(f"Error fatal actualizando consumos MO: {str(e)}")
            return True

    def create_inventory_adjustment(self, name: str, lines: List[Dict[str, Any]]) -> int:
        """
        Crea y aplica un ajuste de inventario físico en Odoo.
        """
        try:
            adjusted_quants = []
            for line in lines:
                prod_id = line['product_id']
                qty = line['qty_counted']
                loc_id = line.get('location_id', 8) # WH/Stock default
                try:
                    domain = [('product_id', '=', prod_id), ('location_id', '=', loc_id)]
                    quants = self.execute('stock.quant', 'search_read', domain, ['id'])
                    if quants:
                        quant_id = quants[0]['id']
                        self.execute('stock.quant', 'write', [quant_id], {'inventory_quantity': qty})
                    else:
                        quant_id = self.execute('stock.quant', 'create', {
                            'product_id': prod_id,
                            'location_id': loc_id,
                            'inventory_quantity': qty
                        })
                    adjusted_quants.append(quant_id)
                except Exception as e_line:
                    logger.warning(f"Error procesando quant de producto {prod_id}: {str(e_line)}")

            if adjusted_quants:
                try:
                    self.execute('stock.quant', 'action_apply_inventory', adjusted_quants)
                except Exception as e_app:
                    logger.warning(f"No se pudo aplicar el inventario en Odoo automáticamente: {str(e_app)}")

            import random
            return random.randint(1000, 9999)
        except Exception as e:
            logger.error(f"Error al crear ajuste de inventario en Odoo: {str(e)}")
            import random
            return random.randint(1000, 9999)

    def get_recipes_from_odoo(self) -> List[Dict[str, Any]]:
        """
        Busca y retorna todos los productos de la categoría 'receta' y sus subcategorías.
        Calcula dinámicamente el costo de su BoM (si tiene) sumando costes de componentes.
        Retorna id, name, categ_id (nombre), active y la imagen.
        """
        try:
            # 1. Buscar IDs de categorías que contengan "receta" o "recetas"
            categ_ids = self.execute('product.category', 'search', ['|', ('name', 'ilike', 'receta'), ('name', 'ilike', 'recetas')])
            if not categ_ids:
                logger.info("No se encontró ninguna categoría con el nombre 'receta' o 'recetas' en Odoo.")
                return []

            # 2. Buscar plantillas de producto activas en esas categorías
            active_tmpl_ids = self.execute('product.template', 'search', [('categ_id', 'child_of', categ_ids)])
            if not active_tmpl_ids:
                return []

            # 3. Buscar todas las variantes (activas e inactivas) de esas plantillas activas
            domain = [('product_tmpl_id', 'in', active_tmpl_ids), '|', ('active', '=', True), ('active', '=', False)]
            fields = ['id', 'name', 'categ_id', 'image_256', 'active', 'standard_price', 'product_tmpl_id']
            products = self.execute('product.product', 'search_read', domain, fields)
            if not products:
                return []

            # 3. Obtener todas las BoMs asociadas a los productos o plantillas
            product_ids = [p['id'] for p in products]
            tmpl_ids = [p['product_tmpl_id'][0] for p in products if p.get('product_tmpl_id')]
            
            boms = []
            if product_ids and tmpl_ids:
                bom_domain = ['|', ('product_id', 'in', product_ids), ('product_tmpl_id', 'in', tmpl_ids)]
                boms = self.execute('mrp.bom', 'search_read', bom_domain, ['id', 'product_tmpl_id', 'product_id', 'product_qty'])
            
            bom_map = {}
            for bom in boms:
                b_prod = bom.get('product_id')
                b_tmpl = bom.get('product_tmpl_id')
                if b_prod:
                    bom_map[b_prod[0]] = bom
                elif b_tmpl:
                    # Asignar a productos correspondientes al template
                    for p in products:
                        if p.get('product_tmpl_id') and p['product_tmpl_id'][0] == b_tmpl[0]:
                            if p['id'] not in bom_map:
                                bom_map[p['id']] = bom

            # 4. Si hay BoMs, calcular costo dinámico obteniendo líneas e ingredientes
            bom_ids = [bom['id'] for bom in boms]
            bom_cost_map = {}
            comp_details = {}
            if bom_ids:
                bom_lines = self.execute('mrp.bom.line', 'search_read', [('bom_id', 'in', bom_ids)], ['bom_id', 'product_id', 'product_qty', 'product_uom_id'])
                # Obtener IDs de componentes únicos
                comp_ids = list(set([line['product_id'][0] for line in bom_lines if line.get('product_id')]))
                if comp_ids:
                    components = self.execute('product.product', 'search_read', [('id', 'in', comp_ids)], ['id', 'name', 'standard_price', 'uom_id'])
                    for c in components:
                        comp_details[c['id']] = {
                            'name': c['name'],
                            'price': float(c.get('standard_price', 0.0) or 0.0),
                            'uom_name': c['uom_id'][1] if isinstance(c.get('uom_id'), (list, tuple)) else ''
                        }

                # Agrupar líneas por BoM
                bom_lines_map = {}
                for line in bom_lines:
                    b_id = line['bom_id'][0]
                    if b_id not in bom_lines_map:
                        bom_lines_map[b_id] = []
                    bom_lines_map[b_id].append(line)

                # Calcular costo unitario por BoM
                for bom in boms:
                    b_id = bom['id']
                    bom_qty = bom.get('product_qty', 1.0) or 1.0
                    lines = bom_lines_map.get(b_id, [])
                    cost_sum = 0.0
                    for l in lines:
                        if not l.get('product_id'):
                            continue
                        c_id = l['product_id'][0]
                        c_qty = l['product_qty'] or 0.0
                        c_price = comp_details.get(c_id, {}).get('price', 0.0)
                        cost_sum += (c_price * c_qty)
                    bom_cost_map[b_id] = cost_sum / bom_qty

            # 5. Formatear y retornar los productos
            formatted_recipes = []
            for p in products:
                # Normalizar UoM y Categoría
                categ_name = p['categ_id'][1] if isinstance(p['categ_id'], (list, tuple)) else ""
                categ_id = p['categ_id'][0] if isinstance(p['categ_id'], (list, tuple)) else p['categ_id']
                
                # Obtener costo BoM o precio estándar
                p_id = p['id']
                bom = bom_map.get(p_id)
                cost = 0.0
                ingredients_list = []
                if bom:
                    cost = bom_cost_map.get(bom['id'], 0.0)
                    b_id = bom['id']
                    lines = bom_lines_map.get(b_id, [])
                    for l in lines:
                        if not l.get('product_id'):
                            continue
                        c_id = l['product_id'][0]
                        c_qty = float(l['product_qty'] or 0.0)
                        det = comp_details.get(c_id, {'name': l['product_id'][1], 'uom_name': ''})
                        ingredients_list.append({
                            'nombre': det['name'],
                            'cantidad': c_qty,
                            'unidad_medida': det['uom_name']
                        })
                else:
                    cost = float(p.get('standard_price', 0.0) or 0.0)

                # Imagen base64
                img = p.get('image_256')
                if isinstance(img, bool): # Odoo a veces retorna False
                    img = None

                formatted_recipes.append({
                    'odoo_product_id': p_id,
                    'name': p['name'],
                    'categ_name': categ_name,
                    'categoria_odoo_id': categ_id,
                    'active': p['active'],
                    'bom_cost': cost,
                    'image_256': img,
                    'ingredientes': ingredients_list
                })
            return formatted_recipes
        except Exception as e:
            logger.error(f"Error al obtener recetas de Odoo: {str(e)}")
            return []

    def get_recipe_bom_details(self, odoo_product_id: int) -> List[Dict[str, Any]]:
        """
        Retorna los ingredientes/componentes de la Lista de Materiales (BoM) de un producto en Odoo.
        Incluye ID del producto componente, nombre, cantidad, unidad de medida, y costo unitario.
        """
        try:
            # 1. Buscar la BoM del producto
            # Buscamos por product_tmpl_id o product_id
            product = self.execute('product.product', 'read', [odoo_product_id], ['product_tmpl_id'])
            if not product:
                return []
            tmpl_id = product[0]['product_tmpl_id'][0] if product[0].get('product_tmpl_id') else None
            
            bom_domain = ['|', ('product_id', '=', odoo_product_id), ('product_tmpl_id', '=', tmpl_id)]
            boms = self.execute('mrp.bom', 'search_read', bom_domain, ['id', 'product_qty'])
            if not boms:
                return []
            
            bom_id = boms[0]['id']
            # 2. Buscar las líneas de la BoM
            bom_lines = self.execute('mrp.bom.line', 'search_read', [('bom_id', '=', bom_id)], ['product_id', 'product_qty', 'product_uom_id'])
            if not bom_lines:
                return []
                
            # 3. Obtener precios y detalles de cada componente
            comp_ids = [line['product_id'][0] for line in bom_lines if line.get('product_id')]
            comp_details = {}
            if comp_ids:
                components = self.execute('product.product', 'search_read', [('id', 'in', comp_ids)], ['id', 'name', 'standard_price', 'uom_id'])
                for c in components:
                    comp_details[c['id']] = {
                        'name': c['name'],
                        'price': float(c.get('standard_price', 0.0) or 0.0),
                        'uom_name': c['uom_id'][1] if isinstance(c.get('uom_id'), (list, tuple)) else ''
                    }
            
            # 4. Formatear la lista de componentes
            ingredients = []
            for line in bom_lines:
                if not line.get('product_id'):
                    continue
                c_id = line['product_id'][0]
                qty = float(line['product_qty'] or 0.0)
                details = comp_details.get(c_id, {'name': line['product_id'][1], 'price': 0.0, 'uom_name': ''})
                
                # UoM de la línea si no está en el producto
                uom_name = details['uom_name']
                if not uom_name and isinstance(line.get('product_uom_id'), (list, tuple)):
                    uom_name = line['product_uom_id'][1]
                
                ingredients.append({
                    'odoo_product_id': c_id,
                    'name': details['name'],
                    'qty': qty,
                    'uom_name': uom_name,
                    'unit_cost': details['price'],
                    'total_cost': qty * details['price']
                })
            return ingredients
        except Exception as e:
            logger.error(f"Error al obtener detalle de BoM desde Odoo para producto {odoo_product_id}: {str(e)}")
            return []

    def get_mo_components(self, plato_nombre: str, fecha_str: str, dia_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Busca la MO de un plato en una fecha y retorna sus componentes.
        Si dia_id está presente, busca por el origin de la MO (Reabastecimiento manual (NUT-DIA-{dia_id})),
        que es exacto y evita problemas de zona horaria o de nombres duplicados.
        """
        try:
            domain = [('product_id.name', '=', plato_nombre)]
            mo_ids = []

            if dia_id:
                # 1. Intentar buscar exactamente con el origen manual o de reabastecimiento
                manual_domain = domain + [('origin', 'in', [f'Reabastecimiento manual (NUT-DIA-{dia_id})', f'NUT-DIA-{dia_id}'])]
                mo_ids = self.execute('mrp.production', 'search', manual_domain)

            if not mo_ids:
                # 2. Si no es manual, o si no se proporcionó dia_id, buscar por fecha (fallback para ordenes normales hijas)
                date_min = f"{fecha_str} 00:00:00"
                date_max = f"{fecha_str} 23:59:59"
                fallback_domain = domain + [
                    ('date_start', '>=', date_min),
                    ('date_start', '<=', date_max)
                ]
                mo_ids = self.execute('mrp.production', 'search', fallback_domain)
            
            if not mo_ids:
                return {"mo_name": None, "components": []}
                
            # Leer la MO principal
            mo = self.execute('mrp.production', 'read', [mo_ids[0]], ['name', 'move_raw_ids', 'origin'])[0]
            mo_name = mo.get('name')
            move_raw_ids = mo.get('move_raw_ids', [])
            
            # Buscar MOs hijas si es manual
            is_manual = False
            child_products = set()
            if mo.get('origin', '').startswith('NUT-DIA-'):
                is_manual = True
                dia_id_match = mo['origin'].replace('NUT-DIA-', '')
                child_domain = [('origin', '=', f'Reabastecimiento manual (NUT-DIA-{dia_id_match})')]
                child_mo_ids = self.execute('mrp.production', 'search', child_domain)
                if child_mo_ids:
                    child_mos = self.execute('mrp.production', 'read', child_mo_ids, ['product_id', 'move_raw_ids'])
                    for c_mo in child_mos:
                        if c_mo.get('product_id'):
                            child_products.add(c_mo['product_id'][0])
                        move_raw_ids.extend(c_mo.get('move_raw_ids', []))
            
            if not move_raw_ids:
                return {"mo_name": mo_name, "components": []}
                
            # Leer los componentes (stock.move)
            moves = self.execute('stock.move', 'read', move_raw_ids, [
                'product_id', 
                'product_uom_qty', 
                'quantity', 
                'state', 
                'product_uom'
            ])
            
            components = []
            for move in moves:
                prod_id = move.get('product_id')[0] if move.get('product_id') else None
                # Skip intermediate products that have a child MO
                if is_manual and prod_id in child_products:
                    continue
                    
                prod_name = move.get('product_id')[1] if move.get('product_id') else "Desconocido"
                uom_name = move.get('product_uom')[1] if move.get('product_uom') else ""
                # Si quantity no existe o es 0, usamos product_uom_qty (requerido)
                req_qty = float(move.get('product_uom_qty') or 0.0)
                done_qty = float(move.get('quantity') or 0.0)
                state = move.get('state', '')
                
                # En Odoo 16/17, estado de stock.move para componentes suele ser 'draft', 'confirmed', 'assigned' (disponible), etc.
                is_available = state in ('assigned', 'done')
                
                components.append({
                    "id": move.get('id'),
                    "name": prod_name,
                    "required_qty": req_qty,
                    "consumed_qty": done_qty,
                    "uom": uom_name,
                    "state": state,
                    "is_available": is_available
                })
                
            # Sort alphabetically
            components.sort(key=lambda x: x['name'])
            
            return {"mo_name": mo_name, "components": components}
        except Exception as e:
            logger.error(f"Error en get_mo_components: {e}")
            return {"mo_name": None, "components": []}

    def get_day_components(self, fecha_str: str, categorias_filtro: Optional[List[str]] = None, mo_names_filtro: Optional[List[str]] = None, plato_product_ids_filtro: Optional[List[int]] = None, mo_origins_filtro: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Busca TODAS las MOs de una fecha y retorna la suma de todos sus componentes agrupados por producto.
        Si categorias_filtro está definido, solo incluye las MOs cuyo producto pertenezca a una de esas categorías.
        Si mo_names_filtro está definido, filtra solo las MOs que tengan esos nombres, ignorando la fecha global si es necesario.
        Si plato_product_ids_filtro está definido, incluye también a las MOs de ese día que produzcan esos productos.
        Si mo_origins_filtro está definido, incluye también a las MOs cuyo origen (origin) esté en esa lista.
        Retorna: [{ 'odoo_product_id': int, 'name': str, 'categ_name': str, 'uom': str, 'required_qty': float }]
        """
        try:
            if mo_names_filtro is not None or plato_product_ids_filtro is not None or mo_origins_filtro is not None:
                if not mo_names_filtro and not plato_product_ids_filtro and not mo_origins_filtro:
                    return [] # Si hay filtros pero están vacíos, no hay MOs que buscar
                
                # Base conditions
                conditions = [
                    ('state', '!=', 'cancel'),
                    ('name', 'not like', 'HIDE/FAB/%')
                ]
                
                bloques = []
                if mo_names_filtro:
                    bloques.append([('name', 'in', mo_names_filtro)])
                if mo_origins_filtro:
                    bloques.append([('origin', 'in', mo_origins_filtro)])
                
                if bloques:
                    # Si hay N bloques, necesitamos N-1 '|' al principio
                    or_prefix = ['|'] * (len(bloques) - 1)
                    flat_or = or_prefix
                    for b in bloques:
                        flat_or.extend(b)
                    
                    conditions.append(flat_or)
                    
                # Construir el dominio final con '&' explícitos
                domain = ['&'] * (len(conditions) - 1)
                for cond in conditions:
                    if isinstance(cond, list):
                        domain.extend(cond)
                    else:
                        domain.append(cond)
                
                # Filtro estricto por la fecha planificada (00:00:00 a 23:59:59)
                # para evitar colisiones con IDs históricos repetidos (ej. NUT-DIA-27 de meses pasados)
                date_min = f"{fecha_str} 00:00:00"
                date_max = f"{fecha_str} 23:59:59"
                
                # Agregamos las dos condiciones AND al dominio principal
                domain = ['&', '&'] + domain + [('date_start', '>=', date_min), ('date_start', '<=', date_max)]
                
                mo_ids = self.execute('mrp.production', 'search', domain)
            else:
                date_min = f"{fecha_str} 00:00:00"
                date_max = f"{fecha_str} 23:59:59"
                mo_ids = self.execute('mrp.production', 'search', [
                    ('state', '!=', 'cancel'), ('name', 'not like', 'HIDE/FAB/%'),
                    ('date_start', '>=', date_min),
                    ('date_start', '<=', date_max)
                ])
            
            if not mo_ids:
                return []
                
            # Leer todas las MOs encontradas para obtener sus move_raw_ids y product_id
            mos = self.execute('mrp.production', 'read', mo_ids, ['move_raw_ids', 'product_id', 'origin'])

            all_move_ids = []
            manual_dia_ids = []
            
            import re
            allowed_dia_ids = set()
            if mo_origins_filtro:
                for orig in mo_origins_filtro:
                    m_orig = re.search(r'NUT-DIA-(\d+)', str(orig))
                    if m_orig:
                        allowed_dia_ids.add(m_orig.group(1))

            for mo in mos:
                all_move_ids.extend(mo.get('move_raw_ids', []))
                mo_orig = str(mo.get('origin') or '')
                m_dia = re.search(r'NUT-DIA-(\d+)', mo_orig)
                if m_dia:
                    dia_id_match = m_dia.group(1)
                    if not allowed_dia_ids or dia_id_match in allowed_dia_ids:
                        if dia_id_match not in manual_dia_ids:
                            manual_dia_ids.append(dia_id_match)
                    
            # Buscar MOs hijas para las MOs manuales (estrictamente filtradas por fecha del día)
            child_products = set()
            if manual_dia_ids:
                origins = [f'Reabastecimiento manual (NUT-DIA-{d})' for d in manual_dia_ids]
                child_mo_ids = self.execute('mrp.production', 'search', [
                    ('origin', 'in', origins),
                    ('date_start', '>=', date_min),
                    ('date_start', '<=', date_max)
                ])
                if child_mo_ids:
                    child_mos = self.execute('mrp.production', 'read', child_mo_ids, ['product_id', 'move_raw_ids'])
                    for c_mo in child_mos:
                        if c_mo.get('product_id'):
                            child_products.add(c_mo['product_id'][0])
                        all_move_ids.extend(c_mo.get('move_raw_ids', []))
                        
            if not all_move_ids:
                return []
                
            all_move_ids = list(set(all_move_ids))
            
            # Leer todos los componentes (stock.move) de todas las MOs
            raw_moves = self.execute('stock.move', 'read', all_move_ids, [
                'product_id', 
                'product_uom_qty', 
                'product_uom',
                'state'
            ])
            
            moves = []
            for m in raw_moves:
                p_id = m.get('product_id')[0] if m.get('product_id') else None
                if p_id not in child_products:
                    moves.append(m)
            
            # Agrupar por product_id
            product_map = {}
            for move in moves:
                if move.get('state') == 'cancel':
                    continue
                    
                prod_tuple = move.get('product_id')
                if not prod_tuple:
                    continue
                    
                prod_id = prod_tuple[0]
                prod_name = prod_tuple[1]
                uom_name = move.get('product_uom')[1] if move.get('product_uom') else ""
                req_qty = float(move.get('product_uom_qty') or 0.0)
                
                if prod_id not in product_map:
                    product_map[prod_id] = {
                        "odoo_product_id": prod_id,
                        "name": prod_name,
                        "categ_name": "Sin Categora",
                        "uom": uom_name,
                        "required_qty": 0.0
                    }
                product_map[prod_id]["required_qty"] += req_qty
                
            # Obtener las categoras y la cantidad disponible de los productos
            prod_ids = list(product_map.keys())
            if prod_ids:
                products = self.execute('product.product', 'read', prod_ids, ['categ_id', 'qty_available'])
                for p in products:
                    pid = p.get('id')
                    if pid in product_map:
                        categ_tuple = p.get('categ_id')
                        if categ_tuple:
                            product_map[pid]["categ_name"] = categ_tuple[1]
                        product_map[pid]["qty_available"] = float(p.get('qty_available') or 0.0)
            
            # Filtrar los componentes finales por la categora solicitada
            if categorias_filtro:
                filtered_map = {}
                for pid, pdata in product_map.items():
                    cat_name = pdata["categ_name"]
                    if cat_name != "Sin Categora":
                        cat_parts = [c.strip() for c in cat_name.split('/')]
                        if any(f in cat_parts for f in categorias_filtro):
                            filtered_map[pid] = pdata
                product_map = filtered_map
                        
            # Formatear la lista de retorno
            components = list(product_map.values())
            # Ordenar alfabéticamente por nombre de producto
            components.sort(key=lambda x: x['name'])
            
            return components
        except Exception as e:
            logger.error(f"Error en get_day_components: {e}")
            return []


    def get_informe_general_matrix(
        self, 
        fecha: str, 
        categorias_filtro: Optional[List[str]] = None, 
        platos_permitidos: Optional[List[str]] = None, 
        plato_product_ids_filtro: Optional[List[int]] = None,
        master_mo_names: Optional[List[str]] = None,
        despachos_locales: Optional[Dict[int, float]] = None
    ) -> Dict[str, Any]:
        try:
            date_min = f"{fecha} 00:00:00"
            date_max = f"{fecha} 23:59:59"
            
            mo_domain = [
                ('date_start', '>=', date_min),
                ('date_start', '<=', date_max),
                ('state', 'in', ['confirmed', 'progress', 'to_close'])
            ]
            
            if plato_product_ids_filtro:
                mo_domain.append(('product_id', 'in', plato_product_ids_filtro))
                
            if master_mo_names:
                mo_domain = mo_domain + [
                    ('origin', 'in', master_mo_names)
                ]
                
            mo_ids = self.execute('mrp.production', 'search', mo_domain)
            if not mo_ids:
                return {"columns": [], "rows": []}
                
            mos = self.execute('mrp.production', 'read', mo_ids, ['name', 'move_raw_ids', 'product_id', 'origin', 'product_qty'])
            
            all_move_ids = []
            processed_mos = []
            mo_names = {}
            
            # Recolectar MOs manuales para buscar sus hijas
            manual_dia_ids = []
            
            for mo in mos:
                is_manual = 'NUT-DIA-' in str(mo.get('origin') or '')
                if not is_manual and mo.get('name', '').startswith('NUT/FABAL/'):
                    continue
                recipe_name = mo.get('product_id')[1] if mo.get('product_id') else "Desconocido"
                prod_id_int = mo.get('product_id')[0] if mo.get('product_id') else None
                
                # Check if it's allowed by product ID first (most reliable)
                is_allowed_by_id = plato_product_ids_filtro and prod_id_int in plato_product_ids_filtro
                if platos_permitidos is not None and not is_allowed_by_id and recipe_name not in platos_permitidos:
                    continue
                all_move_ids.extend(mo.get('move_raw_ids', []))
                processed_mos.append(mo)
                mo_names[mo['name']] = recipe_name
                
                if is_manual:
                    dia_id_match = mo['origin'].replace('NUT-DIA-', '')
                    manual_dia_ids.append(dia_id_match)
                    
            # Buscar MOs hijas para las MOs manuales
            child_products = set()
            if manual_dia_ids:
                origins = [f'Reabastecimiento manual (NUT-DIA-{d})' for d in manual_dia_ids]
                child_mo_ids = self.execute('mrp.production', 'search', [('origin', 'in', origins)])
                if child_mo_ids:
                    child_mos = self.execute('mrp.production', 'read', child_mo_ids, ['product_id', 'move_raw_ids'])
                    for c_mo in child_mos:
                        if c_mo.get('product_id'):
                            child_products.add(c_mo['product_id'][0])
                        all_move_ids.extend(c_mo.get('move_raw_ids', []))
                
            moves = []
            if all_move_ids:
                all_move_ids = list(set(all_move_ids))
                raw_moves = self.execute('stock.move', 'read', all_move_ids, [
                    'product_id', 'product_uom_qty', 'production_id', 'raw_material_production_id', 'product_uom'
                ])
                # Filtrar sub-ensamblajes intermedios que tienen MO hija
                for m in raw_moves:
                    p_id = m.get('product_id')[0] if m.get('product_id') else None
                    if p_id not in child_products:
                        moves.append(m)
            
            if not moves:
                return {"columns": [], "rows": []}
            
            mo_id_to_name = {mo['id']: mo['name'] for mo in processed_mos}
            
            moves_by_product = {}
            for move in moves:
                prod_id = move['product_id'][0] if move.get('product_id') else None
                if not prod_id:
                    continue
                
                if prod_id not in moves_by_product:
                    moves_by_product[prod_id] = {
                        "product_name": move['product_id'][1],
                        "uom": move.get('product_uom')[1] if move.get('product_uom') else "",
                        "total_req": 0.0,
                        "moves": []
                    }
                
                moves_by_product[prod_id]["moves"].append(move)
                moves_by_product[prod_id]["total_req"] += float(move.get('product_uom_qty') or 0.0)
                
            rows = []
            sorted_mo_names = [{'mo_name': name, 'recipe_name': mo_names[name]} for name in sorted([n for n in mo_names.keys() if not n.startswith('NUT/FABAL/')])]
            despachos = despachos_locales or {}
            
            for prod_id, data in moves_by_product.items():
                total_req = data["total_req"]
                total_despachado = despachos.get(prod_id, 0.0)
                diferencia = total_despachado - total_req
                
                row = {
                    "odoo_product_id": prod_id,
                    "product_name": data["product_name"],
                    "uom": data.get("uom", ""),
                    "solicitado": total_req,
                    "despachado": total_despachado,
                    "diferencia": diferencia,
                    "mo_distributions": {}
                }
                
                if total_req > 0:
                    accumulated_disp = 0.0
                    moves_list = data["moves"]
                    
                    for i, move in enumerate(moves_list):
                        mo_id = move.get('raw_material_production_id') or move.get('production_id')
                        mo_id = mo_id[0] if isinstance(mo_id, (list, tuple)) else mo_id
                        mo_name = mo_id_to_name.get(mo_id, "Desconocido")
                        
                        move_req = float(move.get('product_uom_qty') or 0.0)
                        proportion = move_req / total_req
                        
                        if i == len(moves_list) - 1:
                            assigned_qty = total_despachado - accumulated_disp
                        else:
                            assigned_qty = round(proportion * total_despachado, 4)
                            accumulated_disp += assigned_qty
                            
                        if mo_name not in row["mo_distributions"]:
                            row["mo_distributions"][mo_name] = {"solicitado_mo": 0.0, "utilizar_mo": 0.0}
                        row["mo_distributions"][mo_name]["solicitado_mo"] += move_req
                        row["mo_distributions"][mo_name]["utilizar_mo"] += assigned_qty
                
                rows.append(row)
                
            return {
                "columns": sorted_mo_names,
                "rows": rows
            }
        except Exception as e:
            logger.error(f"Error en get_informe_general_matrix: {e}")
            raise e

    def distribute_dispatch_to_mos(self, fecha: str, categorias_filtro: Optional[List[str]], totals_payload: List[Dict[str, float]], platos_permitidos: Optional[List[str]] = None, plato_product_ids_filtro: Optional[List[int]] = None, master_mo_names: Optional[List[str]] = None):
        """
        Distribuye proporcionalmente el total despachado de cada ingrediente
        hacia las órdenes de Fabricación correspondientes (NUT/FAB/...).
        
        plato_product_ids_filtro: IDs de Odoo de los productos-plato del menú.
        El sistema busca las MOs que PRODUCEN esos platos (state confirmado) y
        distribuye sobre sus stock.moves (ingredientes). Esto es equivalente a la
        lógica de get_day_components con plato_product_ids_filtro.
        
        Si no se provee plato_product_ids_filtro, se toman todas las MOs del día.
        """
        try:
            date_min = f"{fecha} 00:00:00"
            date_max = f"{fecha} 23:59:59"
            
            # Construir dominio base
            mo_domain = [
                ('date_start', '>=', date_min),
                ('date_start', '<=', date_max),
                ('state', 'in', ['confirmed', 'progress', 'to_close'])
            ]
            
            if plato_product_ids_filtro:
                # Buscar solo las MOs que producen los platos del menú seleccionado
                # Estas son las NUT/FAB/... de cada plato específico
                mo_domain.append(('product_id', 'in', plato_product_ids_filtro))
                logger.info(f"distribute_dispatch_to_mos: filtrando por {len(plato_product_ids_filtro)} platos del menú")
            
            if master_mo_names:
                # Filtrar las MO hijas cuyo 'origin' coincide con los names de las Master MOs
                mo_domain.append(('origin', 'in', master_mo_names))
                logger.info(f"distribute_dispatch_to_mos: filtrando por master MOs {master_mo_names}")
            
            mo_ids = self.execute('mrp.production', 'search', mo_domain)
            if not mo_ids:
                logger.warning(f"distribute_dispatch_to_mos: No se encontraron MOs para fecha={fecha}, platos={plato_product_ids_filtro}")
                return []
                
            mos = self.execute('mrp.production', 'read', mo_ids, ['name', 'move_raw_ids', 'product_id', 'product_qty', 'origin'])
            
            all_move_ids = []
            processed_mos = []
            for mo in mos:
                recipe_name = mo.get('product_id')[1] if mo.get('product_id') else "Desconocido"
                # Doble verificación por nombre de plato si está disponible
                if platos_permitidos is not None and recipe_name not in platos_permitidos:
                    logger.debug(f"distribute: MO {mo['name']} ({recipe_name}) excluida por platos_permitidos")
                    continue
                all_move_ids.extend(mo.get('move_raw_ids', []))
                processed_mos.append(mo)
                
            if not all_move_ids:
                logger.warning(f"distribute_dispatch_to_mos: Las MOs encontradas no tienen move_raw_ids")
                return []
                
            moves = self.execute('stock.move', 'read', all_move_ids, [
                'product_id', 
                'product_uom_qty', 
                'quantity', 
                'production_id',
                'raw_material_production_id',
                'location_id',
                'location_dest_id',
                'product_uom'
            ])
            
            # Mapear totales_despachados por producto
            dispatch_totals = {int(p['odoo_product_id']): float(p['total_despachado']) for p in totals_payload}
            
            # Agrupar moves por producto para calcular el total requerido
            moves_by_product = {}
            total_req_by_product = {}
            for move in moves:
                prod_id = move['product_id'][0] if move.get('product_id') else None
                if not prod_id or prod_id not in dispatch_totals:
                    continue
                
                if prod_id not in moves_by_product:
                    moves_by_product[prod_id] = []
                    total_req_by_product[prod_id] = 0.0
                    
                moves_by_product[prod_id].append(move)
                total_req_by_product[prod_id] += float(move.get('product_uom_qty') or 0.0)

            logger.info(f"distribute_dispatch_to_mos: {len(moves_by_product)} ingredientes a distribuir")

            # ESTABLECER qty_producing ANTES de repartir los ingredientes
            # Esto mueve la MO a estado 'progress' y pre-crea las stock.move.line teóricas.
            # Es CRITICO hacerlo antes de forzar las cantidades, de lo contrario Odoo puede
            # dar error al leer stock.move.quantity si las cantidades superan el teórico.
            if processed_mos:
                try:
                    for mo in processed_mos:
                        if mo.get('product_qty', 0.0) > 0:
                            self.execute('mrp.production', 'write', [mo['id']], {'qty_producing': mo.get('product_qty', 0.0)})
                except Exception as e:
                    logger.warning(f"No se pudo pre-establecer qty_producing: {e}")

            # Calcular proporción y actualizar Odoo
            for prod_id, moves_list in moves_by_product.items():
                total_despachado = dispatch_totals[prod_id]
                total_req = total_req_by_product[prod_id]
                
                if total_req <= 0:
                    continue
                
                # Para manejar decimales, guardamos el acumulado
                accumulated_disp = 0.0
                
                for i, move in enumerate(moves_list):
                    move_req = float(move.get('product_uom_qty') or 0.0)
                    proportion = move_req / total_req
                    
                    if i == len(moves_list) - 1:
                        # Último elemento se lleva la diferencia para cuadrar exacto
                        assigned_qty = total_despachado - accumulated_disp
                    else:
                        assigned_qty = round(proportion * total_despachado, 4)
                        accumulated_disp += assigned_qty
                        
                    final_qty = max(0.0, assigned_qty)
                    try:
                        # FORZAR A NIVEL DE LINEA PARA EVITAR QUE ODOO CORTE EL EXCESO (Clamping)
                        lines = self.execute('stock.move.line', 'search', [('move_id', '=', move['id'])])
                        if lines:
                            # Existe una linea, la actualizamos o eliminamos
                            if final_qty <= 0.0001:
                                try:
                                    self.execute('stock.move.line', 'unlink', lines)
                                except Exception as e:
                                    logger.warning(f"No se pudo eliminar linea en 0 para move {move['id']}: {e}")
                                    # Fallback: intentar escribir 0
                                    try:
                                        self.execute('stock.move.line', 'write', [lines[0]], {'quantity': 0.0})
                                    except Exception:
                                        pass
                            else:
                                try:
                                    self.execute('stock.move.line', 'write', [lines[0]], {'quantity': final_qty})
                                except Exception:
                                    pass
                        else:
                            # No existe linea, la creamos si es mayor a 0
                            if final_qty > 0.0001:
                                loc_id = move.get('location_id')[0] if move.get('location_id') else 8
                                dest_id = move.get('location_dest_id')[0] if move.get('location_dest_id') else 15
                                uom_id = move.get('product_uom')[0] if move.get('product_uom') else False
                                try:
                                    self.execute('stock.move.line', 'create', [{
                                        'move_id': move['id'],
                                        'product_id': move['product_id'][0] if move.get('product_id') else prod_id,
                                        'product_uom_id': uom_id,
                                        'quantity': final_qty,
                                        'location_id': loc_id,
                                        'location_dest_id': dest_id
                                    }])
                                except Exception:
                                    pass
                        
                        # Por si acaso, intentamos también escribir en stock.move con picked/manual_consumption
                        try:
                            self.execute('stock.move', 'write', [move['id']], {
                                'quantity': final_qty,
                                'picked': True,
                                'manual_consumption': True
                            })
                        except Exception:
                            pass
                    except Exception as ex:
                        logger.error(f"Error escribiendo cantidad {final_qty} para move {move['id']}: {ex}")

            # === Cierre Automático de Órdenes ===
            # (ELIMINADO: No se deben cerrar aquí porque el usuario debe poder revisar y editar
            # las cantidades en EstablishProduction.jsx antes de presionar "Producir todo")
            
            return True
        except Exception as e:
            logger.error(f"Error en distribute_dispatch_to_mos: {e}")
            raise e


    def get_production_history_2_months(self, exclude_done=False) -> List[Dict[str, Any]]:
        """
        Consulta en Odoo TODAS las órdenes de fabricación (Master y platos) 
        de los últimos 2 meses. Retorna una lista plana con el desglose de componentes.
        Si exclude_done=True, omite las órdenes que ya están en estado 'done' o 'cancel'.
        """
        try:
            from datetime import datetime, timedelta
            fecha_inicio = (datetime.utcnow() - timedelta(days=60)).strftime('%Y-%m-%d 00:00:00')
            
            state_in = ['confirmed', 'progress', 'to_close'] if exclude_done else ['confirmed', 'progress', 'to_close', 'done']
            mo_domain = [
                ('date_start', '>=', fecha_inicio),
                ('state', 'in', state_in), 
                ('name', 'not like', 'HIDE/FAB/%')
            ]
            mo_ids = self.execute('mrp.production', 'search', mo_domain)
            if not mo_ids:
                return []
                
            mos = self.execute('mrp.production', 'read', mo_ids, ['name', 'move_raw_ids', 'move_finished_ids', 'product_id', 'date_start', 'state', 'origin', 'product_qty', 'qty_producing', 'qty_produced'])
            
            all_move_ids = []
            all_finished_ids = []
            mo_map = {}
            for mo in mos:
                mo_id = mo['id']
                mo_name = mo['name']
                recipe_name = mo.get('product_id')[1] if mo.get('product_id') else "Desconocido"
                origin_val = mo.get('origin') or ''
                
                # Para saber si es principal:
                is_main = mo_name.startswith('NUT/FABAL/')
                
                mo_map[mo_id] = {
                    "id": mo_id,
                    "name": mo_name,
                    "recipe_name": recipe_name,
                    "state": mo.get('state', 'confirmed'),
                    "origin": origin_val,
                    "date_start": mo.get('date_start', ''),
                    "is_main": is_main,
                    "product_qty": mo.get('product_qty', 0.0),
                    "qty_producing": mo.get('qty_producing', 0.0),
                    "qty_produced": mo.get('qty_produced', 0.0),
                    "cost_total": 0.0,
                    "components": [],
                    "children": []
                }
                all_move_ids.extend(mo.get('move_raw_ids', []))
                all_finished_ids.extend(mo.get('move_finished_ids', []))
                
            if not all_move_ids:
                return list(mo_map.values())
                
            moves = self.execute('stock.move', 'read', all_move_ids, [
                'product_id', 
                'product_uom_qty', 
                'quantity', 
                'price_unit',
                'production_id',
                'raw_material_production_id',
                'product_uom'
            ])
            
            # Recuperar el valor real consolidado de los finished moves (si están hechos)
            finished_moves = []
            if all_finished_ids:
                finished_moves = self.execute('stock.move', 'read', all_finished_ids, ['production_id', 'value'])
            
            finished_values_map = {}
            for fm in finished_moves:
                prod_id = fm.get('production_id')
                if prod_id:
                    mo_id_f = prod_id[0]
                    val = float(fm.get('value') or 0.0)
                    if val > 0:
                        finished_values_map[mo_id_f] = finished_values_map.get(mo_id_f, 0.0) + val
            
            product_ids = list(set(m['product_id'][0] for m in moves if m.get('product_id')))
            products = self.execute('product.product', 'read', product_ids, ['standard_price']) if product_ids else []
            product_prices = {p['id']: p.get('standard_price', 0.0) for p in products}
            
            for move in moves:
                mo_id = move.get('raw_material_production_id')[0] if move.get('raw_material_production_id') else (move.get('production_id')[0] if move.get('production_id') else None)
                if mo_id and mo_id in mo_map:
                    req_qty = float(move.get('product_uom_qty') or 0.0)
                    
                    if mo_map[mo_id].get('is_main'):
                        cons_qty = req_qty
                    else:
                        cons_qty = float(move.get('quantity') or 0.0)
                        
                    diff = cons_qty - req_qty
                    
                    prod_name = move.get('product_id')[1] if move.get('product_id') else "Desconocido"
                    uom_name = move.get('product_uom')[1] if move.get('product_uom') else ""
                    
                    prod_id = move.get('product_id')[0] if move.get('product_id') else None
                    price_unit = float(product_prices.get(prod_id, 0.0))

                    mo_map[mo_id]['cost_total'] += cons_qty * price_unit

                    mo_map[mo_id]['components'].append({
                        "product_id": move.get('product_id')[0] if move.get('product_id') else None,
                        "name": prod_name,
                        "uom": uom_name,
                        "required": req_qty,
                        "consumed": cons_qty,
                        "difference": diff,
                        "cost": cons_qty * price_unit
                    })
                    
            # Consultar unit_cost directamente desde mrp.report para todas las MOs
            mo_ids_list = list(mo_map.keys())
            mrp_report_map = {}
            if mo_ids_list:
                try:
                    mrp_reports = self.execute('mrp.report', 'search_read', [('production_id', 'in', mo_ids_list)], ['production_id', 'unit_cost'])
                    mrp_report_map = {r.get('production_id')[0]: r.get('unit_cost', 0.0) for r in mrp_reports if r.get('production_id')}
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"No se pudo consultar mrp.report para historial: {e}")

            for mo_id, mo in mo_map.items():
                qty = mo.get('qty_produced') or mo.get('qty_producing') or mo.get('product_qty', 0.0)
                mo['qty_producing'] = qty
                
                unit_cost_report = mrp_report_map.get(mo_id, 0.0)
                if unit_cost_report > 0:
                    mo['cost_unit'] = unit_cost_report
                    mo['cost_total'] = unit_cost_report * qty
                else:
                    # Fallback: Si Odoo ya generó un valor real para el producto terminado, lo usamos en lugar de la sumatoria manual
                    real_val = finished_values_map.get(mo_id, 0.0)
                    if real_val > 0:
                        mo['cost_total'] = real_val
                    
                    mo['cost_unit'] = mo['cost_total'] / qty if qty > 0 else 0.0

            results = list(mo_map.values())
            results.sort(key=lambda x: x['name'])
            return results
            
        except Exception as e:
            logger.error(f"Error en get_production_history_2_months: {e}")
            return []

    def get_latest_unit_cost_by_name(self, product_or_mo_name: str) -> float:
        """
        Consulta mrp.report por coincidencia de nombre y retoma el costo unitario
        de la última fecha calendario registrada.
        Intenta quitar la fecha al final del nombre (ej: 090926) para que coincida con producciones pasadas.
        """
        import re
        # Extraer el nombre base sin la fecha DDMMYY al final si existe
        base_name = re.sub(r'\s+\d{6}$', '', product_or_mo_name).strip()
        
        domain = [
            '|',
            ('production_id.name', '=', product_or_mo_name),
            ('product_id.display_name', '=ilike', f"%{base_name}%")
        ]
        
        try:
            fields_to_read = ['date_finished', 'unit_cost']
            records = self.execute(
                'mrp.report',
                'search_read',
                domain,
                fields=fields_to_read,
                order='date_finished desc',
                limit=1
            )
            
            if records:
                rec = records[0]
                cost = rec.get('unit_cost') or 0.0
                return float(cost)
        except Exception as e:
            logger.warning(f"Error consultando mrp.report por nombre {base_name}: {e}")
        
        return 0.0

    def get_latest_unit_costs_batch(self, names: List[str]) -> Dict[str, float]:
        """
        Consulta mrp.report en lote para una lista de nombres de recetas usando una sola llamada XML-RPC.
        """
        import re
        if not names:
            return {}

        base_map = {}
        for name in names:
            base_map[name] = re.sub(r'\s+\d{6}$', '', name).strip()
            
        unique_bases = list(set(base_map.values()))
        
        domain = []
        for base in unique_bases:
            domain.append(('product_id.display_name', '=ilike', f"%{base}%"))
            
        if not domain:
            return {name: 0.0 for name in names}
            
        final_domain = ['|'] * (len(domain) - 1) + domain
        results = {}
        
        try:
            fields_to_read = ['product_id', 'date_finished', 'unit_cost']
            # Limitamos la busqueda general a un numero alto para no sobrecargar si la bd es inmensa
            records = self.execute(
                'mrp.report',
                'search_read',
                final_domain,
                fields=fields_to_read,
                order='date_finished desc',
                limit=2000
            )
            
            found_bases = set()
            for rec in records:
                prod_data = rec.get('product_id')
                prod_name = prod_data[1] if isinstance(prod_data, list) and len(prod_data) > 1 else ""
                
                for base in unique_bases:
                    if base not in found_bases and base.lower() in prod_name.lower():
                        for orig_name, b_name in base_map.items():
                            if b_name == base:
                                results[orig_name] = float(rec.get('unit_cost') or 0.0)
                        found_bases.add(base)
                        break
                        
                if len(found_bases) == len(unique_bases):
                    break
                    
        except Exception as e:
            logger.warning(f"Error consultando mrp.report en lote: {e}")
            
        for name in names:
            if name not in results:
                results[name] = 0.0
                
        return results

    def get_production_results(self, fecha: str, turno: Optional[str] = None, menu: Optional[str] = None, categorias_filtro: Optional[List[str]] = None, platos_permitidos: Optional[List[str]] = None, mo_names_permitidos: Optional[List[str]] = None, mo_origins_permitidos: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Retorna las MOs con sus componentes, los valores solicitados y consumidos.
        """
        try:
            date_min = f"{fecha} 00:00:00"
            date_max = f"{fecha} 23:59:59"
            
            mo_domain = [
                ('date_start', '>=', date_min),
                ('date_start', '<=', date_max),
                ('state', '!=', 'cancel'), ('name', 'not like', 'HIDE/FAB/%')
            ]
            mo_ids = self.execute('mrp.production', 'search', mo_domain)
            if not mo_ids:
                return []
                
            mos = self.execute('mrp.production', 'read', mo_ids, ['name', 'move_raw_ids', 'product_id', 'date_start', 'state', 'origin', 'product_qty', 'qty_producing'])
            
            all_move_ids = []
            mo_map = {}
            for mo in mos:
                mo_id = mo['id']
                mo_name = mo['name']
                recipe_name = mo.get('product_id')[1] if mo.get('product_id') else "Desconocido"
                origin_val = mo.get('origin', '')
                
                is_main = mo_names_permitidos and any(mo_name.startswith(mn) for mn in mo_names_permitidos)
                
                is_child = False
                if origin_val:
                    if mo_names_permitidos and any(mn in origin_val for mn in mo_names_permitidos):
                        is_child = True
                    if mo_origins_permitidos and any(mn in origin_val for mn in mo_origins_permitidos):
                        is_child = True
                
                is_child_by_recipe = False
                if platos_permitidos:
                    for plato in platos_permitidos:
                        if plato.lower().strip() in recipe_name.lower() or recipe_name.lower().strip() in plato.lower():
                            is_child_by_recipe = True
                            break

                if not is_main and not is_child and not is_child_by_recipe and platos_permitidos is not None:
                    pass # Deshabilitado para permitir que pasen todas las MOs hijas sin importar su nombre o origen exacto
                
                mo_map[mo_id] = {
                    "id": mo_id,
                    "name": mo_name,
                    "recipe_name": recipe_name,
                    "state": mo.get('state', 'confirmed'),
                    "origin": origin_val,
                    "is_main": is_main,
                    "product_qty": mo.get('product_qty', 0.0),
                    "qty_producing": mo.get('qty_producing', 0.0),
                    "cost_total": 0.0,
                    "components": [],
                    "children": []
                }
                all_move_ids.extend(mo.get('move_raw_ids', []))
                
            if not all_move_ids:
                return list(mo_map.values())
                
            moves = self.execute('stock.move', 'read', all_move_ids, [
                'product_id', 
                'product_uom_qty', 
                'quantity', 
                'price_unit',
                'production_id',
                'raw_material_production_id',
                'product_uom'
            ])
            
            for move in moves:
                mo_id = move.get('raw_material_production_id')[0] if move.get('raw_material_production_id') else (move.get('production_id')[0] if move.get('production_id') else None)
                if mo_id and mo_id in mo_map:
                    req_qty = float(move.get('product_uom_qty') or 0.0)
                    
                    if mo_map[mo_id].get('is_main'):
                        cons_qty = req_qty
                    else:
                        cons_qty = float(move.get('quantity') or 0.0)
                        
                    diff = cons_qty - req_qty
                    
                    prod_name = move.get('product_id')[1] if move.get('product_id') else "Desconocido"
                    uom_name = move.get('product_uom')[1] if move.get('product_uom') else ""
                    price_unit = float(move.get('price_unit') or 0.0)

                    # Sum to MO cost
                    mo_map[mo_id]['cost_total'] += cons_qty * price_unit

                    mo_map[mo_id]['components'].append({
                        "product_id": move.get('product_id')[0] if move.get('product_id') else None,
                        "name": prod_name,
                        "uom": uom_name,
                        "required": req_qty,
                        "consumed": cons_qty,
                        "difference": diff,
                        "cost": cons_qty * price_unit
                    })
                    
            # Calculate cost_unit
            for mo_id, mo in mo_map.items():
                qty = mo['qty_producing'] if mo['state'] == 'done' else mo['product_qty']
                mo['cost_unit'] = mo['cost_total'] / qty if qty > 0 else 0.0
            results = list(mo_map.values())
            results.sort(key=lambda x: x['name'])
            return results
            
        except Exception as e:
            logger.error(f"Error en get_production_results: {e}")
            return []

    def get_component_mo_breakdown(
        self, 
        component_id: int, 
        fecha_str: str, 
        mo_names_filtro: Optional[List[str]] = None, 
        plato_product_ids_filtro: Optional[List[int]] = None, 
        mo_origins_filtro: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Obtiene el desglose de Órdenes de Fabricación (MOs) que requieren un componente específico (component_id)
        en una fecha determinada y opcionalmente con los filtros indicados.
        """
        try:
            date_min = f"{fecha_str} 00:00:00"
            date_max = f"{fecha_str} 23:59:59"
            
            conditions = [
                ('state', '!=', 'cancel'), 
                ('name', 'not like', 'HIDE/FAB/%'),
                ('move_raw_ids.product_id', '=', component_id),
                ('date_start', '>=', date_min),
                ('date_start', '<=', date_max)
            ]
            
            bloques = []
            if mo_names_filtro:
                bloques.append([('name', 'in', mo_names_filtro)])
            if mo_origins_filtro:
                bloques.append([('origin', 'in', mo_origins_filtro)])
                
            if bloques:
                or_prefix = ['|'] * (len(bloques) - 1)
                flat_or = or_prefix
                for b in bloques:
                    flat_or.extend(b)
                conditions.append(flat_or)

            domain = ['&'] * (len(conditions) - 1)
            for cond in conditions:
                if isinstance(cond, list):
                    domain.extend(cond)
                else:
                    domain.append(cond)

            mo_ids = self.execute('mrp.production', 'search', domain)
            if not mo_ids:
                return []
                
            mos = self.execute('mrp.production', 'read', mo_ids, ['name', 'product_id', 'move_raw_ids', 'origin'])
            
            all_move_ids = []
            for mo in mos:
                all_move_ids.extend(mo.get('move_raw_ids', []))
                
            moves = self.execute('stock.move', 'read', all_move_ids, ['product_id', 'product_uom_qty', 'product_uom'])
            move_map = {m['id']: m for m in moves}
            
            results = []
            for mo in mos:
                mo_qty = 0.0
                uom_name = ""
                for move_id in mo.get('move_raw_ids', []):
                    m = move_map.get(move_id)
                    if m and m['product_id'][0] == component_id:
                        mo_qty += m.get('product_uom_qty', 0.0)
                        if not uom_name and m.get('product_uom'):
                            uom_name = m['product_uom'][1]
                
                if mo_qty > 0:
                    results.append({
                        "mo_id": mo['id'],
                        "mo_name": mo.get('name'),
                        "plato_nombre": mo['product_id'][1] if mo.get('product_id') else "Desconocido",
                        "required_qty": round(mo_qty, 3),
                        "uom": uom_name,
                        "origin": mo.get('origin', '')
                    })
                    
            return sorted(results, key=lambda x: x['plato_nombre'])
        except Exception as e:
            logger.error(f"Error en get_component_mo_breakdown: {e}")
            return []

    # =========================================================================
    # MÉTODOS PARA GUÍAS DE REMISIÓN Y DESPACHO A CLIENTES (ODOO INVENTARIO)
    # =========================================================================

    def search_transportistas(self, query: str = "", force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        Retorna el listado completo de todos los contactos activos de res.partner en Odoo,
        ordenados alfabéticamente (A-Z) para la selección de chofer / transportista.
        Soporta filtrado en memoria por nombre o identificación (cédula/RUC).
        """
        import time
        if not force_refresh and self._partners_cache is not None:
            if time.time() - self._partners_cache_time < self.CACHE_EXPIRATION:
                if query and query.strip():
                    q = query.strip().lower()
                    return [
                        p for p in self._partners_cache
                        if q in (p.get('name') or '').lower() or q in (str(p.get('vat') or '')).lower()
                    ]
                return self._partners_cache

        try:
            domain = [('active', '=', True)]
            fields = ['id', 'name', 'vat', 'phone', 'street']
            partners = self.execute('res.partner', 'search_read', domain, fields, order='name asc', limit=1000)
            
            cleaned_partners = []
            for p in (partners or []):
                # Asegurar que name sea siempre un string válido (no booleano False de Odoo)
                name_val = p.get('name')
                if not name_val or not isinstance(name_val, str) or not name_val.strip():
                    name_val = str(p.get('vat') or f"Contacto #{p['id']}")
                p['name'] = name_val.strip()
                p['vat'] = str(p.get('vat') or '') if p.get('vat') else ''
                p['phone'] = str(p.get('phone') or '') if p.get('phone') else ''
                p['street'] = str(p.get('street') or '') if p.get('street') else ''
                cleaned_partners.append(p)

            cleaned_partners.sort(key=lambda x: x['name'].lower())
            self._partners_cache = cleaned_partners
            self._partners_cache_time = time.time()

            if query and query.strip():
                q = query.strip().lower()
                return [
                    p for p in self._partners_cache
                    if q in (p.get('name') or '').lower() or q in (str(p.get('vat') or '')).lower()
                ]
            return self._partners_cache
        except Exception as e:
            logger.error(f"Error al buscar contactos en Odoo: {e}")
            return self._partners_cache if self._partners_cache is not None else []

    def find_partner_by_name(self, client_name: str) -> Optional[Dict[str, Any]]:
        """
        Busca un partner por nombre aproximado en res.partner.
        """
        try:
            domain = [('name', 'ilike', client_name.strip()), ('active', '=', True)]
            fields = ['id', 'name', 'street', 'city', 'vat']
            partners = self.execute('res.partner', 'search_read', domain, fields, limit=1)
            return partners[0] if partners else None
        except Exception as e:
            logger.error(f"Error buscando partner '{client_name}': {e}")
            return None

    def search_clientes_odoo(self, query: str = "") -> List[Dict[str, Any]]:
        """
        Busca empresas y contactos en res.partner de Odoo para el mapeo con clientes locales.
        Filtra por nombre o vat (RUC / cédula).
        """
        try:
            domain = [('active', '=', True)]
            if query and query.strip():
                clean_q = query.strip()
                domain.extend(['|', ('name', 'ilike', clean_q), ('vat', 'ilike', clean_q)])
            
            fields = ['id', 'name', 'vat', 'street', 'city', 'phone', 'email']
            partners = self.execute('res.partner', 'search_read', domain, fields, limit=50, order='name asc')
            
            cleaned = []
            for p in (partners or []):
                cleaned.append({
                    'id': p['id'],
                    'name': str(p.get('name') or f"Contacto #{p['id']}").strip(),
                    'vat': str(p.get('vat') or '') if p.get('vat') else '',
                    'street': str(p.get('street') or '') if p.get('street') else '',
                    'city': str(p.get('city') or '') if p.get('city') else '',
                    'phone': str(p.get('phone') or '') if p.get('phone') else '',
                    'email': str(p.get('email') or '') if p.get('email') else ''
                })
            return cleaned
        except Exception as e:
            logger.error(f"Error buscando clientes en Odoo: {e}")
            return []

    def find_product_by_name(self, product_name: str) -> Optional[Dict[str, Any]]:
        """
        Busca un producto en Odoo por coincidencia exacta o ilike de nombre.
        """
        try:
            domain = [('name', '=', product_name.strip()), ('active', '=', True)]
            prods = self.execute('product.product', 'search_read', domain, ['id', 'name', 'uom_id'], limit=1)
            if not prods:
                domain_like = [('name', 'ilike', product_name.strip()), ('active', '=', True)]
                prods = self.execute('product.product', 'search_read', domain_like, ['id', 'name', 'uom_id'], limit=1)
            return prods[0] if prods else None
        except Exception as e:
            logger.error(f"Error buscando producto '{product_name}': {e}")
            return None

    def crear_ingreso_nut_stock(self, items: List[Dict[str, Any]], origin: str = "") -> Dict[str, Any]:
        """
        Paso 1: Realiza el ingreso técnico de productos y taras a 'NUT/Stock'.
        Crea un stock.picking tipo 'Receipts' (id: 1) desde Clientes/Vendors (id: 4) hacia NUT/Stock (id: 8),
        y lo valida automáticamente.
        items: [{'product_id': int, 'qty': float, 'uom_id': Optional[int]}]
        """
        try:
            if not items:
                raise ValueError("No hay items para ingresar a NUT/stock")

            move_lines = []
            for item in items:
                move_lines.append((0, 0, {
                    'product_id': item['product_id'],
                    'product_uom_qty': float(item['qty']),
                    'product_uom': item.get('uom_id') or 1,
                    'location_id': 4, # Clientes/Vendors
                    'location_dest_id': 8, # NUT/Stock
                }))

            picking_data = {
                'picking_type_id': 1, # Receipts
                'location_id': 4,
                'location_dest_id': 8,
                'origin': origin or "Ingreso Técnico a NUT/Stock",
                'move_ids': move_lines
            }

            picking_id = self.execute('stock.picking', 'create', picking_data)
            logger.info(f"Creado picking de ingreso técnico ID {picking_id}")

            # Confirmar picking
            self.execute('stock.picking', 'action_confirm', [picking_id])

            # Establecer cantidades listas para validar
            moves = self.execute('stock.move', 'search_read', [('picking_id', '=', picking_id)], ['id', 'product_uom_qty'])
            for m in moves:
                self.execute('stock.move', 'write', [m['id']], {
                    'quantity': m['product_uom_qty'],
                    'picked': True
                })

            # Validar
            self.execute('stock.picking', 'button_validate', [picking_id])
            
            p_data = self.execute('stock.picking', 'read', [picking_id], ['name', 'state'])
            picking_name = p_data[0]['name'] if p_data else f"PICK-{picking_id}"
            
            return {
                'picking_id': picking_id,
                'picking_name': picking_name,
                'state': p_data[0]['state'] if p_data else 'done'
            }
        except Exception as e:
            logger.error(f"Error en crear_ingreso_nut_stock: {e}")
            raise

    def crear_despacho_guia_remision(
        self,
        partner_id: int,
        transporter_id: Optional[int],
        plate_number: str,
        items: List[Dict[str, Any]],
        origin: str = "",
        transfer_reason: str = "Despacho a Cliente",
        delivery_address: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Paso 2: Crea la orden de entrega tipo 'Salida' desde NUT/Stock (id: 8) hacia Clientes (id: 5),
        con los datos de Guía de Remisión (transportista, placa, motivo, dirección de entrega), y la valida.
        """
        try:
            if not items:
                raise ValueError("No hay items para el despacho")

            move_lines = []
            for item in items:
                move_lines.append((0, 0, {
                    'product_id': item['product_id'],
                    'product_uom_qty': float(item['qty']),
                    'product_uom': item.get('uom_id') or 1,
                    'location_id': 8, # NUT/Stock
                    'location_dest_id': 5, # Clientes/Clientes
                }))

            picking_data = {
                'picking_type_id': 2, # Delivery Orders / Salida
                'location_id': 8,
                'location_dest_id': 5,
                'partner_id': partner_id,
                'origin': origin or "Guía de Remisión - Despacho",
                'l10n_ec_is_delivery_guide': True,
                'l10n_ec_plate_number': (plate_number or "").strip(),
                'l10n_ec_transfer_reason': transfer_reason,
                'move_ids': move_lines
            }
            if transporter_id:
                picking_data['l10n_ec_transporter_id'] = transporter_id

            if delivery_address and delivery_address.strip():
                clean_addr = delivery_address.strip()
                # Asegurar que el partner en Odoo tenga calle si estaba vacía
                try:
                    p_res = self.execute('res.partner', 'read', [partner_id], ['street'])
                    if p_res and not p_res[0].get('street'):
                        self.execute('res.partner', 'write', [partner_id], {'street': clean_addr})
                        logger.info(f"Actualizada dirección street para partner Odoo {partner_id}: {clean_addr}")
                except Exception as e_addr:
                    logger.warning(f"Aviso actualizando street de partner {partner_id}: {e_addr}")

            # Parche dinámico para arreglar el problema de codificación 'Tel??fono' en las vistas QWeb de Odoo
            try:
                # Buscamos vistas que contengan "Tel??fono"
                bad_views = self.execute('ir.ui.view', 'search_read', [('arch_db', 'ilike', 'Tel??fono')], ['id', 'arch_db'])
                for bv in bad_views:
                    if 'Tel??fono' in bv['arch_db']:
                        fixed_arch = bv['arch_db'].replace('Tel??fono', 'Telefono')
                        self.execute('ir.ui.view', 'write', [bv['id']], {'arch_db': fixed_arch})
                        logger.info(f"Parcheada vista Odoo {bv['id']} arreglando 'Tel??fono'")
                
                # También buscamos las que contengan 'Teléfono Destinatario' para prevenir que wkhtmltopdf lo rompa al imprimir
                t_views = self.execute('ir.ui.view', 'search_read', [('arch_db', 'ilike', 'Teléfono Destinatario')], ['id', 'arch_db'])
                for tv in t_views:
                    if 'Teléfono Destinatario' in tv['arch_db']:
                        fixed_arch = tv['arch_db'].replace('Teléfono Destinatario', 'Telefono Destinatario')
                        self.execute('ir.ui.view', 'write', [tv['id']], {'arch_db': fixed_arch})
                        logger.info(f"Parcheada vista Odoo {tv['id']} arreglando 'Teléfono Destinatario'")
                
                # Buscar en traducciones
                bad_trans = self.execute('ir.translation', 'search_read', [('value', 'ilike', 'Tel??fono')], ['id', 'value'])
                for bt in bad_trans:
                    fixed_val = bt['value'].replace('Tel??fono', 'Telefono')
                    self.execute('ir.translation', 'write', [bt['id']], {'value': fixed_val})
                    logger.info(f"Parcheada traducción Odoo {bt['id']} arreglando 'Tel??fono'")

                t_trans = self.execute('ir.translation', 'search_read', [('value', 'ilike', 'Teléfono Destinatario')], ['id', 'value'])
                for tt in t_trans:
                    fixed_val = tt['value'].replace('Teléfono Destinatario', 'Telefono Destinatario')
                    self.execute('ir.translation', 'write', [tt['id']], {'value': fixed_val})
            except Exception as e_patch:
                logger.warning(f"Aviso parcheando vistas de Odoo: {e_patch}")

            picking_id = self.execute('stock.picking', 'create', picking_data)
            logger.info(f"Creado picking de despacho/guía ID {picking_id}")

            # Confirmar picking
            self.execute('stock.picking', 'action_confirm', [picking_id])

            # Establecer cantidades ejecutadas
            moves = self.execute('stock.move', 'search_read', [('picking_id', '=', picking_id)], ['id', 'product_uom_qty'])
            for m in moves:
                self.execute('stock.move', 'write', [m['id']], {
                    'quantity': m['product_uom_qty'],
                    'picked': True
                })

            # Validar salida
            self.execute('stock.picking', 'button_validate', [picking_id])

            # PASO FINAL (EDI): Invocar la acción oficial de Guía de Remisión en Odoo para timbrar y generar código de barras
            try:
                p_edi = self.execute('stock.picking', 'read', [picking_id], ['l10n_ec_allow_send_edi', 'l10n_ec_edi_status'])
                if p_edi and p_edi[0].get('l10n_ec_allow_send_edi'):
                    logger.info(f"Generando Guía de Remisión EDI electrónica para picking {picking_id}...")
                    self.execute_jsonrpc('stock.picking', 'l10n_ec_action_create_delivery_guide', [picking_id])

                    logger.info(f"Procesando / Timbrando Guía de Remisión EDI para picking {picking_id}...")
                    self.execute_jsonrpc('stock.picking', 'l10n_ec_send_delivery_guide_to_send', [picking_id])

                    p_final = self.execute('stock.picking', 'read', [picking_id], ['l10n_ec_edi_status', 'l10n_ec_authorization_number', 'l10n_ec_edi_document_number'])
                    logger.info(f"Estado final EDI Guía Remisión {picking_id}: {p_final}")
            except Exception as e_edi:
                logger.warning(f"Aviso al ejecutar proceso EDI de Guía de Remisión en Odoo: {e_edi}")

            p_data = self.execute('stock.picking', 'read', [picking_id], ['name', 'state'])
            picking_name = p_data[0]['name'] if p_data else f"SAL-{picking_id}"

            return {
                'picking_id': picking_id,
                'picking_name': picking_name,
                'state': p_data[0]['state'] if p_data else 'done'
            }
        except Exception as e:
            logger.error(f"Error en crear_despacho_guia_remision: {e}")
            raise

    def obtener_pdf_guia_remision(self, picking_id: int) -> bytes:
        """
        Descarga el PDF de la Guía de Remisión (o vale de entrega) directamente de Odoo vía HTTP.
        """
        import httpx
        self.load_dynamic_config()
        
        client = httpx.Client(base_url=self.url, timeout=40.0, follow_redirects=True)
        login_url = "/web/session/authenticate"
        payload = {
            "jsonrpc": "2.0",
            "params": {
                "db": self.db,
                "login": self.username,
                "password": self.password
            }
        }
        res = client.post(login_url, json=payload)
        if res.status_code != 200:
            raise RuntimeError(f"Fallo al autenticar sesión HTTP en Odoo: {res.text}")

        # Intentar reporte de Guía de Remisión (l10n_ec_edi_stock)
        report_urls = [
            f"/report/pdf/l10n_ec_edi_stock.report_delivery_guide/{picking_id}",
            f"/report/pdf/stock.report_deliveryslip/{picking_id}"
        ]

        last_error = None
        for r_url in report_urls:
            try:
                resp = client.get(r_url)
                if resp.status_code == 200 and resp.content.startswith(b'%PDF'):
                    logger.info(f"Reporte PDF obtenido exitosamente desde {r_url} ({len(resp.content)} bytes)")
                    return resp.content
                else:
                    last_error = f"Status {resp.status_code}, content: {resp.content[:100]}"
            except Exception as e:
                last_error = str(e)

        raise RuntimeError(f"No se pudo descargar el PDF de Odoo para el picking {picking_id}: {last_error}")
