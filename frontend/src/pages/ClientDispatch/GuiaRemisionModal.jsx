import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, Truck, MapPin, Hash, User, Search, CheckCircle2, 
  AlertCircle, RefreshCw, Package, Scale, ChevronDown,
  SlidersHorizontal, Plus, Car, Link2, Building2
} from 'lucide-react';
import { API_BASE_URL } from '../../App';
import ManageChoferesModal from './ManageChoferesModal';
import ManagePlacasModal from './ManagePlacasModal';
import ManageClienteOdooModal from './ManageClienteOdooModal';

const GuiaRemisionModal = ({ 
  despachoId, 
  clienteNombre, 
  onClose, 
  onRefresh 
}) => {
  const [loading, setLoading] = useState(true);
  const [infoGuia, setInfoGuia] = useState(null);
  const [direccion, setDireccion] = useState('');
  const [placa, setPlaca] = useState('');

  // Mapeo Cliente Odoo (res.partner)
  const [mappedPartner, setMappedPartner] = useState(null);
  const [showManageClienteOdoo, setShowManageClienteOdoo] = useState(false);
  
  // Transportistas / Choferes Habilitados
  const [transportista, setTransportista] = useState(null);
  const [activeChoferes, setActiveChoferes] = useState([]);
  const [loadingChoferes, setLoadingChoferes] = useState(false);
  const [transporterSearch, setTransporterSearch] = useState('');
  const [showTransporterDropdown, setShowTransporterDropdown] = useState(false);
  const [showManageChoferes, setShowManageChoferes] = useState(false);

  // Placas Registradas (Catálogo Validado)
  const [registeredPlacas, setRegisteredPlacas] = useState([]);
  const [loadingPlacas, setLoadingPlacas] = useState(false);
  const [placaSearch, setPlacaSearch] = useState('');
  const [showPlacaDropdown, setShowPlacaDropdown] = useState(false);
  const [showManagePlacas, setShowManagePlacas] = useState(false);

  // Submission & Progress
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState(1);
  const [errorMessage, setErrorMessage] = useState(null);

  const dropdownRef = useRef(null);
  const placaDropdownRef = useRef(null);

  // Fetch choferes activos
  const fetchActiveChoferes = async () => {
    try {
      setLoadingChoferes(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/config/choferes-activos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActiveChoferes(data || []);
        return data || [];
      }
    } catch (err) {
      console.error("Error al cargar choferes activos:", err);
    } finally {
      setLoadingChoferes(false);
    }
    return [];
  };

  // Fetch placas registradas
  const fetchRegisteredPlacas = async () => {
    try {
      setLoadingPlacas(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/config/placas?solo_activas=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRegisteredPlacas(data || []);
        return data || [];
      }
    } catch (err) {
      console.error("Error al cargar placas registradas:", err);
    } finally {
      setLoadingPlacas(false);
    }
    return [];
  };

  // Fetch initial info, choferes habilitados y placas registradas
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
        // Peticiones en paralelo: info del despacho, choferes habilitados y placas
        const [infoRes, choferesList] = await Promise.all([
          fetch(`${API_BASE_URL}/dispatch-cliente/despacho/${despachoId}/info-guia`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetchActiveChoferes(),
          fetchRegisteredPlacas()
        ]);

        if (!infoRes.ok) throw new Error("Error al obtener la información para la guía");
        const data = await infoRes.json();
        setInfoGuia(data);
        setMappedPartner({
          id: data.partner_id,
          name: data.odoo_partner_name,
          street: data.direccion_entrega,
          is_mapped: Boolean(data.is_mapped)
        });
        setDireccion(data.direccion_entrega || clienteNombre || data.cliente_nombre || '');
        if (data.placa_vehiculo) {
          setPlaca(data.placa_vehiculo);
          setPlacaSearch(data.placa_vehiculo);
        }

        if (data.transportista_id && data.transportista_nombre) {
          const match = (choferesList || []).find(c => c.id === data.transportista_id);
          setTransportista(match || {
            id: data.transportista_id,
            name: data.transportista_nombre
          });
        }
      } catch (err) {
        console.error(err);
        setErrorMessage(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (despachoId) {
      fetchData();
    }
  }, [despachoId, clienteNombre]);

  const handleMappingSaved = (newMapping) => {
    setMappedPartner({
      id: newMapping.odoo_partner_id,
      name: newMapping.odoo_partner_name,
      street: newMapping.odoo_street,
      is_mapped: true
    });
    if (newMapping.odoo_street) {
      setDireccion(newMapping.odoo_street);
    }
  };

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowTransporterDropdown(false);
      }
      if (placaDropdownRef.current && !placaDropdownRef.current.contains(e.target)) {
        setShowPlacaDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helpers seguros para nombres e iniciales de contactos
  const getContactInitial = (contact) => {
    if (!contact) return '#';
    const name = typeof contact === 'string' ? contact : (contact.name || contact.vat || '');
    if (typeof name === 'string' && name.trim()) {
      return name.trim().charAt(0).toUpperCase();
    }
    return '#';
  };

  const getContactName = (contact) => {
    if (!contact) return '';
    if (typeof contact === 'string') return contact;
    if (contact.name && typeof contact.name === 'string' && contact.name.trim()) return contact.name;
    return contact.vat ? `Contacto (${contact.vat})` : `Contacto #${contact.id || ''}`;
  };

  // Filtrado instantáneo en memoria sobre choferes habilitados
  const filteredChoferes = useMemo(() => {
    if (!transporterSearch.trim()) return activeChoferes;
    const q = transporterSearch.toLowerCase().trim();
    return activeChoferes.filter(c => {
      if (!c) return false;
      const nameStr = getContactName(c);
      return (
        nameStr.toLowerCase().includes(q) ||
        (c.vat && String(c.vat).toLowerCase().includes(q)) ||
        (c.street && String(c.street).toLowerCase().includes(q))
      );
    });
  }, [activeChoferes, transporterSearch]);

  // Filtrado sobre placas registradas
  const filteredPlacas = useMemo(() => {
    if (!placaSearch.trim()) return registeredPlacas;
    const q = placaSearch.toUpperCase().trim();
    return registeredPlacas.filter(p => {
      const pl = (p.placa || '').toUpperCase();
      const desc = (p.descripcion_vehiculo || '').toUpperCase();
      return pl.includes(q) || desc.includes(q);
    });
  }, [registeredPlacas, placaSearch]);

  const handleSelectTransporter = (t) => {
    setTransportista(t);
    setTransporterSearch('');
    setShowTransporterDropdown(false);
  };

  const handleClearTransporter = () => {
    setTransportista(null);
    setTransporterSearch('');
    setShowTransporterDropdown(true);
  };

  const handleSelectPlaca = (p) => {
    setPlaca(p.placa);
    setPlacaSearch(p.placa);
    setShowPlacaDropdown(false);
  };

  const handleClearPlaca = () => {
    setPlaca('');
    setPlacaSearch('');
    setShowPlacaDropdown(true);
  };

  const handleGenerate = async () => {
    if (!placa.trim()) {
      alert("Por favor ingrese la placa del vehículo.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSubmitStep(1);

    // Progressive step status simulation while waiting for Odoo RPC
    const stepTimer1 = setTimeout(() => setSubmitStep(2), 2200);
    const stepTimer2 = setTimeout(() => setSubmitStep(3), 4500);

    try {
      const token = localStorage.getItem('token');
      const payload = {
        partner_id: mappedPartner?.id || null,
        transportista_id: transportista?.id || null,
        transportista_nombre: transportista?.name || transporterSearch.trim() || "Transporte Propio",
        placa_vehiculo: placa.trim().toUpperCase(),
        direccion_entrega: direccion.trim()
      };

      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/despacho/${despachoId}/generar-guia`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Error al generar la guía en Odoo");
      }

      const result = await res.json();

      // Open PDF in a new window automatically
      if (result.pdf_base64) {
        try {
          const byteCharacters = atob(result.pdf_base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/pdf' });
          const pdfUrl = URL.createObjectURL(blob);
          window.open(pdfUrl, '_blank');
        } catch (pdfErr) {
          console.warn("No se pudo abrir automáticamente el PDF:", pdfErr);
        }
      }

      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      console.error(err);
      setErrorMessage(err.message || "No se pudo completar la generación en Odoo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200 relative">
        
        {/* Loading Overlay when generating with Odoo */}
        {isSubmitting && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-30 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin flex items-center justify-center">
              </div>
              <Truck className="w-8 h-8 text-blue-600 absolute inset-0 m-auto animate-pulse" />
            </div>

            <h3 className="text-xl font-black text-slate-800 mb-2">Conectando con Odoo ERP...</h3>
            <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
              Por favor espere mientras se completan las operaciones automáticas de inventario y guía de remisión.
            </p>

            {/* Stepper Status */}
            <div className="w-full max-w-sm space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left">
              <div className={`flex items-center gap-3 text-xs font-bold ${submitStep >= 1 ? 'text-blue-700' : 'text-slate-400'}`}>
                {submitStep > 1 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                )}
                <span>1. Ingreso técnico de insumos y taras a NUT/stock</span>
              </div>
              <div className={`flex items-center gap-3 text-xs font-bold ${submitStep >= 2 ? 'text-blue-700' : 'text-slate-400'}`}>
                {submitStep > 2 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : submitStep === 2 ? (
                  <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                )}
                <span>2. Creación, validación y timbrado de Guía (EDI Odoo)</span>
              </div>
              <div className={`flex items-center gap-3 text-xs font-bold ${submitStep >= 3 ? 'text-blue-700' : 'text-slate-400'}`}>
                {submitStep === 3 ? (
                  <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                )}
                <span>3. Generando reporte PDF con Código de Barras</span>
              </div>
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">Generar Guía de Remisión</h2>
                <span className="px-2 py-0.5 rounded-md bg-blue-500/30 text-blue-200 text-[10px] font-black uppercase tracking-wider border border-blue-400/30">
                  Odoo ERP
                </span>
              </div>
              <p className="text-xs text-blue-100 font-medium">
                Cliente: <span className="font-bold text-white uppercase">{clienteNombre}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-6">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm font-semibold">Cargando datos para la guía...</p>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-700 text-sm">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Ocurrió un error</p>
                    <p className="text-xs text-rose-600 mt-0.5">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Section 1: Form Fields */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  Datos de Transporte y Entrega
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Dirección de Entrega (Nombre del cliente de órdenes de fabricación, no editable) */}
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-600" />
                        Cliente / Dirección de Entrega
                      </label>
                      <div className="flex items-center gap-2">
                        {mappedPartner?.is_mapped ? (
                          <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Odoo: {mappedPartner.name} (#{mappedPartner.id})
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            Sin mapeo en Odoo
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowManageClienteOdoo(true)}
                          className="text-[10px] font-black text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-0.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                          title="Administrar / Mapear Cliente con contacto oficial de Odoo (res.partner)"
                        >
                          <Link2 className="w-3 h-3 text-indigo-600" />
                          <span>Mapear Cliente Odoo</span>
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input 
                        type="text"
                        value={direccion || clienteNombre || ''}
                        readOnly
                        disabled
                        tabIndex={-1}
                        title="La dirección y cliente provienen del mapeo oficial con Odoo y no es editable directamente."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-black text-slate-700 cursor-not-allowed select-none transition-all shadow-2xs"
                      />
                    </div>
                    {mappedPartner?.name && mappedPartner.name !== clienteNombre && (
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        Razón Social Odoo: <span className="font-bold text-slate-700">{mappedPartner.name}</span>
                        {mappedPartner.id && <span className="text-[10px] text-slate-400 font-semibold">(ID #{mappedPartner.id})</span>}
                      </p>
                    )}
                  </div>

                  {/* Transportista con Listado de Todos los Contactos de Odoo */}
                  {/* Transportista con Listado de Choferes Habilitados */}
                  <div className="relative" ref={dropdownRef}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-600" />
                        Chofer / Transportista <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          {loadingChoferes ? '...' : `${activeChoferes.length} habilitados`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowManageChoferes(true)}
                          className="text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                          title="Administrar choferes habilitados desde Odoo"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          <span>Administrar</span>
                        </button>
                      </div>
                    </div>

                    {activeChoferes.length === 0 && !loadingChoferes ? (
                      <div className="p-3 bg-amber-50/80 border border-dashed border-amber-200 rounded-xl text-center">
                        <p className="text-xs font-bold text-amber-800">No hay choferes habilitados</p>
                        <p className="text-[11px] text-amber-700 mt-0.5">Seleccione los choferes autorizados de Odoo.</p>
                        <button
                          type="button"
                          onClick={() => setShowManageChoferes(true)}
                          className="mt-2 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 shadow-xs"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          Habilitar Choferes
                        </button>
                      </div>
                    ) : transportista ? (
                      <div className="flex items-center justify-between p-2.5 bg-blue-50/90 border border-blue-200 rounded-xl shadow-xs">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                            {getContactInitial(transportista)}
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-black text-blue-950 truncate">{getContactName(transportista)}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {transportista.vat ? (
                                <span className="text-[10px] font-mono text-blue-700 font-semibold bg-blue-100/70 px-1.5 py-0.2 rounded">
                                  CI/RUC: {transportista.vat}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Sin CI/RUC</span>
                              )}
                              {transportista.street && (
                                <span className="text-[10px] text-slate-500 truncate max-w-[130px]">
                                  {transportista.street}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearTransporter}
                          className="px-2.5 py-1.5 hover:bg-blue-100 rounded-lg text-blue-700 font-bold text-xs transition-colors ml-2 shrink-0 border border-blue-200 bg-white"
                          title="Seleccionar otro chofer habilitado"
                        >
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="relative">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                          <input 
                            type="text"
                            value={transporterSearch}
                            onChange={(e) => {
                              setTransporterSearch(e.target.value);
                              setShowTransporterDropdown(true);
                            }}
                            onFocus={() => setShowTransporterDropdown(true)}
                            placeholder="Buscar chofer habilitado..."
                            className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          />
                          <ChevronDown 
                            onClick={() => setShowTransporterDropdown(!showTransporterDropdown)}
                            className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 cursor-pointer hover:text-slate-600 transition-colors" 
                          />
                        </div>

                        {/* Dropdown con choferes habilitados */}
                        {showTransporterDropdown && (
                          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-56 overflow-y-auto custom-scrollbar z-30 divide-y divide-slate-100">
                            <div className="p-2.5 bg-slate-50/90 sticky top-0 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500 backdrop-blur-xs">
                              <span>Choferes habilitados ({filteredChoferes.length} de {activeChoferes.length}):</span>
                              {transporterSearch && (
                                <button 
                                  onClick={() => setTransporterSearch('')}
                                  className="text-blue-600 hover:underline"
                                >
                                  Ver todos
                                </button>
                              )}
                            </div>

                            {loadingChoferes ? (
                              <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                                <span>Cargando choferes habilitados...</span>
                              </div>
                            ) : filteredChoferes.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-400">
                                No se encontraron choferes habilitados con "{transporterSearch}"
                              </div>
                            ) : (
                              filteredChoferes.map((t) => (
                                <div
                                  key={t.id}
                                  onClick={() => handleSelectTransporter(t)}
                                  className="p-2.5 px-3 hover:bg-blue-50 cursor-pointer transition-colors flex items-center justify-between group"
                                >
                                  <div className="flex items-center gap-2.5 overflow-hidden pr-2">
                                    <div className="w-7 h-7 rounded-lg bg-blue-100/70 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 transition-colors">
                                      {getContactInitial(t)}
                                    </div>
                                    <div className="truncate">
                                      <p className="text-xs font-bold text-slate-800 group-hover:text-blue-900 truncate">
                                        {getContactName(t)}
                                      </p>
                                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                        {t.vat && <span className="font-mono text-slate-500">CI/RUC: {t.vat}</span>}
                                        {t.street && <span className="truncate max-w-[150px]">{t.street}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-100/60 group-hover:bg-blue-600 group-hover:text-white px-2.5 py-1 rounded-lg shrink-0 transition-colors">
                                    Elegir
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Placa con Catálogo de Placas Registradas */}
                  <div className="relative" ref={placaDropdownRef}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-blue-600" />
                        Placa del Vehículo <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          {loadingPlacas ? '...' : `${registeredPlacas.length} registradas`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowManagePlacas(true)}
                          className="text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                          title="Registrar o administrar catálogo de placas"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Administrar</span>
                        </button>
                      </div>
                    </div>

                    {registeredPlacas.length === 0 && !loadingPlacas ? (
                      <div className="p-3 bg-blue-50/80 border border-dashed border-blue-200 rounded-xl text-center">
                        <p className="text-xs font-bold text-slate-700">Sin placas registradas</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Registre las placas autorizadas con validación.</p>
                        <button
                          type="button"
                          onClick={() => setShowManagePlacas(true)}
                          className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 shadow-xs"
                        >
                          <Plus className="w-3 h-3" />
                          Registrar Placa
                        </button>
                      </div>
                    ) : placa ? (
                      <div className="flex items-center justify-between p-2.5 bg-blue-50/90 border border-blue-200 rounded-xl shadow-xs">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div className="px-3 py-1 rounded-lg bg-slate-900 text-white font-mono font-black text-xs tracking-wider border border-slate-700 shadow-xs shrink-0">
                            {placa}
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-bold text-slate-800 truncate">
                              {registeredPlacas.find(p => p.placa === placa)?.descripcion_vehiculo || 'Vehículo autorizado'}
                            </p>
                            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              Placa registrada
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearPlaca}
                          className="px-2.5 py-1.5 hover:bg-blue-100 rounded-lg text-blue-700 font-bold text-xs transition-colors ml-2 shrink-0 border border-blue-200 bg-white"
                          title="Seleccionar otra placa del catálogo"
                        >
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="relative">
                          <Hash className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                          <input 
                            type="text"
                            value={placaSearch}
                            onChange={(e) => {
                              setPlacaSearch(e.target.value.toUpperCase());
                              setShowPlacaDropdown(true);
                            }}
                            onFocus={() => setShowPlacaDropdown(true)}
                            placeholder="Buscar placa o vehículo..."
                            className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 uppercase transition-all"
                          />
                          <ChevronDown 
                            onClick={() => setShowPlacaDropdown(!showPlacaDropdown)}
                            className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 cursor-pointer hover:text-slate-600 transition-colors" 
                          />
                        </div>

                        {/* Dropdown de Placas Registradas */}
                        {showPlacaDropdown && (
                          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-56 overflow-y-auto custom-scrollbar z-30 divide-y divide-slate-100">
                            <div className="p-2.5 bg-slate-50/90 sticky top-0 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500 backdrop-blur-xs">
                              <span>Placas registradas ({filteredPlacas.length} de {registeredPlacas.length}):</span>
                              <button 
                                onClick={() => setShowManagePlacas(true)}
                                className="text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                Nueva
                              </button>
                            </div>

                            {loadingPlacas ? (
                              <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                                <span>Cargando placas...</span>
                              </div>
                            ) : filteredPlacas.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-400">
                                <p>No se encontraron placas con "{placaSearch}"</p>
                                <button
                                  type="button"
                                  onClick={() => setShowManagePlacas(true)}
                                  className="mt-2 text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Registrar placa nueva
                                </button>
                              </div>
                            ) : (
                              filteredPlacas.map((p) => (
                                <div
                                  key={p.id}
                                  onClick={() => handleSelectPlaca(p)}
                                  className="p-2.5 px-3 hover:bg-blue-50 cursor-pointer transition-colors flex items-center justify-between group"
                                >
                                  <div className="flex items-center gap-2.5 overflow-hidden pr-2">
                                    <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white font-mono font-bold text-xs tracking-wider shrink-0">
                                      {p.placa}
                                    </span>
                                    <div className="truncate">
                                      <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-900 truncate">
                                        {p.descripcion_vehiculo || 'Vehículo'}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-100/60 group-hover:bg-blue-600 group-hover:text-white px-2.5 py-1 rounded-lg shrink-0 transition-colors">
                                    Elegir
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 2: Consolidado de Bienes */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-500" />
                    Ítems Consolidados para la Guía
                  </h3>
                  <span className="text-[11px] font-bold text-slate-400">
                    {infoGuia?.platos?.length || 0} platos • {infoGuia?.taras?.length || 0} taras
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Columna Platos */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-sm flex flex-col">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                      <span className="text-xs font-black text-slate-700 uppercase tracking-tight">
                        Platos / Insumos
                      </span>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        Porciones Despachadas
                      </span>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {infoGuia?.platos?.map((p) => (
                        <div 
                          key={p.id} 
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                        >
                          <div className="truncate pr-2">
                            <p className="font-bold text-slate-800 truncate">{p.plato_nombre}</p>
                            <p className="text-[10px] text-slate-400 capitalize">{p.tipo || 'Plato'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-black text-indigo-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 inline-block">
                              {p.unidades_despachadas ?? 0}
                            </span>
                            <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                              Solicitado: {p.cantidad_teorica}
                            </p>
                          </div>
                        </div>
                      ))}
                      {(!infoGuia?.platos || infoGuia.platos.length === 0) && (
                        <p className="text-center py-4 text-xs text-slate-400 font-medium">Sin platos registrados</p>
                      )}
                    </div>
                  </div>

                  {/* Columna Taras */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-sm flex flex-col">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                      <span className="text-xs font-black text-slate-700 uppercase tracking-tight">
                        Taras / Envases a Retornar
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Total Envases
                      </span>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {infoGuia?.taras?.map((t) => (
                        <div 
                          key={t.id} 
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                        >
                          <div className="flex items-center gap-2.5 truncate pr-2">
                            <div className="w-8 h-8 rounded-lg border border-slate-200 bg-white overflow-hidden shrink-0 flex items-center justify-center">
                              {t.photo ? (
                                <img 
                                  src={t.photo.startsWith('data:') ? t.photo : `data:image/png;base64,${t.photo}`} 
                                  className="w-full h-full object-cover" 
                                  alt={t.name}
                                />
                              ) : (
                                <span className="text-sm">📦</span>
                              )}
                            </div>
                            <div className="truncate">
                              <p className="font-bold text-slate-800 truncate">{t.name}</p>
                              <p className="text-[10px] text-slate-400">
                                Peso tara: {t.peso_tara} kg/u
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-black text-emerald-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 inline-block">
                              {t.cantidad} u
                            </span>
                            <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                              {(t.cantidad * t.peso_tara).toFixed(2)} kg
                            </p>
                          </div>
                        </div>
                      ))}
                      {(!infoGuia?.taras || infoGuia.taras.length === 0) && (
                        <div className="text-center py-6 text-xs text-slate-400 font-medium flex flex-col items-center justify-center gap-1">
                          <Scale className="w-5 h-5 text-slate-300" />
                          <span>No se registraron taras en los pesajes</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-800 text-xs leading-relaxed flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <p>
                    <strong>Flujo automático de Odoo:</strong> Se realizará primero un movimiento técnico de recepción hacia la ubicación física <strong>NUT/stock</strong> de los platos y taras, seguido de la entrega y validación de la Guía de Remisión al cliente.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200/70 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isSubmitting || loading || !placa.trim()}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-200 hover:shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Truck className="w-4 h-4" />
                Confirmar y Generar Guía
              </>
            )}
          </button>
        </div>

        {/* Modales de Gestión Secundaria */}
        <ManageChoferesModal
          isOpen={showManageChoferes}
          onClose={() => setShowManageChoferes(false)}
          onSaved={fetchActiveChoferes}
        />

        <ManagePlacasModal
          isOpen={showManagePlacas}
          onClose={() => setShowManagePlacas(false)}
          onPlacasUpdated={fetchRegisteredPlacas}
          onPlateAdded={(newPlate) => {
            setPlaca(newPlate);
            setPlacaSearch(newPlate);
            fetchRegisteredPlacas();
          }}
        />

        <ManageClienteOdooModal
          isOpen={showManageClienteOdoo}
          onClose={() => setShowManageClienteOdoo(false)}
          clienteLocalNombre={clienteNombre}
          currentPartnerId={mappedPartner?.id}
          onMappingSaved={handleMappingSaved}
        />

      </div>
    </div>
  );
};

export default GuiaRemisionModal;
