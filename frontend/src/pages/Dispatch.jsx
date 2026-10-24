import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Warehouse, Calendar, ChevronDown, ChevronUp, Loader2, RefreshCw, 
  ChefHat, X, AlertCircle, CheckCircle2, AlertTriangle, Scale, ArrowLeft, Database,
  Settings, LayoutGrid
} from 'lucide-react';
import { API_BASE_URL } from '../App';
import * as dateFns from 'date-fns';
import { es } from 'date-fns/locale';
import GruposManagerModal from '../components/GruposManagerModal';
import DispatchDayReportModal from '../components/DispatchDayReportModal';

// Funciones de formato de fecha idénticas al planificador
function parseSpanishDate(dateStr) {
  if (!dateStr) return null;
  const clean = dateStr
    .replace(/FECHA:\s*/i, "")
    .replace(/LUNES|MARTES|MIERCOLES|MIÉRCOLES|JUEVES|VIERNES|SABADO|SÁBADO|DOMINGO/i, "")
    .replace(/,/, "")
    .trim();
  
  const parts = clean.split(/\s+/);
  const months = {
    enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
    julio: "07", agosto: "08", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12"
  };
  
  let day = "", month = "", year = "";
  if (parts.length >= 5) {
    day = parts[0]; month = months[parts[2].toLowerCase()] || ""; year = parts[4];
  } else {
    const match = clean.match(/(\d+)\s+de\s+([a-zA-ZáéíóúÁÉÍÓÚ]+)\s+de\s+(\d+)/i);
    if (match) {
      day = match[1]; month = months[match[2].toLowerCase()] || ""; year = match[3];
    }
  }
  if (day && month && year) {
    return `${year}-${month}-${day.padStart(2, "0")}`;
  }
  return null;
}

function getFormatDateTitle(dateStr) {
  const isoStr = parseSpanishDate(dateStr) || dateStr;
  try {
    const dt = dateFns.parseISO(isoStr);
    return dateFns.format(dt, "EEEE, d 'De' MMMM 'De' yyyy", { locale: es });
  } catch(e) {
    return dateStr;
  }
}

// Custom sort function to match planner order
const sortOrder = {
  "SOPA": 1,
  "FUERTE #1": 2,
  "GUARNICION #1": 3,
  "GUARNICION": 3,
  "FUERTE #2": 4,
  "GUARNICION #2": 5,
  "ARROZ": 6,
  "JUGO": 7,
  "JUGO #2": 8,
  "POSTRE": 9,
  "ADICION": 10,
  "MENU SALUDABLE": 11,
  "GUARNICION SALUDABLE": 12,
  "SOPA SALUDABLE": 13
};

const sortItems = (items) => {
  return [...items].sort((a, b) => {
    const typeA = (a.tipo || "").trim().toUpperCase();
    const typeB = (b.tipo || "").trim().toUpperCase();
    const posA = sortOrder[typeA] || 99;
    const posB = sortOrder[typeB] || 99;
    return posA - posB;
  });
};

