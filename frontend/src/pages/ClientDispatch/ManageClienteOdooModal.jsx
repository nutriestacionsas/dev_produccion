import { useState, useEffect, useRef } from 'react';
import { 
  X, Search, Building2, MapPin, Check, AlertCircle, 
  RefreshCw, CheckCircle2, Link2, FileText, Phone, Mail,
  ExternalLink, Sparkles
} from 'lucide-react';
import { API_BASE_URL } from '../../App';

const ManageClienteOdooModal = ({ 
  isOpen, 
  onClose, 
  clienteLocalNombre, 
  currentPartnerId, 
  onMappingSaved 
}) => {
  const [search, setSearch] = useState('');
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [currentMapping, setCurrentMapping] = useState(null);
  const [loadingMapping, setLoadingMapping] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const searchDebounceRef = useRef(null);

  // Cargar mapeo existente de este cliente local
  useEffect(() => {
    if (!isOpen || !clienteLocalNombre) return;

    const fetchCurrentMapping = async () => {
      try {
        setLoadingMapping(true);
        setError(null);
        setSuccessMsg(null);
        const token = localStorage.getItem('token');
        const res = await fetch(
          `${API_BASE_URL}/dispatch-cliente/config/mapeo-cliente/${encodeURIComponent(clienteLocalNombre)}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.mapped && data.mapping) {
            setCurrentMapping(data.mapping);
            setSelectedPartner({
              id: data.mapping.odoo_partner_id,
              name: data.mapping.odoo_partner_name,
              street: data.mapping.odoo_street
            });
          } else {
            setCurrentMapping(null);
          }
        }
      } catch (err) {
        console.error("Error al consultar mapeo existente:", err);
      } finally {
        setLoadingMapping(false);
      }
    };

    fetchCurrentMapping();

    // Iniciar búsqueda sugerida con el nombre del cliente local
    setSearch(clienteLocalNombre || '');
    searchPartners(clienteLocalNombre || '');
  }, [isOpen, clienteLocalNombre]);

  // Búsqueda en Odoo (res.partner)
  const searchPartners = async (queryText) => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/dispatch-cliente/config/clientes-odoo?query=${encodeURIComponent(queryText || '')}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!res.ok) {
        throw new Error('No se pudo consultar los contactos de Odoo.');
      }

      const data = await res.json();
      setPartners(data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al buscar en Odoo');
    } finally {
      setLoading(false);
    }
  };

  // Manejo de cambio en el input de búsqueda con debounce
  const handleSearchChange = (e) => {
    const text = e.target.value;
    setSearch(text);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      searchPartners(text);
    }, 350);
  };

  const handleSelectPartner = (partner) => {
    setSelectedPartner(partner);
    setError(null);
  };

  // Guardar vinculación
  const handleSave = async () => {
    if (!selectedPartner) {
      setError("Por favor seleccione un contacto / cliente de Odoo.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);
      const token = localStorage.getItem('token');

      const payload = {
        cliente_local_nombre: clienteLocalNombre.trim(),
        odoo_partner_id: selectedPartner.id,
        odoo_partner_name: selectedPartner.name,
        odoo_street: selectedPartner.street || ''
      };

      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/config/mapear-cliente`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Error al guardar el mapeo en el servidor.');
      }

      const result = await res.json();
      setSuccessMsg(`¡Cliente '${clienteLocalNombre}' vinculado con éxito a ${selectedPartner.name}!`);

      if (onMappingSaved) {
        onMappingSaved(result.mapping || payload);
      }

      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al guardar el mapeo.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-700 via-blue-700 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
              <Link2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">Mapear Cliente Odoo</h2>
                <span className="px-2 py-0.5 rounded-md bg-white/20 text-indigo-100 text-[10px] font-black uppercase tracking-wider border border-white/20">
                  res.partner
                </span>
              </div>
              <p className="text-xs text-indigo-200 font-medium flex items-center gap-1.5 mt-0.5">
                Cliente Local: <span className="font-black text-white uppercase bg-white/15 px-2 py-0.5 rounded-md">{clienteLocalNombre}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={saving}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
          {/* Current Mapping Banner */}
          {currentMapping && (
            <div className="p-3.5 bg-indigo-50/80 border border-indigo-200/80 rounded-2xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-indigo-900">Mapeo Actual Guardado</span>
                  <span className="text-[10px] bg-indigo-200/60 text-indigo-800 font-extrabold px-1.5 py-0.2 rounded">
                    ID #{currentMapping.odoo_partner_id}
                  </span>
                </div>
                <p className="font-black text-slate-800 text-sm truncate mt-0.5">
                  {currentMapping.odoo_partner_name}
                </p>
                {currentMapping.odoo_street && (
                  <p className="text-slate-600 truncate mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    {currentMapping.odoo_street}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Feedback Alerts */}
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 font-semibold">{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-emerald-800 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-bold">{successMsg}</div>
            </div>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input 
              type="text"
              placeholder="Buscar por Razón Social, RUC o dirección en Odoo..."
              value={search}
              onChange={handleSearchChange}
              autoFocus
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
            />
            {loading ? (
              <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin absolute right-3.5 top-3" />
            ) : search ? (
              <button 
                onClick={() => { setSearch(''); searchPartners(''); }}
                className="text-slate-400 hover:text-slate-600 absolute right-3 top-2.5 p-1 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>Contactos encontrados en Odoo: <strong className="text-slate-700">{partners.length}</strong></span>
            {selectedPartner && (
              <span className="text-indigo-600 font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Seleccionado: #{selectedPartner.id}
              </span>
            )}
          </div>

          {/* Partners List */}
          <div className="space-y-2 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
            {loading && partners.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                <RefreshCw className="w-7 h-7 animate-spin text-indigo-500" />
                <p className="text-xs font-semibold">Consultando contactos en Odoo...</p>
              </div>
            ) : partners.length === 0 ? (
              <div className="py-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Building2 className="w-8 h-8 mx-auto text-slate-300 mb-1.5" />
                <p className="text-xs font-bold text-slate-600">No se encontraron contactos en Odoo</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Intenta buscar con otra palabra clave o número de RUC.</p>
              </div>
            ) : (
              partners.map(partner => {
                const isSelected = selectedPartner?.id === partner.id;
                const isCurrent = currentMapping?.odoo_partner_id === partner.id;

                return (
                  <div
                    key={partner.id}
                    onClick={() => handleSelectPartner(partner)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 text-left ${
                      isSelected 
                        ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs' 
                        : 'bg-white hover:bg-slate-50/90 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Radio circle */}
                    <div className="mt-1 shrink-0">
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected 
                          ? 'border-indigo-600 bg-indigo-600 text-white' 
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>

                    {/* Partner Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-slate-800 tracking-tight">
                          {partner.name}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-md border border-slate-200">
                          ID: #{partner.id}
                        </span>
                        {partner.vat && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-200 flex items-center gap-1">
                            <FileText className="w-2.5 h-2.5" />
                            RUC/Cédula: {partner.vat}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                            Actual
                          </span>
                        )}
                      </div>

                      {/* Dirección / Street */}
                      <div className="mt-1 text-xs text-slate-600 flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className={partner.street ? 'text-slate-700 font-medium' : 'text-slate-400 italic'}>
                          {partner.street || 'Sin dirección registrada en Odoo'}
                        </span>
                      </div>

                      {/* Phone / Email details if available */}
                      {(partner.phone || partner.email || partner.city) && (
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                          {partner.city && (
                            <span>{partner.city}</span>
                          )}
                          {partner.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {partner.phone}
                            </span>
                          )}
                          {partner.email && (
                            <span className="flex items-center gap-1 truncate max-w-[200px]">
                              <Mail className="w-3 h-3 text-slate-400" />
                              {partner.email}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            {selectedPartner ? (
              <span className="text-slate-700 font-medium truncate max-w-xs block">
                Asignando a: <strong className="text-indigo-700 font-bold">{selectedPartner.name}</strong>
              </span>
            ) : (
              <span>Seleccione un contacto de la lista para vincular.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors border border-slate-200 shadow-2xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedPartner}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Guardar Vinculación</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageClienteOdooModal;
