import React, { useState, useEffect } from 'react';
import { 
  CalendarDays, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  RefreshCw, 
  CheckCircle, 
  User, 
  DollarSign,
  Users as UsersIcon,
  ChefHat,
  UtensilsCrossed,
  X,
  AlertCircle
} from 'lucide-react';
import { API_BASE_URL } from '../App';

function Planner({ user }) {
  const [planners, setPlanners] = useState([]);
  const [selectedPlannerId, setSelectedPlannerId] = useState('');
  const [plannerDetail, setPlannerDetail] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [odooProducts, setOdooProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlannerName, setNewPlannerName] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDayDetail, setSelectedDayDetail] = useState(null);
  
  // Day editor states
  const [menuComponents, setMenuComponents] = useState({
    sopa: '', fuerte1: '', guarnicion1: '', fuerte2: '', guarnicion2: '',
    arroz: '', saludable: '', guarnicion_saludable: '', jugo_1: '', jugo_2: '', postre: ''
  });
  const [clientOrders, setClientOrders] = useState([]);
  const [customName, setCustomName] = useState('');

  const token = localStorage.getItem('token');

  // Load initial data
  useEffect(() => {
    fetchPlanners();
    fetchRecipes();
    fetchCustomers();
    fetchOdooProducts();
  }, []);

  useEffect(() => {
    if (selectedPlannerId) {
      fetchPlannerDetail(selectedPlannerId);
    } else {
      setPlannerDetail(null);
    }
  }, [selectedPlannerId]);

  const fetchPlanners = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/planner/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlanners(data);
        if (data.length > 0 && !selectedPlannerId) {
          setSelectedPlannerId(data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRecipes = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/recipes/?active_only=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRecipes(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/planner/customers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOdooProducts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/odoo/products`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOdooProducts(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPlannerDetail = async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/planner/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlannerDetail(data);
      }
    } catch (err) {
      setError('Error al obtener la planificación.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlanner = async (e) => {
    e.preventDefault();
    if (!newPlannerName || !newStartDate || !newEndDate) return;
    try {
      const res = await fetch(`${API_BASE_URL}/planner/?name=${encodeURIComponent(newPlannerName)}&start_date=${newStartDate}&end_date=${newEndDate}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreateModal(false);
        setNewPlannerName('');
        fetchPlanners();
        setSelectedPlannerId(data.id);
      } else {
        const data = await res.json();
        setError(data.detail || 'Fallo al crear planificación.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Open day detail and load config
  const openDayEditor = (dayDate) => {
    setSelectedDate(dayDate);
    
    // Find if this day has saved details in the planner
    const existingDay = plannerDetail?.dias?.find(d => d.fecha === dayDate);
    setSelectedDayDetail(existingDay || null);

    // Default custom product name: ALMUERZO TIPO 1 AAMMDD
    const formattedDate = dayDate.replace(/-/g, '').slice(2); // YYYY-MM-DD -> YYMMDD (e.g. 260619)
    setCustomName(existingDay?.nombre_odoo_producto || `ALMUERZO TIPO 1 ${formattedDate}`);

    if (existingDay) {
      // Map components
      const mappedComp = { ...menuComponents };
      Object.keys(mappedComp).forEach(k => {
        const c = existingDay.componentes.find(comp => comp.componente_tipo === k);
        mappedComp[k] = c ? c.receta_id : '';
      });
      setMenuComponents(mappedComp);

      // Map orders
      const mappedOrders = existingDay.pedidos.map(p => ({
        id: p.id,
        odoo_partner_id: p.odoo_partner_id,
        tipo_pedido: p.tipo_pedido,
        valor_pedido: p.valor_pedido,
        comensales_calculados: p.comensales_calculados,
        capacity: p.tipo_pedido === 'porcentaje' ? Math.round((p.comensales_calculados * 100) / p.valor_pedido) : 200
      }));
      setClientOrders(mappedOrders);
    } else {
      // Initialize fresh
      setMenuComponents({
        sopa: '', fuerte1: '', guarnicion1: '', fuerte2: '', guarnicion2: '',
        arroz: '', saludable: '', guarnicion_saludable: '', jugo_1: '', jugo_2: '', postre: ''
      });
      setClientOrders([]);
    }
    
    setShowDayModal(true);
  };

  // Add a customer order row
  const addOrderRow = () => {
    if (customers.length === 0) return;
    const defaultCust = customers[0].id;
    setClientOrders([...clientOrders, {
      odoo_partner_id: defaultCust,
      tipo_pedido: 'numerico',
      valor_pedido: 100,
      capacity: 200,
      comensales_calculados: 100
    }]);
  };

  const updateOrderRow = (index, field, value) => {
    const updated = [...clientOrders];
    updated[index][field] = value;
    
    // Recalculate comensales_calculados
    const row = updated[index];
    if (row.tipo_pedido === 'numerico') {
      row.comensales_calculados = Math.round(Number(row.valor_pedido));
    } else {
      // porcentaje
      const pct = Number(row.valor_pedido);
      const cap = Number(row.capacity || 200);
      row.comensales_calculados = Math.round((cap * pct) / 100);
    }
    
    setClientOrders(updated);
  };

  const removeOrderRow = (index) => {
    setClientOrders(clientOrders.filter((_, i) => i !== index));
  };

  // Calculate live cost
  const calculateLivePortionCost = () => {
    const productPriceMap = {};
    odooProducts.forEach(p => {
      productPriceMap[p.id] = p.standard_price;
    });

    let portionCost = 0;
    Object.values(menuComponents).forEach(recId => {
      if (recId) {
        const recipe = recipes.find(r => r.id === Number(recId));
        if (recipe) {
          let recCost = 0;
          recipe.ingredientes.forEach(ing => {
            const price = productPriceMap[ing.odoo_product_id] || 0;
            recCost += ing.cantidad_proporcional * price;
          });
          portionCost += recCost / recipe.base_porciones;
        }
      }
    });
    return portionCost;
  };

  const totalComensales = clientOrders.reduce((sum, o) => sum + o.comensales_calculados, 0);
  const livePortionCost = calculateLivePortionCost();
  const totalEstimatedCost = totalComensales * livePortionCost;

  const saveDayPlan = async () => {
    // Validate
    const activeComponents = Object.entries(menuComponents)
      .filter(([_, recId]) => recId !== '')
      .map(([k, recId]) => ({
        componente_tipo: k,
        receta_id: Number(recId)
      }));

    if (activeComponents.length === 0) {
      alert("Debes seleccionar al menos una receta para el menú.");
      return;
    }

    if (clientOrders.length === 0) {
      alert("Debes agregar al menos un pedido de cliente.");
      return;
    }

    const payload = {
      fecha: selectedDate,
      nombre_odoo_producto: customName,
      componentes: activeComponents,
      pedidos: clientOrders.map(o => ({
        odoo_partner_id: Number(o.odoo_partner_id),
        tipo_pedido: o.tipo_pedido,
        valor_pedido: Number(o.valor_pedido),
        comensales_calculados: Number(o.comensales_calculados)
      }))
    };

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/planner/${selectedPlannerId}/days`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowDayModal(false);
        fetchPlannerDetail(selectedPlannerId);
      } else {
        const data = await res.json();
        alert(data.detail || "Error al guardar el día.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const syncDayWithOdoo = async (dayId) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/planner/${selectedPlannerId}/days/${dayId}/sync-odoo`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Día sincronizado exitosamente.");
        fetchPlannerDetail(selectedPlannerId);
      } else {
        setError(data.detail || "Error al sincronizar con Odoo ERP.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate date grid for calendar representation
  const getDatesBetween = (startDateStr, endDateStr) => {
    const dates = [];
    let curr = new Date(startDateStr + 'T00:00:00');
    const last = new Date(endDateStr + 'T00:00:00');
    while (curr <= last) {
      dates.push(new Date(curr).toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

  const calendarDaysList = plannerDetail 
    ? getDatesBetween(plannerDetail.fecha_inicio, plannerDetail.fecha_fin)
    : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            <CalendarDays className="w-8 h-8 text-blue-600" />
            Planificador de Menús
          </h1>
          <p className="text-slate-650 mt-1">Orquesta las combinaciones de platos y coordina las cantidades programadas por los clientes.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Nueva Planificación
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-55/60 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Select Planificación */}
      <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-wrap gap-4 items-center shadow-sm">
        <label className="text-sm font-bold text-slate-700">Seleccionar Ciclo:</label>
        <select 
          value={selectedPlannerId}
          onChange={(e) => setSelectedPlannerId(e.target.value)}
          className="bg-slate-50 border border-slate-250 text-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 min-w-[200px]"
        >
          <option value="">-- Seleccionar Ciclo --</option>
          {planners.map(p => (
            <option key={p.id} value={p.id}>{p.nombre} ({p.fecha_inicio} al {p.fecha_fin})</option>
          ))}
        </select>
      </div>

      {loading && !plannerDetail ? (
        <p className="text-slate-500 animate-pulse">Cargando ciclo de menú...</p>
      ) : plannerDetail ? (
        <div className="space-y-6">
          {/* Calendar grid view */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {calendarDaysList.map((dayDate) => {
              const savedDay = plannerDetail.dias.find(d => d.fecha === dayDate);
              const dayOfWeekStr = new Date(dayDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' });
              const dateNumberStr = new Date(dayDate + 'T00:00:00').getDate();

              return (
                <div 
                  key={dayDate}
                  className={`
                    border rounded-2xl p-5 flex flex-col justify-between min-h-[220px] transition-all duration-200 shadow-sm
                    ${savedDay 
                      ? 'bg-white border-blue-200 hover:border-blue-500' 
                      : 'bg-slate-50/50 border-slate-200 border-dashed hover:border-slate-350'}
                  `}
                >
                  <div>
                    {/* Day Header */}
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs uppercase font-extrabold tracking-widest text-slate-450">{dayOfWeekStr}</span>
                        <h3 className="text-2xl font-black text-slate-850 mt-0.5">{dateNumberStr}</h3>
                      </div>
                      <span className="text-xs text-slate-600 font-mono bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">{dayDate}</span>
                    </div>

                    {/* Components summary */}
                    {savedDay ? (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs text-blue-600 font-extrabold truncate">{savedDay.nombre_odoo_producto}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {savedDay.componentes.slice(0, 3).map((c, idx) => (
                            <span key={idx} className="inline-block bg-slate-100 border border-slate-200 text-slate-655 text-[10px] px-2 py-0.5 rounded-full capitalize">
                              {c.receta_nombre || c.componente_tipo}
                            </span>
                          ))}
                          {savedDay.componentes.length > 3 && (
                            <span className="inline-block bg-slate-100 border border-slate-200 text-slate-500 text-[10px] px-2 py-0.5 rounded-full">
                              +{savedDay.componentes.length - 3} más
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-xs italic mt-4 font-semibold">Sin menú planificado</p>
                    )}
                  </div>

                  {/* Actions / Cost Info */}
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    {savedDay ? (
                      <div className="text-xs space-y-1">
                        <div className="flex items-center text-slate-500 font-semibold">
                          <UsersIcon className="w-3.5 h-3.5 text-blue-600 mr-1" />
                          <span>{savedDay.pedidos.reduce((s, o) => s + o.comensales_calculados, 0)} com.</span>
                        </div>
                        <div className="flex items-center text-emerald-600 font-bold">
                          <DollarSign className="w-3.5 h-3.5 mr-0.5" />
                          <span>${Number(savedDay.costo_diario_estimado).toFixed(2)}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-450 font-semibold">Planificar platos</span>
                    )}

                    <div className="flex items-center gap-1.5 ml-auto">
                      <button 
                        onClick={() => openDayEditor(dayDate)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 transition-all shadow-sm"
                      >
                        {savedDay ? 'Editar' : 'Diseñar'}
                      </button>

                      {savedDay && (
                        savedDay.odoo_product_id ? (
                          <div className="text-blue-600 p-1.5 bg-blue-50 border border-blue-200 rounded-lg" title="Sincronizado con Odoo">
                            <CheckCircle className="w-4 h-4" />
                          </div>
                        ) : (
                          <button 
                            onClick={() => syncDayWithOdoo(savedDay.id)}
                            className="bg-blue-600 hover:bg-blue-550 text-white p-1.5 rounded-lg text-xs font-bold border border-blue-600 shadow-sm transition-all animate-spin-hover"
                            title="Sincronizar Almuerzo en Odoo"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-white border border-slate-200 border-dashed rounded-3xl text-slate-400 font-semibold italic shadow-sm">
          Selecciona o crea una Planificación para comenzar.
        </div>
      )}

      {/* CREATE PLANNER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-800"
            >
              <X className="w-6 h-6" />
            </button>
            
            <h2 className="text-xl font-bold text-slate-900 mb-4">Nueva Planificación Mensual</h2>
            
            <form onSubmit={handleCreatePlanner} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre / Identificador</label>
                <input 
                  type="text" 
                  value={newPlannerName}
                  onChange={(e) => setNewPlannerName(e.target.value)}
                  placeholder="Ej. Planificación Julio 2026"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Fecha Inicio</label>
                  <input 
                    type="date" 
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Fecha Fin</label>
                  <input 
                    type="date" 
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-550 text-white font-semibold py-2.5 rounded-xl transition-all shadow-sm"
              >
                Crear Calendario
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DAY PLANNER MODAL / EDITOR */}
      {showDayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl w-full max-w-4xl shadow-2xl relative max-h-[90vh] overflow-y-auto flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-black">Configurar Almuerzo del Día</h2>
                <p className="text-xs text-slate-500 font-semibold">Fecha: {selectedDate}</p>
              </div>
              <button 
                onClick={() => setShowDayModal(false)}
                className="text-slate-500 hover:text-slate-800 p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto flex-1 pr-1">
              
              {/* Left Column: Menu Component Recipes */}
              <div className="space-y-4">
                <h3 className="text-sm font-extrabold text-blue-600 flex items-center gap-2 uppercase tracking-wider">
                  <ChefHat className="w-4 h-4" />
                  Componentes del Menú
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-550 mb-1">Nombre del Almuerzo en Odoo</label>
                  <input 
                    type="text" 
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                    placeholder="ALMUERZO TIPO 1 YYMMDD"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.keys(menuComponents).map((compType) => (
                    <div key={compType} className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-500 capitalize">{compType.replace('_', ' ')}</label>
                      <select
                        value={menuComponents[compType]}
                        onChange={(e) => setMenuComponents({...menuComponents, [compType]: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-205 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                      >
                        <option value="">-- Sin asignar --</option>
                        {recipes
                          .filter(r => r.is_active)
                          .map(r => (
                            <option key={r.id} value={r.id}>{r.nombre}</option>
                          ))
                        }
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Customer Orders */}
              <div className="space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-blue-600 flex items-center gap-2 uppercase tracking-wider">
                      <UtensilsCrossed className="w-4 h-4" />
                      Pedidos de Clientes
                    </h3>
                    <button 
                      onClick={addOrderRow}
                      className="flex items-center gap-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-blue-600 px-2.5 py-1.5 rounded-md border border-slate-200 font-bold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar Cliente
                    </button>
                  </div>

                  {clientOrders.length === 0 ? (
                    <p className="text-xs text-slate-400 font-semibold py-6 text-center bg-slate-50/50 border border-slate-200 border-dashed rounded-xl">
                      No hay clientes añadidos. Haz clic en "Agregar Cliente".
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {clientOrders.map((order, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-2 relative">
                          <button 
                            onClick={() => removeOrderRow(idx)}
                            className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold text-xs"
                          >
                            Eliminar
                          </button>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] text-slate-500 font-semibold mb-1">Cliente</label>
                              <select 
                                value={order.odoo_partner_id}
                                onChange={(e) => updateOrderRow(idx, 'odoo_partner_id', e.target.value)}
                                className="w-full bg-white border border-slate-200 text-slate-800 rounded-md px-2 py-1 text-[11px] focus:outline-none"
                              >
                                {customers.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] text-slate-500 font-semibold mb-1">Tipo Pedido</label>
                              <select 
                                value={order.tipo_pedido}
                                onChange={(e) => updateOrderRow(idx, 'tipo_pedido', e.target.value)}
                                className="w-full bg-white border border-slate-200 text-slate-800 rounded-md px-2 py-1 text-[11px] focus:outline-none"
                              >
                                <option value="numerico">Numérico (Raciones)</option>
                                <option value="porcentaje">Porcentual (%)</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {order.tipo_pedido === 'porcentaje' && (
                              <div>
                                <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Techo Comensales</label>
                                <input 
                                  type="number"
                                  value={order.capacity}
                                  onChange={(e) => updateOrderRow(idx, 'capacity', e.target.value)}
                                  className="w-full bg-white border border-slate-200 text-slate-850 rounded-md px-2 py-1 text-[11px] focus:outline-none"
                                />
                              </div>
                            )}

                            <div>
                              <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">
                                {order.tipo_pedido === 'numerico' ? 'Comensales' : 'Porcentaje (%)'}
                              </label>
                              <input 
                                type="number"
                                value={order.valor_pedido}
                                onChange={(e) => updateOrderRow(idx, 'valor_pedido', e.target.value)}
                                className="w-full bg-white border border-slate-200 text-slate-850 rounded-md px-2 py-1 text-[11px] focus:outline-none"
                              />
                            </div>

                            <div className="flex flex-col justify-end items-end">
                              <span className="text-[10px] text-slate-400 font-bold">Rendimiento:</span>
                              <span className="text-xs font-black text-blue-600">{order.comensales_calculados} com.</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live Calculations Summary card */}
                <div className="bg-slate-100 border border-slate-200 p-4 rounded-xl space-y-2 mt-4 shadow-sm">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Total Comensales:</span>
                    <span className="text-slate-800 font-bold">{totalComensales}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Costo Unitario Porción:</span>
                    <span className="text-slate-800 font-bold">${livePortionCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200/80 font-black">
                    <span className="text-slate-700">Costo Diario Estimado:</span>
                    <span className="text-emerald-600">${totalEstimatedCost.toFixed(2)}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div className="border-t border-slate-100 pt-4 mt-6 flex justify-end gap-3">
              <button 
                onClick={() => setShowDayModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 transition-all shadow-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={saveDayPlan}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10"
              >
                <Save className="w-4 h-4" />
                Guardar Menú
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Planner;
