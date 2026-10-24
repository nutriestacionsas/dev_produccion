import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw, Users, PackageOpen, ChevronLeft, ChevronRight, ChevronDown, ChefHat, Check, Truck, FileText, Printer, Search, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../App';
import ClientDispatchCard from './ClientDispatchCard';
import AutoTareModal from './AutoTareModal';
import GuiaRemisionModal from './GuiaRemisionModal';
import ManageSupervisoresModal from './ManageSupervisoresModal';

const ClientDispatchWorkspace = () => {
  const navigate = useNavigate();
  const [fecha, setFecha] = useState('');
  const [clientesData, setClientesData] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

  const [groupedData, setGroupedData] = useState({});
  const [activeDateStr, setActiveDateStr] = useState(null);
  const [menuGroups, setMenuGroups] = useState([]);
  const [activeMenuType, setActiveMenuType] = useState(null);
  const [searchDate, setSearchDate] = useState('');

  // Estados para Modal de Pesajes
  const [activeProductForWeighing, setActiveProductForWeighing] = useState(null);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [showSupervisoresModal, setShowSupervisoresModal] = useState(false);
  const [showSupervisoresErrorModal, setShowSupervisoresErrorModal] = useState(false);
  const [clientesSinSupervisor, setClientesSinSupervisor] = useState([]);

  // Estados para Modal de Guía de Remisión Odoo
  const [activeDespachoForGuia, setActiveDespachoForGuia] = useState(null);
  const [isOpeningPdf, setIsOpeningPdf] = useState(false);

  const fetchDiasHabilitados = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/dias-habilitados`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      
      const grouped = {};
      data.forEach(d => {
        grouped[d.fecha] = d.grupos;
      });
      setGroupedData(grouped);
      
      const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
      if (sortedDates.length > 0 && !activeDateStr) {
        setActiveDateStr(sortedDates[0]);
      }
    } catch(e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDiasHabilitados();
  }, []);

  useEffect(() => {
    if (activeDateStr) {
      setFecha(activeDateStr);
      setMenuGroups(groupedData[activeDateStr] || []);
      if (groupedData[activeDateStr] && groupedData[activeDateStr].length > 0 && !activeMenuType) {
        setActiveMenuType(groupedData[activeDateStr][0].menu_nombre);
      }
    } else {
      setMenuGroups([]);
      setActiveMenuType(null);
    }
  }, [activeDateStr, groupedData]);

  const toggleDate = (dateStr) => {
    if (activeDateStr === dateStr) {
      setActiveDateStr(null);
      setMenuGroups([]);
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

  const handleSyncQuantities = async () => {
    if (!selectedClient || !activeDateStr) return;
    setIsSyncing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/${activeDateStr}/${encodeURIComponent(selectedClient)}/sincronizar-cantidades`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Cantidades solicitadas del cliente actualizadas correctamente.");
        await fetchDispatchData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Error: ${errorData.detail || 'No se pudo sincronizar'}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error de red al sincronizar.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFinalizeClick = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/validar-supervisores?fecha=${activeDateStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.valido) {
           setClientesSinSupervisor(data.clientes_sin_supervisor);
           setShowSupervisoresErrorModal(true);
           return;
        }
      }
    } catch(e) { console.error(e); }
    
    setShowFinalizeModal(true);
  };

  const handleFinalizeDispatch = async () => {
    if (!selectedClient || !activeDateStr) return;
    setIsFinalizing(true);
    try {
      const token = localStorage.getItem('token');
      // Enviar por body JSON (evita problemas con barras '/' o caracteres especiales en el nombre del cliente)
      let res = await fetch(`${API_BASE_URL}/dispatch-cliente/finalizar`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          fecha: activeDateStr,
          cliente_nombre: selectedClient
        })
      });

      // Fallback a path si fuera necesario
      if (!res.ok) {
        res = await fetch(`${API_BASE_URL}/dispatch-cliente/${activeDateStr}/${encodeURIComponent(selectedClient)}/finalizar`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }

      if (!res.ok) throw new Error("Error al finalizar");
      
      setShowFinalizeModal(false);
      fetchDispatchData(); // Refresh to remove the client from list
    } catch (e) {
      console.error(e);
      alert("No se pudo finalizar el despacho.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleViewPdf = async (despachoId) => {
    setIsOpeningPdf(true);
    const newWindow = window.open('about:blank', '_blank');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/despacho/${despachoId}/guia-pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (newWindow) newWindow.close();
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al obtener el PDF de la guía');
      }
      const blob = await res.blob();
      const fileUrl = URL.createObjectURL(blob);
      if (newWindow) {
        newWindow.location.href = fileUrl;
      } else {
        window.open(fileUrl, '_blank');
      }
    } catch (err) {
      if (newWindow) newWindow.close();
      console.error(err);
      alert(err.message || 'No se pudo abrir el PDF de la guía de remisión.');
    } finally {
      setIsOpeningPdf(false);
    }
  };

  const fetchDispatchData = async () => {
    if (!activeDateStr) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/dispatch-cliente/${activeDateStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Error fetching data");
      
      const data = await response.json();
      setClientesData(data.clientes || {});
      
      if (!selectedClient && Object.keys(data.clientes || {}).length > 0) {
        setSelectedClient(Object.keys(data.clientes)[0]);
      } else if (selectedClient && !data.clientes[selectedClient]) {
        setSelectedClient(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeDateStr) {
      fetchDispatchData();
    }
  }, [activeDateStr]);

  // Si el usuario usa el buscador de fechas, seleccionamos esa fecha automáticamente
  useEffect(() => {
    if (searchDate && groupedData[searchDate]) {
      setActiveDateStr(searchDate);
    } else if (searchDate && !groupedData[searchDate]) {
      setActiveDateStr(null);
      setClientesData({});
      setSelectedClient(null);
    }
  }, [searchDate, groupedData]);

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
              <PackageOpen className="w-6 h-6 text-indigo-500" />
              Despacho a Clientes
            </h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-0.5">Bodega y Empaque</p>
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
            <span className="text-sm font-bold text-slate-600">{totalClientes} Clientes Activos</span>
          </div>
          
          <button
            onClick={() => setShowSupervisoresModal(true)}
            className="px-4 py-2.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 rounded-xl font-bold transition-all shrink-0 flex items-center gap-2 border border-indigo-100 shadow-sm"
            title="Asignar Supervisores"
          >
            <ShieldAlert className="w-4 h-4" />
            <span className="hidden sm:inline">Supervisores</span>
          </button>

          <button 
            onClick={fetchDispatchData}
            disabled={loading}
            className="p-2.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 rounded-xl font-bold transition-all disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`${loading ? 'animate-spin' : ''} w-5 h-5`} />
          </button>
        </div>
      </div>

      {/* Main Workspace Wrapper */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">
        
        {/* Right Area on Mobile: Client List Persistent (On top for mobile) */}
        <div className="order-1 xl:order-2 w-full xl:w-80 bg-white border-b xl:border-b-0 xl:border-l border-slate-200 flex flex-col shrink-0 z-0 h-48 xl:h-auto">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              Clientes ({totalClientes})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
            {clientesList.map(cliente => {
              const clienteTieneMenu = clientesData[cliente]?.some(o => !activeMenuType || o.tipo_menu === activeMenuType);
              if (!clienteTieneMenu) return null;
              
              return (
                <button
                  key={cliente}
                  onClick={() => setSelectedClient(cliente)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between group ${
                    selectedClient === cliente 
                      ? 'bg-blue-50 border border-blue-200 text-blue-700 shadow-sm' 
                      : 'bg-transparent border border-transparent hover:bg-slate-50 text-slate-700 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className={`text-sm truncate ${selectedClient === cliente ? 'font-black' : 'font-semibold'}`}>
                      {cliente}
                    </span>
                    {clientesData[cliente]?.some(d => d.guia_remision_creada) && (
                      <span className="p-1 rounded bg-blue-100 text-blue-700 shrink-0" title="Guía de Remisión Generada">
                        <FileText className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  {selectedClient === cliente && <ChevronRight className="w-4 h-4 text-blue-500 shrink-0" />}
                </button>
              );
            })}
            {clientesList.length === 0 && !loading && (
              <div className="text-center p-4 text-xs font-medium text-slate-400">
                Sin clientes
              </div>
            )}
          </div>
        </div>

        {/* Center Area: Full Width Dates Accordion */}
        <div className="order-2 xl:order-1 flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-6">
        
        {Object.keys(groupedData).length === 0 && !loading && (
          <div className="h-full flex items-center justify-center p-6">
            <div className="bg-white p-8 rounded-2xl border border-slate-200 border-dashed text-center max-w-md">
              <PackageOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-700 mb-2">No hay despachos habilitados</h3>
              <p className="text-sm text-slate-500">Debes habilitar los días para despacho desde el Planificador de Órdenes.</p>
            </div>
          </div>
        )}

        {searchDate && Object.keys(groupedData).length > 0 && !groupedData[searchDate] && (
          <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 text-center">
            <h3 className="text-amber-800 font-bold mb-1">No hay despachos para esta fecha</h3>
            <p className="text-sm text-amber-600">No se encontraron registros habilitados para la fecha seleccionada.</p>
          </div>
        )}

        {Object.keys(groupedData)
          .filter(f => !searchDate || f === searchDate)
          .sort((a, b) => new Date(b) - new Date(a))
          .map(fechaIter => {
          const isExpanded = activeDateStr === fechaIter;
          const menusDelDia = groupedData[fechaIter] || [];
          
          return (
            <div key={fechaIter} className={`bg-white rounded-2xl border transition-all ${isExpanded ? 'border-blue-300 shadow-md ring-4 ring-blue-50' : 'border-slate-200 hover:border-slate-300 shadow-sm'}`}>
              
              {/* Accordion Header */}
              <div
                onClick={() => toggleDate(fechaIter)}
                className={`p-5 cursor-pointer flex items-center justify-between group rounded-t-2xl ${isExpanded ? 'bg-blue-50/50' : 'bg-white hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${isExpanded ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                      <span className={`text-xl font-black capitalize ${isExpanded ? 'text-slate-800' : 'text-slate-700 group-hover:text-slate-900'}`}>
                        {getFormatDateTitle(fechaIter)}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-500 mt-0.5">
                      {menusDelDia.length} Menú{menusDelDia.length !== 1 ? 's' : ''} programado{menusDelDia.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg flex items-center gap-1 border border-slate-200">
                     <Users className="w-3.5 h-3.5" /> 
                     {totalClientes} Clientes
                  </div>
                  <ChevronDown className={`w-6 h-6 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-500' : 'text-slate-400 group-hover:text-slate-600'}`} />
                </div>
              </div>

              {/* Accordion Body */}
              {isExpanded && (
                <div className="border-t border-slate-200 p-6 flex flex-col">
                  
                  {/* Tabs (Menus) */}
                  <div className="flex items-center gap-3 mb-6 pb-2 overflow-x-auto custom-scrollbar">
                    {menusDelDia.map((grupo, idx) => {
                       const isActive = activeMenuType === grupo.menu_nombre;
                       return (
                         <button
                           key={`${grupo.turno_nombre}-${grupo.menu_nombre}-${idx}`}
                           onClick={() => setActiveMenuType(grupo.menu_nombre)}
                           className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                             isActive 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                           }`}
                         >
                           {grupo.menu_nombre}
                         </button>
                       );
                    })}
                  </div>

                  {/* Inner Workspace: Cards on Left, Clients on Right */}
                  <div className="flex gap-6 min-h-[500px]">
                     
                     {/* Center / Left: Cards Area */}
                     <div className="flex-1 flex flex-col">
                       {loading && totalClientes === 0 ? (
                         <div className="flex-1 flex items-center justify-center border border-slate-200 border-dashed rounded-2xl bg-slate-50">
                           <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                         </div>
                       ) : !selectedClient ? (
                         <div className="flex-1 flex flex-col items-center justify-center border border-slate-200 border-dashed rounded-2xl bg-slate-50 p-8 text-center">
                           <Users className="w-12 h-12 text-slate-300 mb-4" />
                           <h3 className="text-lg font-bold text-slate-700 mb-2">Selecciona un cliente</h3>
                           <p className="text-sm text-slate-500">Elige un cliente de la lista derecha para ver sus productos a despachar.</p>
                         </div>
                       ) : (
                         <div className="flex-1 flex flex-col">
                           <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                             <div>
                               <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">{selectedClient}</h2>
                               <span className="text-xs font-bold text-slate-400">Productos a despachar</span>
                             </div>
                             { (() => {
                                const clientOrders = clientesData[selectedClient] || [];
                                const currentOrders = clientOrders.filter(orden => !activeMenuType || orden.tipo_menu === activeMenuType);
                                const targetDespacho = currentOrders[0] || clientOrders[0];
                                const isClientCompleted = clientOrders.every(d => d.estado === 'completado');
                                const hasGuia = targetDespacho?.guia_remision_creada;

                                return (
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <button
                                      onClick={handleSyncQuantities}
                                      disabled={isSyncing}
                                      className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold flex items-center justify-center gap-2 border border-indigo-200 transition-colors shadow-sm text-sm disabled:opacity-50"
                                      title="Actualizar Cantidades"
                                    >
                                      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                                      <span className="hidden sm:inline">Actualizar Cantidades</span>
                                    </button>
                                    {isClientCompleted ? (
                                      <>
                                        <button
                                          disabled
                                          className="px-4 py-2.5 bg-slate-100 text-slate-400 rounded-xl font-bold flex items-center justify-center gap-2 border border-slate-200 cursor-not-allowed text-sm"
                                        >
                                          <Check className="w-4 h-4" />
                                          Despacho Finalizado
                                        </button>

                                        {!hasGuia ? (
                                          <button
                                            onClick={() => setActiveDespachoForGuia(targetDespacho)}
                                            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-200 transition-all text-sm"
                                          >
                                            <Truck className="w-4 h-4" />
                                            Imprimir Guía de Remisión
                                          </button>
                                        ) : (
                                          <button
                                            onClick={() => handleViewPdf(targetDespacho.despacho_cliente_id)}
                                            disabled={isOpeningPdf}
                                            className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all text-sm"
                                            title={`Guía Odoo: ${targetDespacho.odoo_picking_name}`}
                                          >
                                            {isOpeningPdf ? (
                                              <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                                            ) : (
                                              <FileText className="w-4 h-4 text-emerald-600" />
                                            )}
                                            Ver PDF Guía ({targetDespacho.odoo_picking_name || 'Generada'})
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <button
                                        onClick={handleFinalizeClick}
                                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-200 transition-all"
                                      >
                                        <Check className="w-5 h-5" />
                                        Despacho Terminado
                                      </button>
                                    )}
                                  </div>
                                );
                              })() }
                           </div>
                           <div className="flex flex-col gap-6 w-full">
                             {clientesData[selectedClient]?.filter(orden => !activeMenuType || orden.tipo_menu === activeMenuType).map((orden, idx) => (
                               <div key={`${selectedClient}-${orden.orden_dia_id}-${idx}`} className="w-full">
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                   {[...orden.productos].sort((a, b) => a.orden_item_id - b.orden_item_id).map(producto => (
                                     <ClientDispatchCard 
                                       key={producto.id}
                                       producto={producto}
                                       onOpenWeighing={(prod) => setActiveProductForWeighing(prod)}
                                       onRefresh={fetchDispatchData}
                                     />
                                   ))}
                                   {orden.productos.length === 0 && (
                                     <div className="col-span-full text-center py-8 text-sm font-medium text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                       Sin productos asignados para este cliente en este menú.
                                     </div>
                                   )}
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                     </div>

                   </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

        {/* Client List moved to top on mobile */}

    </div>

      {/* Modal de Autoguardado para Taras */}
      {activeProductForWeighing && (
        <AutoTareModal 
          producto={activeProductForWeighing}
          onClose={() => setActiveProductForWeighing(null)}
          onRefresh={fetchDispatchData}
        />
      )}


      {/* Modal Confirmacion de Finalizar */}
      {showFinalizeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-800 text-center mb-2">Finalizar Despacho</h3>
              <p className="text-slate-500 text-center text-sm leading-relaxed mb-6">
                ¿Está seguro de finalizar el despacho para <span className="font-bold text-slate-700">{selectedClient}</span>? 
                Una vez finalizado, los datos se enviarán a Puntos de Servicio y no se podrán modificar los pesajes.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFinalizeModal(false)}
                  disabled={isFinalizing}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleFinalizeDispatch}
                  disabled={isFinalizing}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center gap-2 shadow-sm shadow-emerald-200 transition-all disabled:opacity-70"
                >
                  {isFinalizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Confirmar Finalización
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Guía de Remisión Odoo */}
      {activeDespachoForGuia && (
        <GuiaRemisionModal 
          despachoId={activeDespachoForGuia.despacho_cliente_id}
          clienteNombre={selectedClient}
          onClose={() => setActiveDespachoForGuia(null)}
          onRefresh={fetchDispatchData}
        />
      )}

      {/* Modal de Error de Supervisores */}
      {showSupervisoresErrorModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-800 text-center mb-2">Asignación de Supervisor Pendiente</h3>
              <p className="text-slate-500 text-center text-sm leading-relaxed mb-4">
                No se puede finalizar el despacho. Los siguientes clientes programados para hoy no tienen supervisor asignado:
              </p>
              
              <ul className="bg-amber-50 text-amber-800 text-sm font-semibold rounded-xl p-4 mb-6 max-h-40 overflow-y-auto custom-scrollbar list-disc list-inside">
                {clientesSinSupervisor.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSupervisoresErrorModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => {
                    setShowSupervisoresErrorModal(false);
                    setShowSupervisoresModal(true);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-sm shadow-amber-200 transition-all"
                >
                  Asignar Ahora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Gestionar Supervisores */}
      {showSupervisoresModal && (
        <ManageSupervisoresModal 
          onClose={() => setShowSupervisoresModal(false)}
        />
      )}

    </div>
  );
};

export default ClientDispatchWorkspace;
