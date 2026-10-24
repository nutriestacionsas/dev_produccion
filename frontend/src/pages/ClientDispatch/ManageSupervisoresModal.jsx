import React, { useState, useEffect } from 'react';
import { X, Check, Save, RefreshCw, Users, ShieldAlert } from 'lucide-react';
import { API_BASE_URL } from '../../App';

const ManageSupervisoresModal = ({ onClose }) => {
  const [data, setData] = useState({ clientes: [], supervisores: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local state for dropdowns
  const [assignments, setAssignments] = useState({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/dispatch/config/supervisores-clientes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Error loading supervisores");
      const json = await res.json();
      setData(json);
      
      const initAssigns = {};
      json.clientes.forEach(c => {
        initAssigns[c.cliente_nombre] = c.supervisor_id || '';
      });
      setAssignments(initAssigns);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveAllAssignments = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const promises = data.clientes.map(async (c) => {
        const supId = assignments[c.cliente_nombre];
        // Only save if it changed
        if (supId != (c.supervisor_id || '')) {
          const payload = {
            cliente_nombre: c.cliente_nombre,
            supervisor_id: supId ? parseInt(supId, 10) : null
          };
          
          await fetch(`${API_BASE_URL}/dispatch/config/asigna-supervisor`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
        }
      });
      
      await Promise.all(promises);
      await fetchData();
      onClose(); // Auto close on successful save
    } catch (e) {
      console.error(e);
      alert("No se pudieron guardar algunas asignaciones");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">Asignar Supervisores</h2>
              <p className="text-xs font-semibold text-slate-500">Puntos de Servicio</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto bg-white custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
              <p className="text-slate-500 font-medium animate-pulse">Cargando datos...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.clientes.map((c, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-slate-400" />
                    <span className="font-bold text-slate-700">{c.cliente_nombre}</span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <select
                      value={assignments[c.cliente_nombre]}
                      onChange={(e) => setAssignments({ ...assignments, [c.cliente_nombre]: e.target.value })}
                      className="text-sm bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 w-full min-w-[200px]"
                    >
                      <option value="">-- Sin Asignar --</option>
                      {data.supervisores.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              {data.clientes.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  No hay clientes registrados en las órdenes de producción.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={handleSaveAllAssignments}
            disabled={saving || loading || data.clientes.length === 0}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-sm"
          >
            {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Guardar Cambios
          </button>
        </div>

      </div>
    </div>
  );
};

export default ManageSupervisoresModal;
