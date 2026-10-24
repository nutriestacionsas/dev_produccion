import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { 
  X, 
  Loader2, 
  AlertCircle, 
  Search, 
  Filter,
  Database,
  Maximize2,
  Printer,
  Minimize2,
  MessageSquare,
  ArrowUp,
  ArrowDown,
  Minus,
  FileText
} from 'lucide-react';
import { API_BASE_URL } from '../App';

export default function DispatchDayReportModal({ fecha, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawData, setRawData] = useState([]);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMo, setSelectedMo] = useState(''); // '' significa 'Todas'
  const [displayMode, setDisplayMode] = useState('despachado'); // 'despachado' o 'solicitado'
  const [showNovedadesModal, setShowNovedadesModal] = useState(false);
  const [activeCommentProd, setActiveCommentProd] = useState(null);
  
  // Full screen mode
  const [isFullScreen, setIsFullScreen] = useState(false);
  const tableContainerRef = useRef(null);
  
  useEffect(() => {
    fetchData();
  }, [fecha]);

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);


  const handlePrint = useReactToPrint({
    contentRef: tableContainerRef,
    documentTitle: 'Matriz_Utilizacion',
    pageStyle: `
      @page { size: landscape; margin: 5mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; overflow: visible !important; }
        table { zoom: 0.65; max-width: 100%; page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
      }
    `,
  });

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      if (tableContainerRef.current) {
        tableContainerRef.current.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      }
    } else {
      document.exitFullscreen();
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/dispatch/informe-general/${fecha}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error('Error al cargar el informe consolidado del dÃ­a');
      const data = await res.json();
      setRawData(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  // Procesamiento de matriz para la nueva API
  const { productsList, availableMos } = useMemo(() => {
    if (!rawData || !rawData.columns) return { productsList: [], availableMos: [] };
    
    const moList = rawData.columns.map(col => ({
      mo_name: col.mo_name || col,
      recipe_name: col.recipe_name || col
    }));
    
    const pList = (rawData.rows || []).map(row => {
      // Re-map mo_distributions to the old format so filters keep working
      const mosData = {};
      Object.keys(row.mo_distributions || {}).forEach(moName => {
        const moDist = row.mo_distributions[moName];
        mosData[moName] = {
          solicitado_mo: typeof moDist === 'object' ? moDist.solicitado_mo : moDist,
          utilizar_mo: typeof moDist === 'object' ? moDist.utilizar_mo : moDist
        };
      });
      
      return {
        product_id: row.odoo_product_id,
        product_name: row.product_name,
        uom: row.uom,
        total_solicitado: row.solicitado,
        total_despachado: row.despachado,
        diferencia: row.diferencia,
        comentario_diferencia: '',
        mos: mosData
      };
    });
    
    return {
      productsList: pList,
      availableMos: moList
    };
  }, [rawData]);

  // Aplicación de filtros
  const globalNovedades = ''; // No more novedades in the new payload structure unless added later

  const { filteredProducts, filteredMosHeaders } = useMemo(() => {
    // 1. Filtrar las columnas (MOs)
    let moHeaders = availableMos;
    if (selectedMo) {
      moHeaders = availableMos.filter(m => m.mo_name === selectedMo);
    }
    
    // 2. Filtrar productos
    const prods = productsList.filter(prod => {
      // Si hay un MO seleccionado, solo mostrar productos usados en ese MO
      if (selectedMo) {
        const moData = prod.mos[selectedMo];
        if (!moData || (moData.utilizar_mo === 0 && moData.solicitado_mo === 0)) return false;
      }
      
      // Filtro de bÃºsqueda por texto (nombre de producto)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        if (!prod.product_name.toLowerCase().includes(term)) {
          return false;
        }
      }
      
      return true;
    });

    return {
      filteredProducts: prods,
      filteredMosHeaders: moHeaders
    };
  }, [productsList, availableMos, selectedMo, searchTerm]);

  const getFormatDateTitle = (dateString) => {
    try {
      const parts = dateString.split('-');
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return date.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      }
      return dateString;
    } catch {
      return dateString;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-6 print:relative print:inset-auto print:bg-white print:p-0 print:block">
      <div className="bg-slate-50 w-full max-w-[98vw] h-[95vh] rounded-3xl flex flex-col shadow-2xl overflow-hidden border border-slate-300 print:max-w-none print:w-full print:h-auto print:overflow-visible print:shadow-none print:border-none print:rounded-none print:bg-white">
        
        {/* HEADER */}
        <div className="bg-white px-6 py-4 border-b border-slate-300 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
          <div>
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
              <Database className="w-6 h-6 text-orange-500" />
              Matriz de Utilización
            </h2>
            <p className="text-slate-500 font-medium capitalize mt-1 text-sm">
              {getFormatDateTitle(fecha)}
            </p>
          </div>
          <div className="flex items-center gap-2 self-end md:self-auto">
            <button 
              onClick={toggleFullScreen}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600 print:hidden"
              title="Pantalla completa"
            >
              <Maximize2 className="w-6 h-6" />
            </button>
            <button
              onClick={() => handlePrint()}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600 print:hidden"
              title="Imprimir matriz"
            >
              <Printer className="w-6 h-6" />
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600 print:hidden"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* CONTENIDO */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12">
              <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
              <p className="text-slate-500 font-medium">Analizando recetas y calculando matriz...</p>
            </div>
          ) : error ? (
            <div className="p-8">
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center gap-3 font-semibold">
                <AlertCircle className="w-5 h-5" />
                {error}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* BARRA DE FILTROS */}
              <div className="bg-white p-4 border-b border-slate-300 shrink-0 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between print:hidden">
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <div className="relative w-full md:w-96">
                    <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar ingrediente..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all text-sm outline-none font-medium"
                    />
                  </div>
                  <button
                    onClick={() => setShowNovedadesModal(true)}
                    className={`flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-all shadow-sm border-2 text-sm shrink-0 ${globalNovedades ? 'bg-amber-50 text-amber-600 border-amber-300 hover:bg-amber-100' : 'bg-white text-slate-500 border-slate-300 hover:border-blue-300 hover:text-blue-600'}`}
                  >
                    <FileText className="w-4 h-4" />
                    Novedades del Día
                  </button>
                </div>
                
                <div className="flex flex-col md:flex-row gap-3 md:items-center justify-end w-full md:w-auto">
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                      onClick={() => setDisplayMode('solicitado')}
                      className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                        displayMode === 'solicitado' 
                          ? 'bg-white text-blue-600 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Solicitado
                    </button>
                    <button
                      onClick={() => setDisplayMode('despachado')}
                      className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                        displayMode === 'despachado' 
                          ? 'bg-white text-orange-600 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Despachado
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-slate-500 font-bold text-sm whitespace-nowrap">
                      <Filter className="w-4 h-4 inline-block mr-1" /> Preparación (FAB):
                    </label>
                    <select 
                      value={selectedMo}
                      onChange={(e) => setSelectedMo(e.target.value)}
                      className="w-full md:w-64 px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                    >
                      <option value="">Todas las preparaciones</option>
                      {availableMos.map(mo => (
                        <option key={mo.mo_name} value={mo.mo_name}>
                          {mo.recipe_name} ({mo.mo_name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* TABLA PRINCIPAL (PIVOT) */}
              <div ref={tableContainerRef} className="flex-1 overflow-auto bg-slate-50 relative print:overflow-visible print:h-auto print:bg-white print-matrix-target">
                {isFullScreen && (
                  <button
                    onClick={() => document.exitFullscreen()}
                    className="fixed top-4 right-4 z-[300] bg-black/40 hover:bg-black/60 text-white p-2.5 rounded-full shadow-lg backdrop-blur-sm transition-all"
                    title="Salir de pantalla completa"
                  >
                    <Minimize2 className="w-5 h-5" />
                  </button>
                )}
                
                {filteredProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Database className="w-16 h-16 text-slate-200 mb-4" />
                    <h3 className="text-lg font-bold text-slate-600">No se encontraron productos</h3>
                    <p className="text-slate-400 mt-1">Prueba a cambiar o limpiar los filtros.</p>
                  </div>
                ) : (
                  <table className="w-max min-w-full text-left border-separate border-spacing-0">
                    <thead>
                      <tr className="bg-white text-slate-500 text-[11px] font-black uppercase tracking-wider sticky top-0 z-30 shadow-sm">
                        <th className="px-6 py-4 sticky left-0 z-40 bg-white border-b border-r border-slate-300 min-w-[200px]">
                          Producto
                        </th>
                        <th className="px-4 py-4 text-center border-b border-r border-slate-300 bg-white">U.M.</th>
                        <th className="px-4 py-4 text-right border-b border-r border-slate-300 bg-slate-50 print:hidden">Solicitado</th>
                        <th className="px-4 py-4 text-right border-b border-r border-slate-300 bg-blue-50/50 print:hidden">Despachado</th>
                        <th className="px-4 py-4 text-center border-b border-r border-slate-300 bg-white print:hidden">Diferencia</th>
                        
                        {/* Columnas de Preparaciones */}
                        {filteredMosHeaders.map(mo => (
                          <th key={mo.mo_name} className="px-4 py-3 text-right border-b border-r border-slate-300 bg-white hover:bg-slate-50 transition-colors group max-w-[150px]">
                            <div className="flex flex-col items-end justify-end">
                              <span className="font-bold text-slate-700 truncate w-full block" title={mo.recipe_name}>
                                {mo.recipe_name}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400 mt-1 bg-slate-100 px-1.5 py-0.5 rounded">{mo.mo_name}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {filteredProducts.map(prod => {
                        let dispSolicitado = prod.total_solicitado;
                        let dispDespachado = prod.total_despachado;
                        let dispDiferencia = prod.diferencia;
                        
                        if (selectedMo !== '') {
                          const moData = prod.mos[selectedMo];
                          dispSolicitado = moData?.solicitado_mo || 0;
                          dispDespachado = moData?.utilizar_mo || 0;
                          dispDiferencia = dispDespachado - dispSolicitado;
                        }

                        let diffColor = "text-slate-500 bg-slate-100";
                        let DiffIcon = Minus;
                        
                        if (dispDiferencia > 0) {
                          diffColor = "text-emerald-700 bg-emerald-100 text-emerald-700"; // Excedente a favor
                          DiffIcon = ArrowUp;
                        } else if (dispDiferencia < 0) {
                          diffColor = "text-red-700 bg-red-100 text-red-700"; // Faltante
                          DiffIcon = ArrowDown;
                        } else {
                          diffColor = "text-slate-600 bg-slate-100 text-slate-600";
                          DiffIcon = Minus;
                        }

                        return (
                          <tr key={prod.product_id} className="hover:bg-slate-50/80 transition-colors group">
                            <td className="px-6 py-3 font-semibold text-slate-700 sticky left-0 z-30 bg-white border-b border-r border-slate-300">
                              {prod.product_name}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-medium text-slate-500 border-b border-r border-slate-300 bg-white">
                              {prod.uom}
                            </td>
                            <>
                              <td className="px-4 py-3 text-right font-mono font-bold text-slate-500 border-b border-r border-slate-300 bg-slate-50/50 print:hidden">
                                {dispSolicitado.toFixed(3)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-black text-blue-600 border-b border-r border-slate-300 bg-blue-50/30 print:hidden">
                                {dispDespachado.toFixed(3)}
                              </td>
                              <td className="px-4 py-3 text-center border-b border-r border-slate-300 print:hidden">
                                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold ${diffColor}`}>
                                  <DiffIcon className="w-3 h-3" />
                                  <span>{Math.abs(dispDiferencia).toFixed(3)}</span>
                                </div>
                              </td>
                            </>
                            
                            {/* Celdas de Preparaciones */}
                            {filteredMosHeaders.map(mo => {
                              const moData = prod.mos[mo.mo_name];
                              const valueToDisplay = displayMode === 'solicitado' 
                                ? (moData?.solicitado_mo || 0) 
                                : (moData?.utilizar_mo || 0);
                              
                              const hasValue = valueToDisplay > 0;
                              const isPartOfRecipe = moData && (moData.solicitado_mo > 0 || moData.utilizar_mo > 0);
                              
                              return (
                                <td key={mo.mo_name} className={`px-4 py-3 text-right font-mono text-sm border-b border-r border-slate-300 transition-colors ${hasValue ? (displayMode === 'solicitado' ? 'font-bold text-slate-700 bg-blue-50/20' : 'font-bold text-slate-700 bg-orange-50/20') : (isPartOfRecipe ? 'font-bold text-slate-400 bg-slate-50' : 'text-slate-300')}`}>
                                  {isPartOfRecipe ? valueToDisplay.toFixed(3) : '-'}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
        
      {/* Novedades Modal */}
      {showNovedadesModal && (() => {
        const productsWithComments = filteredProducts.filter(p => p.comentario_diferencia && p.comentario_diferencia.trim() !== '');
        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
              <div className="px-6 py-4 border-b border-slate-300 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-500" />
                  Novedades del Día
                </h3>
                <button onClick={() => setShowNovedadesModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto text-slate-700 text-sm">
                {globalNovedades && (
                  <div className="mb-6">
                    <h4 className="font-bold text-slate-800 mb-2 uppercase text-xs tracking-wider border-b pb-1">Comentarios Generales</h4>
                    <div className="whitespace-pre-wrap">{globalNovedades}</div>
                  </div>
                )}
                
                {productsWithComments.length > 0 && (
                  <div>
                    <h4 className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-1">Diferencias por Producto</h4>
                    <div className="space-y-4">
                      {productsWithComments.map(prod => (
                        <div key={prod.product_id} className="bg-slate-50 border border-slate-300 rounded-xl p-4">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-slate-800">{prod.product_name}</span>
                            <div className="flex items-center gap-3 text-xs font-mono">
                              <span className="text-slate-500">Sol: {prod.total_solicitado.toFixed(3)}</span>
                              <span className="text-blue-600 font-bold">Des: {prod.total_despachado.toFixed(3)}</span>
                            </div>
                          </div>
                          <div className="whitespace-pre-wrap text-slate-600">
                            {prod.comentario_diferencia}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {!globalNovedades && productsWithComments.length === 0 && (
                  <p className="text-slate-400 text-center py-4">No se registraron novedades ni diferencias para este día.</p>
                )}
              </div>
              <div className="px-6 py-4 border-t border-slate-300 bg-slate-50 flex justify-end gap-3 shrink-0">
                <button onClick={() => setShowNovedadesModal(false)} className="px-5 py-2.5 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
