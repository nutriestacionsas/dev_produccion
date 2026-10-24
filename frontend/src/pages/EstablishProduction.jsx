import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import CookingAnimation from '../components/CookingAnimation';
import { Loader2, Database, ChevronRight, ChevronDown, CheckCircle2, Calendar, Share2, AlertTriangle, ChefHat, Layers, TrendingUp, TrendingDown, X, Minus } from 'lucide-react';
import { API_BASE_URL } from '../App';
import * as htmlToImage from 'html-to-image';

export default function EstablishProduction({ user }) {
  const { fecha } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const turnoParam = searchParams.get('turno') || '';
  const menuParam = searchParams.get('menu') || '';
  const grupoIdParam = searchParams.get('grupo_id') || '';

  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState('');

  const [productionDays, setProductionDays] = useState([]);
  const [groupedData, setGroupedData] = useState({});
  const [activeDateStr, setActiveDateStr] = useState(null);
  
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [pendingDispatchGroup, setPendingDispatchGroup] = useState(null);

  const [menuGroups, setMenuGroups] = useState([]);
  const [activeMenuType, setActiveMenuType] = useState(null);
  const [expandedParents, setExpandedParents] = useState({});
  const [expandedChildren, setExpandedChildren] = useState({});

  const toggleChild = (id) => setExpandedChildren(prev => ({ ...prev, [id]: !prev[id] }));

  const printRef = useRef(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeDateStr) {
      fetchProductionResults(activeDateStr);
    }
  }, [activeDateStr, groupedData, turnoParam, menuParam, grupoIdParam]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [pendingShare, setPendingShare] = useState(false);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [producedMenus, setProducedMenus] = useState(new Set());
  const [burnedLastCosts, setBurnedLastCosts] = useState({});

  const getGroupDiaId = (group) => {
    return group?.mos?.map(m => {
      const match = (m.origin || '').match(/NUT-DIA-(\d+)/);
      return match ? match[1] : null;
    }).find(Boolean) || null;
  };

  const handleProducirTodo = async (fecha, turno, menu) => {
    if (!window.confirm(`¿Estás seguro de marcar como HECHO todo el menú ${menu} del turno ${turno} en Odoo?`)) return;

    // "Quemar" los últimos costos que se están mostrando en pantalla antes de producir
    const ultimosCostosActuales = {};
    const targetGroup = menuGroups.find(g => g.menu_nombre === menu && (g.turno_nombre === turno || !turno)) || menuGroups.find(g => g.menu_nombre === menu);
    if (targetGroup) {
      (targetGroup.mos || []).forEach(parent => {
        (parent.children || []).forEach(ch => {
          const uCost = parseFloat(ch.last_cost_unit);
          if (!isNaN(uCost) && uCost > 0) {
            if (ch.recipe_name) ultimosCostosActuales[ch.recipe_name] = uCost;
            if (ch.id) ultimosCostosActuales[ch.id.toString()] = uCost;
          }
        });
      });
      setBurnedLastCosts(prev => ({ ...prev, ...ultimosCostosActuales }));
    }

    setShowAnimation(true);
    setIsFinishing(false);
    try {
      const token = localStorage.getItem('token');
      const payload = { fecha, turno, menu, ultimos_costos: ultimosCostosActuales };
      const res = await fetch(`${API_BASE_URL}/dispatch/producir-todo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      const resData = await res.json();
      
      if (!res.ok) {
        throw new Error(resData.detail || 'Error al producir todo');
      }
      
      if (resData.errores > 0) {
        alert(`Se produjeron ${resData.producidas} órdenes, pero fallaron ${resData.errores}. Odoo podría requerir confirmación manual para algunas (ej. falta de stock o verificaciones de calidad). Por favor revisa en Odoo.`);
      }
      
      setProducedMenus(prev => new Set(prev).add(`${fecha}-${turno}-${menu}`));
      
      await fetchInitialData();
      setIsFinishing(true);
      
    } catch (error) {
      console.error(error);
      alert(error.message);
      setShowAnimation(false);
    }
  };

  const handleAnimationFinished = () => {
    setShowAnimation(false);
    setIsFinishing(false);
    setPendingShare(true);
  };

    const fetchInitialData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/dispatch/establecer-produccion`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar historial de producción desde Odoo');
      const historial = await res.json();
      
      const days = historial.map(d => ({ fecha: d.fecha, produccion_establecida: true }));
      setProductionDays(days);

      const grouped = {};
      historial.forEach(d => {
        grouped[d.fecha] = d.grupos;
      });
      setGroupedData(grouped);

      let dateToSelect = null;
      if (fecha && fecha !== 'hoy') {
        dateToSelect = fecha;
      } else {
        const today = new Date();
        const offset = today.getTimezoneOffset() * 60000;
        dateToSelect = (new Date(today - offset)).toISOString().split('T')[0];
      }

      if (grouped[dateToSelect]) {
        setActiveDateStr(dateToSelect);
      } else if (Object.keys(grouped).length > 0) {
        const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
        setActiveDateStr(sortedDates[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

    const fetchProductionResults = async (dateStr) => {
    setLoadingResults(true);
    try {
      if (groupedData[dateStr]) {
        setMenuGroups(groupedData[dateStr]);
        
        if (groupedData[dateStr].length > 0) {
          setActiveMenuType(groupedData[dateStr][0].menu_nombre);
        } else {
          setActiveMenuType('');
        }
      } else {
        setMenuGroups([]);
        setActiveMenuType('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingResults(false);
    }
  };

  const toggleParent = (id) => {
    setExpandedParents(prev => ({ ...prev, [id]: !prev[id] }));
  };

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

  const compartirWhatsApp = async () => {
    if (!printRef.current) return;
    try {
      const blob = await htmlToImage.toBlob(printRef.current, {
        backgroundColor: '#f8fafc',
        pixelRatio: 2,
      });
      if (!blob) throw new Error("No se pudo generar la imagen");
      
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
    } catch (err) {
      alert('Hubo un error al capturar: ' + err.message);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewBlob(null);
    setPreviewUrl(null);
  };

  const executeShare = async () => {
    if (navigator.share) {
      const file = new File([previewBlob], 'reporte.png', { type: 'image/png' });
      try {
        await navigator.share({
          title: 'Reporte de Producción',
          files: [file]
        });
      } catch (err) {
        console.log('Cancelado o error:', err);
      }
    } else {
      const a = document.createElement('a');
      a.href = previewUrl;
      a.download = `Reporte_Produccion.png`;
      a.click();
      alert('¡Imagen descargada! Puedes compartirla en WhatsApp.');
    }
    closePreview();
  };

  useEffect(() => {
    if (pendingShare && !loading && !loadingResults) {
      if (activeDateStr && groupedData[activeDateStr]) {
         const activeGroup = groupedData[activeDateStr].find(g => g.menu_nombre === activeMenuType);
         if (activeGroup && activeGroup.mos) {
             const expandAll = {};
             activeGroup.mos.forEach(m => expandAll[m.id] = true);
             setExpandedParents(expandAll);
         }
      }

      const timer = setTimeout(() => {
        compartirWhatsApp();
        setPendingShare(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [pendingShare, loading, loadingResults, activeDateStr, groupedData, activeMenuType]);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  };

  return (
    <div className="w-full min-h-[100dvh] bg-slate-50 flex flex-col">
      {showAnimation && (
        <CookingAnimation 
          isFinishing={isFinishing}
          onFinished={handleAnimationFinished}
        />
      )}
      <div className="flex-none bg-white px-6 md:px-10 py-6 border-b border-slate-200 sticky top-0 z-40 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Reporte de Producción
            </h1>
            <p className="text-sm font-semibold text-slate-500">
              Órdenes Master y Platos Producidos en Odoo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/despacho')}
            className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2.5 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
          >
            Volver
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center gap-3 font-semibold">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
            <p className="text-slate-500 font-bold">Cargando...</p>
          </div>
        ) : Object.keys(groupedData).length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
            <Layers className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-black text-slate-700">No hay órdenes pendientes para establecer producción</h3>
            <p className="text-slate-500 font-medium mt-2">Asegúrate de confirmar el Despacho Diario primero. Solo aparecerán aquí los menús cuyo despacho ha sido validado.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.keys(groupedData).sort((a, b) => new Date(b) - new Date(a)).map(fechaIter => {
              const isExpanded = activeDateStr === fechaIter;

              return (
                <div key={fechaIter} ref={isExpanded ? printRef : null} className={`bg-white rounded-3xl border transition-all ${isExpanded ? 'border-blue-300 shadow-md ring-4 ring-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div
                    onClick={() => toggleDate(fechaIter)}
                    className="px-6 py-5 flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isExpanded ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Calendar className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-slate-800 capitalize">{getFormatDateTitle(fechaIter)}</h2>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                          {groupedData[fechaIter].length} Menús
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isExpanded && (user?.rol === 'admin' || user?.permisos?.modules?.['Establecer producción']?.actions?.['Compartir']) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); compartirWhatsApp(); }}
                          className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full font-bold border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm"
                        >
                          <Share2 className="w-4 h-4" /> Compartir
                        </button>
                      )}
                      <div className={`p-2 rounded-xl ${isExpanded ? 'bg-blue-50 text-blue-600' : 'text-slate-400'}`}>
                        {isExpanded ? <ChevronDown className="w-6 h-6" /> : <ChevronRight className="w-6 h-6" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-6 rounded-b-3xl">
                      {loadingResults ? (
                        <div className="flex flex-col items-center py-12">
                          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                          <p className="text-slate-500 font-bold">Consultando Odoo...</p>
                        </div>
                      ) : menuGroups.length === 0 ? (
                        <div className="text-center py-10">
                          <p className="text-slate-500 font-bold">No se encontraron MOs cerradas.</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="flex flex-col lg:flex-row gap-6">
                            {menuGroups.map(grupo => (
                              <button
                                key={`${grupo.turno_nombre}-${grupo.menu_nombre}`}
                                onClick={() => {
                                  setActiveMenuType(grupo.menu_nombre);
                                  const expandAll = {};
                                  if (grupo.mos && grupo.mos.length <= 5) {
                                    grupo.mos.forEach(m => expandAll[m.id] = true);
                                  }
                                  setExpandedParents(expandAll);
                                }}
                                className={`px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all border ${
                                  activeMenuType === grupo.menu_nombre
                                    ? 'bg-slate-800 text-white border-slate-800 shadow-md'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                {grupo.menu_nombre}
                              </button>
                            ))}
                          </div>

                          {(() => {
                            const activeGroup = menuGroups.find(g => g.menu_nombre === activeMenuType);
                            if (!activeGroup) return null;
                            const parents = activeGroup.mos || [];
                            
                            const menuKey = `${activeDateStr}-${activeGroup.turno_nombre}-${activeGroup.menu_nombre}`;
                            const isAlreadyProduced = producedMenus.has(menuKey);
                            const hasPendingMos = parents.length > 0 && parents.some(p => p.state !== 'done');
                            const isFullyProduced = parents.length > 0 && !hasPendingMos;

                            return (
                              <div className="space-y-4">
                                {true && (
                                  <div className="flex justify-end mb-2 gap-3">
                                    <button
                                      onClick={() => {
                                        if (isFullyProduced) {
                                          const gDiaId = getGroupDiaId(activeGroup);
                                          const diaParam = gDiaId ? `&dia_id=${gDiaId}` : '';
                                          window.open(`/despacho-dia/${activeDateStr}?turno=${encodeURIComponent(activeGroup.turno_nombre)}&menu=${encodeURIComponent(activeGroup.menu_nombre)}${diaParam}&viewOnly=true`, '_blank');
                                        } else {
                                          setPendingDispatchGroup(activeGroup);
                                          setShowPasswordModal(true);
                                        }
                                      }}
                                      className="bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-100 transition-colors flex items-center gap-2 shadow-sm"
                                    >
                                      {isFullyProduced ? "Ver Despacho" : "Editar Despacho"}
                                    </button>
                                    {!isFullyProduced && (
                                      <button
                                        onClick={() => handleProducirTodo(activeDateStr, activeGroup.turno_nombre, activeGroup.menu_nombre)}
                                        disabled={loadingAction}
                                        className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                                      >
                                        <CheckCircle2 className="w-4 h-4" /> 
                                        {loadingAction ? 'Procesando...' : 'Producir Todo'}
                                      </button>
                                    )}
                                  </div>
                                )}
                                {parents.length === 0 ? (
                                  <div className="text-center py-10 bg-white rounded-2xl border border-slate-200">
                                    <p className="text-slate-500 font-bold">Sin registros Odoo.</p>
                                  </div>
                                ) : (
                                  parents.map((parent) => (
                                    <div key={parent.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                                      <div
                                        onClick={() => toggleParent(parent.id)}
                                        className="p-5 flex items-center justify-between cursor-pointer bg-gradient-to-r from-slate-50 to-white select-none"
                                      >
                                        <div className="flex items-center gap-4">
                                          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                                            <Layers className="w-6 h-6" />
                                          </div>
                                          <div>
                                            <div className="flex items-center gap-2 mb-1">
                                              <span className="text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white px-2 py-0.5 rounded-md">Master MO</span>
                                              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md flex items-center gap-1 ${parent.state === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                {parent.state === 'done' ? <><CheckCircle2 className="w-3 h-3" /> Hecho</> : parent.state}
                                              </span>
                                            </div>
                                            <h3 className="text-lg font-black text-slate-800 tracking-tight">{parent.name}</h3>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{parent.recipe_name || activeMenuType}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                          <div className="hidden md:flex items-center gap-6 text-right">
                                            <div>
                                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo Total</p>
                                              <p className="text-lg font-black text-slate-800">{formatCurrency(parent.cost_total)}</p>
                                            </div>
                                            <div>
                                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Producido</p>
                                              <p className="text-lg font-black text-blue-600">{parent.qty_producing || parent.product_qty} und</p>
                                            </div>
                                            {(() => {
                                              const costUnit = parent.cost_unit || (parent.cost_total / (parent.qty_producing || parent.product_qty || 1));
                                              const costEst = parent.costo_estimado || 0;
                                              const diff = costUnit - costEst;
                                              const isUp = diff > 0.01;
                                              const isDown = diff < -0.01;
                                              return (
                                                <>
                                                  <div>
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo Unit</p>
                                                    <p className="text-lg font-black text-slate-600">
                                                      {formatCurrency(costUnit)}
                                                    </p>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <div>
                                                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo Estimado</p>
                                                      <p className="text-lg font-black text-amber-600">
                                                        {formatCurrency(costEst)}
                                                      </p>
                                                    </div>
                                                    {(costEst > 0 && (isUp || isDown)) && (
                                                      <div className={`flex flex-col items-center justify-center px-1.5 py-0.5 rounded-md ${isUp ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        <span className="text-[9px] font-black">{isUp ? '+' : '-'}{formatCurrency(Math.abs(diff))}</span>
                                                      </div>
                                                    )}
                                                  </div>
                                                </>
                                              );
                                            })()}
                                          </div>
                                          <div className={`p-2 rounded-full transition-colors ${expandedParents[parent.id] ? 'bg-slate-200' : 'hover:bg-slate-100'}`}>
                                            {expandedParents[parent.id] ? <ChevronDown className="w-5 h-5 text-slate-600" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                                          </div>
                                        </div>
                                      </div>
                                      {expandedParents[parent.id] && (
                                        <div className="border-t border-slate-200 bg-slate-50/50 p-4 md:p-6 space-y-4">
                                          {parent.children && parent.children.length > 0 ? (
                                            parent.children.map(child => (
                                              <div key={child.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                                <div 
                                                  onClick={() => toggleChild(child.id)}
                                                  className={`flex flex-col md:flex-row md:items-center justify-between p-4 gap-4 cursor-pointer hover:bg-slate-50 transition-colors ${expandedChildren[child.id] ? 'bg-slate-50 border-b border-slate-100' : ''}`}
                                                >
                                                  <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0 border border-emerald-100">
                                                      <ChefHat className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                      <div className="flex items-center gap-2">
                                                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">{child.recipe_name}</h4>
                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md flex items-center gap-1 ${child.state === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                          {child.state === 'done' ? <><CheckCircle2 className="w-3 h-3" /> Hecho</> : child.state}
                                                        </span>
                                                      </div>
                                                      <p className="text-xs font-bold text-slate-500">{child.name}</p>
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center gap-4 md:gap-8 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                                                    {(() => {
                                                      const effectiveLastCost = (burnedLastCosts[child.id] || (child.recipe_name && burnedLastCosts[child.recipe_name])) || child.last_cost_unit;
                                                      if (effectiveLastCost === undefined || effectiveLastCost <= 0) return null;
                                                      const diff = child.cost_unit - effectiveLastCost;

                                                      return (
                                                        <div className="text-center border-r border-slate-200 pr-4 md:pr-6">
                                                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Últ. Costo Unit</p>
                                                          <div className="flex items-center gap-1 justify-center">
                                                            {diff > 0.01 ? (
                                                              <>
                                                                <TrendingUp className="w-3 h-3 text-red-500" />
                                                                <p className="text-sm font-bold text-red-500">{formatCurrency(effectiveLastCost)}</p>
                                                              </>
                                                            ) : diff < -0.01 ? (
                                                              <>
                                                                <TrendingDown className="w-3 h-3 text-emerald-500" />
                                                                <p className="text-sm font-bold text-emerald-500">{formatCurrency(effectiveLastCost)}</p>
                                                              </>
                                                            ) : (
                                                              <>
                                                                <Minus className="w-3 h-3 text-slate-400" />
                                                                <p className="text-sm font-bold text-slate-500">{formatCurrency(effectiveLastCost)}</p>
                                                              </>
                                                            )}
                                                          </div>
                                                        </div>
                                                      );
                                                    })()}

                                                    <div className="text-center">
                                                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Costo Total</p>
                                                      <p className="text-sm font-bold text-slate-800">{formatCurrency(child.cost_total)}</p>
                                                    </div>
                                                    <div className="text-center">
                                                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cant.</p>
                                                      <p className="text-sm font-black text-indigo-600">{child.qty_producing || child.product_qty}</p>
                                                    </div>
                                                    <div className="text-center border-l border-slate-200 pl-4 md:pl-6">
                                                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Costo Unit</p>
                                                      <p className="text-sm font-bold text-slate-600">{formatCurrency(child.cost_unit)}</p>
                                                    </div>
                                                    <div className="pl-2">
                                                      {expandedChildren[child.id] ? <ChevronDown className="w-5 h-5 text-slate-600" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                                                    </div>
                                                  </div>
                                                </div>
                                                {expandedChildren[child.id] && (
                                                  <div className="p-4 bg-slate-50/50">
                                                    <div className="overflow-x-auto">
                                                      <table className="w-full min-w-[600px] border-collapse">
                                                        <thead>
                                                          <tr className="border-b border-slate-200">
                                                            <th className="py-2 px-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Componente</th>
                                                            <th className="py-2 px-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Solicitado</th>
                                                            <th className="py-2 px-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Despachado</th>
                                                            <th className="py-2 px-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Diferencia</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                          {child.components && child.components.length > 0 ? child.components.map((comp, idx) => (
                                                            <tr key={idx} className="hover:bg-white transition-colors">
                                                              <td className="py-2 px-3">
                                                                <p className="text-xs font-semibold text-slate-700">{comp.name}</p>
                                                              </td>
                                                              <td className="py-2 px-3 text-right">
                                                                <p className="text-xs font-bold text-slate-500">{comp.required.toFixed(2)} {comp.uom}</p>
                                                              </td>
                                                              <td className="py-2 px-3 text-right">
                                                                <p className="text-xs font-bold text-slate-600">{comp.consumed.toFixed(2)} {comp.uom}</p>
                                                              </td>
                                                              <td className="py-2 px-3 text-right">
                                                                <p className={`text-xs font-bold ${comp.difference > 0 ? 'text-red-500' : (comp.difference < 0 ? 'text-emerald-500' : 'text-slate-400')}`}>
                                                                  {comp.difference > 0 ? '+' : ''}{comp.difference.toFixed(2)} {comp.uom}
                                                                </p>
                                                              </td>
                                                            </tr>
                                                          )) : (
                                                            <tr>
                                                              <td colSpan="3" className="py-4 text-center text-xs font-semibold text-slate-400">
                                                                Sin componentes registrados
                                                              </td>
                                                            </tr>
                                                          )}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            ))
                                          ) : (
                                            <div className="text-center py-6">
                                              <p className="text-sm font-bold text-slate-500">No hay platos (hijas) asociados a esta Master MO.</p>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-800">Vista Previa</h3>
              <button onClick={closePreview} className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar bg-slate-50/50 flex-1 flex justify-center">
              <img src={previewUrl} alt="Vista previa" className="max-w-full h-auto rounded-xl border border-slate-200 shadow-sm" />
            </div>
            <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
              <button onClick={closePreview} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
              <button onClick={executeShare} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-200">
                <Share2 className="w-5 h-5" />
                Compartir
              </button>
            </div>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Autorización Requerida</h3>
            <p className="text-sm text-slate-500 mb-4">Ingrese la contraseña para editar el despacho.</p>
            <input 
              type="password"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm mb-2"
              placeholder="Contraseña..."
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (passwordInput === 'Nutri005!') {
                    setShowPasswordModal(false);
                    setPasswordInput('');
                    if (pendingDispatchGroup) {
                      const gDiaId = getGroupDiaId(pendingDispatchGroup);
                      const diaParam = gDiaId ? `&dia_id=${gDiaId}` : '';
                      window.open(`/despacho-dia/${activeDateStr}?turno=${encodeURIComponent(pendingDispatchGroup.turno_nombre)}&menu=${encodeURIComponent(pendingDispatchGroup.menu_nombre)}${diaParam}`, '_blank');
                    }
                    setPendingDispatchGroup(null);
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
                onClick={() => { setShowPasswordModal(false); setPasswordInput(''); setPasswordError(''); setPendingDispatchGroup(null); }}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (passwordInput === 'Nutri005!') {
                    setShowPasswordModal(false);
                    setPasswordInput('');
                    if (pendingDispatchGroup) {
                      const gDiaId = getGroupDiaId(pendingDispatchGroup);
                      const diaParam = gDiaId ? `&dia_id=${gDiaId}` : '';
                      window.open(`/despacho-dia/${activeDateStr}?turno=${encodeURIComponent(pendingDispatchGroup.turno_nombre)}&menu=${encodeURIComponent(pendingDispatchGroup.menu_nombre)}${diaParam}`, '_blank');
                    }
                    setPendingDispatchGroup(null);
                  } else {
                    setPasswordError('Contraseña incorrecta.');
                  }
                }}
                className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