export default function Dispatch({ user }) {
  const [productionDays, setProductionDays] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [menuTypes, setMenuTypes] = useState([]);
  const [recipes, setRecipes] = useState({});
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeDateStr, setActiveDateStr] = useState('');
  const [activeShiftTab, setActiveShiftTab] = useState('none');
  const [activeMenuByDate, setActiveMenuByDate] = useState({});
  // Detail view state
  const [selectedPlate, setSelectedPlate] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [plateComponents, setPlateComponents] = useState([]);
  const [moName, setMoName] = useState(null);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [componentError, setComponentError] = useState('');
  const [reportModalDateStr, setReportModalDateStr] = useState(null);

  // Grupos state
  const [grupos, setGrupos] = useState([]);
  const [isGruposMode, setIsGruposMode] = useState(false);
  const [showGruposModal, setShowGruposModal] = useState(false);
  const [updatingMode, setUpdatingMode] = useState(false);
  
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // Fetch days, shifts, menus, config
      const [resDays, resShifts, resMenus, resRecipes, resGrupos, resConfig] = await Promise.all([
        fetch(`${API_BASE_URL}/planner/ordenes-fabricacion`, { headers }),
        fetch(`${API_BASE_URL}/planner/turnos`, { headers }),
        fetch(`${API_BASE_URL}/planner/tipos-menu`, { headers }),
        fetch(`${API_BASE_URL}/recipes/?active_only=true`, { headers }), // Reusing recipes to get photos
        fetch(`${API_BASE_URL}/dispatch/grupos`, { headers }),
        fetch(`${API_BASE_URL}/dispatch/config/modo-grupos`, { headers })
      ]);

      if (resDays.ok) {
        const days = await resDays.json();
        setProductionDays(days);
        if (days.length > 0 && !activeDateStr) setActiveDateStr(days[0].id.toString());
      }
      if (resShifts.ok) {
        const shiftsData = await resShifts.json();
        setShifts(shiftsData);
        if (shiftsData.length > 0 && activeShiftTab === 'none') {
          setActiveShiftTab(shiftsData[0].id.toString());
        }
      }
      if (resMenus.ok) {
        const menus = await resMenus.json();
        setMenuTypes(menus);
      }
      if (resRecipes.ok) {
        const recList = await resRecipes.json();
        const recMap = {};
        recList.forEach(r => {
          recMap[r.nombre] = r;
        });
        setRecipes(recMap);
      }
      if (resGrupos.ok) {
        setGrupos(await resGrupos.json());
      }
      if (resConfig.ok) {
        const config = await resConfig.json();
        setIsGruposMode(config.modo_grupos);
      }
    } catch (err) {
      setError('Error al cargar datos. ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmToggleGruposMode = async () => {
    if (user?.rol !== 'admin') return;
    setUpdatingMode(true);
    const newValue = !isGruposMode;
    // Optimistic UI update
    setIsGruposMode(newValue);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/config/modo-grupos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ activo: newValue })
      });
      if (!res.ok) {
        throw new Error('Error al guardar la configuración');
      }
      const data = await res.json();
      setIsGruposMode(data.modo_grupos);
    } catch (err) {
      alert(err.message);
      setIsGruposMode(!newValue); // revert
    } finally {
      setUpdatingMode(false);
    }
  };

  const toggleGruposMode = () => {
    if (user?.rol !== 'admin') return;
    if (!isGruposMode) {
      setShowPasswordModal(true);
    } else {
      confirmToggleGruposMode();
    }
  };

  const openComponentModal = async (item, fecha, diaId) => {
    setSelectedPlate(item);
    setSelectedDate(fecha);
    setPlateComponents([]);
    setMoName(null);
    setComponentError('');
    setLoadingComponents(true);

    try {
      const dbDate = parseSpanishDate(fecha) || fecha;
      let url = `${API_BASE_URL}/dispatch/plate-components?plato_nombre=${encodeURIComponent(item.plato_nombre)}&fecha=${dbDate}`;
      if (diaId) {
        url += `&dia_id=${diaId}`;
      }
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('No se pudo cargar los ingredientes.');
      const data = await res.json();
      setPlateComponents(data.components || []);
      setMoName(data.mo_name);
    } catch (err) {
      setComponentError(err.message);
    } finally {
      setLoadingComponents(false);
    }
  };

  const handleDespacharDia = (fecha, turno, menu, diaId) => {
    if (window.confirm(`¿Estás seguro que quieres despachar todos los ingredientes del día ${getFormatDateTitle(fecha)}?`)) {
      const query = new URLSearchParams();
      if (turno) query.append('turno', turno);
      if (menu) query.append('menu', menu);
      if (diaId) query.append('dia_id', diaId);
      navigate(`/despacho-dia/${fecha}?${query.toString()}`);
    }
  };

  const handleDespacharGrupo = (fecha, grupo, turno, menu, diaId) => {
    if (window.confirm(`¿Estás seguro que quieres despachar los productos de ${grupo.nombre} para el día ${getFormatDateTitle(fecha)}?`)) {
      const query = new URLSearchParams();
      if (turno) query.append('turno', turno);
      if (menu) query.append('menu', menu);
      if (diaId) query.append('dia_id', diaId);
      query.append('grupo_id', grupo.id);
      query.append('grupo_nombre', grupo.nombre);
      navigate(`/despacho-dia/${fecha}?${query.toString()}`);
    }
  };

  // Y aplicar filtros de turno y menú
  const syncedDays = productionDays.filter(d => {
    if (!d.ruta_asignada) return false;
    
    // Ocultar menús que ya fueron despachados y establecida la producción
    if (d.produccion_establecida) return false;
    
    // Filtro por Turno
    if (activeShiftTab !== 'none' && d.turno_id?.toString() !== activeShiftTab) return false;
    if (activeShiftTab === 'none' && d.turno_id) return false;

    return true;
  });

  // Group by date
  const groupedData = syncedDays.reduce((acc, d) => {
    if (!acc[d.fecha]) acc[d.fecha] = [];
    acc[d.fecha].push(d);
    return acc;
  }, {});

  if (selectedPlate) {
    const recipeObj = recipes[selectedPlate.plato_nombre];
    const photoBase64 = recipeObj ? recipeObj.image_256 : null;
    const pasosPreparacion = recipeObj && recipeObj.pasos_preparacion ? recipeObj.pasos_preparacion : [];

    return (
      <div className="space-y-6 animate-fade-in">
        {/* Encabezado fijo para detalle de orden */}
        <div className="sticky -top-6 md:-top-10 bg-slate-50 z-30 -mx-6 md:-mx-10 px-6 md:px-10 -mt-6 md:-mt-10 pt-6 md:pt-10 pb-4 border-b border-slate-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedPlate(null)}
              className="p-2 bg-white hover:bg-slate-100 text-slate-650 hover:text-slate-900 border border-slate-200 rounded-xl transition-all cursor-pointer shadow-xs flex items-center justify-center shrink-0"
              title="Volver a despachos"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-orange-400">Detalle de Orden de Fabricación</span>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-tight line-clamp-1">
                {selectedPlate.plato_nombre}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              {getFormatDateTitle(selectedDate)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Foto e Información */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white border border-slate-205 rounded-2xl p-6 shadow-xs flex flex-col items-center text-center">
              <div className="w-32 h-32 rounded-full border-4 border-slate-50 bg-slate-50 flex items-center justify-center overflow-hidden shadow-xs mb-4 shrink-0">
                {photoBase64 ? (
                  <img 
                    src={photoBase64.startsWith('data:') ? photoBase64 : `data:image/png;base64,${photoBase64}`} 
                    alt={selectedPlate.plato_nombre} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ChefHat className="w-14 h-14 text-slate-300" />
                )}
              </div>

              {moName && (
                <span className="text-[10px] font-bold text-blue-500 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-md font-mono mb-3 flex items-center gap-1.5">
                  <Warehouse className="w-3 h-3" /> REF ODOO: #{moName}
                </span>
              )}

              <h2 className="text-lg font-bold text-slate-800 leading-snug">{selectedPlate.plato_nombre}</h2>
              
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mt-2 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-150">
                {selectedPlate.tipo}
              </span>

              <div className="w-full border-t border-slate-100 my-4" />

              <div className="flex flex-col items-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Raciones A Cocinar</span>
                <p className="text-3xl font-black text-orange-600 mt-0.5 bg-orange-50 px-4 py-1 rounded-xl border border-orange-100">
                  {selectedPlate.total} <span className="text-sm font-bold text-orange-400">Uds</span>
                </p>
              </div>
            </div>
            {/* Preparación */}
            <div className="bg-white border border-slate-205 rounded-2xl p-6 shadow-xs mt-6">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                Preparación
              </h3>
              {pasosPreparacion.length > 0 ? (
                <ol className="list-decimal list-inside space-y-3">
                  {pasosPreparacion.map((paso, idx) => (
                    <li key={idx} className="text-sm text-slate-600 leading-relaxed pl-1">
                      {paso}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-400 italic text-center py-4">
                  No hay instrucciones de preparación registradas para esta receta.
                </p>
              )}
            </div>
          </div>

          {/* Materiales de la Receta (BoM) */}
          <div className="lg:col-span-2 bg-white border border-slate-205 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-orange-500" />
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Materiales a Despachar</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-bold bg-slate-50 border border-slate-150 px-2 py-0.5 rounded-md font-mono">
                Componentes: {plateComponents.length}
              </span>
            </div>

            {loadingComponents ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                <p className="text-xs font-semibold animate-pulse">Obteniendo componentes de Odoo ERP...</p>
              </div>
            ) : componentError ? (
              <div className="text-center py-16 text-rose-500 space-y-2 bg-rose-50 rounded-xl border border-rose-100">
                <AlertTriangle className="w-8 h-8 mx-auto" />
                <p className="text-sm font-bold">{componentError}</p>
              </div>
            ) : plateComponents.length === 0 ? (
              <div className="text-center py-16 text-slate-400 space-y-2">
                <Warehouse className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-600">Orden de Fabricación no encontrada.</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">Asegúrate de que este día haya sido sincronizado con Odoo primero.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre del Material</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Cantidad Req.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plateComponents.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-150 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3.5 text-xs font-bold text-slate-700">{item.name}</td>
                        <td className="px-4 py-3.5 text-xs text-slate-800 font-black text-right font-mono">
                          {item.required_qty.toLocaleString('es', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500 font-semibold text-left">{item.uom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Encabezado Fijo */}
      <div className="sticky -top-6 md:-top-10 bg-slate-50 z-30 -mx-6 md:-mx-10 px-6 md:px-10 -mt-6 md:-mt-10 pt-6 md:pt-10 pb-4 border-b border-slate-200/50 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <Warehouse className="w-8 h-8 text-blue-600" />
              Despachos Diarios
            </h1>
            <p className="text-slate-500 mt-1.5 font-medium">Gestiona y pesa los ingredientes requeridos por día.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* Toggle Grupo Mode (Solo Admin) */}
            {(user?.rol === 'admin' || user?.permisos?.modules?.['Despacho a cocina']?.actions?.['Por Grupos']) ? (
              <label className={`flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm ${updatingMode ? 'opacity-50' : ''}`}>
                <div className="relative inline-block w-10 h-5">
                  <input type="checkbox" className="peer sr-only" disabled={updatingMode} checked={isGruposMode} onChange={toggleGruposMode} />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                </div>
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <LayoutGrid className="w-4 h-4 text-indigo-500" /> {updatingMode ? 'Guardando...' : 'Por Grupos'}
                </span>
              </label>
            ) : isGruposMode ? (
              <div className="flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-xl border border-indigo-100 shadow-sm">
                <span className="text-sm font-semibold text-indigo-700 flex items-center gap-1.5">
                  <LayoutGrid className="w-4 h-4" /> Por Grupos
                </span>
              </div>
            ) : null}

            {(user?.rol === 'admin' || user?.permisos?.modules?.['Despacho a cocina']?.actions?.['Gestionar grupos']) && (
              <button 
                onClick={() => setShowGruposModal(true)}
                className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-indigo-600 px-4 py-2.5 rounded-xl font-bold border border-indigo-200 transition-all shadow-sm cursor-pointer"
              >
                <Settings className="w-4 h-4" /> Gestionar Grupos
              </button>
            )}

            <div className="flex-1 w-full md:w-auto">
              {/* Contenedor de Botones (Fila Superior: Turnos, Fila Inferior: Menús) */}
              <div className="flex flex-col gap-3">
                {/* Tabs de Turnos */}
                <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-3xs flex flex-wrap gap-2 items-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1 font-mono">Turno:</span>
                  {shifts.map(sh => {
                    const isSelected = activeShiftTab === sh.id.toString();
                    return (
                      <button
                        key={sh.id}
                        onClick={() => setActiveShiftTab(sh.id.toString())}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {sh.nombre}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setActiveShiftTab('none')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                      activeShiftTab === 'none'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    Sin Asignar
                  </button>
                </div>

              </div>
            </div>
            <button 
              onClick={fetchInitialData}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl font-bold border border-slate-200 transition-all shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center gap-3 font-semibold shadow-xs">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {loading && productionDays.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-10 h-10 animate-spin mb-4 text-orange-500" />
          <p className="font-semibold tracking-wide">Cargando jornadas...</p>
        </div>
      ) : Object.keys(groupedData).length === 0 ? (
        <div className="bg-white border border-slate-200 text-slate-500 p-10 rounded-3xl flex flex-col items-center text-center shadow-xs">
          <Calendar className="w-16 h-16 text-slate-300 mb-4" />
          <h3 className="text-xl font-bold text-slate-700 mb-2">No hay despachos pendientes</h3>
          <p className="text-slate-500">Solo se muestran los días que ya han sido sincronizados con Odoo (con ruta asignada).</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedData).map(([fecha, records]) => {
            const isExpanded = activeDateStr === fecha;
            
            // Determinar menús disponibles
            const availableMenus = records.map(r => r.tipo_menu).filter(Boolean);
            
            // Determinar el menú activo para este día
            const activeMenuId = activeMenuByDate[fecha] || (availableMenus.length > 0 ? availableMenus[0].id : null);
            
            // Determinar el record activo (que corresponde al menú seleccionado)
            const activeRecord = records.find(r => r.tipo_menu?.id === activeMenuId) || records[0];
            const sortedItems = sortItems(activeRecord.items.filter(it => it.total > 0));
            const totalPlatos = records.reduce((sum, r) => sum + r.items.filter(it => it.total > 0).length, 0);

            return (
              <div key={fecha} className={`bg-white border transition-all duration-300 rounded-3xl shadow-xs ${isExpanded ? 'border-orange-300 ring-2 ring-orange-500/10' : 'border-slate-200 hover:border-slate-300'}`}>
                {/* Cabecera ÚNICA del día */}
                <div 
                  onClick={() => setActiveDateStr(isExpanded ? '' : fecha)}
                  className={`sticky top-[220px] sm:top-[160px] md:top-[115px] z-20 p-5 flex items-center justify-between cursor-pointer select-none transition-colors backdrop-blur-md rounded-t-3xl ${!isExpanded ? 'rounded-b-3xl' : ''} ${isExpanded ? 'bg-orange-50/90 border-b border-orange-100 shadow-sm' : 'bg-white/90 hover:bg-slate-50/80'}`}
                >
                  <div className="flex items-center gap-5">
                    <div className={`p-3 rounded-2xl ${isExpanded ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'}`}>
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className={`text-lg font-extrabold capitalize ${isExpanded ? 'text-slate-900' : 'text-slate-700'}`}>
                        {getFormatDateTitle(fecha)}
                      </h3>
                      <p className="text-xs font-semibold text-slate-500 mt-1">
                        {records.length} {records.length === 1 ? 'Menú' : 'Menús'} programados
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReportModalDateStr(fecha);
                      }}
                      className="text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2"
                      title="Ver Informe General de Despacho del Día"
                    >
                      <Database className="w-4 h-4" />
                      <span className="hidden sm:inline">Informe General</span>
                    </button>
                    <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
                      {totalPlatos} Platos en total
                    </span>
                    {isExpanded ? <ChevronUp className="w-6 h-6 text-slate-400" /> : <ChevronDown className="w-6 h-6 text-slate-400" />}
                  </div>
                </div>

                {/* Contenido expandido */}
                {isExpanded && (
                  <div className="p-4 bg-slate-50/30">
                    
                    {/* TABS DE MENÚS (Internos) */}
                    {availableMenus.length > 0 && (
                      <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-4 px-2">
                        {availableMenus.map(menu => (
                          <button
                            key={menu.id}
                            onClick={(e) => {
                               e.stopPropagation();
                               setActiveMenuByDate(prev => ({...prev, [fecha]: menu.id}));
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all shadow-sm ${
                              activeMenuId === menu.id 
                                ? 'bg-blue-600 text-white border border-blue-600' 
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            {menu.nombre}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* CAJA DE CONTEXTO ESTILO PLANNER */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 px-2">
                      <div className="flex items-center gap-2 bg-slate-100/50 px-3 py-2 rounded-xl border border-slate-200/60 shadow-3xs w-fit">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono bg-slate-200/50 px-2 py-1 rounded-md">Contexto:</span>
                        <span className="text-xs font-bold text-slate-700">
                          Turno: <span className="text-blue-700 font-extrabold">{activeRecord.turno?.nombre || "Sin Asignar"}</span> | Menú: <span className="text-blue-700 font-extrabold">{activeRecord.tipo_menu?.nombre}</span>
                        </span>
                      </div>
                      
                      {!isGruposMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDespacharDia(fecha, activeRecord.turno?.nombre, activeRecord.tipo_menu?.nombre, activeRecord.id);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
                        >
                          <Warehouse className="w-4 h-4" />
                          <span className="text-xs">Despachar Este Menú</span>
                        </button>
                      )}
                    </div>

                    {/* Contenido expandido: Grupos o Tarjetas de platos */}
                          {isGruposMode ? (() => {
                            // Renderizar por Grupos
                            const groupsWithItems = grupos.map(g => {
                              const groupCatNames = g.categorias.map(c => c.categoria_odoo_nombre);
                              const itemsInGroup = sortedItems.filter(item => {
                                const recipeObj = recipes[item.plato_nombre];
                                if (!recipeObj || !recipeObj.categ_name) return false;
                                const catParts = recipeObj.categ_name.split('/').map(c => c.trim());
                                return catParts.some(c => groupCatNames.includes(c));
                              });
                              return { ...g, items: itemsInGroup };
                            }).filter(g => g.items.length > 0);

                            const assignedItemIds = new Set(groupsWithItems.flatMap(g => g.items.map(i => i.id)));
                            const unassignedItems = sortedItems.filter(i => !assignedItemIds.has(i.id));

                            const renderItemsGrid = (items) => (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                {items.map(item => {
                                  const recipeObj = recipes[item.plato_nombre];
                                  const photoBase64 = recipeObj ? recipeObj.image_256 : null;
                                  
                                  return (
                                    <div 
                                      key={item.id} 
                                      onClick={() => openComponentModal(item, fecha, activeRecord.id)}
                                      className="bg-white border border-slate-200 hover:border-orange-300 rounded-xl p-3 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col group"
                                    >
                                      <div className="flex justify-center mb-2">
                                        <div className="w-16 h-16 rounded-full border border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
                                          {photoBase64 ? (
                                            <img src={photoBase64.startsWith('data:') ? photoBase64 : `data:image/png;base64,${photoBase64}`} alt={item.plato_nombre} className="w-full h-full object-cover"/>
                                          ) : (
                                            <ChefHat className="w-6 h-6 text-slate-300" />
                                          )}
                                        </div>
                                      </div>
                                      <div className="text-center flex-1 flex flex-col justify-between">
                                        <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug mb-1" title={item.plato_nombre}>
                                          {item.plato_nombre}
                                        </h4>
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 inline-block">
                                          {item.tipo}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );

                            return (
                              <div className="space-y-3">
                                {groupsWithItems.map(g => (
                                  <div key={g.id} className="bg-white rounded-xl border border-indigo-100 overflow-hidden shadow-sm">
                                    <div className="bg-indigo-50/50 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:gap-6 flex-1">
                                        <div className="shrink-0 min-w-[150px]">
                                          <h4 className="text-md font-bold text-indigo-900">{g.nombre}</h4>
                                          <p className="text-xs text-indigo-600 font-medium">{g.items.length} Platos asignados</p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          {g.items.map(item => (
                                            <div 
                                              key={item.id} 
                                              onClick={() => openComponentModal(item, fecha, activeRecord.id)} 
                                              className="inline-flex items-center gap-2 bg-white border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-lg shadow-2xs cursor-pointer transition-all group hover:-translate-y-0.5"
                                            >
                                              <span className="text-xs font-semibold text-slate-700 group-hover:text-indigo-800">{item.plato_nombre}</span>
                                              <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">{item.tipo}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDespacharGrupo(fecha, g, activeRecord.turno?.nombre, activeRecord.tipo_menu?.nombre, activeRecord.id);
                                        }}
                                        className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
                                      >
                                        <Warehouse className="w-4 h-4" />
                                        <span className="text-xs">Despachar</span>
                                      </button>
                                    </div>
                                  </div>
                                ))}

                                {unassignedItems.length > 0 && (
                                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm mt-4">
                                    <div className="bg-slate-50/80 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:gap-6 flex-1">
                                        <div className="shrink-0 min-w-[150px]">
                                          <h4 className="text-md font-bold text-slate-700">Otros / Sin Grupo</h4>
                                          <p className="text-xs text-slate-500 font-medium">{unassignedItems.length} Platos no asignados</p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          {unassignedItems.map(item => (
                                            <div 
                                              key={item.id} 
                                              onClick={() => openComponentModal(item, fecha, activeRecord.id)}
                                              className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg shadow-2xs cursor-pointer transition-all group hover:-translate-y-0.5"
                                            >
                                              <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-900">{item.plato_nombre}</span>
                                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{item.tipo}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })() : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                              {sortedItems.map(item => {
                                const recipeObj = recipes[item.plato_nombre];
                                const photoBase64 = recipeObj ? recipeObj.image_256 : null;
                                
                                return (
                                  <div 
                                    key={item.id} 
                                    onClick={() => openComponentModal(item, fecha, activeRecord.id)}
                                    className="bg-white border border-slate-200 hover:border-orange-300 rounded-xl p-3 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col group"
                                  >
                                    <div className="flex justify-center mb-2">
                                      <div className="w-16 h-16 rounded-full border border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
                                        {photoBase64 ? (
                                          <img src={photoBase64.startsWith('data:') ? photoBase64 : `data:image/png;base64,${photoBase64}`} alt={item.plato_nombre} className="w-full h-full object-cover"/>
                                        ) : (
                                          <ChefHat className="w-6 h-6 text-slate-300" />
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-center flex-1 flex flex-col justify-between">
                                      <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug mb-1" title={item.plato_nombre}>
                                        {item.plato_nombre}
                                      </h4>
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 inline-block">
                                        {item.tipo}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
            );
          })}
        </div>
      )}

      {/* Modal Componentes Plato */}
      {selectedPlate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Receta: {selectedPlate.plato_nombre}</h3>
                <p className="text-sm text-slate-500">Componentes de Odoo y pasos de preparación</p>
              </div>
              <button onClick={() => setSelectedPlate(null)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Database className="w-4 h-4 text-orange-500" />
                    Ingredientes (Odoo BoM)
                  </h4>
                  {loadingComponents ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                    </div>
                  ) : componentError ? (
                    <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{componentError}</div>
                  ) : plateComponents.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No se encontraron componentes en la Orden de Fabricación.</p>
                  ) : (
                    <div className="space-y-2">
                      {plateComponents.map((c, i) => (
                        <div key={i} className="flex justify-between items-center p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-sm">
                          <span className="font-medium text-slate-700 line-clamp-1 flex-1 pr-2" title={c.name}>{c.name}</span>
                          <span className="font-mono text-xs font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded">
                            {c.required_qty.toFixed(3)} {c.uom}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div>
                  <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <ChefHat className="w-4 h-4 text-blue-500" />
                    Pasos de Preparación
                  </h4>
                  {recipes[selectedPlate.plato_nombre]?.pasos_preparacion?.length > 0 ? (
                    <ol className="space-y-3">
                      {recipes[selectedPlate.plato_nombre].pasos_preparacion.map((paso, i) => (
                        <li key={i} className="flex gap-3 text-sm text-slate-600 bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
                          <span className="font-black text-blue-300 select-none">{i + 1}.</span>
                          <span className="leading-relaxed">{paso}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-slate-500 italic">No hay pasos de preparación registrados para esta receta.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gestionar Grupos */}
      <GruposManagerModal isOpen={showGruposModal} onClose={() => {
        setShowGruposModal(false);
        fetchInitialData(); // refetch groups
      }} />

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Autorización Requerida</h3>
            <p className="text-sm text-slate-500 mb-4">Ingrese la contraseña para activar los despachos por grupos.</p>
            <input 
              type="password"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm mb-2"
              placeholder="Contraseña..."
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (passwordInput === 'Nutri005!') {
                    setShowPasswordModal(false);
                    setPasswordInput('');
                    confirmToggleGruposMode();
                  } else {
                    setPasswordError('Contraseña incorrecta.');
                  }
                }
              }}
              autoFocus
            />
            {passwordError && <p className="text-red-500 text-xs font-semibold">{passwordError}</p>}
            
            <div className="flex gap-3 mt-5">
              <button 
                onClick={() => { setShowPasswordModal(false); setPasswordInput(''); setPasswordError(''); }}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (passwordInput === 'Nutri005!') {
                    setShowPasswordModal(false);
                    setPasswordInput('');
                    confirmToggleGruposMode();
                  } else {
                    setPasswordError('Contraseña incorrecta.');
                  }
                }}
                className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dispatch Report */}
      {reportModalDateStr && (
        <DispatchDayReportModal 
          fecha={reportModalDateStr} 
          onClose={() => setReportModalDateStr(null)} 
        />
      )}
    </div>
  );
}
