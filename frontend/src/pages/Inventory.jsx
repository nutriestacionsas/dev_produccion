import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Scale, 
  MapPin, 
  Search, 
  Save, 
  CheckCircle, 
  AlertCircle,
  FileText,
  Plus,
  X,
  PlusCircle,
  CheckCircle2
} from 'lucide-react';
import { API_BASE_URL } from '../App';

function Inventory({ user }) {
  const [inventories, setInventories] = useState([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState(null);
  const [inventoryDetail, setInventoryDetail] = useState(null);
  const [envases, setEnvases] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Program modal states
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [newInvName, setNewInvName] = useState('');
  const [newInvDate, setNewInvDate] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('all');

  // Weigh-in modal states
  const [showWeighModal, setShowWeighModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedEnvaseId, setSelectedEnvaseId] = useState('');
  const [grossWeight, setGrossWeight] = useState('');
  const [customTareWeight, setCustomTareWeight] = useState('0');

  // Admin correction states (editable physical count)
  const [corrections, setCorrections] = useState({}); // item_id -> cantidad_fisica
  const [novelties, setNovelties] = useState({}); // item_id -> novedad

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchInventories();
    fetchEnvases();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedInventoryId) {
      fetchInventoryDetail(selectedInventoryId);
    } else {
      setInventoryDetail(null);
    }
  }, [selectedInventoryId]);

  const fetchInventories = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInventories(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEnvases = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/odoo/envases`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEnvases(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchInventoryDetail = async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInventoryDetail(data);
        
        // Initialize corrections & novelties from loaded item counts
        const initialCorrs = {};
        const initialNovs = {};
        data.items.forEach(item => {
          initialCorrs[item.id] = item.cantidad_fisica;
          initialNovs[item.id] = item.novedad || '';
        });
        setCorrections(initialCorrs);
        setNovelties(initialNovs);
      }
    } catch (err) {
      setError('Error al obtener la toma de inventario.');
    } finally {
      setLoading(false);
    }
  };

  const handleProgramInventory = async (e) => {
    e.preventDefault();
    if (!newInvName || !newInvDate) return;
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nombre_ajuste_odoo: newInvName,
          fecha_programada: newInvDate,
          usuario_asignado_id: assignedUserId ? Number(assignedUserId) : null
        })
      });
      if (res.ok) {
        const data = await res.json();
        setShowProgramModal(false);
        setNewInvName('');
        setNewInvDate('');
        setAssignedUserId('');
        fetchInventories();
        setSelectedInventoryId(data.id);
      } else {
        const data = await res.json();
        setError(data.detail || 'Fallo al programar inventario.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const openWeighModal = (item) => {
    setSelectedItem(item);
    setSelectedEnvaseId('');
    setGrossWeight('');
    setCustomTareWeight('0');
    setShowWeighModal(true);
  };

  const getSelectedEnvaseWeight = () => {
    if (selectedEnvaseId === 'custom') {
      return Number(customTareWeight) || 0;
    }
    const env = envases.find(e => e.id === Number(selectedEnvaseId));
    return env ? Number(env.weight) || 0 : 0;
  };

  const calculatedNetWeight = Math.max(0, (Number(grossWeight) || 0) - getSelectedEnvaseWeight());

  const handleRegisterWeighing = async (e) => {
    e.preventDefault();
    if (!grossWeight || Number(grossWeight) <= 0) {
      alert("Ingresa un peso bruto válido.");
      return;
    }

    const payload = {
      inventario_item_id: selectedItem.id,
      peso_bruto: Number(grossWeight),
      tara_odoo_product_id: selectedEnvaseId && selectedEnvaseId !== 'custom' ? Number(selectedEnvaseId) : null,
      peso_tara: getSelectedEnvaseWeight()
    };

    try {
      const res = await fetch(`${API_BASE_URL}/inventory/${selectedInventoryId}/pesaje`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setShowWeighModal(false);
        
        // Update local item count & difference dynamically
        setCorrections(prev => ({
          ...prev,
          [selectedItem.id]: data.cantidad_fisica_acumulada
        }));
        
        fetchInventoryDetail(selectedInventoryId);
      } else {
        const data = await res.json();
        alert(data.detail || "Error al registrar pesaje físico.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCorrectionChange = (itemId, val) => {
    setCorrections({
      ...corrections,
      [itemId]: Number(val)
    });
  };

  const handleNoveltyChange = (itemId, val) => {
    setNovelties({
      ...novelties,
      [itemId]: val
    });
  };

  const handleFinalizeAndSync = async () => {
    if (!window.confirm("¿Confirmar ajuste? Esto enviará los conteos finales a Odoo ERP 19 y aplicará las correcciones.")) {
      return;
    }

    // Prepare corrections list
    const compiledCorrections = Object.keys(corrections).map(id => ({
      id: Number(id),
      cantidad_fisica: corrections[id],
      novedad: novelties[id] || ''
    }));

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/${selectedInventoryId}/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ correcciones: compiledCorrections })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Ajuste enviado y aplicado en Odoo.");
        fetchInventoryDetail(selectedInventoryId);
        fetchInventories();
      } else {
        setError(data.detail || "Error al sincronizar inventario con Odoo.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Group items by location
  const getLocationsList = () => {
    if (!inventoryDetail) return [];
    const locs = new Set();
    inventoryDetail.items.forEach(item => {
      if (item.ubicacion_fisica) locs.add(item.ubicacion_fisica);
    });
    return Array.from(locs);
  };

  const getFilteredItems = () => {
    if (!inventoryDetail) return [];
    return inventoryDetail.items.filter(item => {
      const matchesSearch = item.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            String(item.odoo_product_id).includes(searchQuery);
      const matchesLocation = selectedLocation === 'all' || item.ubicacion_fisica === selectedLocation;
      return matchesSearch && matchesLocation;
    });
  };

  // Group filtered items by location
  const groupedItems = {};
  getFilteredItems().forEach(item => {
    const loc = item.ubicacion_fisica || 'Sin Ubicación';
    if (!groupedItems[loc]) groupedItems[loc] = [];
    groupedItems[loc].push(item);
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            <Database className="w-8 h-8 text-blue-600" />
            Toma de Inventario Físico
          </h1>
          <p className="text-slate-650 mt-1">Conteo y pesaje físico de insumos de compra con conciliación de stock y ajuste en Odoo.</p>
        </div>
        {((user?.rol === 'admin' || user?.permisos?.modules?.['Toma física de inventario']?.actions?.['Sincronizar con Odoo']) || user?.permisos?.modules?.['Toma física de inventario']?.actions?.['Programar Toma']) && (
          <button 
            onClick={() => setShowProgramModal(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Programar Toma Física
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Select Inventario */}
      <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-wrap gap-4 items-center shadow-sm">
        <label className="text-sm font-bold text-slate-700">Seleccionar Toma de Inventario:</label>
        <select 
          value={selectedInventoryId || ''}
          onChange={(e) => setSelectedInventoryId(e.target.value ? Number(e.target.value) : null)}
          className="bg-slate-50 border border-slate-250 text-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 min-w-[280px]"
        >
          <option value="">-- Seleccionar Inventario Programado --</option>
          {inventories.map(inv => (
            <option key={inv.id} value={inv.id}>
              {inv.nombre} - {new Date(inv.fecha_programada).toLocaleDateString()} [{inv.estado.toUpperCase()}]
            </option>
          ))}
        </select>
      </div>

      {loading && !inventoryDetail ? (
        <p className="text-slate-500 animate-pulse">Cargando planilla de conteos...</p>
      ) : inventoryDetail ? (
        <div className="space-y-6">
          {/* Cabecera del inventario seleccionado */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
            <div className="space-y-1.5">
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                inventoryDetail.estado === 'sincronizado_odoo' 
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  : inventoryDetail.estado === 'en_conteo'
                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
                {inventoryDetail.estado.replace('_', ' ')}
              </span>
              <h2 className="text-xl font-black text-slate-850">{inventoryDetail.nombre}</h2>
              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                <p>Fecha Programada: <span className="text-slate-850 font-bold">{new Date(inventoryDetail.fecha_programada).toLocaleString()}</span></p>
                <p>Usuario Asignado: <span className="text-slate-850 font-bold">{inventoryDetail.usuario_assigned || 'No asignado'}</span></p>
              </div>
            </div>

            {inventoryDetail.estado !== 'sincronizado_odoo' && (user?.rol === 'admin' || user?.permisos?.modules?.['Toma física de inventario']?.actions?.['Sincronizar con Odoo']) && (
              <button 
                onClick={handleFinalizeAndSync}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all text-sm shadow-md shadow-emerald-500/10"
              >
                <CheckCircle2 className="w-5 h-5" />
                Aprobar y Sincronizar Ajuste con Odoo
              </button>
            )}
          </div>

          {/* Buscador y Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-center bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar insumo por nombre o ID..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div className="flex gap-2 items-center">
              <MapPin className="w-4 h-4 text-slate-450" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="all">Todas las ubicaciones</option>
                {getLocationsList().map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Planilla por ubicaciones agrupadas */}
          <div className="space-y-8">
            {Object.keys(groupedItems).map((locationName) => (
              <div key={locationName} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    {locationName}
                  </h3>
                  <span className="text-[10px] bg-blue-50 border border-blue-200 text-blue-600 font-bold px-2 py-0.5 rounded-full">
                    {groupedItems[locationName].length} Productos
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 text-[10px] font-extrabold tracking-widest text-slate-550 border-b border-slate-200 uppercase">
                        <th className="p-3">Producto</th>
                        <th className="p-3 text-right">Stock Teórico Odoo</th>
                        <th className="p-3 text-right">Cantidad Física</th>
                        <th className="p-3 text-right">Diferencia</th>
                        <th className="p-3">Novedades / Observaciones</th>
                        {inventoryDetail.estado !== 'sincronizado_odoo' && (
                          <th className="p-3 text-center">Registrar</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {groupedItems[locationName].map((item) => {
                        const count = corrections[item.id] !== undefined ? corrections[item.id] : item.cantidad_fisica;
                        const diff = count - item.cantidad_teorica;

                        let diffColor = 'text-slate-500';
                        if (diff > 0.001) diffColor = 'text-emerald-600 font-bold';
                        else if (diff < -0.001) diffColor = 'text-red-650 font-bold';

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50">
                            <td className="p-3">
                              <p className="font-bold text-slate-800">{item.nombre}</p>
                              <span className="text-[10px] text-slate-400">ID: {item.odoo_product_id}</span>
                            </td>
                            <td className="p-3 text-right text-slate-500 font-mono">
                              {item.cantidad_teorica.toFixed(3)} {item.uom}
                            </td>
                            <td className="p-3 text-right">
                              {inventoryDetail.estado !== 'sincronizado_odoo' && (user?.rol === 'admin' || user?.permisos?.modules?.['Toma física de inventario']?.actions?.['Sincronizar con Odoo']) ? (
                                <input 
                                  type="number"
                                  step="0.001"
                                  value={count}
                                  onChange={(e) => handleCorrectionChange(item.id, e.target.value)}
                                  className="bg-white border border-slate-250 text-slate-900 rounded px-2 py-1 text-right font-mono text-xs w-24 focus:outline-none focus:border-blue-500"
                                />
                              ) : (
                                <span className="font-mono text-slate-800 font-bold">{count.toFixed(3)} {item.uom}</span>
                              )}
                            </td>
                            <td className={`p-3 text-right font-mono ${diffColor}`}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(3)}
                            </td>
                            <td className="p-3">
                              {inventoryDetail.estado !== 'sincronizado_odoo' && (user?.rol === 'admin' || user?.permisos?.modules?.['Toma física de inventario']?.actions?.['Sincronizar con Odoo']) ? (
                                <input 
                                  type="text"
                                  value={novelties[item.id] || ''}
                                  onChange={(e) => handleNoveltyChange(item.id, e.target.value)}
                                  className="bg-white border border-slate-250 text-slate-700 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-blue-500"
                                  placeholder="Ingresar novedades..."
                                />
                              ) : (
                                <span className="text-slate-450 italic text-[11px] font-semibold">{item.novedad || 'Sin observaciones'}</span>
                              )}
                            </td>
                            {inventoryDetail.estado !== 'sincronizado_odoo' && (
                              <td className="p-3 text-center">
                                <button 
                                  onClick={() => openWeighModal(item)}
                                  className="flex items-center gap-1 mx-auto bg-slate-50 hover:bg-slate-100 border border-slate-200 text-blue-600 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-sm"
                                >
                                  <Scale className="w-3.5 h-3.5" />
                                  Pesar Báscula
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            
            {getFilteredItems().length === 0 && (
              <div className="text-center py-16 bg-white border border-slate-200 border-dashed rounded-3xl text-slate-450 font-semibold italic shadow-sm">
                Ningún producto coincide con el filtro de búsqueda.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-white border border-slate-200 border-dashed rounded-3xl text-slate-400 font-semibold italic shadow-sm">
          Selecciona o crea un inventario planificado para comenzar la toma de stock física.
        </div>
      )}

      {/* PROGRAM INVENTORY MODAL */}
      {showProgramModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowProgramModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-800"
            >
              <X className="w-6 h-6" />
            </button>

            <h2 className="text-xl font-bold text-slate-900 mb-4">Programar Inventario Físico</h2>

            <form onSubmit={handleProgramInventory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre del Ajuste en Odoo</label>
                <input 
                  type="text" 
                  value={newInvName}
                  onChange={(e) => setNewInvName(e.target.value)}
                  placeholder="Ej. Planilla Conteo Mensual Bodega"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Fecha Programada de Inicio</label>
                <input 
                  type="datetime-local" 
                  value={newInvDate}
                  onChange={(e) => setNewInvDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Operario Asignado (Supervisor)</label>
                <select
                  value={assignedUserId}
                  onChange={(e) => setAssignedUserId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- No Asignar (Disponible General) --</option>
                  {usersList.map(u => (
                    <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>
                  ))}
                </select>
              </div>

              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10"
              >
                Iniciar Planilla de Conteo
              </button>
            </form>
          </div>
        </div>
      )}

      {/* WEIGHING INVENTORY MODAL */}
      {showWeighModal && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowWeighModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-800"
            >
              <X className="w-6 h-6" />
            </button>

            <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Scale className="w-5 h-5 text-blue-600" />
              Báscula: Toma Física Acumulativa
            </h2>
            <p className="text-xs text-slate-500 mb-4">{selectedItem.nombre}</p>

            <form onSubmit={handleRegisterWeighing} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-555 mb-1">Seleccionar Recipiente (Tara)</label>
                <select
                  value={selectedEnvaseId}
                  onChange={(e) => setSelectedEnvaseId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="">Ninguno (Pesada directa / Neta)</option>
                  {envases.map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.weight} kg)</option>
                  ))}
                  <option value="custom">-- Otro envase (Manual) --</option>
                </select>
              </div>

              {selectedEnvaseId === 'custom' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-555 mb-1">Peso de Tara Manual (kg)</label>
                  <input 
                    type="number" 
                    step="0.001"
                    value={customTareWeight}
                    onChange={(e) => setCustomTareWeight(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-555 mb-1">Peso Bruto Registrado en Báscula (kg)</label>
                <input 
                  type="number" 
                  step="0.001"
                  value={grossWeight}
                  onChange={(e) => setGrossWeight(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 font-bold"
                  placeholder="0.000"
                  required
                  autoFocus
                />
              </div>

              <div className="bg-slate-100 border border-slate-200 p-4 rounded-xl space-y-1.5 font-mono text-xs shadow-sm">
                <div className="flex justify-between text-slate-650 font-semibold">
                  <span>Peso Bruto:</span>
                  <span>{Number(grossWeight) || 0} kg</span>
                </div>
                <div className="flex justify-between text-slate-500 font-semibold">
                  <span>[-] Peso Tara:</span>
                  <span>{getSelectedEnvaseWeight()} kg</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-sm text-emerald-650">
                  <span>[=] Peso Neto Conteo:</span>
                  <span>{calculatedNetWeight.toFixed(3)} kg</span>
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition-all text-xs uppercase tracking-wider shadow-md shadow-blue-500/10"
              >
                Acumular Conteo
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inventory;
