import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../App';
import { Shield, Save, CheckCircle2, ChevronRight, LayoutDashboard, Loader2, Users } from 'lucide-react';

const MODULES_LIST = [
  {
    group: 'COCINA',
    items: [
      { name: 'Planificador', actions: ['Vaciar Planificación', 'Ver Costos Diarios'] },
      { name: 'Prueba de recetas', actions: ['Programar Prueba', 'Guardar Receta Definitiva'] },
      { name: 'Recetario', actions: [] }
    ]
  },
  {
    group: 'PRODUCCION',
    items: [
      { name: 'Plan de Producción', actions: [] },
      { 
        name: 'Órdenes de fabricación', 
        actions: [
          'Importar .xlsx', 'Nuevo Cliente', 'Agregar Cliente', 'Gestionar clientes, turnos y menús', 
          'Quitar y eliminar clientes', 'Agregar plato al menú', 'Modificar Menú', 
          'Eliminar o cambiar plato', 'Eliminar planificación', 'Sincronizar con Odoo', 'Re sincronizar con Odoo'
        ] 
      }
    ]
  },
  {
    group: 'BODEGA',
    items: [
      { name: 'Recepción de proveedores', actions: [] },
      { 
        name: 'Despacho a cocina', 
        actions: ['Informe General', 'Por Grupos', 'Gestionar grupos', 'Despachar este menú', 'Configurar productos', 'Agregar adicionales', 'Confirmar despacho total'] 
      },
      { 
        name: 'Establecer producción', 
        actions: ['Compartir', 'Producir todo'] 
      },
      { name: 'Despacho a clientes', actions: [] },
      { name: 'Baja de inventario', actions: [] },
      { name: 'Toma física de inventario', actions: ['Programar Toma', 'Sincronizar con Odoo'] }
    ]
  },
  {
    group: 'PUNTOS DE SERVICIO',
    items: [
      { name: 'Despachos de Planta', actions: [] }
    ]
  },
  {
    group: 'CONFIGURACIONES',
    items: [
      { name: 'Usuarios', actions: [] },
      { name: 'Permiso de accesos', actions: [] },
      { name: 'Conexión a Odoo', actions: [] }
    ]
  },
  {
    group: 'PROCESOS Y MANTENIMIENTOS',
    items: [
      { name: 'Equipos y Activos', actions: [] },
      { name: 'Mantenimiento Preventivo', actions: [] },
      { name: 'Órdenes de Trabajo', actions: [] },
      { name: 'Puntos de Control y Alertas', actions: [] },
      { name: 'Checklists y POES', actions: [] },
      { name: 'Analytics & KPI GMAO', actions: [] }
    ]
  }
];

