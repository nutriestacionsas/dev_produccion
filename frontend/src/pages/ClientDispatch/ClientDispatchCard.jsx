import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquareText, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { API_BASE_URL } from '../../App';

const ClientDispatchCard = ({ producto, onOpenWeighing, onRefresh }) => {
  const [showNovedadModal, setShowNovedadModal] = useState(false);
  const [novedadText, setNovedadText] = useState(producto.novedad || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setNovedadText(producto.novedad || '');
  }, [producto.novedad]);

  const despachado = producto.unidades_despachadas || 0;
  const solicitado = producto.cantidad_teorica || 0;
  const delta = despachado - solicitado;
  
  const pct = solicitado > 0 ? Math.min(100, (despachado / solicitado) * 100) : 0;
  const isFulfilled = solicitado > 0 && despachado >= solicitado;

  const saveNovedad = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE_URL}/dispatch-cliente/producto/${producto.id}/novedad`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ novedad: novedadText })
      });
      setShowNovedadModal(false);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div 
        onClick={() => onOpenWeighing(producto)}
        className={`relative rounded-2xl border shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer group ${isFulfilled ? 'bg-emerald-500/15 border-emerald-400/50' : 'bg-white border-slate-200 hover:border-indigo-300'} ${producto.novedad ? 'border-l-4 border-l-amber-400' : ''}`}
      >
        <div className="p-4 flex flex-col h-full gap-3">
          {/* Header: Title & Novedad */}
          <div className="flex justify-between items-start gap-3">
            <div className="flex flex-col flex-1 min-w-0">
               <h4 className="text-sm font-black text-slate-800 line-clamp-2 leading-tight" title={producto.plato_nombre}>
                 {producto.plato_nombre}
               </h4>
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{producto.tipo}</span>
            </div>
            <button 
               type="button"
               onClick={(e) => { e.stopPropagation(); setShowNovedadModal(true); }}
               className={`p-1.5 rounded-lg transition-colors shrink-0 ${producto.novedad ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-400 hover:bg-slate-200 hover:text-slate-700'}`}
               title={producto.novedad || "Añadir comentario / novedad"}
            >
               {producto.novedad ? <AlertCircle className="w-4 h-4" /> : <MessageSquareText className="w-4 h-4" />}
            </button>
          </div>

          {/* Space filler to push progress bar to bottom if title is short */}
          <div className="flex-1"></div>

          {/* Progress Section */}
          <div className="flex flex-col gap-1.5 mt-2">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {isFulfilled ? (
                  <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Completado</span>
                ) : 'Progreso'}
              </span>
              <div className="flex items-baseline gap-1">
                <span className={`text-lg font-black leading-none ${isFulfilled ? 'text-emerald-600' : 'text-indigo-600'}`}>{despachado}</span>
                <span className="text-xs font-bold text-slate-400">/ {solicitado}</span>
              </div>
            </div>
            
            {/* Progress Bar Track */}
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
              <div 
                className={`h-full transition-all duration-500 ease-out ${isFulfilled ? 'bg-emerald-500' : 'bg-indigo-500'}`} 
                style={{ width: `${pct}%` }}
              ></div>
            </div>
            
            {/* Delta & Peso */}
            <div className="flex justify-between items-center mt-1">
              <span className="text-[10px] font-bold text-slate-400">{(producto.peso_despachado || 0).toFixed(2)} kg acumulados</span>
              {delta > 0 && (
                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">+{delta} extra</span>
              )}
              {delta < 0 && despachado > 0 && (
                <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100">Faltan {Math.abs(delta)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Novedad montado en Document Body con Portal para evitar interferencias */}
      {showNovedadModal && createPortal(
        <div 
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            setShowNovedadModal(false);
          }}
        >
          <div 
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-amber-50/80 px-6 py-4 border-b border-amber-100/80 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-slate-800 font-black text-sm">
                    Comentario / Novedad
                  </h3>
                  <p className="text-[11px] font-semibold text-slate-500 truncate max-w-[260px]">
                    {producto.plato_nombre}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNovedadModal(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 flex flex-col gap-3">
              <label className="text-xs font-bold text-slate-700">
                Observación para este producto en el despacho:
              </label>
              <textarea
                value={novedadText}
                onChange={(e) => setNovedadText(e.target.value)}
                placeholder="Ej. Cambio de presentación, tara especial, faltante, solicitud del cliente..."
                rows={4}
                className="w-full p-3.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all outline-none resize-none font-medium text-slate-700"
              />
              <p className="text-[11px] text-slate-400">
                Este comentario quedará registrado en el detalle del producto de este despacho.
              </p>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 mt-2 pt-2 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setShowNovedadModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={saveNovedad}
                  disabled={loading}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-sm shadow-amber-200 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {loading ? 'Guardando...' : 'Guardar Comentario'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default ClientDispatchCard;
