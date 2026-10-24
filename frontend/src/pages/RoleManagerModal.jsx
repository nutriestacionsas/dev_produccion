import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Shield } from 'lucide-react';
import { API_BASE_URL } from '../App';

export default function RoleManagerModal({ onClose, roles, fetchRoles }) {
  const [newRole, setNewRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token');

  const handleAddRole = async (e) => {
    e.preventDefault();
    if (!newRole.trim()) return;

    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/roles/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nombre: newRole.trim() })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Error al crear el rol');
      }

      setNewRole('');
      await fetchRoles();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (id) => {
    if (!window.confirm("¿Está seguro de que desea eliminar esta etiqueta de rol?")) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/roles/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Error al eliminar el rol');
      }

      await fetchRoles();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2 text-slate-800">
            <Shield className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-lg">Gestor de Roles</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleAddRole} className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="Nuevo nombre de rol..."
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm outline-none"
            />
            <button
              type="submit"
              disabled={loading || !newRole.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl flex items-center gap-2 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" /> Agregar
            </button>
          </form>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Roles Existentes</h4>
            {roles.map(rol => {
              const isSystem = ["admin", "cocina", "bodega", "supervisor"].includes(rol.nombre);
              
              return (
                <div key={rol.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm transition-all group">
                  <span className="font-medium text-slate-700 text-sm">{rol.nombre}</span>
                  {!isSystem && (
                    <button
                      onClick={() => handleDeleteRole(rol.id)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Eliminar rol"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {isSystem && (
                    <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">Sistema</span>
                  )}
                </div>
              );
            })}
            
            {roles.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-4">No hay roles definidos.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
