import React, { useState, useEffect } from 'react';
import { Users, Plus, Shield, UserX, UserCheck, Trash2, AlertCircle, Edit, X } from 'lucide-react';
import { API_BASE_URL } from '../App';
import RoleManagerModal from './RoleManagerModal';

function UsersPage({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRoleManager, setShowRoleManager] = useState(false);
  const [availableRoles, setAvailableRoles] = useState([]);
  const token = localStorage.getItem('token');

  // Form states
  const [username, setUsername] = useState('');
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('cocina');

  // Edit form states
  const [editingUser, setEditingUser] = useState(null);
  const [editUsername, setEditUsername] = useState('');
  const [editNombre, setEditNombre] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRol, setEditRol] = useState('cocina');

    const fetchRoles = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/roles/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableRoles(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/users/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setUsers(data);
      } else {
        throw new Error(data.detail || 'Fallo al cargar usuarios');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE_URL}/users/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username, nombre, password, rol })
      });
      if (response.ok) {
        fetchUsers();
        setShowAddForm(false);
        setUsername('');
        setNombre('');
        setPassword('');
      } else {
        const data = await response.json();
        alert(data.detail || 'Error al crear usuario');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (u) => {
    setEditingUser(u);
    setEditUsername(u.username);
    setEditNombre(u.nombre);
    setEditRol(u.rol);
    setEditPassword('');
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE_URL}/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: editUsername,
          nombre: editNombre,
          password: editPassword || null,
          rol: editRol,
          odoo_user_id: editingUser.odoo_user_id
        })
      });
      if (response.ok) {
        fetchUsers();
        setEditingUser(null);
      } else {
        const data = await response.json();
        alert(data.detail || 'Error al actualizar usuario');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleUser = async (id) => {
    if (!window.confirm("¿Está seguro de que desea eliminar permanentemente este usuario?")) return;
    try {
      const response = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchUsers();
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.detail || "Error al eliminar el usuario. Es posible que tenga registros asociados.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Gestión de Usuarios</h1>
          <p className="text-slate-650 mt-1">Crea y administra los usuarios locales para el personal de cocina y bodega.</p>
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-semibold transition-all"
        >
          <Plus className="w-5 h-5" />
          Agregar Usuario Local
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Formulario de Agregar */}
      {showAddForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-205 p-6 rounded-2xl max-w-lg space-y-4 shadow-md">
          <h3 className="text-lg font-bold text-slate-800 mb-2">Nuevo Usuario Local</h3>
          
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre de Usuario (Login)</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej: chef.cocina"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-slate-900 placeholder-slate-400 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre Completo</label>
            <input 
              type="text" 
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Juan Pérez"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-slate-900 placeholder-slate-400 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Contraseña</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-slate-900 placeholder-slate-400 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Rol del Sistema</label>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-slate-900 outline-none text-sm"
            >
              <option value="cocina">Cocina (Visualización y Pruebas)</option>
              <option value="bodega">Bodega (Despacho e Inventarios)</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            >
              Crear Usuario
            </button>
            <button 
              type="button"
              onClick={() => setShowAddForm(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Tabla de Usuarios */}
      {loading ? (
        <p className="text-slate-500 animate-pulse">Cargando lista de usuarios...</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-205 bg-slate-50 text-slate-550 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Nombre</th>
                <th className="px-6 py-4">Rol</th>
                <th className="px-6 py-4">Autenticación</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-blue-600">{u.username}</td>
                  <td className="px-6 py-4 text-slate-800 font-bold">{u.nombre}</td>
                  <td className="px-6 py-4 text-slate-650 capitalize">{u.rol}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                      u.odoo_user_id 
                        ? 'bg-blue-50 text-blue-600' 
                        : 'bg-indigo-50 text-indigo-650'
                    }`}>
                      {u.odoo_user_id ? 'Odoo ERP' : 'Local App'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      u.activo 
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-550/10' 
                        : 'bg-red-500/10 text-red-600 border-red-550/10'
                    }`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => startEdit(u)}
                        className="p-2 text-blue-650 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Editar Usuario / Rol"
                      >
                        <Edit className="w-4.5 h-4.5" />
                      </button>
                      {user?.id !== u.id && (
                        <button
                          onClick={() => toggleUser(u.id)}
                          className="p-2 rounded-lg transition-colors cursor-pointer text-red-500 hover:bg-red-50"
                          title="Eliminar Usuario"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Edición de Usuario y Roles */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white border border-slate-200 p-6 rounded-2xl shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2 text-slate-800">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-lg">Gestionar Rol y Usuario</h3>
              </div>
              <button 
                onClick={() => setEditingUser(null)}
                className="p-1.5 text-slate-400 hover:text-slate-650 hover:bg-slate-50 rounded-lg cursor-pointer transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleUpdate} className="space-y-4 text-left font-sans">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Nombre de Usuario (Login)
                </label>
                <input 
                  type="text" 
                  required
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-slate-900 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Nombre Completo
                </label>
                <input 
                  type="text" 
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-slate-900 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Rol del Sistema
                </label>
                <select
                  value={editRol}
                  onChange={(e) => setEditRol(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-slate-900 outline-none text-sm"
                >
                  <option value="cocina">Cocina (Visualización y Pruebas)</option>
                  <option value="bodega">Bodega (Despacho e Inventarios)</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {/* Password update only for local users */}
              {!editingUser.odoo_user_id && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Nueva Contraseña (Opcional)
                  </label>
                  <input 
                    type="password" 
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Dejar en blanco para conservar actual"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-slate-900 placeholder-slate-400 outline-none text-sm"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-100 mt-6">
                <button 
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer text-center"
                >
                  Guardar Cambios
                </button>
                <button 
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-650 hover:text-slate-900 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer text-center"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
          {showRoleManager && (
        <RoleManagerModal 
          onClose={() => setShowRoleManager(false)} 
          roles={availableRoles}
          fetchRoles={fetchRoles}
        />
      )}
    </div>
  );
}

export default UsersPage;
