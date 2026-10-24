import React, { useState, useEffect } from 'react';
import { ChefHat, Search, RefreshCw, AlertCircle, ArrowLeft, Save, Trash, Plus, ClipboardList, Database, ChevronDown } from 'lucide-react';
import { API_BASE_URL } from '../App';

function Recipes({ user }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Todas');
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token');

  // Vista de detalle de receta
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [bomIngredients, setBomIngredients] = useState([]);
  const [loadingBom, setLoadingBom] = useState(false);
  const [steps, setSteps] = useState([]);
  const [newStepText, setNewStepText] = useState('');
  const [savingSteps, setSavingSteps] = useState(false);
  const [sortBy, setSortBy] = useState('default'); // 'default', 'price_asc', 'price_desc'

  // Obtener los detalles de BoM desde Odoo vía backend
  const fetchBomDetails = async (recipeId) => {
    setBomIngredients([]);
    setLoadingBom(true);
    try {
      const response = await fetch(`${API_BASE_URL}/recipes/${recipeId}/bom`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setBomIngredients(data);
      } else {
        console.error("Fallo al obtener BoM de Odoo");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBom(false);
    }
  };

  useEffect(() => {
    if (selectedRecipe) {
      fetchBomDetails(selectedRecipe.id);
      setSteps(selectedRecipe.pasos_preparacion || []);
      setNewStepText('');
    }
  }, [selectedRecipe]);

  // Guardar los pasos de preparación localmente
  const handleSaveSteps = async () => {
    setSavingSteps(true);
    try {
      const response = await fetch(`${API_BASE_URL}/recipes/${selectedRecipe.id}/steps`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          pasos_preparacion: steps
        })
      });
      if (response.ok) {
        const updatedRecipe = await response.json();
        setRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
        setSelectedRecipe(updatedRecipe);
        alert('¡Pasos de preparación guardados exitosamente!');
      } else {
        alert('Error al guardar los pasos de preparación.');
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al guardar los pasos.');
    } finally {
      setSavingSteps(false);
    }
  };

  // Helper to extract the last subcategory from category path (e.g. "Recetas / JUGOS" -> "JUGOS")
  const getSubcategory = (categName) => {
    if (!categName) return 'Sin Categoría';
    const parts = categName.split('/');
    return parts[parts.length - 1].trim();
  };

  // Cargar recetas de Odoo a través del backend
  const fetchRecipes = async (sync = false) => {
    setLoading(true);
    setError('');
    try {
      const url = sync ? `${API_BASE_URL}/recipes/?sync=true` : `${API_BASE_URL}/recipes/`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setRecipes(data);
      } else {
        throw new Error(data.detail || 'Fallo al cargar recetas');
      }
    } catch (err) {
      setError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  const toggleStatus = async (id) => {
    try {
      // Optimistic update
      setRecipes(prev => prev.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r));
      if (selectedRecipe && selectedRecipe.id === id) {
        setSelectedRecipe(prev => ({ ...prev, is_active: !prev.is_active }));
      }
      
      const response = await fetch(`${API_BASE_URL}/recipes/${id}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const data = await response.json();
        // Rollback on error
        setRecipes(prev => prev.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r));
        if (selectedRecipe && selectedRecipe.id === id) {
          setSelectedRecipe(prev => ({ ...prev, is_active: !prev.is_active }));
        }
        alert(data.detail || 'Error al cambiar estado de receta');
      }
    } catch (err) {
      console.error(err);
      fetchRecipes(); // refetch on network failure
    }
  };

  const formatCost = (cost) => {
    if (!cost) return '$0.00';
    const num = typeof cost === 'string' ? parseFloat(cost) : cost;
    if (num === 0) return '$0.00';
    if (num < 0.01) return `$${num.toFixed(4)}`;
    return `$${num.toFixed(2)}`;
  };

  // Helper to get the tab grouping name, mapping all "Tipo 2" subcategories to a single tab
  const getSubcategoryTab = (categName) => {
    const subcat = getSubcategory(categName);
    if (subcat.toLowerCase().includes('tipo 2')) {
      return 'Tipo 2';
    }
    // Clean "Tipo 1" to keep it general (e.g. "Fuerte Tipo 1" -> "Fuerte")
    if (subcat.toLowerCase().includes('tipo 1')) {
      return subcat.replace(/tipo\s*1/i, '').trim();
    }
    return subcat;
  };

  // Derive unique subcategories based on current view mode
  const viewableRecipes = recipes.filter(r => showArchived ? !r.is_active : r.is_active);
  const uniqueSubcategories = [...new Set(viewableRecipes.map(r => getSubcategoryTab(r.categ_name)))].sort((a, b) => a.localeCompare(b));
  const subcategories = ['Todas', ...uniqueSubcategories];

  const filteredRecipes = viewableRecipes.filter(r => {
    const matchesSearch = r.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (r.categ_name && r.categ_name.toLowerCase().includes(search.toLowerCase()));
    
    if (activeTab === 'Todas') {
      return matchesSearch;
    }
    return matchesSearch && getSubcategoryTab(r.categ_name) === activeTab;
  });

  const sortedRecipes = [...filteredRecipes].sort((a, b) => {
    const costA = a.bom_cost || 0;
    const costB = b.bom_cost || 0;
    if (sortBy === 'price_asc') return costA - costB;
    if (sortBy === 'price_desc') return costB - costA;
    return 0;
  });

  if (selectedRecipe) {
    const totalBomCost = bomIngredients.length > 0
      ? bomIngredients.reduce((sum, item) => sum + (item.total_cost || 0), 0)
      : (selectedRecipe.bom_cost || 0);

    return (
      <div className="space-y-6 animate-fade-in">
        {/* Encabezado fijo para detalle de receta */}
        <div className="sticky -top-6 md:-top-10 bg-slate-50 z-30 -mx-6 md:-mx-10 px-6 md:px-10 -mt-6 md:-mt-10 pt-6 md:pt-10 pb-4 border-b border-slate-200/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedRecipe(null)}
              className="p-2 bg-white hover:bg-slate-100 text-slate-650 hover:text-slate-900 border border-slate-200 rounded-xl transition-all cursor-pointer shadow-xs flex items-center justify-center shrink-0"
              title="Volver al catálogo"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Detalle de Receta</span>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-tight line-clamp-1">{selectedRecipe.nombre}</h1>
            </div>
          </div>
          
          <button
            onClick={handleSaveSteps}
            disabled={savingSteps}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white px-5 py-2.5 rounded-xl font-bold tracking-wide transition-all shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 cursor-pointer text-sm flex items-center gap-2"
          >
            {savingSteps ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Guardar Pasos</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Foto e Información + Preparación */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Foto e Información */}
            <div className="bg-white border border-slate-205 rounded-2xl p-6 shadow-xs flex flex-col items-center text-center">
              <div className="w-32 h-32 rounded-full border-4 border-slate-50 bg-slate-50 flex items-center justify-center overflow-hidden shadow-xs mb-4 shrink-0">
                {selectedRecipe.image_256 ? (
                  <img 
                    src={selectedRecipe.image_256.startsWith('data:') ? selectedRecipe.image_256 : `data:image/png;base64,${selectedRecipe.image_256}`} 
                    alt={selectedRecipe.nombre} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-blue-50/50 flex items-center justify-center">
                    <ChefHat className="w-14 h-14 text-blue-500/60" />
                  </div>
                )}
              </div>

              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-sm font-mono mb-3">
                ID ODOO: #{selectedRecipe.odoo_product_id}
              </span>

              <h2 className="text-lg font-bold text-slate-800 leading-snug">{selectedRecipe.nombre}</h2>
              
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mt-2 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-150">
                {getSubcategory(selectedRecipe.categ_name)}
              </span>

              <div className="w-full border-t border-slate-100 my-4" />

              <div className="grid grid-cols-2 gap-4 w-full text-left">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Costo BoM</span>
                  <p className="text-xl font-extrabold text-blue-650 mt-0.5">
                    {formatCost(totalBomCost)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Porciones Base</span>
                  <p className="text-xl font-extrabold text-slate-700 mt-0.5">
                    {selectedRecipe.base_porciones}
                  </p>
                </div>
              </div>

              <div className="w-full border-t border-slate-100 my-4" />

              <div className="flex items-center justify-between w-full">
                <span className="text-xs text-slate-500 font-semibold">Estado de Receta</span>
                <button
                  onClick={() => toggleStatus(selectedRecipe.id)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    selectedRecipe.is_active ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                      selectedRecipe.is_active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Preparación */}
            <div className="bg-white border border-slate-205 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <ClipboardList className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Preparación</h3>
              </div>

              {/* Lista de pasos */}
              {steps.length === 0 ? (
                <p className="text-slate-400 text-xs italic py-4 text-center">No se han registrado pasos de preparación para esta receta.</p>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {steps.map((step, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-150 group">
                      <span className="w-5 h-5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        {index + 1}
                      </span>
                      <p className="text-xs text-slate-650 leading-relaxed flex-1">{step}</p>
                      <button
                        onClick={() => setSteps(prev => prev.filter((_, i) => i !== index))}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-slate-100 transition-all cursor-pointer shrink-0"
                        title="Eliminar paso"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Agregar nuevo paso */}
              <div className="flex items-end gap-2 pt-2 border-t border-slate-100">
                <div className="flex-1">
                  <textarea
                    value={newStepText}
                    onChange={(e) => setNewStepText(e.target.value)}
                    placeholder="Escribe el siguiente paso de preparación..."
                    rows="2"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/10 rounded-xl text-slate-800 placeholder-slate-400 outline-none text-xs transition-all resize-none shadow-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (newStepText.trim()) {
                      setSteps(prev => [...prev, newStepText.trim()]);
                      setNewStepText('');
                    }
                  }}
                  disabled={!newStepText.trim()}
                  className="p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-100 disabled:text-slate-400 text-white border border-transparent disabled:border-slate-200 rounded-xl transition-all cursor-pointer shrink-0 flex items-center justify-center shadow-xs"
                  title="Añadir paso"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

          </div>

          {/* Materiales de la Receta (BoM) */}
          <div className="lg:col-span-2 bg-white border border-slate-205 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Materiales de la Receta (Odoo BoM)</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-bold bg-slate-50 border border-slate-150 px-2 py-0.5 rounded-md font-mono">
                Componentes: {bomIngredients.length}
              </span>
            </div>

            {loadingBom ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-xs font-semibold animate-pulse">Obteniendo Lista de Materiales desde Odoo ERP...</p>
              </div>
            ) : bomIngredients.length === 0 ? (
              <div className="text-center py-16 text-slate-400 space-y-2">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold">Esta receta no tiene una Lista de Materiales (BoM) activa en Odoo.</p>
                <p className="text-[10px] text-slate-400 max-w-sm mx-auto">Asegúrate de que el producto esté correctamente enlazado en el módulo mrp de Odoo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">ID Componente</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre del Material</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Cantidad</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Unidad</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Costo Unit.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Costo Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bomIngredients.map((item) => (
                      <tr key={item.odoo_product_id} className="border-b border-slate-150 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3.5 text-xs text-slate-400 font-mono">#{item.odoo_product_id}</td>
                        <td className="px-4 py-3.5 text-xs font-bold text-slate-700">{item.name}</td>
                        <td className="px-4 py-3.5 text-xs text-slate-650 font-bold text-right font-mono">{item.qty.toFixed(3)}</td>
                        <td className="px-4 py-3.5 text-xs text-slate-500 font-semibold">{item.uom_name}</td>
                        <td className="px-4 py-3.5 text-xs text-slate-650 text-right font-mono">${item.unit_cost.toFixed(4)}</td>
                        <td className="px-4 py-3.5 text-xs font-extrabold text-slate-800 text-right font-mono">${item.total_cost.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="bg-blue-50/20 font-bold border-t-2 border-blue-100">
                      <td colSpan="4" className="px-4 py-4 text-xs uppercase tracking-wider text-slate-500">Costo Total de Materiales (BoM)</td>
                      <td colSpan="2" className="px-4 py-4 text-lg font-extrabold text-blue-650 text-right font-mono">
                        {formatCost(bomIngredients.reduce((sum, item) => sum + item.total_cost, 0))}
                      </td>
                    </tr>
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
    <div className="space-y-6">
      {/* Encabezado y controles fijos al dar scroll */}
      <div className="sticky -top-6 md:-top-10 bg-slate-50 z-30 -mx-6 md:-mx-10 px-6 md:px-10 -mt-6 md:-mt-10 pt-6 md:pt-10 pb-4 border-b border-slate-200/50 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Catálogo de Recetas</h1>
            <p className="text-slate-650 mt-1">Consulta y administra recetas con listas de materiales (BoM) sincronizadas desde Odoo ERP.</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setShowArchived(!showArchived);
                setActiveTab('Todas');
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold border transition-all cursor-pointer text-sm shrink-0 ${
                showArchived 
                  ? 'bg-amber-100 border-amber-200 text-amber-800' 
                  : 'bg-white border-slate-205 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Database className="w-4 h-4" />
              {showArchived ? 'Ver Activas' : 'Archivadas'}
            </button>
            <button 
              onClick={() => fetchRecipes(true)}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-semibold border border-slate-205 transition-all cursor-pointer text-sm shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Sincronizar Odoo
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center gap-2.5 shadow-xs">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Buscador */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
              <Search className="w-5 h-5" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre de receta o categoría..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-205 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-slate-900 outline-none placeholder-slate-400 text-sm transition-all shadow-xs"
            />
          </div>

          {/* Ordenador de Precios */}
          <div className="relative shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none bg-white border border-slate-205 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 rounded-xl pl-4 pr-10 py-3 text-sm font-semibold text-slate-750 outline-none transition-all shadow-xs cursor-pointer"
            >
              <option value="default">Orden por Defecto</option>
              <option value="price_asc">Más Baratas Primero</option>
              <option value="price_desc">Más Caras Primero</option>
            </select>
            <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
              <ChevronDown className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>

      {/* Contenido principal con sidebar lateral y grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start animate-fade-in">
        {/* Sidebar de Categorías (se muestra si no está cargando y hay recetas) */}
        {!loading && recipes.length > 0 && (
          <div className="md:col-span-1 bg-white border border-slate-205 rounded-2xl p-4 shadow-xs md:sticky md:top-[120px] space-y-3">
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1 pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>Categorías</span>
              <span className="text-[10px] text-slate-500 font-mono font-normal">({recipes.length})</span>
            </h3>
            <div className="flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 scrollbar-none">
              {subcategories.map((subcat) => {
                const count = subcat === 'Todas' 
                  ? viewableRecipes.length 
                  : viewableRecipes.filter(r => getSubcategoryTab(r.categ_name) === subcat).length;
                const isActive = activeTab === subcat;
                return (
                  <button
                    key={subcat}
                    onClick={() => setActiveTab(subcat)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-205 cursor-pointer border flex items-center justify-between gap-3 text-left ${
                      isActive 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/10' 
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-650 hover:text-slate-800'
                    }`}
                  >
                    <span className="truncate">{subcat}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-500'
                    }`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Listado de Recetas */}
        <div className={!loading && recipes.length > 0 ? "md:col-span-4" : "w-full"}>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, idx) => (
                <div key={idx} className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col items-center animate-pulse">
                  <div className="w-20 h-20 rounded-full bg-slate-100 mb-4" />
                  <div className="w-3/4 h-4 bg-slate-100 rounded mb-2" />
                  <div className="w-1/2 h-3 bg-slate-100 rounded mb-4" />
                  <div className="w-full h-8 bg-slate-100 rounded mt-auto" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedRecipes.map((recipe) => (
                  <div 
                    key={recipe.id} 
                    onClick={() => setSelectedRecipe(recipe)}
                    className="bg-white border border-slate-205 rounded-2xl p-4 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-305 flex flex-col items-center text-center relative group cursor-pointer"
                  >
                    {/* Circular image centred at the top */}
                    <div className="w-20 h-20 rounded-full border-4 border-slate-50 bg-slate-50 flex items-center justify-center overflow-hidden shadow-xs mb-4 shrink-0 transition-transform duration-300 group-hover:scale-103">
                      {recipe.image_256 ? (
                        <img 
                          src={recipe.image_256.startsWith('data:') ? recipe.image_256 : `data:image/png;base64,${recipe.image_256}`} 
                          alt={recipe.nombre} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-blue-50/50 flex items-center justify-center">
                          <ChefHat className="w-8 h-8 text-blue-500/60" />
                        </div>
                      )}
                    </div>

                    {/* ID de Odoo */}
                    <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-sm font-mono mb-2">
                      ID: #{recipe.odoo_product_id}
                    </span>

                    {/* Name */}
                    <h3 className="font-bold text-slate-800 text-sm line-clamp-2 h-10 flex items-center justify-center px-1">
                      {recipe.nombre}
                    </h3>

                    {/* Category */}
                    <span 
                      title={recipe.categ_name}
                      className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mt-2 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-150 cursor-help"
                    >
                      {getSubcategory(recipe.categ_name)}
                    </span>

                    {/* Costo BoM */}
                    <div className="mt-4 flex flex-col items-center">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Costo BoM</span>
                      <span className="text-lg font-extrabold text-blue-650 mt-0.5">
                        {formatCost(recipe.bom_cost)}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="w-full border-t border-slate-100 my-4" />

                    {/* Switch de Estado */}
                    <div className="flex items-center justify-between w-full mt-auto">
                      <span className="text-xs text-slate-500 font-semibold">Estado Receta</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStatus(recipe.id);
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          recipe.is_active ? 'bg-blue-600' : 'bg-slate-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                            recipe.is_active ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {filteredRecipes.length === 0 && (
                <div className="bg-white border border-slate-200 p-12 rounded-2xl text-center shadow-xs">
                  <ChefHat className="w-12 h-12 text-slate-350 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold italic">No se encontraron recetas que coincidan con la búsqueda.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Recipes;
