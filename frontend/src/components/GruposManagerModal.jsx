import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Check, Loader2, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../App';

const GruposManagerModal = ({ isOpen, onClose }) => {
  const [grupos, setGrupos] = useState([]);
  const [odooCategories, setOdooCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingGrupo, setEditingGrupo] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', activo: true, categorias: [] });
  
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [catRes, grpRes] = await Promise.all([
        fetch(`${API_BASE_URL}/odoo/categories?parent_name=receta`, { headers }),
        fetch(`${API_BASE_URL}/dispatch/grupos`, { headers })
      ]);
      
      if (catRes.ok) {
        setOdooCategories(await catRes.json() || []);
      }
      
      if (grpRes.ok) {
        setGrupos(await grpRes.json() || []);
      }
    } catch (err) {
      console.error(err);
      setError("Error al cargar datos. Verifica la conexión.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.nombre.trim()) {
      setError("El nombre del grupo es obligatorio.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      if (isCreating) {
        await fetch(`${API_BASE_URL}/dispatch/grupos`, {
          method: 'POST',
          headers,
          body: JSON.stringify(formData)
        });
      } else if (editingGrupo) {
        await fetch(`${API_BASE_URL}/dispatch/grupos/${editingGrupo.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(formData)
        });
      }
      await fetchData();
      setEditingGrupo(null);
      setIsCreating(false);
    } catch (err) {
      console.error(err);
      setError("Error al guardar el grupo.");
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar este grupo?")) return;
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      await fetch(`${API_BASE_URL}/dispatch/grupos/${id}`, {
        method: 'DELETE',
        headers
      });
      await fetchData();
    } catch (err) {
      console.error(err);
      setError("Error al eliminar el grupo.");
      setLoading(false);
    }
  };

  const handleEdit = (grupo) => {
    setEditingGrupo(grupo);
    setIsCreating(false);
    setFormData({
      nombre: grupo.nombre,
      activo: grupo.activo,
      categorias: grupo.categorias.map(c => c.categoria_odoo_nombre)
    });
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingGrupo(null);
    setFormData({ nombre: '', activo: true, categorias: [] });
  };

  const toggleCategory = (catName) => {
    setFormData(prev => {
      const isSelected = prev.categorias.includes(catName);
      if (isSelected) {
        return { ...prev, categorias: prev.categorias.filter(c => c !== catName) };
      } else {
        return { ...prev, categorias: [...prev.categorias, catName] };
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col h-[90vh] md:h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-slate-50 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Gestionar Grupos de Despacho</h2>
            <p className="text-sm text-slate-500 mt-1">
              Organiza las categorías de Odoo en bloques de despacho.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Lista de Grupos */}
          <div className="w-1/3 border-r border-slate-200 bg-slate-50/50 flex flex-col">
            <div className="p-4 border-b border-slate-200">
              <button 
                onClick={handleCreateNew}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Nuevo Grupo
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading && !isCreating && !editingGrupo ? (
                <div className="flex items-center justify-center p-8 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : grupos.length === 0 ? (
                <p className="text-center text-slate-500 text-sm mt-4">No hay grupos creados.</p>
              ) : (
                grupos.map(g => (
                  <div 
                    key={g.id}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex justify-between items-center group
                      ${editingGrupo?.id === g.id ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-indigo-300'}`}
                    onClick={() => handleEdit(g)}
                  >
                    <div>
                      <p className="font-semibold text-slate-700">{g.nombre}</p>
                      <p className="text-xs text-slate-500">{g.categorias.length} categorías</p>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Eliminar grupo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Formulario de Edición/Creación */}
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {isCreating || editingGrupo ? (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800 mb-4">
                    {isCreating ? 'Crear Nuevo Grupo' : 'Editar Grupo'}
                  </h3>
                  
                  {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Grupo</label>
                      <input 
                        type="text" 
                        value={formData.nombre}
                        onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                        className="w-full border-slate-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="Ej. Sopas y Entradas"
                      />
                    </div>
                  </div>
                </div>

                {/* Selección de categorías */}
                <div className="flex-1 p-6 overflow-y-auto">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Categorías de Odoo Asignadas</h4>
                  <p className="text-xs text-slate-500 mb-4">
                    Selecciona las categorías de productos que se agruparán bajo este bloque.
                  </p>
                  
                  {loading && odooCategories.length === 0 ? (
                     <div className="flex items-center justify-center p-8 text-slate-400">
                       <Loader2 className="w-6 h-6 animate-spin" />
                     </div>
                  ) : (() => {
                    // Filter categories already assigned to OTHER groups
                    const assignedByOthers = new Set();
                    grupos.forEach(g => {
                      if (editingGrupo && g.id === editingGrupo.id) return;
                      g.categorias.forEach(c => assignedByOthers.add(c.categoria_odoo_nombre));
                    });
                    
                    const availableCategories = odooCategories.filter(cat => !assignedByOthers.has(cat.name));

                    if (availableCategories.length === 0) {
                      return (
                        <div className="p-4 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                          No hay categorías disponibles. Todas han sido asignadas a otros grupos.
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {availableCategories.map(cat => {
                          const isSelected = formData.categorias.includes(cat.name);
                        return (
                          <div 
                            key={cat.id}
                            onClick={() => toggleCategory(cat.name)}
                            className={`p-3 rounded-lg border cursor-pointer flex items-start gap-3 transition-colors
                              ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
                          >
                            <div className={`w-5 h-5 rounded border mt-0.5 flex items-center justify-center shrink-0 transition-colors
                              ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                              {isSelected && <Check className="w-3.5 h-3.5" />}
                            </div>
                            <div className="overflow-hidden">
                              <p className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                                {cat.name.split('/').pop().trim()}
                              </p>
                              <p className="text-xs text-slate-400 truncate" title={cat.name}>
                                {cat.name}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )})()}
                </div>

                {/* Footer Formulario */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 mt-auto">
                  <button 
                    onClick={() => { setIsCreating(false); setEditingGrupo(null); }}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={loading}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Guardar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-slate-50/50">
                <div className="w-16 h-16 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center mb-4">
                  <Edit2 className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-lg font-medium text-slate-600">Selecciona un grupo</p>
                <p className="text-sm">o crea uno nuevo para empezar a gestionar.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GruposManagerModal;
