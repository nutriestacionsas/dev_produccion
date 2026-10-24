import React, { useState, useEffect, useRef } from 'react';
import { 
  ClipboardList, 
  Plus, 
  Play, 
  CheckCircle, 
  Video, 
  FileText, 
  AlertCircle, 
  ArrowLeft, 
  Trash, 
  Save, 
  Database, 
  Search, 
  RefreshCw 
} from 'lucide-react';
import { API_BASE_URL } from '../App';

// Helper to extract YouTube embed ID
function getYouTubeEmbedId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function Trials({ user }) {
  const [trials, setTrials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token');

  // Search autocomplete cache from Odoo
  const [odooProducts, setOdooProducts] = useState([]);
  const [odooCategories, setOdooCategories] = useState([]);

  // Sub-views states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTrial, setSelectedTrial] = useState(null);

  // Portions state (for Details View scaling)
  const [portionsScale, setPortionsScale] = useState(10);
  const [realQuantities, setRealQuantities] = useState({});

  // Finalize Recipe Modal
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [finalizeProteina, setFinalizeProteina] = useState('Pollo');
  const [finalizeCategoria, setFinalizeCategoria] = useState('');
  const [finalizeSubcategoria, setFinalizeSubcategoria] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  // Creation Form states
  const [formNombrePlato, setFormNombrePlato] = useState('');
  const [formFechaPrueba, setFormFechaPrueba] = useState(new Date().toISOString().split('T')[0]);
  const [formBasePrueba, setFormBasePrueba] = useState(10);
  const [formBaseRegistroTarget, setFormBaseRegistroTarget] = useState(100);
  const [isTargetActive, setIsTargetActive] = useState(false);
  const [formVideoUrl, setFormVideoUrl] = useState('');
  const [formSteps, setFormSteps] = useState([]);
  const [formStepText, setFormStepText] = useState('');
  const [formIngredients, setFormIngredients] = useState([]);
  const [savingTrial, setSavingTrial] = useState(false);

  // Load trials, products, and categories
  const fetchTrials = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/trials/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setTrials(data);
      } else {
        throw new Error(data.detail || 'Error al cargar pruebas');
      }
    } catch (err) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const fetchOdooData = async () => {
    try {
      // Products
      const prodRes = await fetch(`${API_BASE_URL}/odoo/products`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setOdooProducts(prodData);
      }
      
      // Categories
      const catRes = await fetch(`${API_BASE_URL}/odoo/categories`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (catRes.ok) {
        const catData = await catRes.json();
        setOdooCategories(catData);
        if (catData.length > 0) {
          setFinalizeCategoria(catData[0].id);
        }
      }
    } catch (err) {
      console.error("Error cargando datos de Odoo:", err);
    }
  };

  useEffect(() => {
    fetchTrials();
    fetchOdooData();
  }, []);

  // Initialize scaling and actual ingredients in details view
  useEffect(() => {
    if (selectedTrial) {
      setPortionsScale(selectedTrial.base_prueba);
      const initialReal = {};
      selectedTrial.ingredientes.forEach(ing => {
        initialReal[ing.id] = ing.cantidad_real !== null ? ing.cantidad_real : '';
      });
      setRealQuantities(initialReal);
    }
  }, [selectedTrial]);

  const changeStatus = async (id, statusVal) => {
    try {
      const response = await fetch(`${API_BASE_URL}/trials/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ estado: statusVal })
      });
      if (response.ok) {
        const updated = await response.json();
        if (selectedTrial && selectedTrial.id === id) {
          setSelectedTrial(updated);
        }
        fetchTrials();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save the trial quantities and complete it
  const handleSaveAndComplete = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/trials/${selectedTrial.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          estado: 'completada',
          base_prueba: portionsScale, // Update portions baseline to actual scaled cooked amount
          ingredientes: selectedTrial.ingredientes.map(ing => ({
            id: ing.id,
            // If they didn't input a value, save the scaled theoretical amount
            cantidad_real: realQuantities[ing.id] !== '' ? Number(realQuantities[ing.id]) : Number((ing.cantidad_teorica * (portionsScale / selectedTrial.base_prueba)).toFixed(4))
          }))
        })
      });
      if (response.ok) {
        alert('¡Prueba completada e ingredientes reales guardados!');
        setSelectedTrial(null);
        fetchTrials();
      } else {
        alert('Error al completar el registro.');
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al enviar datos.');
    }
  };

  // Convert trial to definitive recipe in local database
  const handleFinalizeRecipe = async () => {
    setFinalizing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/trials/${selectedTrial.id}/finalize-to-recipe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          proteina_dominante: finalizeProteina,
          categoria_odoo_id: Number(finalizeCategoria),
          subcategoria_odoo_id: finalizeSubcategoria ? Number(finalizeSubcategoria) : null
        })
      });
      if (response.ok) {
        alert('¡Receta definitiva guardada exitosamente y prueba cerrada!');
        setShowFinalizeModal(false);
        setSelectedTrial(null);
        fetchTrials();
      } else {
        const data = await response.json();
        alert(`Error al guardar receta: ${data.detail}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al guardar la receta.');
    } finally {
      setFinalizing(false);
    }
  };

  // Handlers for Creation Form
  const addIngredientRow = () => {
    setFormIngredients(prev => [
      ...prev,
      {
        odoo_product_id: null,
        product_name: '',
        cantidad_teorica: 1.0,
        unidad_medida: '',
        searchQuery: '',
        showDropdown: false
      }
    ]);
  };

  const removeIngredientRow = (index) => {
    setFormIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const updateIngredientRow = (index, fields) => {
    setFormIngredients(prev => prev.map((ing, i) => i === index ? { ...ing, ...fields } : ing));
  };

  // Scale creation form quantities dynamically on Portions scale trigger
  const handleActivateTarget = () => {
    setIsTargetActive(true);
  };

  const handleDeactivateTarget = () => {
    setIsTargetActive(false);
  };

  const handleCreateTrialSubmit = async (e) => {
    e.preventDefault();
    if (!formNombrePlato.trim()) {
      alert('El nombre del plato es obligatorio.');
      return;
    }
    if (formIngredients.length === 0) {
      alert('Debes agregar al menos un ingrediente.');
      return;
    }
    if (formIngredients.some(ing => !ing.odoo_product_id)) {
      alert('Asegúrate de seleccionar productos válidos de Odoo para todos los ingredientes.');
      return;
    }

    setSavingTrial(true);
    try {
      const multimediaPayload = [];
      if (formVideoUrl.trim()) {
        multimediaPayload.push({ tipo: 'video_url', contenido: formVideoUrl.trim() });
      }
      formSteps.forEach(step => {
        multimediaPayload.push({ tipo: 'texto', contenido: step });
      });

      const response = await fetch(`${API_BASE_URL}/trials/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nombre_plato: formNombrePlato,
          base_prueba: Number(formBasePrueba),
          base_registro_target: isTargetActive ? Number(formBaseRegistroTarget) : Number(formBasePrueba),
          fecha_prueba: formFechaPrueba,
          ingredientes: formIngredients.map(ing => ({
            odoo_product_id: ing.odoo_product_id,
            cantidad_teorica: Number(ing.cantidad_teorica),
            unidad_medida: ing.unidad_medida
          })),
          multimedia: multimediaPayload
        })
      });

      if (response.ok) {
        alert('¡Prueba programada exitosamente!');
        setShowCreateForm(false);
        // Reset states
        setFormNombrePlato('');
        setFormVideoUrl('');
        setFormSteps([]);
        setFormIngredients([]);
        setFormBasePrueba(10);
        setFormBaseRegistroTarget(100);
        fetchTrials();
      } else {
        const errData = await response.json();
        alert(`Error al crear la prueba: ${errData.detail}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al crear la prueba.');
    } finally {
      setSavingTrial(false);
    }
  };

  // Helper to find Odoo product name by ID
  const getOdooProductName = (productId) => {
    const prod = odooProducts.find(p => p.id === productId);
    return prod ? prod.name : `Producto Odoo #${productId}`;
  };

  // Safe autocomplete products fetch fallback on input focus
  const handleAutocompleteFocus = (index) => {
    updateIngredientRow(index, { showDropdown: true });
    if (odooProducts.length === 0) {
      fetchOdooData();
    }
  };

  const handleRealQtyChange = (ingId, val) => {
    setRealQuantities(prev => ({
      ...prev,
      [ingId]: val
    }));
  };

  // VIEW 1: Creation View
  if (showCreateForm) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Sticky Header */}
        <div className="sticky -top-6 md:-top-10 bg-slate-50 z-30 -mx-6 md:-mx-10 px-6 md:px-10 -mt-6 md:-mt-10 pt-6 md:pt-10 pb-4 border-b border-slate-200/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowCreateForm(false)}
              className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer shadow-xs"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 font-mono">Programación</span>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">Programar Nueva Prueba</h1>
            </div>
          </div>
          <button 
            onClick={handleCreateTrialSubmit}
            disabled={savingTrial}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white px-5 py-2.5 rounded-xl font-bold tracking-wide transition-all shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 cursor-pointer text-sm flex items-center gap-2"
          >
            {savingTrial ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Guardar Programación</span>
          </button>
        </div>

        {/* Creation Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          
          {/* Left Column: General info, video and steps (2/5) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* General Information Card */}
            <div className="bg-white border border-slate-205 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-2">
                <ClipboardList className="w-4.5 h-4.5 text-blue-600" />
                <span>Datos Básicos</span>
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider block mb-1">Nombre del Plato a Probar *</label>
                  <input 
                    type="text"
                    required
                    value={formNombrePlato}
                    onChange={(e) => setFormNombrePlato(e.target.value)}
                    placeholder="Ej. Arroz Chaufa especial"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-slate-800 placeholder-slate-400 outline-none text-xs transition-all shadow-2xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider block mb-1">Fecha Programada *</label>
                  <input 
                    type="date"
                    required
                    value={formFechaPrueba}
                    onChange={(e) => setFormFechaPrueba(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-slate-800 outline-none text-xs transition-all shadow-2xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider block mb-1">Enlace del Video de Preparación (YouTube)</label>
                  <input 
                    type="url"
                    value={formVideoUrl}
                    onChange={(e) => setFormVideoUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-slate-800 placeholder-slate-400 outline-none text-xs transition-all shadow-2xs"
                  />
                </div>

                {/* Video Preview */}
                {getYouTubeEmbedId(formVideoUrl) && (
                  <div className="pt-2">
                    <div className="aspect-video w-full rounded-xl overflow-hidden shadow-xs border border-slate-200 bg-slate-100">
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${getYouTubeEmbedId(formVideoUrl)}`}
                        frameBorder="0"
                        allowFullScreen
                        title="Previsualización"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step-by-Step Preparation Card */}
            <div className="bg-white border border-slate-205 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-blue-600" />
                <span>Paso a Paso de la Preparación</span>
              </h3>

              {formSteps.length === 0 ? (
                <p className="text-slate-450 text-[11px] italic text-center py-2">No se han ingresado pasos de preparación aún.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {formSteps.map((step, idx) => (
                    <div key={idx} className="flex gap-2 items-start p-2 bg-slate-50 rounded-xl border border-slate-150 group">
                      <span className="w-4.5 h-4.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 font-extrabold text-[9px] flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</span>
                      <p className="text-[11px] text-slate-650 leading-snug flex-1">{step}</p>
                      <button 
                        type="button"
                        onClick={() => setFormSteps(prev => prev.filter((_, i) => i !== idx))}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-0.5 rounded transition-all cursor-pointer shrink-0"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Step inputs */}
              <div className="flex gap-2 items-end pt-2 border-t border-slate-100">
                <textarea
                  value={formStepText}
                  onChange={(e) => setFormStepText(e.target.value)}
                  placeholder="Ej. Hervir el agua y añadir el arroz..."
                  rows="2"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-slate-800 placeholder-slate-400 outline-none text-xs transition-all resize-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (formStepText.trim()) {
                      setFormSteps(prev => [...prev, formStepText.trim()]);
                      setFormStepText('');
                    }
                  }}
                  disabled={!formStepText.trim()}
                  className="p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl transition-all cursor-pointer shrink-0 flex items-center justify-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>

          {/* Right Column: Materials list table & Portions slider (3/5) */}
          <div className="lg:col-span-3 bg-white border border-slate-205 rounded-2xl p-6 shadow-xs space-y-4">
            
            {/* Header controls with scaling mouse-range-slider */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-4">
              <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 flex items-center justify-between">
                <span>Ajuste de Porciones & Escalamiento</span>
                <span className="text-[9px] font-mono text-slate-400 font-normal">Escala Dinámica por Regla de Tres</span>
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                {/* planned portions (rendimiento de prueba) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Rendimiento (Porciones de Prueba) *</label>
                  <input 
                    type="number"
                    required
                    min="1"
                    value={formBasePrueba}
                    onChange={(e) => setFormBasePrueba(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 bg-white border border-slate-205 focus:border-blue-500 rounded-xl text-slate-800 outline-none text-xs font-mono font-bold transition-all"
                  />
                  <span className="text-[9px] text-slate-400 block font-medium">Especifica la cantidad base de comensales para esta prueba.</span>
                </div>

                {/* target portions slider & manual input (clickable card) */}
                <div 
                  onClick={isTargetActive ? undefined : handleActivateTarget}
                  className={`border p-3 rounded-xl transition-all relative flex flex-col justify-between space-y-2 select-none ${
                    isTargetActive 
                      ? 'bg-emerald-50/5 border-emerald-500 shadow-xs cursor-default' 
                      : 'bg-slate-100/50 border-slate-205 text-slate-400 cursor-pointer hover:bg-slate-100 hover:border-slate-350 hover:text-slate-500'
                  }`}
                  title={isTargetActive 
                    ? ""
                    : "Haz clic para activar el objetivo y escalar las cantidades"
                  }
                >
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className={isTargetActive ? "text-slate-700" : "text-slate-400"}>Objetivo Receta Definitiva:</span>
                    {isTargetActive ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="px-2 py-0.5 bg-emerald-600 text-white text-[9px] font-bold rounded-lg shadow-2xs flex items-center gap-1">
                          <span>🟢 Activo</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleDeactivateTarget}
                          className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[9px] font-bold rounded-lg transition-all cursor-pointer border border-slate-300"
                        >
                          Desactivar
                        </button>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-300 text-slate-650 text-[9px] font-bold rounded-lg flex items-center gap-1 cursor-pointer border border-slate-400/30">
                        <span>Click para Activar</span>
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="range"
                      min="10"
                      max={Math.max(500, formBaseRegistroTarget)}
                      step="5"
                      value={formBaseRegistroTarget}
                      disabled={!isTargetActive}
                      onChange={(e) => setFormBaseRegistroTarget(parseInt(e.target.value) || 10)}
                      className={`flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed ${
                        isTargetActive ? 'bg-slate-200' : 'bg-slate-300'
                      }`}
                    />
                    <input 
                      type="number"
                      min="1"
                      value={formBaseRegistroTarget}
                      disabled={!isTargetActive}
                      onChange={(e) => setFormBaseRegistroTarget(parseInt(e.target.value) || 1)}
                      className="w-16 px-2 py-1 bg-white border border-slate-205 focus:border-blue-500 rounded-lg text-xs font-mono font-bold text-center outline-none disabled:opacity-50 disabled:bg-slate-100 disabled:cursor-not-allowed"
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 block font-medium">
                    {isTargetActive 
                      ? "Escalamiento en tiempo real. Ajusta la barra o número para ver las cantidades calculadas."
                      : "Desactivado. Haz clic en este recuadro para activarlo y ver las cantidades calculadas al objetivo."
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Ingredients table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-655 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-blue-600" />
                  <span>Líneas de Materiales a Despachar</span>
                </h3>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-mono">
                  Items: {formIngredients.length}
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl min-h-[280px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Producto (Autocomplete)</th>
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider w-20">U.M.</th>
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right w-36">Cant. Despacho (Prueba: {formBasePrueba} pers)</th>
                      <th className={`px-4 py-2.5 text-xs font-bold text-right w-36 uppercase tracking-wider transition-colors duration-200 ${isTargetActive ? 'text-emerald-700 bg-emerald-50/30' : 'text-slate-400 bg-slate-50/10'}`}>
                        Cant. Despacho (Objetivo: {isTargetActive ? formBaseRegistroTarget : '-'} pers)
                      </th>
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-16">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formIngredients.map((ing, index) => (
                      <tr key={index} className="border-b border-slate-150 hover:bg-slate-50/30 transition-colors">
                        <td className="px-3 py-2 relative">
                          {ing.odoo_product_id ? (
                            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                              <span className="text-xs font-bold text-slate-700 truncate max-w-xs">{ing.product_name}</span>
                              <button 
                                type="button"
                                onClick={() => updateIngredientRow(index, { odoo_product_id: null, product_name: '', unidad_medida: '' })}
                                className="text-[10px] text-blue-650 hover:text-blue-500 font-extrabold cursor-pointer border border-slate-200 hover:border-slate-350 bg-white px-2.5 py-0.5 rounded-md shadow-2xs"
                              >
                                Cambiar
                              </button>
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                type="text"
                                value={ing.searchQuery || ''}
                                onFocus={() => handleAutocompleteFocus(index)}
                                onBlur={() => {
                                  // Short delay allows click/mousedown event registration on child components
                                  setTimeout(() => {
                                    updateIngredientRow(index, { showDropdown: false });
                                  }, 250);
                                }}
                                onChange={(e) => updateIngredientRow(index, { searchQuery: e.target.value, showDropdown: true })}
                                placeholder="Escribe para buscar en Odoo..."
                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-205 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none transition-all"
                              />

                              {ing.showDropdown && (
                                <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-50">
                                  {odooProducts
                                    .filter(p => p.name.toLowerCase().includes((ing.searchQuery || '').toLowerCase()))
                                    .slice(0, 15)
                                    .map(prod => (
                                      <button
                                        key={prod.id}
                                        type="button"
                                        onMouseDown={() => {
                                          // onMouseDown triggers before onBlur, populating fields correctly
                                          updateIngredientRow(index, {
                                            odoo_product_id: prod.id,
                                            product_name: prod.name,
                                            unidad_medida: prod.uom_name || 'U',
                                            showDropdown: false,
                                            searchQuery: ''
                                          });
                                        }}
                                        className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 text-xs text-slate-700 border-b border-slate-100 last:border-none cursor-pointer"
                                      >
                                        <span className="font-semibold text-slate-850 truncate block">{prod.name}</span>
                                      </button>
                                    ))}
                                  {odooProducts.filter(p => p.name.toLowerCase().includes((ing.searchQuery || '').toLowerCase())).length === 0 && (
                                    <div className="p-3 text-xs text-slate-400 italic text-center">No se encontraron productos</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs text-slate-500 font-semibold">{ing.unidad_medida || '-'}</span>
                        </td>
                        <td className="px-4 py-2">
                          <input 
                            type="number"
                            step="any"
                            min="0"
                            value={ing.cantidad_teorica === 0 ? '' : ing.cantidad_teorica}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateIngredientRow(index, { cantidad_teorica: val === '' ? 0 : parseFloat(val) || 0 });
                            }}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-lg text-xs font-mono font-bold text-right outline-none transition-all"
                          />
                        </td>
                        <td className={`px-4 py-2 text-right transition-colors duration-200 ${isTargetActive ? 'bg-emerald-50/10 font-bold text-emerald-800' : 'text-slate-400'}`}>
                          {isTargetActive ? (
                            <span className="font-mono text-xs">
                              {((ing.cantidad_teorica || 0) * (formBaseRegistroTarget / (formBasePrueba || 1))).toFixed(3)}
                            </span>
                          ) : (
                            <span className="font-mono text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeIngredientRow(index)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {formIngredients.length === 0 && (
                      <tr>
                        <td colSpan="5" className="text-center py-6 text-slate-400 italic text-xs">
                          No se han ingresado líneas de materiales. Haz clic en "Añadir Línea" para empezar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={addIngredientRow}
                className="flex items-center justify-center gap-1.5 w-full border border-dashed border-slate-300 hover:border-slate-400 text-slate-650 hover:text-slate-800 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Añadir Línea de Material</span>
              </button>
            </div>

          </div>

        </div>
      </div>
    );
  }

  // VIEW 2: Detail Workspace View
  if (selectedTrial) {
    const videoUrl = selectedTrial.multimedia.find(m => m.tipo === 'video_url')?.contenido || '';
    const steps = selectedTrial.multimedia.filter(m => m.tipo === 'texto').map(m => m.contenido);
    const videoEmbedId = getYouTubeEmbedId(videoUrl);

    return (
      <div className="space-y-6 animate-fade-in">
        {/* Sticky Header */}
        <div className="sticky -top-6 md:-top-10 bg-slate-50 z-30 -mx-6 md:-mx-10 px-6 md:px-10 -mt-6 md:-mt-10 pt-6 md:pt-10 pb-4 border-b border-slate-200/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSelectedTrial(null)}
              className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer shadow-xs"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Detalle de Prueba</span>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">{selectedTrial.nombre_plato}</h1>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  selectedTrial.estado === 'planificada' 
                    ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                    : selectedTrial.estado === 'en_coccion' 
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    : selectedTrial.estado === 'completada'
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {selectedTrial.estado.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {selectedTrial.estado === 'planificada' && (
              <button
                onClick={() => changeStatus(selectedTrial.id, 'en_coccion')}
                className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-amber-500/10 hover:shadow-amber-500/20 cursor-pointer text-xs flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>Iniciar Cocción</span>
              </button>
            )}
            
            {selectedTrial.estado === 'en_coccion' && (
              <button
                onClick={handleSaveAndComplete}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 cursor-pointer text-xs flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Completar Registro</span>
              </button>
            )}

            {selectedTrial.estado === 'completada' && (user?.rol === 'admin' || user?.permisos?.modules?.['Prueba de recetas']?.actions?.['Guardar Receta Definitiva']) && (
              <button
                onClick={() => setShowFinalizeModal(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 cursor-pointer text-xs flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Guardar Receta Definitiva</span>
              </button>
            )}
          </div>
        </div>

        {/* Details view grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          
          {/* Left Column: Embed Player & Steps (2/5) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Video Player Box */}
            <div className="bg-white border border-slate-205 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-2">
                <Video className="w-4.5 h-4.5 text-blue-600" />
                <span>Video de Preparación</span>
              </h3>
              
              {videoEmbedId ? (
                <div className="aspect-video w-full rounded-xl overflow-hidden shadow-xs border border-slate-200 bg-slate-50">
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${videoEmbedId}`}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Video del plato"
                  />
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 border-dashed rounded-xl text-slate-400 space-y-2">
                  <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold">No se cargó un enlace de video para esta prueba.</p>
                </div>
              )}
            </div>

            {/* Steps list Box */}
            <div className="bg-white border border-slate-205 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-blue-600" />
                <span>Preparación Paso a Paso</span>
              </h3>

              {steps.length === 0 ? (
                <p className="text-slate-400 text-xs italic text-center py-6">No se registraron instrucciones de preparación escritas.</p>
              ) : (
                <div className="space-y-3">
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex gap-3 items-start p-3 bg-slate-50 rounded-xl border border-slate-150">
                      <span className="w-5 h-5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 font-extrabold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-xs text-slate-650 leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Scaling range slider and Ingredients list (3/5) */}
          <div className="lg:col-span-3 bg-white border border-slate-205 rounded-2xl p-6 shadow-xs space-y-4">
            
            {/* Portions Scaling Slider Controls */}
            <div className="space-y-2.5 bg-slate-50 border border-slate-200 p-4 rounded-2xl">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Porciones a Cocinar / Probar (Escala):</span>
                <span className="px-2.5 py-0.5 bg-blue-600 text-white font-mono rounded-lg text-[11px] font-bold">{portionsScale} pers.</span>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="range"
                  min="1"
                  max={Math.max(300, portionsScale)}
                  value={portionsScale}
                  onChange={(e) => setPortionsScale(parseInt(e.target.value) || 1)}
                  disabled={selectedTrial.estado === 'completada' || selectedTrial.estado === 'registrada'}
                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                />
                <input 
                  type="number"
                  min="1"
                  value={portionsScale}
                  onChange={(e) => setPortionsScale(parseInt(e.target.value) || 1)}
                  disabled={selectedTrial.estado === 'completada' || selectedTrial.estado === 'registrada'}
                  className="w-16 px-2 py-1 bg-white border border-slate-205 focus:border-blue-500 rounded-lg text-xs font-mono font-bold text-center outline-none"
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Original planificado: {selectedTrial.base_prueba} personas</span>
                <span>Objetivo Definitivo: {selectedTrial.base_registro_target} personas</span>
              </div>
            </div>

            {/* Ingredients table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-blue-600" />
                  <span>Despacho de Materiales</span>
                </h3>
                <span className="text-[10px] text-slate-400 font-bold bg-slate-50 border border-slate-150 px-2 py-0.5 rounded-md font-mono">
                  Items: {selectedTrial.ingredientes.length}
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Producto (Odoo)</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-20">U.M.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right w-36">Cant. Despacho (Teorica)</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right w-44">Cant. Usada Físicamente (Real)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTrial.ingredientes.map((ing) => {
                      // Rule-of-three calculation
                      const ratio = portionsScale / selectedTrial.base_prueba;
                      const scaledQty = ing.cantidad_teorica * ratio;
                      const isReadOnly = selectedTrial.estado !== 'en_coccion';

                      return (
                        <tr key={ing.id} className="border-b border-slate-150 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3.5 text-xs font-bold text-slate-700">
                            {getOdooProductName(ing.odoo_product_id)}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-500 font-semibold">
                            {ing.unidad_medida}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-bold text-right font-mono text-slate-650">
                            {scaledQty.toFixed(3)}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {isReadOnly ? (
                              <span className="text-xs font-mono font-extrabold text-slate-800">
                                {ing.cantidad_real !== null ? ing.cantidad_real.toFixed(3) : '-'}
                              </span>
                            ) : (
                              <input 
                                type="number"
                                step="any"
                                min="0"
                                value={realQuantities[ing.id]}
                                onChange={(e) => handleRealQtyChange(ing.id, e.target.value)}
                                placeholder={`Def: ${scaledQty.toFixed(2)}`}
                                className="w-32 px-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-lg text-xs font-mono font-bold text-right outline-none transition-all"
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>

        {/* Finalize Recipe Dialog Overlay (Modal) */}
        {showFinalizeModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50">
            <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 max-w-md w-full mx-4 space-y-4 animate-scale-up">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Database className="w-5 h-5 text-emerald-600" />
                <span>Guardar Receta en BD Local</span>
              </h3>
              
              <p className="text-xs text-slate-500">
                Al guardar, la prueba experimental se cerrará. Se creará la receta definitiva con las porciones objetivo ({selectedTrial.base_registro_target}) escalando matemáticamente los ingredientes reales utilizados en la cocina.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block mb-1">Proteína Dominante</label>
                  <select 
                    value={finalizeProteina}
                    onChange={(e) => setFinalizeProteina(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                  >
                    <option value="Pollo">Pollo</option>
                    <option value="Carne de Res">Carne de Res</option>
                    <option value="Cerdo">Cerdo</option>
                    <option value="Pescado/Mariscos">Pescado/Mariscos</option>
                    <option value="Vegetariano">Vegetariano/Vegano</option>
                    <option value="Ninguna">Ninguna/Otro</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block mb-1">Categoría en Odoo</label>
                  <select 
                    value={finalizeCategoria}
                    onChange={(e) => setFinalizeCategoria(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                  >
                    {odooCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowFinalizeModal(false)}
                  disabled={finalizing}
                  className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleFinalizeRecipe}
                  disabled={finalizing}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center shadow-md flex items-center justify-center gap-1.5"
                >
                  {finalizing && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  <span>Confirmar y Guardar</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // VIEW 3: List View
  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Pruebas de Cocina</h1>
          <p className="text-slate-650 mt-1">Registra, ajusta y escala recetas experimentales en base a rendimientos de cocción reales.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchTrials}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-205 text-slate-700 rounded-xl transition-all cursor-pointer"
            title="Recargar datos"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {(user?.rol === 'admin' || user?.permisos?.modules?.['Prueba de recetas']?.actions?.['Programar Prueba']) && (
            <button 
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 cursor-pointer text-sm shrink-0"
            >
              <Plus className="w-5 h-5" />
              <span>Programar Prueba</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center gap-2.5 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, idx) => (
            <div key={idx} className="bg-white border border-slate-200 p-6 rounded-2xl animate-pulse space-y-3">
              <div className="w-1/4 h-5 bg-slate-100 rounded" />
              <div className="w-1/2 h-4 bg-slate-100 rounded" />
              <div className="w-1/3 h-3 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {trials.map((trial) => (
            <div 
              key={trial.id} 
              onClick={() => setSelectedTrial(trial)}
              className="bg-white border border-slate-205 shadow-2xs hover:shadow-md hover:border-slate-350 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 cursor-pointer transition-all duration-305 group"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-extrabold text-slate-800 group-hover:text-blue-650 transition-colors">{trial.nombre_plato}</h3>
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    trial.estado === 'planificada' 
                      ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                      : trial.estado === 'en_coccion' 
                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      : trial.estado === 'completada'
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {trial.estado.replace('_', ' ')}
                  </span>
                </div>
                
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
                  <p>Rendimiento Prueba: <span className="text-slate-800 font-bold font-mono">{trial.base_prueba} porciones</span></p>
                  <p>Porciones Objetivo: <span className="text-slate-800 font-bold font-mono">{trial.base_registro_target} porciones</span></p>
                  <p>Fecha Programada: <span className="text-slate-800 font-bold font-mono">{trial.fecha_prueba}</span></p>
                </div>
                
                {/* multimedia indicators */}
                <div className="flex gap-3 pt-1">
                  {trial.multimedia.some(m => m.tipo === 'video_url') && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      <Video className="w-3.5 h-3.5 text-blue-500" />
                      <span>Con Video</span>
                    </span>
                  )}
                  {trial.multimedia.some(m => m.tipo === 'texto') && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      <FileText className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Instrucciones</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <Database className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{trial.ingredientes.length} Materiales</span>
                  </span>
                </div>
              </div>

              {/* Status Action Buttons */}
              <div className="flex gap-2 self-stretch md:self-auto justify-end shrink-0" onClick={(e) => e.stopPropagation()}>
                {trial.estado === 'planificada' && (
                  <button 
                    onClick={() => changeStatus(trial.id, 'en_coccion')}
                    className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-500/10 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>Iniciar Cocción</span>
                  </button>
                )}
                {trial.estado === 'en_coccion' && (
                  <button 
                    onClick={() => { setSelectedTrial(trial); }}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Registrar Pesajes</span>
                  </button>
                )}
                {trial.estado === 'completada' && (user?.rol === 'admin' || user?.permisos?.modules?.['Prueba de recetas']?.actions?.['Guardar Receta Definitiva']) && (
                  <button 
                    onClick={() => { setSelectedTrial(trial); setShowFinalizeModal(true); }}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/10 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Guardar Receta</span>
                  </button>
                )}
                {trial.estado === 'registrada' && (
                  <span className="text-xs text-slate-400 italic font-semibold px-2 py-1">Guardada como Receta Definitiva</span>
                )}
              </div>
            </div>
          ))}
          {trials.length === 0 && (
            <div className="text-center py-16 bg-white border border-slate-205 border-dashed rounded-2xl text-slate-400 font-bold italic shadow-xs">
              No hay pruebas de recetas programadas.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Trials;
