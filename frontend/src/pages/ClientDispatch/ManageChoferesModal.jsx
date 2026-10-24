import { useState, useEffect } from 'react';
import { 
  X, Search, UserCheck, UserX, Check, AlertCircle, 
  RefreshCw, CheckCircle2, SlidersHorizontal, Users
} from 'lucide-react';
import { API_BASE_URL } from '../../App';

const ManageChoferesModal = ({ isOpen, onClose, onSaved }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyActiveFilter, setOnlyActiveFilter] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Cargar choferes de Odoo cruzados con PostgreSQL
  useEffect(() => {
    if (!isOpen) return;

    const fetchChoferes = async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccessMsg(null);
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/dispatch-cliente/config/choferes-odoo`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          throw new Error('No se pudo obtener la lista de contactos de Odoo.');
        }

        const data = await res.json();
        setContacts(data || []);
      } catch (err) {
        console.error(err);
        setError(err.message || 'Error de conexión');
      } finally {
        setLoading(false);
      }
    };

    fetchChoferes();
  }, [isOpen]);

  // Toggle individual
  const handleToggle = (id) => {
    setContacts(prev => prev.map(c => {
      if (c.id === id) {
        return { ...c, activo: !c.activo };
      }
      return c;
    }));
  };

  // Habilitar todos los que coinciden con la búsqueda actual
  const handleEnableFiltered = () => {
    const filteredIds = new Set(filteredContacts.map(c => c.id));
    setContacts(prev => prev.map(c => {
      if (filteredIds.has(c.id)) {
        return { ...c, activo: true };
      }
      return c;
    }));
  };

  // Deshabilitar todos los que coinciden con la búsqueda actual
  const handleDisableFiltered = () => {
    const filteredIds = new Set(filteredContacts.map(c => c.id));
    setContacts(prev => prev.map(c => {
      if (filteredIds.has(c.id)) {
        return { ...c, activo: false };
      }
      return c;
    }));
  };

  // Filtrado de contactos derivado
  const q = search.trim().toLowerCase();
  const filteredContacts = contacts.filter(c => {
    if (onlyActiveFilter && !c.activo) return false;
    if (!q) return true;
    const name = (c.name || '').toLowerCase();
    const vat = String(c.vat || '').toLowerCase();
    const street = String(c.street || '').toLowerCase();
    return name.includes(q) || vat.includes(q) || street.includes(q);
  });

  const activeCount = contacts.filter(c => c.activo).length;

  // Guardar cambios en el backend
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);
      const token = localStorage.getItem('token');

      // Enviamos el mapeo de todos los choferes
      const payload = contacts.map(c => ({
        odoo_partner_id: c.id,
        nombre_chofer: c.name,
        activo: Boolean(c.activo)
      }));

      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/config/choferes-habilitados`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Error al guardar los choferes habilitados.');
      }

      const resData = await res.json();
      setSuccessMsg(`¡Preferencias guardadas! (${resData.total_activos} choferes habilitados)`);

      if (onSaved) {
        onSaved();
      }

      setTimeout(() => {
        onClose();
      }, 700);

    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">Administrar Choferes Autorizados</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold border border-emerald-400/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  {activeCount} de {contacts.length} habilitados
                </span>
              </div>
              <p className="text-xs text-blue-100 font-medium">
                Seleccione únicamente los contactos autorizados para despachar en la Guía de Remisión.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, CI/RUC..."
              className="w-full pl-10 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setOnlyActiveFilter(!onlyActiveFilter)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                onlyActiveFilter 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {onlyActiveFilter ? 'Viendo solo habilitados' : 'Filtrar habilitados'}
            </button>

            <button
              type="button"
              onClick={handleEnableFiltered}
              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
              title="Habilitar los choferes mostrados actualmente"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Habilitar Visibles</span>
            </button>

            <button
              type="button"
              onClick={handleDisableFiltered}
              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
              title="Deshabilitar los choferes mostrados actualmente"
            >
              <UserX className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Desmarcar Visibles</span>
            </button>
          </div>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-700 text-xs font-bold">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-700 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Contacts List */}
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm font-semibold">Cargando lista de contactos desde Odoo...</p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-600">No se encontraron choferes</p>
              <p className="text-xs mt-1">Pruebe ajustando los términos de búsqueda o desactive los filtros.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {filteredContacts.map((c) => {
                const isChecked = Boolean(c.activo);
                const initial = (c.name || 'C').charAt(0).toUpperCase();

                return (
                  <div
                    key={c.id}
                    onClick={() => handleToggle(c.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group select-none ${
                      isChecked 
                        ? 'bg-blue-50/70 border-blue-300 shadow-xs' 
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 transition-colors ${
                        isChecked 
                          ? 'bg-blue-600 text-white shadow-xs' 
                          : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                      }`}>
                        {initial}
                      </div>

                      <div className="truncate">
                        <p className={`text-xs font-black truncate leading-tight ${
                          isChecked ? 'text-blue-950' : 'text-slate-800'
                        }`}>
                          {c.name || `Contacto #${c.id}`}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {c.vat ? (
                            <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-bold">
                              CI/RUC: {c.vat}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Sin CI/RUC</span>
                          )}
                          {c.street && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                              {c.street}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <div className="shrink-0 flex items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(c.id);
                        }}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                          isChecked ? 'bg-blue-600' : 'bg-slate-200'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform flex items-center justify-center ${
                            isChecked ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 text-blue-600 stroke-[3]" />}
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            Mostrando <span className="font-bold text-slate-800">{filteredContacts.length}</span> de <span className="font-bold text-slate-800">{contacts.length}</span> contactos ({activeCount} habilitados)
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold rounded-xl text-xs transition-colors"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Guardar Preferencias</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ManageChoferesModal;
