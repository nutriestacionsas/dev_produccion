import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Minus, Scale, Warehouse, Search, CheckCircle2 } from 'lucide-react';
import { API_BASE_URL } from '../../App';

const AutoTareModal = ({ producto, onClose, onRefresh }) => {
  const [weighings, setWeighings] = useState([]);
  const [envases, setEnvases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const [tareSearchQuery, setTareSearchQuery] = useState('');

  // Buffer para autoguardado
  const weighingsRef = useRef([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE_URL}/odoo/envases`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setEnvases(data);
        else setEnvases([]);
      })
      .catch(console.error);
      
    // Inicializar con los pesajes existentes del producto
    if (producto && producto.pesajes && producto.pesajes.length > 0) {
      setWeighings(producto.pesajes.map(p => {
        const rawTaras = p.taras_seleccionadas || [];
        const normalizedTaras = rawTaras.map(t => ({
          ...t,
          qty: parseInt(t.qty || t.cantidad) || 1,
          peso_tara: parseFloat(t.peso_tara ?? t.weight ?? 0)
        }));

        const calcTare = normalizedTaras.reduce(
          (acc, t) => acc + ((parseFloat(t.peso_tara || t.weight) || 0) * (parseInt(t.qty) || 1)),
          0
        );

        const grossVal = parseFloat(p.peso_bruto) || 0;
        const totalTare = normalizedTaras.length > 0 ? calcTare : (parseFloat(p.peso_tara) || 0);

        const rawPorciones = p.porciones_seleccionadas || [];
        let normalizedPorciones = rawPorciones.map((v, i) => ({ id: `p-${i}`, val: parseInt(v) }));
        if (normalizedPorciones.length === 0 && (parseInt(p.unidades) || 0) > 0) {
            normalizedPorciones = [{ id: 'legacy', val: parseInt(p.unidades) }];
        }
        const sumPorciones = normalizedPorciones.reduce((acc, curr) => acc + curr.val, 0) || '';

        return {
          id: p.id,
          gross: p.gross || p.peso_bruto,
          taras: normalizedTaras,
          porciones: normalizedPorciones,
          tareWeight: totalTare,
          net: Math.max(0, grossVal - totalTare),
          unidades: sumPorciones || p.unidades || '',
          saved: true,
          isDirty: false
        };
      }));
      weighingsRef.current = producto.pesajes;
    } else {
      const newId = `temp-${Date.now()}`;
      setWeighings([{
        id: newId,
        gross: '',
        taras: [],
        porciones: [],
        tareWeight: 0,
        net: 0,
        unidades: '',
        saved: false,
        isDirty: false
      }]);
      setActiveRowId(newId);
    }
  }, [producto]);

  // Hidratar fotos de taras en los pesajes existentes cuando se cargan los envases de Odoo
  useEffect(() => {
    if (envases.length > 0) {
      setWeighings(prev => prev.map(w => ({
        ...w,
        taras: (w.taras || []).map(t => {
          const match = envases.find(e => e.id === t.id);
          const photoVal = t.photo || match?.photo || match?.image_128;
          return photoVal && t.photo !== photoVal ? { ...t, photo: photoVal } : t;
        })
      })));
    }
  }, [envases]);

  const addWeighingRow = () => {
    const newId = `temp-${Date.now()}`;
    setWeighings(prev => {
      const updated = [...prev, {
        id: newId,
        gross: '',
        taras: [],
        porciones: [],
        tareWeight: 0,
        net: 0,
        unidades: '',
        saved: false,
        isDirty: false
      }];
      setActiveRowId(newId);
      return updated;
    });
  };

  const updateWeighing = (id, field, value) => {
    setWeighings(prev => prev.map(w => {
      if (w.id !== id) return w;
      
      const updated = { ...w, [field]: value, isDirty: true };
      
      const grossVal = parseFloat(updated.gross) || 0;
      const totalTare = updated.taras.reduce((acc, t) => acc + ((parseFloat(t.peso_tara || t.weight) || 0) * (parseInt(t.qty) || 0)), 0);
      updated.tareWeight = totalTare;
      updated.net = Math.max(0, grossVal - totalTare);
      
      return updated;
    }));
  };

  const addPorcion = (rowId, val) => {
      const parsedVal = parseInt(val);
      if (isNaN(parsedVal) || parsedVal <= 0) return;
      setWeighings(prev => prev.map(w => {
          if (w.id !== rowId) return w;
          const newPorciones = [...(w.porciones || []), { id: `p-${Date.now()}-${Math.random()}`, val: parsedVal }];
          const sum = newPorciones.reduce((acc, curr) => acc + curr.val, 0);
          return { ...w, porciones: newPorciones, unidades: sum, isDirty: true };
      }));
  };

  const removePorcion = (rowId, pId) => {
      setWeighings(prev => prev.map(w => {
          if (w.id !== rowId) return w;
          const newPorciones = (w.porciones || []).filter(p => p.id !== pId);
          const sum = newPorciones.length > 0 ? newPorciones.reduce((acc, curr) => acc + curr.val, 0) : '';
          return { ...w, porciones: newPorciones, unidades: sum, isDirty: true };
      }));
  };

  const selectTareForActiveRow = (tare) => {
    if (!activeRowId) return;
    setWeighings(prev => prev.map(w => {
      if (w.id !== activeRowId) return w;
      
      let updatedTaras = [...w.taras];
      if (!tare) {
         updatedTaras = [];
      } else {
         const existingIndex = updatedTaras.findIndex(t => t.id === tare.id);
         if (existingIndex >= 0) {
            const current = updatedTaras[existingIndex];
            updatedTaras[existingIndex] = {
              ...current,
              qty: (parseInt(current.qty) || 1) + 1
            };
         } else {
            updatedTaras.push({
              ...tare,
              peso_tara: parseFloat(tare.peso_tara ?? tare.weight ?? 0),
              photo: tare.photo || tare.image_128 || '',
              qty: 1
            });
         }
      }
      
      const grossVal = parseFloat(w.gross) || 0;
      const totalTare = updatedTaras.reduce((acc, t) => acc + ((parseFloat(t.peso_tara || t.weight) || 0) * (parseInt(t.qty) || 0)), 0);
      
      return { 
        ...w, 
        taras: updatedTaras, 
        tareWeight: totalTare, 
        net: Math.max(0, grossVal - totalTare),
        isDirty: true 
      };
    }));
  };

  const removeTareFromRow = (rowId, tareId, e) => {
     if (e) e.stopPropagation();
     setWeighings(prev => prev.map(w => {
      if (w.id !== rowId) return w;
      const updatedTaras = w.taras.filter(t => t.id !== tareId);
      const grossVal = parseFloat(w.gross) || 0;
      const totalTare = updatedTaras.reduce((acc, t) => acc + ((parseFloat(t.peso_tara || t.weight) || 0) * (parseInt(t.qty) || 0)), 0);
      return { ...w, taras: updatedTaras, tareWeight: totalTare, net: Math.max(0, grossVal - totalTare), isDirty: true };
     }));
  };

  const updateTareQty = (rowId, tareId, newQty) => {
    setWeighings(prev => prev.map(w => {
      if (w.id !== rowId) return w;
      
      const updatedTaras = w.taras.map(t => {
        if (t.id === tareId) {
          if (newQty === '') {
            return { ...t, qty: '' };
          }
          const parsed = parseInt(newQty);
          return { ...t, qty: isNaN(parsed) ? 1 : Math.max(1, parsed) };
        }
        return t;
      });

      const grossVal = parseFloat(w.gross) || 0;
      const totalTare = updatedTaras.reduce((acc, t) => acc + ((parseFloat(t.peso_tara || t.weight) || 0) * (parseInt(t.qty) || 0)), 0);
      return { ...w, taras: updatedTaras, tareWeight: totalTare, net: Math.max(0, grossVal - totalTare), isDirty: true };
    }));
  };

  const removeWeighing = async (id, isSaved) => {
    if (isSaved) {
      try {
        const token = localStorage.getItem('token');
        await fetch(`${API_BASE_URL}/dispatch-cliente/pesaje/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (err) {
        console.error("Error al borrar pesaje:", err);
      }
    }
    setWeighings(prev => prev.filter(w => w.id !== id));
    if (activeRowId === id) setActiveRowId(null);
    deletedFlagRef.current = true;
  };

  const deletedFlagRef = useRef(false);

  // Autoguardado al cerrar
  useEffect(() => {
    weighingsRef.current = weighings;
  }, [weighings]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const handleClose = async () => {
    setLoading(true);
    try {
      const dirtyRows = weighingsRef.current.filter(w => w.isDirty && (parseFloat(w.gross) > 0 || parseInt(w.unidades) > 0 || w.saved));
      const token = localStorage.getItem('token');
      
      for (const w of dirtyRows) {
        const cleanTaras = (w.taras || []).map(t => ({
          ...t,
          qty: parseInt(t.qty) || 1
        }));
        const totalTare = cleanTaras.reduce(
          (acc, t) => acc + ((parseFloat(t.peso_tara || t.weight) || 0) * (parseInt(t.qty) || 1)),
          0
        );

        const payload = {
          unidades: parseInt(w.unidades) || 0,
          peso_bruto: parseFloat(w.gross),
          taras_seleccionadas: cleanTaras,
          porciones_seleccionadas: (w.porciones || []).map(p => p.val),
          peso_tara: totalTare
        };

        if (w.saved) {
           await fetch(`${API_BASE_URL}/dispatch-cliente/pesaje/${w.id}`, {
             method: 'PUT',
             headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
             body: JSON.stringify(payload)
           });
        } else {
           await fetch(`${API_BASE_URL}/dispatch-cliente/producto/${producto.id}/pesaje`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
             body: JSON.stringify(payload)
           });
        }
      }
      if (dirtyRows.length > 0 || deletedFlagRef.current) {
        onRefresh();
      }
    } catch (err) {
      console.error("Error en autoguardado:", err);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  const totals = weighings.reduce((acc, curr) => {
    if (parseFloat(curr.net) > 0 || parseFloat(curr.gross) > 0) {
      acc.gross += parseFloat(curr.gross) || 0;
      acc.tare += curr.tareWeight || 0;
      acc.net += parseFloat(curr.net) || 0;
      acc.unidades += parseInt(curr.unidades) || 0;
    }
    return acc;
  }, { gross: 0, tare: 0, net: 0, unidades: 0 });

  const filteredTares = envases.filter(t => (t.name || '').toLowerCase().includes(tareSearchQuery.toLowerCase()));
  const isUnitsProduct = ['u', 'units', 'unidades', 'unidad'].includes((producto.uom || '').toLowerCase());

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scale-up">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl">
              <Scale className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800">
              Registro de Pesadas con Taras - Despacho Cliente
            </h3>
          </div>
          <button onClick={handleClose} disabled={loading} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Sub Header */}
        <div className="px-6 py-4 bg-orange-50/50 border-b border-orange-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-orange-600 bg-orange-100 px-2 py-0.5 rounded-md mb-1 block w-max">
              Producto a Pesar
            </span>
            <h4 className="text-xl font-extrabold text-slate-900">{producto?.plato_nombre}</h4>
          </div>
          <div className="flex gap-6 items-center">
            { (() => {
               const diff = totals.unidades - (producto?.cantidad_teorica || 0);
               if (diff < 0) return <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-black border border-orange-200">Faltan {Math.abs(diff)} porc.</span>;
               if (diff > 0) return <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-black border border-emerald-200">{diff} porc. adicionales</span>;
               return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-black flex items-center"><CheckCircle2 className="w-3 h-3 mr-1" />Exacto</span>;
            })() }
            <div className="text-right">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Solicitado</span>
              <span className="text-2xl font-black text-slate-800">{(producto?.cantidad_teorica || 0).toFixed(0)} <span className="text-sm text-slate-500">porciones</span></span>
            </div>
            <div className="text-right bg-white px-4 py-2 rounded-xl shadow-xs border border-orange-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-500 block">Porciones Despachadas</span>
              <span className="text-2xl font-black text-orange-600">{totals.unidades} <span className="text-sm text-orange-400">porciones</span></span>
            </div>
          </div>
        </div>

        {/* Body (Split View) */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          
          {/* Left Panel: Table */}
          <div className="flex-1 flex flex-col border-r border-slate-200 bg-white">
            <div className="flex-1 overflow-auto p-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="pb-3 text-center w-10">#</th>
                    <th className="pb-3 text-right w-32">Bruto (kg)</th>
                    <th className="pb-3 text-left pl-4">Taras Seleccionadas</th>
                    <th className="pb-3 text-right w-32">Neto (kg)</th>
                    <th className="pb-3 text-center w-28">Porciones</th>
                    <th className="pb-3 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {weighings.length === 0 ? (
                    <tr><td colSpan="6" className="py-8 text-center text-slate-400 font-medium">No hay pesadas registradas. Use el botón Agregar Pesada.</td></tr>
                  ) : (
                    weighings.map((row, idx) => {
                      const tare = envases.find(t => t.id === row.tareId);
                      const isRowActive = row.id === activeRowId;
                      return (
                        <tr key={row.id} 
                            onClick={() => !isUnitsProduct && setActiveRowId(row.id)}
                            className={`border-b border-slate-100 transition-colors ${isRowActive ? 'bg-orange-50/30' : 'hover:bg-slate-50'}`}>
                          <td className="py-3 text-center text-sm font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-3">
                            <input type="number" step="0.001" placeholder="0.000"
                              value={row.gross} onChange={(e) => updateWeighing(row.id, 'gross', e.target.value)}
                              onFocus={() => !isUnitsProduct && setActiveRowId(row.id)}
                              className="w-full text-right font-mono font-bold text-lg bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none" />
                          </td>
                          <td className="py-3 pl-4">
                            <div className={`w-full text-left p-2.5 rounded-2xl border flex flex-wrap gap-2.5 min-h-[64px] items-center transition-all ${isRowActive ? 'border-orange-400 bg-white ring-2 ring-orange-100 shadow-sm' : 'border-slate-200 bg-slate-50'}`}>
                              { row.taras && row.taras.length > 0 ? (
                                row.taras.map(tare => {
                                  const unitWeight = parseFloat(tare.peso_tara || tare.weight || 0);
                                  const qty = tare.qty === '' ? '' : (parseInt(tare.qty) || 1);
                                  const numericQty = parseInt(tare.qty) || 0;
                                  const itemTotalTare = unitWeight * numericQty;

                                  return (
                                    <div 
                                      key={tare.id} 
                                      className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl p-2 pr-3 shadow-xs hover:border-slate-300 transition-all select-none"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {/* Icon / Photo */}
                                      <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden text-base">
                                        {(() => {
                                          const match = envases.find(e => e.id === tare.id);
                                          const photo = tare.photo || match?.photo || match?.image_128;
                                          return photo ? (
                                            <img 
                                              src={photo.startsWith('data:') ? photo : `data:image/png;base64,${photo}`} 
                                              className="w-full h-full object-cover" 
                                              alt={tare.name}
                                            />
                                          ) : '📦';
                                        })()}
                                      </div>

                                      {/* Info & Quantity Stepper */}
                                      <div className="flex flex-col">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[11px] font-bold text-slate-800 truncate max-w-[130px]" title={tare.name}>
                                            {tare.name}
                                          </span>
                                          <button 
                                            type="button"
                                            onClick={(e) => removeTareFromRow(row.id, tare.id, e)} 
                                            className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full p-0.5 transition-colors"
                                            title="Quitar tara"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>

                                        <div className="flex items-center gap-2 mt-1">
                                          {/* Stepper [-] [qty] [+] */}
                                          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg overflow-hidden h-6">
                                            <button
                                              type="button"
                                              onClick={() => updateTareQty(row.id, tare.id, Math.max(1, (parseInt(tare.qty) || 1) - 1))}
                                              disabled={(parseInt(tare.qty) || 1) <= 1}
                                              className="w-6 h-full flex items-center justify-center text-slate-600 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                              title="Disminuir cantidad"
                                            >
                                              <Minus className="w-3 h-3" />
                                            </button>
                                            <input 
                                              type="number" 
                                              min="1" 
                                              value={qty} 
                                              onChange={(e) => updateTareQty(row.id, tare.id, e.target.value)}
                                              onBlur={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (!val || val < 1) {
                                                  updateTareQty(row.id, tare.id, 1);
                                                }
                                              }}
                                              className="w-9 h-full text-xs font-black text-center text-slate-800 bg-white border-x border-slate-200 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                                              title="Cantidad de envases"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => updateTareQty(row.id, tare.id, (parseInt(tare.qty) || 1) + 1)}
                                              className="w-6 h-full flex items-center justify-center text-slate-600 hover:bg-slate-200 active:bg-slate-300 transition-colors"
                                              title="Aumentar cantidad"
                                            >
                                              <Plus className="w-3 h-3" />
                                            </button>
                                          </div>

                                          {/* Unit weight & total tare for this item */}
                                          <div className="flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                                            <span>x -{unitWeight.toFixed(3)}kg</span>
                                            {numericQty > 1 && (
                                              <span className="font-extrabold text-rose-700 ml-0.5">
                                                (= -{itemTotalTare.toFixed(3)}kg)
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-slate-400 text-sm font-medium italic py-1 px-2 w-full">
                                  {isUnitsProduct ? 'No aplica tara (producto en unidades)' : 'Seleccione envases a la derecha ➜'}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-right font-mono font-black text-xl text-emerald-600">
                            {parseFloat(row.net || 0).toFixed(3)}
                          </td>
                          <td className="py-3 px-2 align-top">
                            <div className="flex flex-col gap-1.5 w-full mt-2">
                              <div className="flex flex-wrap gap-1">
                                {(row.porciones || []).map(p => (
                                  <span key={p.id} className="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded-md flex items-center gap-1 font-black border border-orange-200 shadow-sm transition-all hover:shadow hover:bg-orange-200 cursor-default">
                                    {p.val}
                                    <button 
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); removePorcion(row.id, p.id); }}
                                      className="text-orange-400 hover:text-rose-600 hover:bg-rose-100 rounded-full p-0.5 transition-colors ml-1 focus:outline-none"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                              <input 
                                type="number" min="1" placeholder="+ Añadir (Enter)"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && e.target.value) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    addPorcion(row.id, e.target.value);
                                    e.target.value = '';
                                  }
                                }}
                                onFocus={() => !isUnitsProduct && setActiveRowId(row.id)}
                                className="w-full text-center font-bold text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2 py-1.5 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 placeholder:text-slate-400 transition-colors shadow-xs" 
                                title="Escriba la cantidad de porciones y presione Enter para añadirla a la lista"
                              />
                              {(row.porciones || []).length > 0 && (
                                <div className="text-[10px] uppercase font-black tracking-widest text-orange-600 text-center mt-1 bg-orange-50 rounded-lg py-1 border border-orange-100 shadow-xs">
                                  Total: <span className="text-sm">{row.unidades}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            <button onClick={(e) => { e.stopPropagation(); removeWeighing(row.id, row.saved); }} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                              <X className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50">
              <button onClick={addWeighingRow} className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:border-slate-300 hover:bg-slate-100 transition-colors shadow-xs">
                <Plus className="w-4 h-4" /> Agregar Pesada
              </button>
            </div>
          </div>

          {/* Right Panel: Tare Catalog */}
          <div className="w-80 flex flex-col bg-slate-50">
            <div className="p-4 border-b border-slate-200">
              <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Warehouse className="w-4 h-4" /> Catálogo de Envases</h4>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Buscar envase..." value={tareSearchQuery} onChange={e => setTareSearchQuery(e.target.value)} disabled={isUnitsProduct}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 text-sm" />
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {isUnitsProduct ? (
                <div className="text-center p-6 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <p className="font-bold text-slate-800 mb-2">No aplica tara</p>
                  <p className="text-xs text-slate-500">Este producto se mide en unidades.</p>
                </div>
              ) : (
                <>
                  <div onClick={() => selectTareForActiveRow(null)} className={`bg-white border rounded-xl p-3 cursor-pointer flex items-center gap-3 transition-all hover:shadow-md ${activeRowId && weighings.find(w=>w.id===activeRowId)?.taras.length === 0 ? 'border-orange-400 ring-2 ring-orange-100' : 'border-slate-200'}`}>
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">✖</div>
                    <div><p className="font-bold text-slate-800 text-sm">Limpiar Taras</p><p className="text-xs font-bold text-slate-400">0.000 kg</p></div>
                  </div>
                  {filteredTares.map(tare => {
                    return (
                      <div key={tare.id} onClick={() => selectTareForActiveRow(tare)} className="bg-white border rounded-xl p-3 cursor-pointer flex items-center gap-3 transition-all hover:shadow-md border-slate-200 hover:border-orange-300">
                        <div className="w-10 h-10 rounded-lg border border-slate-100 overflow-hidden shadow-xs shrink-0 bg-slate-100 flex items-center justify-center">
                          {(() => {
                            const photo = tare.photo || tare.image_128;
                            return photo ? (
                              <img 
                                src={photo.startsWith('data:') ? photo : `data:image/png;base64,${photo}`} 
                                className="w-full h-full object-cover" 
                                alt={tare.name}
                              />
                            ) : (
                              <span className="text-base">📦</span>
                            );
                          })()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{tare.name}</p>
                          <p className="text-xs font-black text-rose-500">-{parseFloat(tare.peso_tara || tare.weight || 0).toFixed(3)} kg</p>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="flex gap-8">
            <div><p className="text-xs font-bold text-slate-400 uppercase">Bruto Total</p><p className="text-lg font-black text-slate-800">{totals.gross.toFixed(3)} kg</p></div>
            <div><p className="text-xs font-bold text-slate-400 uppercase">Tara Total</p><p className="text-lg font-black text-rose-500">-{totals.tare.toFixed(3)} kg</p></div>
            <div><p className="text-xs font-bold text-emerald-500 uppercase">Neto Total</p><p className="text-xl font-black text-emerald-600">{totals.net.toFixed(3)} kg</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleClose} disabled={loading} className="px-8 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/20 flex items-center gap-2 disabled:opacity-50">
              {loading ? 'Guardando...' : <><CheckCircle2 className="w-5 h-5" /> Cerrar y Guardar</>}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AutoTareModal;
