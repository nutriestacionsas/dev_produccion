import React, { useState, useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  ChefHat, 
  Warehouse, 
  CalendarDays, 
  Users, 
  LogOut, 
  Utensils, 
  ClipboardList, 
  User, 
  Database,
  Menu,
  X,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Recipes from './pages/Recipes';
import Trials from './pages/Trials';
import UsersPage from './pages/Users';
import PermissionsPage from './pages/Permissions';
import Planner from './pages/Planner';
import PlannerManufacturingOrders from './pages/PlannerManufacturingOrders';
import Dispatch from './pages/Dispatch';
import DispatchDayExecution from './pages/DispatchDayExecution';
import ClientDispatchWorkspace from './pages/ClientDispatch/ClientDispatchWorkspace';
import ServicePointsPlantDispatch from './pages/ServicePoints/ServicePointsPlantDispatch';
import Inventory from './pages/Inventory';
import Settings from './pages/Settings';
import EstablishProduction from './pages/EstablishProduction';
import Working from './pages/Working';
import Assets from './pages/Maintenance/Assets';
import PreventivePlans from './pages/Maintenance/PreventivePlans';
import WorkOrders from './pages/Maintenance/WorkOrders';
import ControlPoints from './pages/Maintenance/ControlPoints';
import Checklists from './pages/Maintenance/Checklists';
import DashboardGMAO from './pages/Maintenance/DashboardGMAO';
import logoCircular from './assets/logo_circular.png';
import logoHorizontal from './assets/logo_horizontal.png';

// Configuración de la dirección base del Backend API
export const API_BASE_URL = "/api";

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Cargar perfil de usuario si hay token
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      fetch(`${API_BASE_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Token inválido');
      })
      .then(data => {
        setUser(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        logout();
        setLoading(false);
      });
    } else {
      localStorage.removeItem('token');
      setUser(null);
      setLoading(false);
    }
  }, [token]);

  const logout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('token');
  };

  if (loading || (token && !user)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-800">
        <div className="flex flex-col items-center gap-4">
          <img src={logoCircular} className="w-16 h-16 object-contain animate-pulse" alt="Cargando..." />
          <p className="text-slate-500 text-sm font-semibold tracking-wide animate-pulse">Cargando aplicación...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Router><Routes><Route path="*" element={<Login setToken={setToken} />} /></Routes></Router>;
  }

  return (
    <Router>
      <Layout user={user} logout={logout}>
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/recetas" element={<Recipes user={user} />} />
          <Route path="/pruebas" element={<Trials user={user} />} />
          <Route path="/planificador" element={<Planner user={user} />} />
          <Route path="/planificador/ordenes-fabricacion" element={<PlannerManufacturingOrders user={user} />} />
          <Route path="/despacho" element={<Dispatch user={user} />} />
          <Route path="/despacho-dia/:fecha" element={<DispatchDayExecution user={user} />} />
          <Route path="/despacho/establecer-produccion/:fecha" element={<EstablishProduction user={user} />} />
          <Route path="/despacho-clientes" element={<ClientDispatchWorkspace user={user} />} />
          <Route path="/puntos-servicio/despachos-planta" element={<ServicePointsPlantDispatch user={user} />} />
          <Route path="/inventario" element={<Inventory user={user} />} />
          <Route path="/usuarios" element={<UsersPage user={user} />} />
                <Route path="/permisos" element={<PermissionsPage user={user} />} />
          <Route path="/configuracion" element={<Settings user={user} />} />
          <Route path="/working" element={<Working />} />
          <Route path="/mantenimiento/equipos" element={<Assets />} />
          <Route path="/mantenimiento/preventivo" element={<PreventivePlans />} />
          <Route path="/mantenimiento/ordenes-trabajo" element={<WorkOrders />} />
          <Route path="/mantenimiento/puntos-control" element={<ControlPoints />} />
          <Route path="/mantenimiento/checklists" element={<Checklists />} />
          <Route path="/mantenimiento/dashboard" element={<DashboardGMAO />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

function Layout({ children, user, logout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [odooDb, setOdooDb] = useState('');
  const [odooStatus, setOdooStatus] = useState('checking'); // 'checking', 'online', 'offline'

  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/odoo-config`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.db) {
          setOdooDb(data.db);
        }
      })
      .catch(console.error);

    const checkStatus = () => {
      fetch(`${API_BASE_URL}/auth/odoo-status`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.status) {
            setOdooStatus(data.status);
          } else {
            setOdooStatus('offline');
          }
        })
        .catch(() => setOdooStatus('offline'));
    };

    checkStatus(); // Initial check
    const statusInterval = setInterval(checkStatus, 30000); // Check every 30 seconds
    return () => clearInterval(statusInterval);
  }, []);

  const [expandedGroups, setExpandedGroups] = useState({
    COCINA: false,
    PRODUCCION: false,
    BODEGA: false,
    PUNTOS_DE_SERVICIO: false,
    PROCESOS_Y_MANTENIMIENTOS: false,
    CONFIGURACIONES: false
  });

  const toggleGroup = (title) => {
    setExpandedGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const menuGroups = [
    {
      title: 'COCINA',
      items: [
        { name: 'Planificador', path: '/working', icon: CalendarDays, roles: ['admin', 'cocina'] },
        { name: 'Prueba de recetas', path: '/working', icon: ClipboardList, roles: ['admin', 'cocina'] },
        { name: 'Recetario', path: '/recetas', icon: ChefHat, roles: ['admin', 'cocina'] }
      ]
    },
    {
      title: 'PRODUCCION',
      items: [
        { name: 'Plan de Producción', path: '/working', icon: Utensils, roles: ['admin', 'cocina'] },
        { name: 'Órdenes de fabricación', path: '/planificador/ordenes-fabricacion', icon: ClipboardList, roles: ['admin'] }
      ]
    },
    {
      title: 'BODEGA',
      items: [
        { name: 'Recepción de proveedores', path: '/working', icon: Warehouse, roles: ['admin', 'bodega'] },
        { name: 'Despacho a cocina', path: '/despacho', icon: Warehouse, roles: ['admin', 'bodega'] },
        { name: 'Establecer producción', path: '/despacho/establecer-produccion/hoy', icon: Warehouse, roles: ['admin', 'bodega'] },
        { name: 'Despacho a clientes', path: '/despacho-clientes', icon: Warehouse, roles: ['admin', 'bodega'] },
        { name: 'Baja de inventario', path: '/working', icon: Database, roles: ['admin', 'bodega'] },
        { name: 'Toma física de inventario', path: '/working', icon: Database, roles: ['admin', 'bodega'] }
      ]
    },
    {
      title: 'PUNTOS DE SERVICIO',
      items: [
        { name: 'Despachos de Planta', path: '/puntos-servicio/despachos-planta', icon: ClipboardList, roles: ['admin', 'bodega', 'supervisor'] }
      ]
    },
    {
      title: 'PROCESOS Y MANTENIMIENTOS',
      items: [
        { name: 'Equipos y Activos', path: '/mantenimiento/equipos', icon: SettingsIcon, roles: ['admin', 'supervisor'] },
        { name: 'Mantenimiento Preventivo', path: '/mantenimiento/preventivo', icon: ClipboardList, roles: ['admin', 'supervisor'] },
        { name: 'Órdenes de Trabajo', path: '/mantenimiento/ordenes-trabajo', icon: ClipboardList, roles: ['admin', 'supervisor'] },
        { name: 'Puntos de Control y Alertas', path: '/mantenimiento/puntos-control', icon: ClipboardList, roles: ['admin', 'supervisor'] },
        { name: 'Checklists y POES', path: '/mantenimiento/checklists', icon: ClipboardList, roles: ['admin', 'supervisor'] },
        { name: 'Analytics & KPI GMAO', path: '/mantenimiento/dashboard', icon: Database, roles: ['admin'] }
      ]
    },
    {
      title: 'CONFIGURACIONES',
      items: [
        { name: 'Usuarios', path: '/usuarios', icon: Users, roles: ['admin'] },
        { name: 'Permiso de accesos', path: '/permisos', icon: SettingsIcon, roles: ['admin'] },
        { name: 'Conexión a Odoo', path: '/configuracion', icon: Database, roles: ['admin'] }
      ]
    }
  ];

  // Filtrar grupos y links según el rol del usuario
  const filteredMenuGroups = menuGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (user?.rol === 'admin') return true;
      const userPerms = user?.permisos?.modules || {};
      return userPerms[item.name]?.view === true;
    })
  })).filter(group => group.items.length > 0);

  const odooStatusConfig = {
    online: {
      bg: 'bg-emerald-50 border-emerald-200/60 shadow-emerald-500/10',
      text: 'text-emerald-700',
      icon: 'text-emerald-500',
      dot: 'bg-emerald-500',
      ping: 'bg-emerald-400',
      label: 'En línea'
    },
    checking: {
      bg: 'bg-amber-50 border-amber-200/60 shadow-amber-500/10',
      text: 'text-amber-700',
      icon: 'text-amber-500',
      dot: 'bg-amber-500',
      ping: 'bg-amber-400',
      label: 'Conectando...'
    },
    offline: {
      bg: 'bg-rose-50 border-rose-200/60 shadow-rose-500/10',
      text: 'text-rose-700',
      icon: 'text-rose-500',
      dot: 'bg-rose-500',
      ping: null,
      label: 'Fuera de línea'
    }
  };

  const currentStatus = odooStatusConfig[odooStatus] || odooStatusConfig.offline;

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 flex flex-col md:flex-row">
      {/* Botón de Menú Móvil */}
        <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200">
          <Link to="/" className="flex flex-col items-start gap-1">
            <img src={logoHorizontal} className="h-8 object-contain" alt="NutriEstación" />
            {odooDb && (
              <div 
                className={`mt-1 flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl border shadow-sm transition-all duration-300 ${currentStatus.bg}`}
              >
                <div className="relative flex items-center justify-center">
                  <Database className={`w-3.5 h-3.5 ${currentStatus.icon}`} />
                  {currentStatus.ping ? (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentStatus.ping}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${currentStatus.dot}`}></span>
                    </span>
                  ) : (
                    <span className={`absolute -top-1 -right-1 flex h-2 w-2 rounded-full ${currentStatus.dot}`}></span>
                  )}
                </div>
                <div className="flex flex-col items-start leading-none">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${currentStatus.text}`}>
                    {odooDb}
                  </span>
                  <span className={`text-[8.5px] font-bold opacity-80 mt-0.5 ${currentStatus.text}`}>
                    {currentStatus.label}
                  </span>
                </div>
              </div>
            )}
          </Link>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-slate-600 hover:text-slate-900">
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex flex-col justify-between
        transform transition-transform duration-300 md:translate-x-0 md:static md:inset-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
          <div>
            {/* Logo */}
            <Link to="/" className="hidden md:flex flex-col items-center justify-center p-5 border-b border-slate-200 hover:opacity-80 transition-opacity">
              <img src={logoHorizontal} className="h-10 object-contain mb-2" alt="NutriEstación Logo" />
              {odooDb && (
                <div 
                  className={`mt-2.5 w-full flex items-center justify-center gap-2.5 px-3 py-2 rounded-xl border shadow-sm transition-all duration-300 hover:shadow-md cursor-help ${currentStatus.bg}`}
                  title={`Estado: ${currentStatus.label}`}
                >
                  <div className="relative flex items-center justify-center">
                    <Database className={`w-4 h-4 ${currentStatus.icon}`} />
                    {currentStatus.ping ? (
                      <span className="absolute -top-1 -right-1 flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentStatus.ping}`}></span>
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${currentStatus.dot}`}></span>
                      </span>
                    ) : (
                      <span className={`absolute -top-1 -right-1 flex h-2 w-2 rounded-full ${currentStatus.dot}`}></span>
                    )}
                  </div>
                  <div className="flex flex-col items-start leading-none">
                    <span className={`text-[11px] font-black uppercase tracking-widest ${currentStatus.text}`}>
                      {odooDb}
                    </span>
                    <span className={`text-[9.5px] font-bold opacity-80 mt-1 ${currentStatus.text}`}>
                      {currentStatus.label}
                    </span>
                  </div>
                </div>
              )}
            </Link>

          {/* Navegación */}
          <nav className="p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-160px)] custom-scrollbar">
            {filteredMenuGroups.map((group, groupIdx) => {
              const isExpanded = expandedGroups[group.title];

              return (
                <div key={groupIdx} className="space-y-1">
                  <div 
                    onClick={() => toggleGroup(group.title)}
                    className="flex items-center gap-3 px-4 mt-6 mb-3 cursor-pointer group"
                  >
                    <h3 className="text-xs font-semibold text-slate-500 tracking-widest uppercase group-hover:text-slate-800 transition-colors whitespace-nowrap">
                      {group.title}
                    </h3>
                    <div className="flex-1 h-px bg-slate-200 group-hover:bg-slate-300 transition-colors"></div>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0" />
                    )}
                  </div>
                  
                  {isExpanded && group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.path === '/' 
                      ? location.pathname === '/' 
                      : location.pathname === item.path;

                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={`
                          flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full
                          ${isActive 
                            ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm' 
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'}
                        `}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="flex-1">{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Footer Sidebar / Perfil */}
        <div className="p-4 border-t border-slate-200 space-y-3 bg-slate-50/40">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <User className="w-5 h-5" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold truncate text-slate-800">{user?.nombre}</p>
              <span className="text-xs text-slate-500 capitalize">{user?.rol === 'admin' ? 'Administrador' : user?.rol}</span>
            </div>
          </div>

          <button 
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-red-600 hover:text-white text-slate-650 rounded-lg text-xs font-semibold border border-slate-200 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-10 overflow-y-auto w-full">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
