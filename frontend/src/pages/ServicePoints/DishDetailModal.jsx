import React from 'react';
import { X, Scale, FileText, Calendar, Clock, AlertCircle } from 'lucide-react';

const DishDetailModal = ({ producto, onClose }) => {
  if (!producto) return null;

  const { despachoHeader, plato_nombre, tipo, cantidad_teorica, peso_despachado, unidades_despachadas, novedad, pesajes } = producto;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return timeStr;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between shrink-0">
          <div>
            <h3 className="text-xl font-black text-slate-800">{plato_nombre}</h3>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{tipo}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Cliente</span>
              <span className="text-sm font-bold text-slate-700 uppercase line-clamp-1" title={despachoHeader?.cliente_nombre}>
                {despachoHeader?.cliente_nombre}
              </span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Fecha</span>
              <span className="text-sm font-bold text-slate-700 capitalize line-clamp-1">
                {formatDate(despachoHeader?.fecha)}
              </span>
            </div>
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-1">Solicitado</span>
              <span className="text-lg font-black text-indigo-700">{cantidad_teorica} Unds</span>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
              <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider block mb-1">Despachado</span>
              <span className="text-lg font-black text-emerald-700">{unidades_despachadas} Unds</span>
            </div>
          </div>

          {/* Novedad */}
          {novedad && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-2xl flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-yellow-800 mb-1">Novedad Registrada</h4>
                <p className="text-sm text-yellow-700 whitespace-pre-wrap">{novedad}</p>
              </div>
            </div>
          )}

          {/* Pesajes List */}
          <div>
            <h4 className="text-base font-black text-slate-800 flex items-center gap-2 mb-4">
              <Scale className="w-5 h-5 text-slate-400" />
              Historial de Pesajes
            </h4>
            
            {pesajes && pesajes.length > 0 ? (
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <div className="col-span-2">Hora</div>
                  <div className="col-span-2 text-center">Unidades</div>
                  <div className="col-span-2 text-right">Peso Bruto</div>
                  <div className="col-span-4 pl-4">Taras</div>
                  <div className="col-span-2 text-right text-emerald-600">Peso Neto</div>
                </div>
                
                <div className="divide-y divide-slate-100">
                  {pesajes.map((pes, idx) => (
                    <div key={pes.id || idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-6 py-4 items-center hover:bg-slate-50 transition-colors">
                      <div className="md:col-span-2 flex items-center gap-2 text-sm text-slate-500 font-medium">
                        <Clock className="w-4 h-4 md:hidden" />
                        {formatTime(pes.timestamp)}
                      </div>
                      
                      <div className="md:col-span-2 md:text-center text-sm font-bold text-slate-700 flex justify-between md:block">
                        <span className="md:hidden text-slate-400 font-normal">Unidades:</span>
                        {pes.unidades} Unds
                      </div>
                      
                      <div className="md:col-span-2 md:text-right text-sm font-medium text-slate-600 flex justify-between md:block">
                        <span className="md:hidden text-slate-400 font-normal">Peso Bruto:</span>
                        {pes.peso_bruto.toFixed(3)} kg
                      </div>
                      
                      <div className="md:col-span-4 md:pl-4 text-xs text-slate-500 flex flex-col gap-1">
                        <span className="md:hidden text-slate-400 font-normal mb-1">Taras:</span>
                        {pes.taras_seleccionadas && pes.taras_seleccionadas.length > 0 ? (
                          pes.taras_seleccionadas.map((t, i) => {
                            const q = parseInt(t.qty || t.cantidad) || 1;
                            const w = parseFloat(t.peso_tara || t.weight || t.peso || 0);
                            return (
                              <div key={i} className="flex justify-between items-center bg-slate-100 px-2 py-1 rounded">
                                <span className="truncate max-w-[120px]">{t.name || t.nombre}</span>
                                <span className="font-bold text-slate-600">
                                  {q > 1 ? `${q}x -${w.toFixed(3)}kg` : `-${w.toFixed(3)}kg`}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-slate-400 italic">Sin tara</span>
                        )}
                      </div>
                      
                      <div className="md:col-span-2 md:text-right text-sm font-black text-emerald-600 flex justify-between md:block mt-2 md:mt-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                        <span className="md:hidden text-slate-400 font-normal">Peso Neto:</span>
                        {pes.peso_neto.toFixed(3)} kg
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Total Footer */}
                <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between md:items-center gap-4">
                  <span className="text-sm font-bold text-slate-500 uppercase">Total Despachado</span>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="block text-xs font-bold text-slate-400 uppercase">Unidades</span>
                      <span className="text-xl font-black text-slate-800">{unidades_despachadas}</span>
                    </div>
                    <div className="w-px h-8 bg-slate-200"></div>
                    <div className="text-right">
                      <span className="block text-xs font-bold text-slate-400 uppercase">Peso Neto Total</span>
                      <span className="text-xl font-black text-emerald-600">{peso_despachado.toFixed(3)} kg</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-500">No hay registros de pesaje para este producto.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default DishDetailModal;