export default function Permissions({ user: currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  
  // permissions[module_name] = { view: boolean, actions: { actionName: boolean } }
  const [permissions, setPermissions] = useState({});
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/users/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al obtener usuarios');
      const data = await res.json();
      setUsers(data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleSelectUser = (u) => {
    setSelectedUser(u);
    setSuccessMsg('');
    const initPerms = u.permisos?.modules || {};
    
    const mergedPerms = {};
    MODULES_LIST.forEach(g => {
      g.items.forEach(item => {
        const initItemPerms = initPerms[item.name] || {};
        const initItemActions = initItemPerms.actions || {};
        
        // Ensure actions exist from generic action prop too (migration)
        if (initItemPerms.action === true) {
            item.actions.forEach(act => initItemActions[act] = true);
        }

        mergedPerms[item.name] = {
          view: initItemPerms.view || false,
          actions: {}
        };
        
        item.actions.forEach(actionName => {
          mergedPerms[item.name].actions[actionName] = initItemActions[actionName] || false;
        });
      });
    });
    setPermissions(mergedPerms);
  };

  const toggleViewPermission = (moduleName) => {
    setPermissions(prev => ({
      ...prev,
      [moduleName]: {
        ...prev[moduleName],
        view: !prev[moduleName].view
      }
    }));
  };

  const toggleActionPermission = (moduleName, actionName) => {
    setPermissions(prev => ({
      ...prev,
      [moduleName]: {
        ...prev[moduleName],
        actions: {
          ...prev[moduleName].actions,
          [actionName]: !prev[moduleName].actions[actionName]
        }
      }
    }));
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    setSuccessMsg('');
    try {
      const token = localStorage.getItem('token');
      const payload = { modules: permissions };
      
      const res = await fetch(`${API_BASE_URL}/users/${selectedUser.id}/permisos`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error('Error al guardar permisos');
      
      setUsers(users.map(u => u.id === selectedUser.id ? { ...u, permisos: payload } : u));
      setSuccessMsg('Permisos guardados correctamente.');
      
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-slate-300" />
      </div>
    );
  }

  if (currentUser?.rol !== 'admin') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50">
        <Shield className="w-20 h-20 text-slate-300 mb-6" />
        <h2 className="text-2xl font-black text-slate-700">Acceso Restringido</h2>
        <p className="text-slate-500 mt-2 font-medium">Solo los administradores pueden gestionar permisos.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      <div className="bg-white border-b border-slate-200 px-6 md:px-10 py-6 sticky top-0 z-20 flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Permisos de Accesos</h1>
            <p className="text-sm font-semibold text-slate-500 mt-0.5">Controla quién puede ver y actuar en cada módulo</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Users List */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm h-[calc(100vh-200px)] flex flex-col">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <Users className="w-5 h-5 text-slate-400" />
            <h2 className="font-bold text-slate-700">Usuarios</h2>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => handleSelectUser(u)}
                className={`w-full text-left px-4 py-3 rounded-2xl transition-all flex items-center justify-between group ${
                  selectedUser?.id === u.id 
                    ? 'bg-indigo-50 border-indigo-200 shadow-sm ring-2 ring-indigo-50 text-indigo-900' 
                    : 'bg-white border border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>
                  <p className={`font-bold ${selectedUser?.id === u.id ? 'text-indigo-800' : 'text-slate-800'}`}>
                    {u.nombre}
                  </p>
                  <p className="text-xs font-semibold text-slate-500 mt-1 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-slate-200/60 uppercase text-[10px] tracking-wider text-slate-600">
                      {u.rol}
                    </span>
                    @{u.username}
                  </p>
                </div>
                <ChevronRight className={`w-5 h-5 ${selectedUser?.id === u.id ? 'text-indigo-400' : 'text-slate-300 group-hover:text-slate-400'}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Permissions Editor */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)]">
          {!selectedUser ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <LayoutDashboard className="w-16 h-16 text-slate-200 mb-6" />
              <h3 className="text-xl font-black text-slate-700">Selecciona un usuario</h3>
              <p className="text-slate-500 font-medium mt-2 max-w-sm">
                Elige un usuario de la lista a la izquierda para configurar sus permisos de acceso y acciones.
              </p>
            </div>
          ) : (
            <>
              <div className="p-6 border-b border-slate-100 flex flex-wrap gap-4 items-center justify-between bg-slate-50/50 sticky top-0 z-10">
                <div>
                  <h3 className="text-lg font-black text-slate-800">
                    Permisos para <span className="text-indigo-600">{selectedUser.nombre}</span>
                  </h3>
                  <p className="text-sm font-medium text-slate-500 mt-1">
                    Configura el acceso y las acciones específicas para cada módulo.
                  </p>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm shadow-indigo-200 transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar Cambios
                </button>
              </div>

              {successMsg && (
                <div className="mx-6 mt-4 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold text-sm">{successMsg}</span>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {MODULES_LIST.map((group) => (
                  <div key={group.group}>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                      {group.group}
                    </h4>
                    <div className="grid grid-cols-1 gap-3">
                      {group.items.map(item => {
                        const perms = permissions[item.name] || { view: false, actions: {} };
                        
                        return (
                          <div key={item.name} className="flex flex-col md:flex-row md:items-center justify-between bg-white border border-slate-100 p-4 rounded-2xl shadow-sm hover:border-indigo-100 transition-colors">
                            <div className="flex items-center gap-4 mb-4 md:mb-0">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  className="sr-only peer"
                                  checked={perms.view}
                                  onChange={() => toggleViewPermission(item.name)}
                                />
                                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                              </label>
                              <span className="font-semibold text-slate-700">{item.name}</span>
                            </div>
                            
                            {item.actions.length > 0 && (
                              <div className="flex flex-wrap gap-2 md:justify-end pl-14 md:pl-0">
                                {item.actions.map(actionName => (
                                  <label key={actionName} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                                    perms.actions[actionName] 
                                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                  }`}>
                                    <input 
                                      type="checkbox" 
                                      className="hidden"
                                      checked={perms.actions[actionName] || false}
                                      onChange={() => toggleActionPermission(item.name, actionName)}
                                      disabled={!perms.view}
                                    />
                                    <div className={`w-3 h-3 rounded flex items-center justify-center border ${
                                      perms.actions[actionName] ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'
                                    } ${!perms.view ? 'opacity-50' : ''}`}>
                                      {perms.actions[actionName] && <CheckCircle2 className="w-2.5 h-2.5" />}
                                    </div>
                                    <span className={!perms.view ? 'opacity-50' : ''}>{actionName}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
