import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw, Users, PackageOpen, ChevronLeft, ChevronDown, ChevronRight, Check, Clock, Search, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../App';
import DishDetailModal from './DishDetailModal';

const ServicePointsPlantDispatch = () => {
  const navigate = useNavigate();
  
  // Data States
  const [fechasData, setFechasData] = useState({});
  const [clientesData, setClientesData] = useState({});
  
  // Selection States
  const [activeDateStr, setActiveDateStr] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [activeMenuType, setActiveMenuType] = useState('');
  const [searchDate, setSearchDate] = useState('');
  
  // Loading States
  const [loadingFechas, setLoadingFechas] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  
  // Modal State
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Initial Fetch of Dates
  const fetchFechasDisponibles = async () => {
    setLoadingFechas(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/puntos-servicio/despachos-planta/fechas-disponibles`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Error fetching dates");
      const data = await res.json();
      
      const grouped = {};
      data.forEach(d => {
        grouped[d.fecha] = d.grupos;
      });
      setFechasData(grouped);
      
      if (!activeDateStr && data.length > 0) {
        // Automatically open the most recent date
        const sortedDates = data.map(d => d.fecha).sort((a, b) => new Date(b) - new Date(a));
        setActiveDateStr(sortedDates[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFechas(false);
    }
  };

  useEffect(() => {
    fetchFechasDisponibles();
  }, []);

  // Fetch Clients Data when Date changes
  const fetchDispatchData = async () => {
    if (!activeDateStr) return;
    setLoadingData(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/puntos-servicio/despachos-planta?fecha=${activeDateStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Error fetching clients data");
      const data = await res.json();
      
      setClientesData(data.clientes || {});
      
      // Select first client by default
      if (!selectedClient && Object.keys(data.clientes || {}).length > 0) {
        setSelectedClient(Object.keys(data.clientes)[0]);
      } else if (selectedClient && !data.clientes[selectedClient]) {
        setSelectedClient(Object.keys(data.clientes)[0] || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (activeDateStr) {
      fetchDispatchData();
    }
  }, [activeDateStr]);

  // Si el usuario usa el buscador de fechas, seleccionamos esa fecha automáticamente
  useEffect(() => {
    if (searchDate && fechasData[searchDate]) {
      setActiveDateStr(searchDate);
    } else if (searchDate && !fechasData[searchDate]) {
      setActiveDateStr(null);
      setClientesData({});
      setSelectedClient(null);
    }
  }, [searchDate, fechasData]);

  // Si cambia el cliente o sus datos, auto-seleccionar el primer menú disponible
  useEffect(() => {
    if (selectedClient && clientesData[selectedClient]) {
      const clientMenus = Array.from(new Set(clientesData[selectedClient].map(o => o.tipo_menu))).sort();
      if (clientMenus.length > 0 && !clientMenus.includes(activeMenuType)) {
        setActiveMenuType(clientMenus[0]);
      }
    }
  }, [selectedClient, clientesData, activeMenuType]);

  const toggleDate = (dateStr) => {
    if (activeDateStr === dateStr) {
      setActiveDateStr(null);
      setClientesData({});
      setSelectedClient(null);
    } else {
      setActiveDateStr(dateStr);
    }
  };

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

  const totalClientes = Object.keys(clientesData).length;
  const clientesList = Object.keys(clientesData).sort();

  return (
    <div className="flex flex-col h-full bg-slate-50">
      
      {/* Top Header Sticky */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between shrink-0 sticky top-0 z-10 shadow-sm gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/working')}
            className="p-2 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-xl transition-colors"
            title="Volver"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <PackageOpen className="w-6 h-6 text-emerald-500" />
              Despachos de Planta
            </h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-0.5">Puntos de Servicio</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 overflow-x-auto">
          {/* Buscador de Fechas */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 shrink-0">
            <Search className="w-4 h-4 text-slate-400" />
            <input 
              type="date"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-semibold text-slate-700 cursor-pointer"
              title="Filtrar por fecha"
            />
            {searchDate && (
              <button onClick={() => setSearchDate('')} className="text-slate-400 hover:text-rose-500 ml-1" title="Limpiar fecha">
                x
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 shrink-0">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-bold text-slate-600">{totalClientes} Clientes</span>
          </div>
          <button 
            onClick={() => { fetchFechasDisponibles(); fetchDispatchData(); }}
            disabled={loadingFechas || loadingData}
            className="p-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 rounded-xl font-bold transition-all disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`${(loadingFechas || loadingData) ? 'animate-spin' : ''} w-5 h-5`} />
          </button>
        </div>
      </div>

      {/* Main Workspace Wrapper */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">
        
        {/* Right Area on Mobile: Client List Persistent (On top for mobile) */}
        <div className="order-1 xl:order-2 w-full xl:w-80 bg-white border-b xl:border-b-0 xl:border-l border-slate-200 flex flex-col shrink-0 z-0 shadow-[0_4px_15px_-3px_rgba(0,0,0,0.05)] xl:shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] h-48 xl:h-auto">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-500" />
              Clientes ({totalClientes})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
            {clientesList.map(cliente => {
              return (
                <button
                  key={cliente}
                  onClick={() => setSelectedClient(cliente)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between group ${
                    selectedClient === cliente 
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-sm' 
                      : 'bg-transparent border border-transparent hover:bg-slate-50 text-slate-700 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className={`text-sm truncate ${selectedClient === cliente ? 'font-black' : 'font-semibold'}`}>
                      {cliente}
                    </span>
                  </div>
                  {selectedClient === cliente && <ChevronRight className="w-4 h-4 text-emerald-500 shrink-0" />}
                </button>
              );
            })}
            {clientesList.length === 0 && !loadingData && (
              <div className="text-center p-4 text-xs font-medium text-slate-400">
                Sin clientes
              </div>
            )}
          </div>
        </div>

        {/* Center Area: Full Width Dates Accordion */}
        <div className="order-2 xl:order-1 flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-6">
          {Object.keys(fechasData).length === 0 && !loadingFechas && (
            <div className="h-full flex items-center justify-center p-6">
              <div className="bg-white p-8 rounded-2xl border border-slate-200 border-dashed text-center max-w-md">
                <Check className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-700 mb-2">No hay despachos finalizados</h3>
                <p className="text-sm text-slate-500">Aún no se han completado despachos a clientes en planta.</p>
              </div>
            </div>
          )}
          
          {searchDate && Object.keys(fechasData).length > 0 && !fechasData[searchDate] && (
            <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 text-center">
              <h3 className="text-amber-800 font-bold mb-1">No hay despachos para esta fecha</h3>
              <p className="text-sm text-amber-600">No se encontraron registros finalizados el {getFormatDateTitle(searchDate)}.</p>
            </div>
          )}

          {Object.keys(fechasData)
            .filter(f => !searchDate || f === searchDate)
            .sort((a, b) => new Date(b) - new Date(a))
            .map(fechaIter => {
            const isExpanded = activeDateStr === fechaIter;
            const menusDelDia = fechasData[fechaIter] || [];
            
            return (
              <div key={fechaIter} className={`bg-white rounded-2xl border transition-all ${isExpanded ? 'border-emerald-300 shadow-md ring-4 ring-emerald-50' : 'border-slate-200 hover:border-slate-300 shadow-sm'}`}>
                
                {/* Accordion Header */}
                <div
                  onClick={() => toggleDate(fechaIter)}
                  className={`p-5 cursor-pointer flex items-center justify-between group rounded-t-2xl ${isExpanded ? 'bg-emerald-50/50' : 'bg-white hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${isExpanded ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-3">
                        <span className={`text-xl font-black capitalize ${isExpanded ? 'text-slate-800' : 'text-slate-700 group-hover:text-slate-900'}`}>
                          {getFormatDateTitle(fechaIter)}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-500 mt-0.5">
                        {menusDelDia.length} Menú{menusDelDia.length !== 1 ? 's' : ''} disponible{menusDelDia.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className={`w-6 h-6 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-emerald-500' : 'text-slate-400 group-hover:text-slate-600'}`} />
                </div>

                {/* Expanded Content Workspace */}
                {isExpanded && (
                  <div className="border-t border-emerald-100/50">
                     
                     {/* SubMenu Tabs */}
                     <div className="flex px-4 pt-4 border-b border-slate-100 overflow-x-auto custom-scrollbar">
                       {selectedClient && clientesData[selectedClient] && Array.from(new Set(clientesData[selectedClient].map(o => o.tipo_menu))).sort().map(menuName => (
                         <button
                           key={menuName}
                           onClick={() => setActiveMenuType(menuName)}
                           className={`px-5 py-2.5 font-bold text-sm border-b-2 whitespace-nowrap transition-colors ${
                             activeMenuType === menuName 
                               ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50' 
                               : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                           }`}
                         >
                           {menuName}
                         </button>
                       ))}
                     </div>

                     {/* Content inside expanded date */}
                     <div className="p-6 bg-slate-50/30 rounded-b-2xl min-h-[400px]">
                       {loadingData ? (
                         <div className="flex flex-col items-center justify-center py-20">
                           <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mb-4" />
                           <p className="text-emerald-600 font-semibold animate-pulse">Cargando despachos...</p>
                         </div>
                       ) : !selectedClient ? (
                         <div className="flex items-center justify-center py-20">
                           <div className="bg-white p-8 rounded-2xl border border-slate-200 border-dashed text-center">
                             <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                             <p className="text-slate-500 font-medium">Selecciona un cliente de la lista derecha para ver sus detalles</p>
                           </div>
                         </div>
                       ) : (
                         <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                           {/* Cliente Header inside Workspace */}
                           <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                              <div>
                                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                                  {selectedClient}
                                </h2>
                              </div>
                           </div>
                           
                           {/* Listado en filas (DishRows) */}
                           <div className="flex flex-col w-full border border-slate-100 rounded-xl overflow-hidden">
                              <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                <div className="col-span-5">Producto / Plato</div>
                                <div className="col-span-4">Cumplimiento (Cantidades)</div>
                                <div className="col-span-3 text-right">Estado</div>
                              </div>
                              
                              <div className="divide-y divide-slate-100">
                                {clientesData[selectedClient]?.filter(orden => !activeMenuType || orden.tipo_menu === activeMenuType).map((orden, idx) => (
                                  <React.Fragment key={`${selectedClient}-${orden.orden_dia_id}-${idx}`}>
                                    {[...orden.productos].sort((a, b) => a.orden_item_id - b.orden_item_id).map(producto => (
                                      <div 
                                        key={producto.id} 
                                        className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50 transition-colors cursor-pointer group"
                                        onClick={() => setSelectedProduct({ ...producto, despachoHeader: { cliente_nombre: selectedClient, fecha: activeDateStr, tipo_menu: orden.tipo_menu, turno: orden.turno, fecha_finalizacion: orden.fecha_finalizacion } })}
                                      >
                                        <div className="col-span-5 flex flex-col">
                                          <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-600 transition-colors">{producto.plato_nombre}</span>
                                          <span className="text-xs font-semibold text-slate-400">{producto.tipo}</span>
                                          {producto.novedad && (
                                            <span className="mt-1 text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200 max-w-fit truncate">
                                              {producto.novedad}
                                            </span>
                                          )}
                                        </div>
                                        
                                        <div className="col-span-4 flex items-center gap-4">
                                          <div className="flex flex-col">
                                            <span className="text-xs text-slate-400 uppercase tracking-wider">Solicitado</span>
                                            <span className="text-sm font-semibold text-slate-600">{producto.cantidad_teorica?.toFixed(2) || '0.00'}</span>
                                          </div>
                                          <div className="h-6 w-px bg-slate-200"></div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-slate-400 uppercase tracking-wider">Despachado</span>
                                            <span className="text-sm font-bold text-slate-800">{producto.unidades_despachadas?.toFixed(2) || '0.00'}</span>
                                          </div>
                                        </div>
                                        
                                        <div className="col-span-3 flex items-center justify-end">
                                          {producto.estado_badge === 'exacto' && (
                                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Cumplido</span>
                                          )}
                                          {producto.estado_badge === 'adicional' && (
                                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1">
                                              Adicional (+{producto.delta?.toFixed(2)})
                                            </span>
                                          )}
                                          {producto.estado_badge === 'faltante' && (
                                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1">
                                              Faltante ({producto.delta?.toFixed(2)})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </React.Fragment>
                                ))}
                                {clientesData[selectedClient]?.filter(orden => !activeMenuType || orden.tipo_menu === activeMenuType).length === 0 && (
                                  <div className="col-span-full text-center py-8 text-sm font-medium text-slate-400 bg-slate-50">
                                    Sin productos asignados para este cliente en este menú.
                                  </div>
                                )}
                              </div>
                           </div>

                         </div>
                       )}
                     </div>

                   </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedProduct && (
        <DishDetailModal 
          producto={selectedProduct} 
          onClose={() => setSelectedProduct(null)} 
        />
      )}

    </div>
  );
};

export default ServicePointsPlantDispatch;
