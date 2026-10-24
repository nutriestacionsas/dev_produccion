import React, { useState, useEffect } from 'react';
import { X, Plus, Loader2, AlertCircle, RefreshCw, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { API_BASE_URL } from '../App';

const AdditionalDispatchModal = ({ isOpen, onClose, fecha, turno, menu }) => {
  const [mos, setMos] = useState([]);
  const [selectedMo, setSelectedMo] = useState('');
  
  const [moLines, setMoLines] = useState([]);
  const [products, setProducts] = useState([]);
  
  const [loadingMos, setLoadingMos] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [newProductId, setNewProductId] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [searchProductQuery, setSearchProductQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (isOpen) {
      fetchMos();
      if (products.length === 0) fetchProducts();
    } else {
      // Reset state on close
      setSelectedMo('');
      setSuccess('');
      setNewProductId('');
      setNewQuantity('');
      setSearchProductQuery('');
      setIsDropdownOpen(false);
      setError('');
      setSuccess('');
      setMoLines([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedMo) {
      fetchMoLines(selectedMo);
    } else {
      setMoLines([]);
    }
  }, [selectedMo]);

  const fetchMos = async () => {
    setLoadingMos(true);
    setError('');
    try {
      let url = `${API_BASE_URL}/dispatch/day-mos?fecha=${fecha}`;
      if (turno) url += `&turno=${encodeURIComponent(turno)}`;
      if (menu) url += `&menu=${encodeURIComponent(menu)}`;
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar las Órdenes de Fabricación hijas');
      const data = await res.json();
      setMos(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMos(false);
    }
  };

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await fetch(`${API_BASE_URL}/odoo/products`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (err) {
      console.error('Error fetching products', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchMoLines = async (moId) => {
    setLoadingLines(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/mo-lines/${moId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar los componentes de la MO');
      const data = await res.json();
      setMoLines(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingLines(false);
    }
  };

  const handleAddLine = async () => {
    if (!selectedMo) {
      setError('Debes seleccionar una MO primero.');
      return;
    }
    if (!newProductId || !newQuantity || isNaN(newQuantity) || Number(newQuantity) <= 0) {
      setError('Debes seleccionar un producto y una cantidad válida mayor a 0.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/mo-add-line/${selectedMo}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product_id: parseInt(newProductId),
          quantity: parseFloat(newQuantity)
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Error al agregar la línea');
      }

      setSuccess('Adicional agregado correctamente a la MO en Odoo.');
      setNewProductId('');
      setNewQuantity('');
      
      // Refresh lines
      fetchMoLines(selectedMo);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Agregar Adicionales</h2>
            <p className="text-sm text-slate-500 mt-1">Añade componentes a las Órdenes de Fabricación hijas.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row items-center gap-3 text-red-700">
              <AlertCircle size={20} className="shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          

          {!selectedMo ? (
            <div className="flex flex-col gap-3">
              <label className="text-sm font-bold text-slate-700">Seleccionar Orden de Fabricación (Hija)</label>
              {loadingMos ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={16} className="animate-spin" /> Cargando órdenes...
                </div>
              ) : mos.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No se encontraron Órdenes de Fabricación hijas.</p>
              ) : (
                <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-2">
                  {mos.map(mo => (
                    <li 
                      key={mo.id}
                      onClick={() => setSelectedMo(mo.id.toString())}
                      className="flex items-center px-4 py-3 rounded-xl border cursor-pointer transition-all bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                    >
                      <div className="w-2 h-2 rounded-full mr-3 shrink-0 bg-slate-300" />
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="font-bold text-slate-800 text-sm">{mo.name}</span>
                        <span className="hidden sm:inline text-slate-400">-</span>
                        <span className="text-sm font-medium text-slate-600">
                          {mo.product_id && mo.product_id.length > 1 ? mo.product_id[1] : 'Sin Producto'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Workspace Header */}
              <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                <button 
                  onClick={() => setSelectedMo('')}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all shrink-0"
                  title="Volver a la lista"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h3 className="text-lg font-black text-slate-800 leading-tight">
                    {(() => {
                      const mo = mos.find(m => m.id.toString() === selectedMo);
                      if (!mo) return '';
                      return mo.product_id && mo.product_id.length > 1 ? mo.product_id[1] : mo.name;
                    })()}
                  </h3>
                  <p className="text-xs font-bold text-slate-500 mt-0.5">
                    MO: {mos.find(m => m.id.toString() === selectedMo)?.name}
                  </p>
                </div>
              </div>

              {/* Lines Table */}
              <div className="flex flex-col gap-4 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700">Componentes Actuales en Odoo</h3>
                  {loadingLines && <Loader2 size={16} className="animate-spin text-blue-500" />}
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50/50">
                        <th className="px-5 py-3 font-bold">Producto</th>
                        <th className="px-5 py-3 font-bold text-right">Cantidad Odoo</th>
                        <th className="px-5 py-3 font-bold">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moLines.length === 0 && !loadingLines ? (
                        <tr>
                          <td colSpan="3" className="px-5 py-8 text-center text-sm text-slate-500 italic">
                            No hay componentes registrados en esta MO.
                          </td>
                        </tr>
                      ) : (
                        moLines.map(line => (
                          <tr key={line.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3 text-sm font-semibold text-slate-700">
                              {line.product_name}
                            </td>
                            <td className="px-5 py-3 text-sm font-mono text-slate-600 text-right">
                              {line.quantity} {line.uom}
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-500">
                              <span className="px-2 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200">
                                {line.state}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add New Line Form or Success Prompt */}
                {success ? (
                  <div className="p-6 bg-emerald-50 border-t border-emerald-200 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-300">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <CheckCircle2 size={24} className="text-emerald-600" />
                      <p className="text-base font-bold">{success}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                      <button 
                        onClick={onClose}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition-colors"
                      >
                        Aceptar y Salir
                      </button>
                      <button 
                        onClick={() => setSuccess('')}
                        className="px-6 py-2.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold rounded-xl shadow-sm transition-colors"
                      >
                        Seguir Agregando
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="p-5 bg-slate-50 border-t border-slate-200">
                  <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <Plus size={16} className="text-blue-500" />
                    Añadir Nuevo Componente
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                        <input
                          type="text"
                          placeholder="Buscar producto..."
                          value={searchProductQuery}
                          onChange={(e) => {
                            setSearchProductQuery(e.target.value);
                            setIsDropdownOpen(true);
                            setNewProductId('');
                          }}
                          onFocus={() => setIsDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                          disabled={loadingProducts || submitting}
                        />
                        {isDropdownOpen && (
                          <div className="absolute z-10 w-full bottom-full mb-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                            {products
                              .filter(p => p.name.toLowerCase().includes(searchProductQuery.toLowerCase()))
                              .map(p => (
                                <div
                                  key={p.id}
                                  className="px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 text-slate-700"
                                  onMouseDown={(e) => {
                                    e.preventDefault(); // Prevent input from losing focus immediately
                                    setNewProductId(p.id);
                                    setSearchProductQuery(p.name);
                                    setIsDropdownOpen(false);
                                  }}
                                >
                                  {p.name}
                                </div>
                              ))}
                            {products.filter(p => p.name.toLowerCase().includes(searchProductQuery.toLowerCase())).length === 0 && (
                              <div className="px-4 py-2 text-sm text-slate-500 italic">No se encontraron productos</div>
                            )}
                          </div>
                        )}
                      {loadingProducts && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 size={16} className="animate-spin text-slate-400" />
                        </div>
                      )}
                    </div>
                    <div className="w-full sm:w-32">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="Cantidad"
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                        value={newQuantity}
                        onChange={(e) => setNewQuantity(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <button
                      onClick={handleAddLine}
                      disabled={submitting || !newProductId || !newQuantity}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Confirmar Solicitud
                    </button>
                  </div>
                </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default AdditionalDispatchModal;
