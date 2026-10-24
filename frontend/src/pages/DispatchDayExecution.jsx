import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, Warehouse, Loader2, AlertCircle, Scale, X, Save, Plus, Search, CheckCircle2, AlertTriangle, ChevronRight, ListTree, Settings, MessageSquare, FileText
} from 'lucide-react';
import { API_BASE_URL } from '../App';
import AdditionalDispatchModal from '../components/AdditionalDispatchModal';
import PartialDispatchConfigModal from '../components/PartialDispatchConfigModal';

export default function DispatchDayExecution({ user }) {
  const { fecha } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const turno = searchParams.get('turno') || '';
  const menu = searchParams.get('menu') || '';
  const grupoId = searchParams.get('grupo_id') || '';
  const grupoNombre = searchParams.get('grupo_nombre') || '';
  const viewOnly = searchParams.get('viewOnly') === 'true';
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const hasActionPerm = user?.rol === 'admin' || user?.permisos?.modules?.['Despacho a cocina']?.actions?.['Confirmar despacho total'] === true;
  
  const [components, setComponents] = useState([]);
  const [tares, setTares] = useState([]);
  const [moNames, setMoNames] = useState([]);
  
  // Estados unificados para despacho y devoluciA3n
  // Format: { [odoo_product_id]: { mode: 'manual'|'scale', manualValue: string, weighings: [] } }
  const [dispatchData, setDispatchData] = useState({});
  const [devolutionData, setDevolutionData] = useState({});
  const [draftProductNames, setDraftProductNames] = useState({});
  const [novedades, setNovedades] = useState("");
  
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estado del modal de Taras
  const [activeWeighingContext, setActiveWeighingContext] = useState(null); // 'dispatch' | 'devolution'
  const [activeWeighingProduct, setActiveWeighingProduct] = useState(null);
  const [modalWeighings, setModalWeighings] = useState([]);
  const [activeRowId, setActiveRowId] = useState(null);
  const [tareSearchQuery, setTareSearchQuery] = useState('');
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showAdditionalModal, setShowAdditionalModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [pendingPasswordAction, setPendingPasswordAction] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEstablishing, setIsEstablishing] = useState(false);

  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'synced'

  // Modal de Despacho Parcial
  const [partialModalOpen, setPartialModalOpen] = useState(false);
  const [partialComponent, setPartialComponent] = useState(null);
  const [partialBreakdown, setPartialBreakdown] = useState([]);
  const [loadingPartial, setLoadingPartial] = useState(false);
  const [partialState, setPartialState] = useState({}); // { mo_id: { mode, manualValue, weighings } }
  const [partialConfig, setPartialConfig] = useState([]);
  const [showPartialConfigModal, setShowPartialConfigModal] = useState(false);
  
  // Comments and Novedades State
  const [showNovedadesModal, setShowNovedadesModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [activeCommentProduct, setActiveCommentProduct] = useState(null);
  const [activeCommentText, setActiveCommentText] = useState('');
  
  // Para la balanza dentro del modal parcial
  const [partialActiveRowId, setPartialActiveRowId] = useState(null);

  // Cargar borrador al inicializar desde la base de datos
  useEffect(() => {
    const fetchDraft = async () => {
      try {
        const localDraftKey = `draft_${fecha}_${turno}_${menu}_${grupoId}`;
        const localDraft = localStorage.getItem(localDraftKey);
        let loadedFromLocal = false;
        
        if (localDraft) {
          try {
            const parsed = JSON.parse(localDraft);
            // Cargar si tiene menos de 24 horas
            if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
              if (parsed.dispatchData) setDispatchData(parsed.dispatchData);
              if (parsed.devolutionData) setDevolutionData(parsed.devolutionData);
              if (parsed.novedades) setNovedades(parsed.novedades);
              if (parsed.draftProductNames) setDraftProductNames(parsed.draftProductNames);
              loadedFromLocal = true;
            }
          } catch (e) {
            console.error("Error parseando borrador local", e);
          }
        }

        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        const queryParams = new URLSearchParams();
        if (grupoId) queryParams.append('grupo_id', grupoId);
        if (turno) queryParams.append('turno', turno);
        if (menu) queryParams.append('menu', menu);
        
        const url = `${API_BASE_URL}/dispatch/draft?fecha=${fecha}&${queryParams.toString()}`;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          // Si no había local, o preferimos sincronizar si en DB es más reciente (aquí omitimos esa lógica por simplicidad, priorizando local)
          if (!loadedFromLocal) {
            if (data.dispatchData) setDispatchData(data.dispatchData);
            if (data.devolutionData) setDevolutionData(data.devolutionData);
            if (data.novedades) setNovedades(data.novedades);
            if (data.productNames) setDraftProductNames(data.productNames);
          }
        }
      } catch (err) {
        console.error("Error al cargar borrador desde DB", err);
      }
    };
    fetchDraft();
  }, [fecha, turno, menu, grupoId]);

  // Guardar en LocalStorage instantáneamente
  useEffect(() => {
    if (Object.keys(dispatchData).length === 0 && Object.keys(devolutionData).length === 0 && !novedades) return;
    const localDraftKey = `draft_${fecha}_${turno}_${menu}_${grupoId}`;
    localStorage.setItem(localDraftKey, JSON.stringify({
      dispatchData,
      devolutionData,
      novedades,
      draftProductNames,
      timestamp: Date.now()
    }));
  }, [dispatchData, devolutionData, novedades, draftProductNames, fecha, turno, menu, grupoId]);

  // Guardar borrador automáticamente con debounce
  useEffect(() => {
    if (Object.keys(dispatchData).length === 0 && Object.keys(devolutionData).length === 0) return;

    setSyncStatus('syncing');
    const timerId = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        
        const body = {
          fecha,
          turno: turno || null,
          menu: menu || null,
          grupo_id: grupoId ? parseInt(grupoId, 10) : null,
          novedades: novedades,
          dispatchData,
          devolutionData
        };

        const res = await fetch(`${API_BASE_URL}/dispatch/draft`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });
        
        if (res.ok) {
          setSyncStatus('synced');
          setTimeout(() => setSyncStatus('idle'), 3000);
        } else {
          setSyncStatus('idle');
        }
      } catch (err) {
        console.error("Error al guardar borrador", err);
        setSyncStatus('idle');
      }
    }, 1500);

    return () => clearTimeout(timerId);
  }, [dispatchData, devolutionData, fecha, turno, menu, grupoId]);

  const handleBackNavigation = () => {
    navigate('/despacho');
  };

  // Helper para mostrar la subcategoría si la categoría raíz es "Recetas"
  const getDisplayCategory = (categ_name) => {
    if (!categ_name) return '';
    const parts = categ_name.split('/').map(p => p.trim());
    if (parts.length > 1 && parts[0].toLowerCase() === 'recetas') {
      return parts.slice(1).join(' / ');
    }
    return parts[0];
  };

  const turnoParam = searchParams.get('turno');
  const menuParam = searchParams.get('menu');
  const diaIdParam = searchParams.get('dia_id');

  useEffect(() => {
    setComponents([]);
    fetchInitialData();
  }, [fecha, turnoParam, menuParam, grupoId, diaIdParam]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const queryParams = new URLSearchParams();
      if (grupoId) queryParams.append('grupo_id', grupoId);
      
      const turno = searchParams.get('turno');
      const menu = searchParams.get('menu');
      const diaId = searchParams.get('dia_id');
      if (turno) queryParams.append('turno', turno);
      if (menu) queryParams.append('menu', menu);
      if (diaId) queryParams.append('dia_id', diaId);
      
      const compUrl = `${API_BASE_URL}/dispatch/day-components/${fecha}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

      const [compRes, taresRes, partialConfigRes] = await Promise.all([
        fetch(compUrl, { headers }),
        fetch(`${API_BASE_URL}/odoo/envases`, { headers }),
        fetch(`${API_BASE_URL}/dispatch/partial-config`, { headers })
      ]);
      
      if (!compRes.ok) throw new Error('Error al cargar componentes del día');
      const compData = await compRes.json();
      
      if (partialConfigRes.ok) {
        const pConfigData = await partialConfigRes.json();
        if (pConfigData.status === 'success') {
          setPartialConfig(pConfigData.product_ids || []);
        }
      }
      
      // Filter out the "Recetas" category (the parent MOs components), so we only show raw ingredients (from child MOs)
      const filteredComps = (compData.components || []).filter(c => {
        const cat = c.categ_name?.split('/')[0]?.trim()?.toLowerCase() || '';
        return cat !== 'recetas' && cat !== 'receta';
      });
      setComponents(filteredComps);
      if (compData.mo_names) {
        setMoNames(compData.mo_names);
      }
      if (taresRes.ok) {
        setTares(await taresRes.json());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getFormatDateTitle = (dateString) => {
    if (!dateString) return '';
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

  // ---- LOGICA DE TABLA ----
  const handleManualChange = (type, productId, value) => {
    if (!/^\d*\.?\d{0,3}$/.test(value)) return;
    const setter = type === 'dispatch' ? setDispatchData : setDevolutionData;
    setter(prev => {
      const existing = prev[productId] || {};
      if (existing.mode === 'scale') return prev;
      return {
        ...prev,
        [productId]: { ...existing, mode: 'manual', manualValue: value }
      };
    });
  };

  const handleManualBlur = (type, productId, value) => {
    if (!value) return;
    const num = parseFloat(value);
    if (!isNaN(num)) {
      const formattedValue = num.toFixed(3);
      const setter = type === 'dispatch' ? setDispatchData : setDevolutionData;
      setter(prev => {
        const existing = prev[productId] || {};
        if (existing.mode === 'scale' || existing.mode === 'partial') return prev;
        return {
          ...prev,
          [productId]: { ...existing, mode: 'manual', manualValue: formattedValue }
        };
      });
    }
  };

  const getNetValue = (type, productId) => {
    const data = type === 'dispatch' ? dispatchData[productId] : devolutionData[productId];
    if (!data) return 0;
    if (data.mode === 'manual' || data.mode === 'partial') return parseFloat(data.manualValue) || 0;
    return (data.weighings || []).reduce((s, w) => s + (parseFloat(w.net) || 0), 0);
  };

  const getManualStr = (type, productId) => {
    const data = type === 'dispatch' ? dispatchData[productId] : devolutionData[productId];
    if (!data) return '';
    if (data.mode === 'scale') {
      return ((data.weighings || []).reduce((s, w) => s + (parseFloat(w.net) || 0), 0)).toFixed(3);
    }
    if (data.mode === 'partial' && data.manualValue !== undefined) {
      const parsed = parseFloat(data.manualValue);
      if (!isNaN(parsed)) return parsed.toFixed(3);
    }
    return data.manualValue || '';
  };

  // ---- LÓGICA DE TARAS Y PESAJE ----
  const handleOpenWeighingModal = (product, type) => {
    setActiveWeighingContext(type);
    setActiveWeighingProduct(product);
    const data = type === 'dispatch' ? dispatchData[product.odoo_product_id] : devolutionData[product.odoo_product_id];
    const existingWeighings = data ? data.weighings || [] : [];
    
    if (existingWeighings.length === 0) {
      const manualVal = data && data.manualValue ? String(data.manualValue) : '';
      const initialNet = parseFloat(manualVal) || 0;
      setModalWeighings([{ 
        id: Date.now().toString(), 
        gross: manualVal, 
        tareId: null, 
        tareQty: '1', 
        tareWeight: 0, 
        net: initialNet 
      }]);
      setActiveRowId(Date.now().toString());
    } else {
      setModalWeighings([...existingWeighings]);
      setActiveRowId(existingWeighings[existingWeighings.length - 1].id);
    }
    setTareSearchQuery('');
  };

  const handleCloseWeighingModal = () => {
    setActiveWeighingProduct(null);
    setActiveWeighingContext(null);
    setModalWeighings([]);
    setActiveRowId(null);
  };

  const handleOpenPartialModal = async (product) => {
    setLoadingPartial(true);
    setPartialComponent(product);
    setPartialModalOpen(true);
    try {
      const token = localStorage.getItem('token');
      const diaIdParam = searchParams.get('dia_id');
      const url = `${API_BASE_URL}/dispatch/day/component-breakdown/${product.odoo_product_id}?fecha=${fecha}${grupoId ? `&grupo_id=${grupoId}` : ''}${turno ? `&turno=${encodeURIComponent(turno)}` : ''}${menu ? `&menu=${encodeURIComponent(menu)}` : ''}${diaIdParam ? `&dia_id=${diaIdParam}` : ''}`;
      
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Error fetching breakdown');
      const data = await res.json();
      
      setPartialBreakdown(data.breakdown || []);
      
      // Initialize inputs from existing partials if any
      const existing = dispatchData[product.odoo_product_id]?.partials || {};
      setPartialState(existing);
      
    } catch (err) {
      console.error(err);
      alert('No se pudo cargar el desglose por preparaciones.');
    } finally {
      setLoadingPartial(false);
    }
  };

  const handleClosePartialModal = () => {
    setPartialModalOpen(false);
    setPartialComponent(null);
    setPartialBreakdown([]);
    setPartialState({});
  };

  const handlePartialGrossChange = (moId, value) => {
    setPartialState(prev => ({
      ...prev,
      [moId]: {
        mode: 'manual',
        manualValue: value,
        weighings: []
      }
    }));
  };

  const handlePartialBlur = (moId, value) => {
    if (!value || value.trim() === '') return;
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setPartialState(prev => ({
        ...prev,
        [moId]: {
          mode: 'manual',
          manualValue: num.toFixed(3),
          weighings: []
        }
      }));
    }
  };

  const handleSavePartialDispatch = () => {
    if (!partialComponent) return;
    
    // Sumar todos los valores parciales (solo los que están en el breakdown actual)
    let total = 0;
    const cleanPartialState = {};
    
    partialBreakdown.forEach(row => {
      const valObj = partialState[row.mo_id];
      if (valObj) {
        cleanPartialState[row.mo_id] = valObj;
        const numStr = typeof valObj === 'object' ? valObj.manualValue : valObj;
        const num = parseFloat(numStr);
        if (!isNaN(num)) total += num;
      }
    });

    setDispatchData(prev => ({
      ...prev,
      [partialComponent.odoo_product_id]: {
        mode: 'partial',
        manualValue: total.toFixed(3),
        weighings: [],
        partials: cleanPartialState
      }
    }));
    handleClosePartialModal();
  };

  const handleAddWeighingRow = () => {
    const newId = Date.now().toString();
    setModalWeighings([...modalWeighings, { id: newId, gross: '', tareId: null, tareQty: '1', tareWeight: 0, net: 0 }]);
    setActiveRowId(newId);
  };

  const handleDeleteWeighingRow = (id) => {
    const updated = modalWeighings.filter(w => w.id !== id);
    setModalWeighings(updated);
    if (activeRowId === id) {
      setActiveRowId(updated.length > 0 ? updated[updated.length - 1].id : null);
    }
  };

  const calculateNet = (grossStr, tareWeight, tareQtyStr) => {
    const gross = parseFloat(grossStr) || 0;
    const qty = parseInt(tareQtyStr) || 1;
    return Math.max(0, gross - (qty * tareWeight));
  };

  const handleWeighingGrossChange = (id, val) => {
    if (/^\d*\.?\d{0,3}$/.test(val)) {
      setModalWeighings(prev => prev.map(row => {
        if (row.id === id) {
          return { ...row, gross: val, net: calculateNet(val, row.tareWeight, row.tareQty) };
        }
        return row;
      }));
    }
  };

  const handleWeighingTareQtyChange = (id, val) => {
    setModalWeighings(prev => prev.map(row => {
      if (row.id === id) {
        return { ...row, tareQty: val, net: calculateNet(row.gross, row.tareWeight, val) };
      }
      return row;
    }));
  };

  const selectTareForActiveRow = (tare) => {
    if (!activeRowId) return;
    setModalWeighings(prev => prev.map(row => {
      if (row.id === activeRowId) {
        const tareWeight = tare ? parseFloat(tare.peso_tara || tare.weight || 0) : 0;
        const tareId = tare ? tare.id : null;
        return { ...row, tareId, tareWeight, net: calculateNet(row.gross, tareWeight, row.tareQty) };
      }
      return row;
    }));
  };

  const handleSaveWeighing = () => {
    if (!activeWeighingProduct || !activeWeighingContext) return;
    const validWeighings = modalWeighings.filter(w => parseFloat(w.net) > 0);
    const totalNet = validWeighings.reduce((s, w) => s + (parseFloat(w.net) || 0), 0);
    
    if (activeWeighingContext === 'partial') {
      setPartialState(prev => ({
        ...prev,
        [activeWeighingProduct.odoo_product_id]: {
          mode: 'scale',
          manualValue: totalNet.toFixed(3),
          weighings: validWeighings
        }
      }));
      handleCloseWeighingModal();
      return;
    }

    const setter = activeWeighingContext === 'dispatch' ? setDispatchData : setDevolutionData;
    setter(prev => ({
      ...prev,
      [activeWeighingProduct.odoo_product_id]: {
        mode: 'scale',
        manualValue: totalNet.toFixed(3),
        weighings: validWeighings
      }
    }));
    handleCloseWeighingModal();
  };

  const getModalTotals = () => {
    return modalWeighings.reduce((acc, curr) => {
      acc.gross += parseFloat(curr.gross) || 0;
      const tW = (parseFloat(curr.tareWeight) || 0) * (parseInt(curr.tareQty) || 1);
      acc.tare += tW;
      acc.net += parseFloat(curr.net) || 0;
      return acc;
    }, { gross: 0, tare: 0, net: 0 });
  };

  const handleOpenPartialWeighingModal = (row) => {
    setActiveWeighingContext('partial');
    setActiveWeighingProduct({
      odoo_product_id: row.mo_id,
      name: `${row.plato_nombre} (${row.mo_name})`,
      required_qty: row.required_qty,
      uom: row.uom
    });
    
    const existingData = partialState[row.mo_id];
    const existingWeighings = existingData ? (existingData.weighings || []) : [];
    
    if (existingWeighings.length === 0) {
      const manualVal = existingData && existingData.manualValue ? String(existingData.manualValue) : (typeof existingData === 'string' ? existingData : '');
      const initialNet = parseFloat(manualVal) || 0;
      setModalWeighings([{ 
        id: Date.now().toString(), 
        gross: manualVal, 
        tareId: null, 
        tareQty: '1', 
        tareWeight: 0, 
        net: initialNet 
      }]);
      setActiveRowId(Date.now().toString());
    } else {
      setModalWeighings([...existingWeighings]);
      setActiveRowId(existingWeighings[existingWeighings.length - 1]?.id || Date.now().toString());
    }
  };

  const renderPartialModal = () => {
    if (!partialModalOpen || !partialComponent) return null;

    let partialNet = 0;
    partialBreakdown.forEach(row => {
      const valObj = partialState[row.mo_id];
      if (valObj) {
        const numStr = typeof valObj === 'object' ? valObj.manualValue : valObj;
        const num = parseFloat(numStr);
        if (!isNaN(num)) partialNet += num;
      }
    });

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl animate-scale-up">
          {/* Header */}
          <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-white/20 rounded-xl">
                <ListTree className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black">Despacho Parcial por Preparación</h3>
                <p className="text-blue-100 font-medium text-sm mt-0.5">Ingresar cantidades por cada Orden de Fabricación</p>
              </div>
            </div>
            <button onClick={handleClosePartialModal} className="p-2 text-white/70 hover:bg-white/20 hover:text-white rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Subheader info */}
          <div className="px-6 py-4 bg-blue-50/50 border-b border-blue-100 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-100 px-2 py-0.5 rounded-md mb-1 block w-max">
                Ingrediente
              </span>
              <h4 className="text-xl font-extrabold text-slate-900">{partialComponent.name}</h4>
              <div className="flex gap-4 md:gap-6 flex-wrap justify-end">
                <div className="text-right border-r border-blue-100 pr-4 md:pr-6 hidden sm:block">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">A la mano</span>
                  <span className="text-2xl font-black text-slate-700">{partialComponent.qty_available !== undefined ? partialComponent.qty_available.toFixed(3) : '0.000'} <span className="text-sm text-slate-500">{partialComponent.uom}</span></span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Total Solicitado</span>
                  <span className="text-2xl font-black text-slate-800">{partialComponent.required_qty.toFixed(3)} <span className="text-sm text-slate-500">{partialComponent.uom}</span></span>
                </div>
                
                <div className="text-right bg-white px-4 py-2 rounded-xl shadow-xs border border-blue-100">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-500 block">Suma Parcial</span>
                  <span className="text-2xl font-black text-blue-600">{partialNet.toFixed(3)} <span className="text-sm text-blue-400 ml-1">{partialComponent.uom}</span></span>
                </div>

                <div className={`text-right bg-white px-4 py-2 rounded-xl shadow-xs border ${partialNet >= partialComponent.required_qty ? 'border-emerald-100' : 'border-amber-100'}`}>
                  <span className={`text-[10px] font-black uppercase tracking-wider block ${partialNet >= partialComponent.required_qty ? 'text-emerald-500' : 'text-amber-500'}`}>Faltante</span>
                  <span className={`text-2xl font-black ${partialNet >= partialComponent.required_qty ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {Math.max(0, partialComponent.required_qty - partialNet).toFixed(3)} 
                    <span className={`text-sm ${partialNet >= partialComponent.required_qty ? 'text-emerald-400' : 'text-amber-400'} ml-1`}>{partialComponent.uom}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto bg-slate-50">
            {loadingPartial ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p className="font-bold">Cargando desglose de preparaciones...</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse bg-white">
                <thead className="sticky top-0 z-10 bg-white shadow-sm">
                  <tr className="border-b-2 border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="py-3 px-6">Plato / Preparación</th>
                    <th className="py-3 px-6 w-40 text-right">Solicitada</th>
                    <th className="py-3 px-6 w-48 text-right">Despachada</th>
                    <th className="py-3 px-6 w-40 text-right">Faltante</th>
                  </tr>
                </thead>
                <tbody>
                  {partialBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-8 text-center text-slate-400 font-medium">
                        No se encontraron preparaciones para este ingrediente.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(
                      partialBreakdown.reduce((acc, row) => {
                        const menu = row.menu_nombre || 'Otros';
                        if (!acc[menu]) acc[menu] = [];
                        acc[menu].push(row);
                        return acc;
                      }, {})
                    ).map(([menuName, rows]) => (
                      <React.Fragment key={menuName}>
                        <tr className="bg-slate-100 border-b border-slate-200">
                          <td colSpan="4" className="py-2 px-6 font-bold text-slate-700 text-sm">
                            {menuName}
                          </td>
                        </tr>
                        {rows.map((row, idx) => {
                          const req = row.required_qty;
                          const valObj = partialState[row.mo_id];
                          const val = valObj ? (typeof valObj === 'object' ? valObj.manualValue : valObj) : '';
                          const isScale = valObj && typeof valObj === 'object' && valObj.mode === 'scale';
                          
                          const despachadoNum = parseFloat(val) || 0;
                          const faltante = Math.max(0, req - despachadoNum);
                          const isComplete = despachadoNum >= req && req > 0;
                          
                          return (
                            <tr key={row.mo_id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                              <td className="py-4 px-6">
                                <p className="font-bold text-slate-800">{row.plato_nombre}</p>
                                <p className="text-xs text-slate-400 font-mono mt-1">{row.parent_mo_name || row.mo_name}</p>
                              </td>
                          <td className="py-4 px-6 text-right">
                            <span className="font-black text-slate-600 text-lg">{req.toFixed(3)}</span>
                            <span className="text-xs text-slate-400 ml-1">{row.uom}</span>
                          </td>
                          <td className="py-4 px-6 text-right flex items-center justify-end gap-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0.000"
                              value={val}
                              readOnly={isScale}
                              onFocus={(e) => {
                                if (isScale) {
                                  e.target.blur();
                                  handleOpenPartialWeighingModal(row);
                                }
                              }}
                              onChange={(e) => handlePartialGrossChange(row.mo_id, e.target.value)}
                              onBlur={(e) => handlePartialBlur(row.mo_id, e.target.value)}
                              className={`w-24 text-right font-mono font-bold text-lg border-2 rounded-lg px-2 py-1.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all ${isScale ? 'bg-emerald-50 border-emerald-300 cursor-pointer text-emerald-700' : 'bg-blue-50/30 border-slate-200'}`}
                            />
                            <button 
                              onClick={() => handleOpenPartialWeighingModal(row)}
                              className={`p-2 rounded-lg border-2 transition-all ${isScale ? 'border-emerald-300 bg-emerald-50 text-emerald-600 shadow-sm' : 'border-slate-200 bg-white text-slate-400 hover:border-blue-300 hover:text-blue-500'}`}
                              title="Pesar con balanza y taras"
                            >
                              <Scale className="w-5 h-5" />
                            </button>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className={`font-black text-lg ${isComplete ? 'text-emerald-500' : 'text-amber-500'}`}>
                              {faltante.toFixed(3)}
                            </span>
                            <span className="text-xs text-slate-400 ml-1">{row.uom}</span>
                          </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
            <button onClick={handleClosePartialModal} className="px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSavePartialDispatch} disabled={loadingPartial} className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md flex items-center gap-2 disabled:opacity-50">
              <CheckCircle2 className="w-5 h-5" />
              Guardar Despacho Parcial
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderModal = () => {
    if (!activeWeighingProduct) return null;
    const totals = getModalTotals();
    const isUnitsProduct = ['u', 'units', 'unidades', 'unidad'].includes((activeWeighingProduct.uom || '').toLowerCase());
    const filteredTares = tares.filter(t => (t.name || '').toLowerCase().includes(tareSearchQuery.toLowerCase()));

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scale-up">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl">
                <Scale className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">
                Registro de Pesadas con Taras - { activeWeighingContext === 'dispatch' ? 'Despacho' : 'Devolución' }
              </h3>
            </div>
            <button onClick={handleCloseWeighingModal} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="px-6 py-4 bg-orange-50/50 border-b border-orange-100 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-600 bg-orange-100 px-2 py-0.5 rounded-md mb-1 block w-max">
                Producto a Pesar
              </span>
              <h4 className="text-xl font-extrabold text-slate-900">{activeWeighingProduct.name}</h4>
            </div>
            <div className="flex gap-6">
              <div className="text-right border-r border-orange-100 pr-4 md:pr-6 hidden sm:block">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">A la mano</span>
                <span className="text-2xl font-black text-slate-700">{(activeWeighingProduct.qty_available || 0).toFixed(3)} <span className="text-sm text-slate-500">{activeWeighingProduct.uom}</span></span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Total Solicitado</span>
                <span className="text-2xl font-black text-slate-800">{(activeWeighingProduct.required_qty || 0).toFixed(3)} <span className="text-sm text-slate-500">{activeWeighingProduct.uom}</span></span>
              </div>
              <div className="text-right bg-white px-4 py-2 rounded-xl shadow-xs border border-orange-100">
                <span className="text-[10px] font-black uppercase tracking-wider text-orange-500 block">Neto Acumulado</span>
                <span className="text-2xl font-black text-orange-600">{totals.net.toFixed(3)} <span className="text-sm text-orange-400">{activeWeighingProduct.uom}</span></span>
              </div>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 flex flex-col border-r border-slate-200 bg-white">
              <div className="flex-1 overflow-auto p-6">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                      <th className="pb-3 text-center w-10">#</th>
                      <th className="pb-3 text-right w-32">Bruto (kg)</th>
                      <th className="pb-3 text-center w-24">Cant. Env.</th>
                      <th className="pb-3 text-left pl-4">Envase / Tara</th>
                      <th className="pb-3 text-right w-32">Neto (kg)</th>
                      <th className="pb-3 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalWeighings.length === 0 ? (
                      <tr><td colSpan="6" className="py-8 text-center text-slate-400 font-medium">No hay pesadas registradas. Use el botón Agregar Pesada.</td></tr>
                    ) : (
                      modalWeighings.map((row, idx) => {
                        const tare = tares.find(t => t.id === row.tareId);
                        const isRowActive = row.id === activeRowId;
                        return (
                          <tr key={row.id} 
                              onClick={() => !isUnitsProduct && setActiveRowId(row.id)}
                              className={`border-b border-slate-100 transition-colors ${isRowActive ? 'bg-orange-50/30' : 'hover:bg-slate-50'}`}>
                            <td className="py-3 text-center text-sm font-bold text-slate-400">{idx + 1}</td>
                            <td className="py-3">
                              <input type="text" inputMode="decimal" placeholder="0.000"
                                value={row.gross} onChange={(e) => handleWeighingGrossChange(row.id, e.target.value)}
                                onFocus={() => !isUnitsProduct && setActiveRowId(row.id)}
                                className="w-full text-right font-mono font-bold text-lg bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none" />
                            </td>
                            <td className="py-3 px-2">
                              <input type="number" min="1" disabled={isUnitsProduct || !row.tareId}
                                value={row.tareQty} onChange={(e) => handleWeighingTareQtyChange(row.id, e.target.value)}
                                onFocus={() => !isUnitsProduct && setActiveRowId(row.id)}
                                className="w-full text-center font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none disabled:opacity-50" />
                            </td>
                            <td className="py-3 pl-4">
                              <button disabled={isUnitsProduct} className={`w-full text-left px-4 py-2 rounded-xl border flex items-center gap-3 ${isRowActive ? 'border-orange-400 bg-white ring-2 ring-orange-100' : 'border-slate-200 bg-slate-50'}`}>
                                { tare ? (
                                  <>
                                    <div className="w-8 h-8 rounded-lg bg-white shadow-xs border border-slate-100 flex items-center justify-center overflow-hidden">
                                      {tare.photo ? <img src={tare.photo.startsWith('data:') ? tare.photo : `data:image/png;base64,${tare.photo}`} className="w-full h-full object-cover" alt="tara"/> : '📦'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-slate-800 truncate">{tare.name}</p>
                                      <p className="text-xs font-black text-rose-500">
                                        {(parseInt(row.tareQty) || 1) > 1 ? `${row.tareQty} x ` : ''}-{parseFloat(tare.peso_tara || tare.weight || 0).toFixed(3)} kg
                                      </p>
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-slate-400 text-sm font-medium italic">
                                    {isUnitsProduct ? 'No aplica tara' : 'Seleccione envase a la derecha ➜'}
                                  </div>
                                )}
                              </button>
                            </td>
                            <td className="py-3 text-right font-mono font-black text-xl text-emerald-600">
                              {parseFloat(row.net || 0).toFixed(3)}
                            </td>
                            <td className="py-3 text-center">
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteWeighingRow(row.id); }} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
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
                <button onClick={handleAddWeighingRow} className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:border-slate-300 hover:bg-slate-100 transition-colors shadow-xs">
                  <Plus className="w-4 h-4" /> Agregar Pesada
                </button>
              </div>
            </div>

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
                    <div onClick={() => selectTareForActiveRow(null)} className={`bg-white border rounded-xl p-3 cursor-pointer flex items-center gap-3 transition-all hover:shadow-md ${activeRowId && !modalWeighings.find(w=>w.id===activeRowId)?.tareId ? 'border-orange-400 ring-2 ring-orange-100' : 'border-slate-200'}`}>
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">✖</div>
                      <div><p className="font-bold text-slate-800 text-sm">Sin Envase / Tara</p><p className="text-xs font-bold text-slate-400">0.000 kg</p></div>
                    </div>
                    {filteredTares.map(tare => {
                      const isSelected = activeRowId && modalWeighings.find(w=>w.id===activeRowId)?.tareId === tare.id;
                      return (
                        <div key={tare.id} onClick={() => selectTareForActiveRow(tare)} className={`bg-white border rounded-xl p-3 cursor-pointer flex items-center gap-3 transition-all hover:shadow-md ${isSelected ? 'border-orange-400 ring-2 ring-orange-100' : 'border-slate-200'}`}>
                          <div className="w-10 h-10 rounded-lg border border-slate-100 overflow-hidden shadow-xs shrink-0">
                            {tare.photo ? <img src={tare.photo.startsWith('data:') ? tare.photo : `data:image/png;base64,${tare.photo}`} className="w-full h-full object-cover" alt="tara"/> : <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">📦</div>}
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
          
          <div className="p-6 border-t border-slate-200 bg-white flex items-center justify-between">
            <div className="flex gap-8">
              <div><p className="text-xs font-bold text-slate-400 uppercase">Bruto Total</p><p className="text-lg font-black text-slate-800">{totals.gross.toFixed(3)} kg</p></div>
              <div><p className="text-xs font-bold text-slate-400 uppercase">Tara Total</p><p className="text-lg font-black text-rose-500">-{totals.tare.toFixed(3)} kg</p></div>
              <div><p className="text-xs font-bold text-orange-500 uppercase">Neto Total</p><p className="text-xl font-black text-orange-600">{totals.net.toFixed(3)} {activeWeighingProduct.uom}</p></div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleCloseWeighingModal} className="px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors">Cancelar</button>
              <button onClick={handleSaveWeighing} className="px-8 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/20 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Confirmar Pesadas
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="w-12 h-12 animate-spin text-orange-500 mb-4" />
        <p className="text-slate-500 font-semibold text-lg">Cargando consolidado del día...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="bg-rose-50 text-rose-600 p-8 rounded-3xl border border-rose-200 flex flex-col items-center text-center max-w-lg shadow-sm">
          <AlertTriangle className="w-16 h-16 mb-4 opacity-80" />
          <h2 className="text-2xl font-black mb-2">Error</h2>
          <p className="font-medium text-rose-500">{error}</p>
          <button onClick={() => navigate('/despacho')} className="mt-8 px-6 py-2.5 bg-white border-2 border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-100 transition-colors">
            Volver a Despachos
          </button>
        </div>
      </div>
    );
  }

  const allComponents = [
    ...components.map(c => ({ ...c, isOrphan: false })),
    ...Object.entries(draftProductNames)
      .filter(([id]) => !components.find(c => c.odoo_product_id.toString() === id.toString()))
      .filter(([id]) => {
        const netDisp = getNetValue('dispatch', id);
        const netDev = getNetValue('devolution', id);
        return netDisp > 0 || netDev > 0;
      })
      .map(([id, meta]) => ({
        odoo_product_id: parseInt(id),
        name: meta.name,
        categ_name: '⚠️ Huérfanos / Retirados',
        required_qty: 0,
        uom: meta.uom,
        isOrphan: true
      }))
  ];

  return (
    <div className="w-full h-[100dvh] relative flex flex-col bg-slate-50 overflow-hidden animate-fade-in">
      {renderPartialModal()}
      {renderModal()}
      
      {/* 1. Cabecera Principal (Fixed Flex Item) */}
      <div className="flex-none bg-slate-50 px-6 md:px-10 pt-6 md:pt-8 pb-4 flex items-center justify-between gap-4 border-b border-slate-200 z-50">
        <div className="flex items-center gap-6">
          <button onClick={handleBackNavigation} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm text-slate-500 hover:text-blue-600 shrink-0">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-start justify-center">
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight capitalize mb-1">
              {getFormatDateTitle(fecha)}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 px-3 py-1 rounded-md inline-block shadow-sm">
                {grupoNombre ? `Despacho de Grupo: ${grupoNombre}` : `Despacho Consolidado`}
              </span>
              {turno && <span className="text-[10px] font-black uppercase tracking-widest text-slate-800 bg-slate-200 px-3 py-1 rounded-md inline-block">{turno}</span>}
              {moNames && moNames.length > 0 ? (
                moNames.map(mo => (
                  <span key={mo} className="text-[10px] font-black uppercase tracking-widest text-slate-800 bg-slate-200 px-3 py-1 rounded-md inline-block">
                    {mo}
                  </span>
                ))
              ) : (
                menu && fecha && (() => {
                  const [y, m, d] = fecha.split('-');
                  const title = `${menu} ${d}${m}${y.slice(2)}`;
                  return <span className="text-[10px] font-black uppercase tracking-widest text-slate-800 bg-slate-200 px-3 py-1 rounded-md inline-block">{title}</span>;
                })()
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {syncStatus === 'syncing' && (
            <div className="flex items-center gap-2 text-slate-500 font-semibold text-sm px-3 py-1 bg-slate-100 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin" />
              Guardando...
            </div>
          )}
          {syncStatus === 'synced' && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm px-3 py-1 bg-emerald-50 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
                Borrador guardado
              </div>
              <button 
                onClick={async () => {
                  if (window.confirm('¿Estás seguro de limpiar el borrador? Esto borrará los datos ingresados y recargará las cantidades solicitadas desde Odoo.')) {
                    const localDraftKey = `draft_${fecha}_${turno}_${menu}_${grupoId}`;
                    localStorage.removeItem(localDraftKey);
                    
                    try {
                      const token = localStorage.getItem('token');
                      const headers = { 'Authorization': `Bearer ${token}` };
                      
                      const queryParams = new URLSearchParams();
                      if (grupoId) queryParams.append('grupo_id', grupoId);
                      if (turno) queryParams.append('turno', turno);
                      if (menu) queryParams.append('menu', menu);
                      
                      await fetch(`${API_BASE_URL}/dispatch/draft?fecha=${fecha}&${queryParams.toString()}`, {
                        method: 'DELETE',
                        headers
                      });
                    } catch (e) {
                      console.error("Error borrando borrador en DB", e);
                    }
                    
                    setDispatchData({});
                    setDevolutionData({});
                    setNovedades('');
                    setDraftProductNames({});
                    setSyncStatus('idle');
                    window.location.reload();
                  }
                }}
                className="text-xs text-red-500 hover:text-red-700 underline font-medium"
              >
                Limpiar Borrador
              </button>
            </div>
          )}
          {!viewOnly && (
            <>
              <button 
                onClick={() => {
                  setPendingPasswordAction('partial_config');
                  setShowPasswordModal(true);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-slate-300 text-slate-700 font-extrabold rounded-xl shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 text-sm shrink-0 hover:bg-slate-50 hover:border-slate-400"
              >
                <Settings className="w-5 h-5" />
                Configurar Productos
              </button>
              
              <button 
                onClick={() => {
                  setPendingPasswordAction('additional');
                  setShowPasswordModal(true);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-blue-600 text-blue-600 font-extrabold rounded-xl shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 text-sm shrink-0"
              >
                <Plus className="w-5 h-5" />
                Agregar Adicionales
              </button>
              
              {hasActionPerm && (
                <button 
                  onClick={() => setShowConfirmModal(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-md shadow-blue-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 text-sm shrink-0"
                >
                  <Save className="w-5 h-5" />
                  Confirmar Despacho Total
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-scale-up text-center">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">Confirmar Producción</h3>
            <p className="text-slate-600 font-medium mb-8">
              ¿Está seguro que desea enviar y confirmar la producción del día? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors"
                disabled={isEstablishing}
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  setIsEstablishing(true);
                  try {
                    const payload = components.map(item => {
                      const d = getNetValue('dispatch', item.odoo_product_id);
                      const ret = getNetValue('devolution', item.odoo_product_id);
                      const totalFinal = Math.max(0, d - ret);
                      return {
                        odoo_product_id: item.odoo_product_id,
                        total_despachado: totalFinal
                      };
                    });
                    
                    const token = localStorage.getItem('token');
                    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
                    const reqBody = {
                      fecha, 
                      turno: turno || null, 
                      menu: menu || null, 
                      grupo_id: grupoId ? parseInt(grupoId, 10) : null,
                      productos: payload
                    };

                    const res = await fetch(`${API_BASE_URL}/dispatch/establecer-produccion`, {
                      method: 'POST',
                      headers,
                      body: JSON.stringify(reqBody)
                    });

                    if (!res.ok) throw new Error('Error al establecer producción');
                    
                    // Limpiar borrador local al confirmar
                    const localDraftKey = `draft_${fecha}_${turno}_${menu}_${grupoId}`;
                    localStorage.removeItem(localDraftKey);
                    
                    // Navegar de regreso a la pantalla principal de despacho a cocina
                    navigate('/despacho');
                  } catch (err) {
                    alert(err.message);
                  } finally {
                    setIsEstablishing(false);
                    setShowConfirmModal(false);
                  }
                }}
                disabled={isEstablishing}
                className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                {isEstablishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                {isEstablishing ? 'Estableciendo...' : 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Titulo de tabla (Fixed Flex Item) */}
      <div className="flex-none px-6 md:px-10 py-4 border-b-2 border-slate-200 bg-slate-50 flex items-center gap-3 z-40 shadow-sm">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <Warehouse className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-black text-slate-800 mr-4">Listado de Ingredientes Acumulados</h2>
          
          <div className="relative flex-1 max-w-md min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por nombre..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm font-medium bg-white border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
            />
          </div>
          
          <button
            onClick={() => setShowNovedadesModal(true)}
            className={`ml-4 flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-all shadow-sm border-2 text-sm ${novedades.trim() ? 'bg-amber-50 text-amber-600 border-amber-300 hover:bg-amber-100' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}
          >
            <FileText className="w-4 h-4" />
            Novedades del Día
          </button>
          
          <span className="ml-auto bg-slate-200 text-slate-600 font-bold text-xs px-3 py-1 rounded-lg shadow-inner">
            {allComponents.length} Productos
          </span>
      </div>
        
      {/* 3. Contenedor de Tabla Scrollable (Flex Grow) */}
      <div className="flex-1 overflow-auto bg-slate-50 relative">
        <table className="w-full text-left border-collapse">
          {/* Thead (Sticky al contenedor scrollable) */}
          <thead className="sticky top-0 z-30 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)]">
            <tr className="border-b-2 border-slate-300 bg-white">
              <th className="px-6 md:px-10 py-4 text-[11px] font-black text-slate-800 uppercase tracking-wider bg-white">Producto</th>
              <th className="px-6 md:px-10 py-2 bg-white">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">Categoría</span>
                  <select 
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 cursor-pointer max-w-[150px] shadow-sm"
                  >
                    <option value="">Todas</option>
                    {[...new Set(allComponents.map(item => getDisplayCategory(item.categ_name)))].filter(Boolean).sort().map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </th>
              <th className="px-6 md:px-10 py-4 text-[11px] font-black text-slate-800 uppercase tracking-wider text-center bg-white">U.M.</th>
              <th className="px-6 md:px-10 py-4 text-[11px] font-black text-slate-800 uppercase tracking-wider text-right bg-white">A la mano</th>
              <th className="px-6 md:px-10 py-4 text-[11px] font-black text-slate-800 uppercase tracking-wider text-right bg-white">Solicitado</th>
              <th className="px-6 md:px-10 py-4 text-[11px] font-black text-slate-800 uppercase tracking-wider text-right w-44 bg-white">Despacho</th>
              <th className="px-6 md:px-10 py-4 text-[11px] font-black text-slate-800 uppercase tracking-wider text-right w-44 bg-white">Devolución</th>
              <th className="px-6 md:px-10 py-4 text-[11px] font-black text-blue-700 uppercase tracking-wider text-right bg-white">Total Despachado</th>
              <th className="px-6 md:px-10 py-4 text-[11px] font-black text-amber-600 uppercase tracking-wider text-right bg-white">Diferencia</th>
            </tr>
          </thead>
            <tbody>
              {allComponents
                .filter(item => !categoryFilter || getDisplayCategory(item.categ_name) === categoryFilter)
                .filter(item => !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .sort((a, b) => {
                  const aPartial = partialConfig.includes(a.odoo_product_id);
                  const bPartial = partialConfig.includes(b.odoo_product_id);
                  // Orphans go to the top to alert the user
                  if (a.isOrphan && !b.isOrphan) return -1;
                  if (!a.isOrphan && b.isOrphan) return 1;
                  
                  if (aPartial && !bPartial) return -1;
                  if (!aPartial && bPartial) return 1;
                  return 0;
                })
                .map((item) => {
                const despachoNeto = getNetValue('dispatch', item.odoo_product_id);
                const despachoStr = getManualStr('dispatch', item.odoo_product_id);
                
                const devolucionNeto = getNetValue('devolution', item.odoo_product_id);
                const devolucionStr = getManualStr('devolution', item.odoo_product_id);

                const totalFinal = Math.max(0, despachoNeto - devolucionNeto);
                const diferencia = totalFinal - item.required_qty;
                
                const isConfiguredPartial = partialConfig.includes(item.odoo_product_id);
                const isPartial = isConfiguredPartial; // STRICT: Only if in global partialConfig
                const isScale = dispatchData[item.odoo_product_id]?.mode === 'scale';
                const isReadOnly = viewOnly || isScale || isPartial;
                const itemComment = dispatchData[item.odoo_product_id]?.comentario_diferencia || '';

                return (
                  <tr key={item.odoo_product_id} className={`border-b border-slate-200 hover:bg-slate-100 transition-colors group ${item.isOrphan ? 'bg-rose-50/60' : 'bg-slate-50'}`}>
                    <td className="px-6 md:px-10 py-4">
                      <div className="flex items-center gap-3">
                        <p className={`text-sm font-medium leading-tight ${item.isOrphan ? 'text-rose-700 font-bold' : 'text-black'}`}>{item.name}</p>
                      </div>
                      {item.isOrphan && (
                         <p className="text-xs text-rose-500 font-semibold mt-1">⚠️ Retirado del plan. Devuélvalo a bodega y borre este despacho a 0.</p>
                      )}
                    </td>
                    <td className="px-6 md:px-10 py-4">
                      <span className={`text-xs font-bold ${item.isOrphan ? 'text-rose-600' : 'text-slate-600'}`}>
                        {item.isOrphan ? item.categ_name : getDisplayCategory(item.categ_name)}
                      </span>
                    </td>
                    <td className="px-6 md:px-10 py-4 text-center">
                      <span className="text-xs font-semibold text-slate-400">{item.uom}</span>
                    </td>
                    <td className="px-6 md:px-10 py-4 text-right">
                      <span className="text-sm font-semibold text-slate-500 font-mono">
                        {item.qty_available !== undefined ? item.qty_available.toFixed(3) : '0.000'}
                      </span>
                    </td>
                    <td className="px-6 md:px-10 py-4 text-right">
                      <p className="text-base font-black text-slate-700 font-mono">
                        {item.required_qty.toFixed(3)}
                      </p>
                    </td>
                    
                    {/* DESPACHO */}
                    <td className="px-6 md:px-10 py-4 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <input 
                          type="text" 
                          inputMode="decimal"
                          placeholder="0.000"
                          value={despachoStr}
                          readOnly={isReadOnly}
                          onFocus={(e) => {
                            if (isReadOnly) {
                              e.target.blur();
                              if (isPartial) {
                                handleOpenPartialModal(item);
                              } else {
                                handleOpenWeighingModal(item, 'dispatch');
                              }
                            }
                          }}
                          onChange={(e) => handleManualChange('dispatch', item.odoo_product_id, e.target.value)}
                          onBlur={(e) => handleManualBlur('dispatch', item.odoo_product_id, e.target.value)}
                          className={`w-24 text-right font-mono font-bold text-base border-2 rounded-lg px-2 py-1.5 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-emerald-700 placeholder:text-slate-300 ${isReadOnly ? 'bg-emerald-50 border-emerald-300 cursor-pointer' : 'bg-white border-slate-200'}`}
                        />
                        {!viewOnly && (
                          <button 
                            onClick={() => {
                              if (isPartial) {
                                handleOpenPartialModal(item);
                              } else {
                                handleOpenWeighingModal(item, 'dispatch');
                              }
                            }}
                            className={`p-2 rounded-lg border-2 transition-all ${isScale ? 'border-emerald-300 bg-emerald-50 text-emerald-600 shadow-sm' : 'border-slate-200 bg-white text-slate-400 hover:border-blue-300 hover:text-blue-500'}`}
                            title="Pesar con Tara"
                          >
                            <Scale className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                    
                    {/* DEVOLUCION */}
                    <td className="px-6 md:px-10 py-4 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <input 
                          type="text" 
                          inputMode="decimal"
                          placeholder="0.000"
                          value={devolucionStr}
                          readOnly={devolutionData[item.odoo_product_id]?.mode === 'scale'}
                          onClick={(e) => {
                            if (devolutionData[item.odoo_product_id]?.mode === 'scale') {
                              e.target.blur();
                              handleOpenWeighingModal(item, 'devolution');
                            }
                          }}
                          onChange={(e) => handleManualChange('devolution', item.odoo_product_id, e.target.value)}
                          onBlur={(e) => handleManualBlur('devolution', item.odoo_product_id, e.target.value)}
                          className={`w-24 text-right font-mono font-bold text-base border-2 rounded-lg px-2 py-1.5 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-rose-600 placeholder:text-slate-300 ${devolutionData[item.odoo_product_id]?.mode === 'scale' ? 'bg-rose-50 border-rose-300 cursor-pointer' : 'bg-white border-slate-200'}`}
                        />
                        {!viewOnly && (
                          <button 
                            onClick={() => handleOpenWeighingModal(item, 'devolution')}
                            className={`p-2 rounded-lg border-2 transition-all ${devolutionData[item.odoo_product_id]?.mode === 'scale' ? 'border-rose-300 bg-rose-50 text-rose-600 shadow-sm' : 'border-slate-200 bg-white text-slate-400 hover:border-blue-300 hover:text-blue-500'}`}
                            title="Pesar Devolución con Tara"
                          >
                            <Scale className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                    
                    {/* TOTAL DESPACHADO */}
                    <td className="px-6 md:px-10 py-4 text-right transition-colors">
                      <p className="text-xl font-black text-blue-600 font-mono">
                        {parseFloat(totalFinal || 0).toFixed(3)}
                      </p>
                    </td>

                    {/* DIFERENCIA Y COMENTARIO */}
                    <td className="px-6 md:px-10 py-4 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className={`text-base font-bold font-mono ${Math.abs(diferencia) > 0.001 ? (diferencia > 0 ? 'text-amber-500' : 'text-rose-500') : 'text-slate-400'}`}>
                          {diferencia > 0 ? '+' : ''}{diferencia.toFixed(3)}
                        </span>
                        <button
                          onClick={() => {
                            setActiveCommentProduct(item);
                            setActiveCommentText(itemComment);
                            setShowCommentModal(true);
                          }}
                          className={`p-2 rounded-lg transition-all ${itemComment.trim() ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}
                          title="Comentario de Diferencia"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
      </div>
      {/* Modals */}
      
      {/* Novedades Modal */}
      {showNovedadesModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-500" />
                Novedades del Día
              </h3>
              <button onClick={() => setShowNovedadesModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm font-medium text-slate-500 mb-2">Ingrese observaciones generales del despacho de hoy:</p>
              <textarea 
                className="w-full border-2 border-slate-200 rounded-xl p-4 text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 min-h-[120px] transition-all"
                placeholder="Ej. Falta de personal, retraso en entrega de proveedor..."
                value={novedades}
                readOnly={viewOnly}
                onChange={(e) => setNovedades(e.target.value)}
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowNovedadesModal(false)} className="px-5 py-2.5 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comentario Diferencia Modal */}
      {showCommentModal && activeCommentProduct && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                Comentario de Diferencia
              </h3>
              <button onClick={() => {
                setShowCommentModal(false);
                setActiveCommentProduct(null);
                setActiveCommentText('');
              }} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm font-bold text-slate-700 mb-1">{activeCommentProduct.name}</p>
              <p className="text-sm font-medium text-slate-500 mb-4">Justifique la diferencia de despacho para este ingrediente:</p>
              <textarea 
                className="w-full border-2 border-slate-200 rounded-xl p-4 text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 min-h-[120px] transition-all"
                placeholder="Motivo de la diferencia..."
                value={activeCommentText}
                readOnly={viewOnly}
                onChange={(e) => setActiveCommentText(e.target.value)}
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setShowCommentModal(false);
                  setActiveCommentProduct(null);
                  setActiveCommentText('');
                }} 
                className="px-5 py-2.5 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                {viewOnly ? 'Cerrar' : 'Cancelar'}
              </button>
              {!viewOnly && (
                <button 
                  onClick={() => {
                    setDispatchData(prev => {
                      const existing = prev[activeCommentProduct.odoo_product_id] || { mode: 'manual', manualValue: '' };
                      return {
                        ...prev,
                        [activeCommentProduct.odoo_product_id]: { ...existing, comentario_diferencia: activeCommentText }
                      };
                    });
                    setShowCommentModal(false);
                    setActiveCommentProduct(null);
                    setActiveCommentText('');
                  }} 
                  className="px-6 py-2.5 bg-blue-600 text-white font-bold hover:bg-blue-700 rounded-xl transition-colors shadow-md"
                >
                  Guardar Comentario
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <AdditionalDispatchModal 
        isOpen={showAdditionalModal}
        onClose={() => {
          setShowAdditionalModal(false);
          fetchInitialData(); // refresh components after modal close
        }}
        fecha={fecha}
        turno={turno}
        menu={menu}
      />
      
      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Autorización Requerida</h3>
            <p className="text-sm text-slate-500 mb-4">Ingrese la contraseña para continuar.</p>
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
                    if (pendingPasswordAction === 'additional') {
                      setShowAdditionalModal(true);
                    } else if (pendingPasswordAction === 'partial_config') {
                      setShowPartialConfigModal(true);
                    }
                    setPendingPasswordAction(null);
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
                    if (pendingPasswordAction === 'additional') {
                      setShowAdditionalModal(true);
                    } else if (pendingPasswordAction === 'partial_config') {
                      setShowPartialConfigModal(true);
                    }
                    setPendingPasswordAction(null);
                  } else {
                    setPasswordError('Contraseña incorrecta.');
                  }
                }}
                className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <PartialDispatchConfigModal
        isOpen={showPartialConfigModal}
        onClose={() => setShowPartialConfigModal(false)}
        onSave={(newConfig) => {
          setPartialConfig(newConfig);
        }}
      />

    </div>
  );
}
