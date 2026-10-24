import React, { useState, useEffect } from 'react';
import { Search, Loader2, Save, X } from 'lucide-react';
import { API_BASE_URL } from '../App';

const PartialDispatchConfigModal = ({ isOpen, onClose, onSave }) => {
  const [products, setProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // Fetch products and config in parallel
      const [productsRes, configRes] = await Promise.all([
        fetch(`${API_BASE_URL}/dispatch/odoo-products?purchasable=true`, { headers }),
        fetch(`${API_BASE_URL}/dispatch/partial-config`, { headers })
      ]);

      if (!productsRes.ok || !configRes.ok) {
        throw new Error('Error al cargar datos del servidor');
      }

      const productsData = await productsRes.json();
      const configData = await configRes.json();

      if (productsData.status === 'success') {
        // Sort alphabetically
        const sorted = productsData.products.sort((a, b) => a.name.localeCompare(b.name));
        setProducts(sorted);
      } else {
        throw new Error('Error al cargar productos de Odoo');
      }

      if (configData.status === 'success') {
        setSelectedIds(new Set(configData.product_ids));
      }
    } catch (err) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const token = localStorage.getItem('token');
      const headers = { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      const productIds = Array.from(selectedIds);
      const res = await fetch(`${API_BASE_URL}/dispatch/partial-config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ product_ids: productIds })
      });
      
      if (!res.ok) throw new Error('Error al guardar configuración');
      const data = await res.json();
      
      if (data.status === 'success') {
        onSave(productIds);
        onClose();
      } else {
        throw new Error('Error al guardar configuración');
      }
    } catch (err) {
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const toggleProduct = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  if (!isOpen) return null;

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-scale-up overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Configurar Despacho Parcial</h2>
            <p className="text-sm text-slate-500 mt-1">Seleccione los productos que por defecto usarán despacho parcial.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-hidden flex flex-col bg-slate-50/50">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          <div className="relative mb-4 shrink-0">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto bg-white border-2 border-slate-200 rounded-xl p-2 min-h-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <p>Cargando productos...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                <p>No se encontraron productos.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filteredProducts.map(prod => (
                  <label 
                    key={prod.id} 
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${selectedIds.has(prod.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-300'}`}
                  >
                    <input 
                      type="checkbox"
                      checked={selectedIds.has(prod.id)}
                      onChange={() => toggleProduct(prod.id)}
                      className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{prod.name}</p>
                      <p className="text-xs text-slate-400">{prod.uom_id?.[1] || prod.uom_id}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={saving || loading}
            className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Guardar Configuración
          </button>
        </div>
      </div>
    </div>
  );
};

export default PartialDispatchConfigModal;
