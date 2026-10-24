import { useState, useEffect } from 'react';
import { 
  X, Plus, Trash2, Check, AlertCircle, RefreshCw, 
  Truck, Hash, ShieldCheck, CheckCircle2, Car
} from 'lucide-react';
import { API_BASE_URL } from '../../App';

const PLACA_REGEX = /^[A-Z0-9]{1,5}-[A-Z0-9]+$/;

const ManagePlacasModal = ({ isOpen, onClose, onPlateAdded, onPlacasUpdated }) => {
  const [placas, setPlacas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Form State
  const [inputPlaca, setInputPlaca] = useState('');
  const [inputDescripcion, setInputDescripcion] = useState('');
  const [formError, setFormError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Función para refrescar placas después de guardar/eliminar
  const refetchPlacas = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/config/placas?solo_activas=false`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar placas');
      const data = await res.json();
      setPlacas(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const token = localStorage.getItem('token');
    fetch(`${API_BASE_URL}/dispatch-cliente/config/placas?solo_activas=false`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (isMounted) setPlacas(data || []);
      })
      .catch(err => console.error(err));

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Validación estricta en tiempo real
  const validatePlaca = (val) => {
    const clean = (val || '').trim().toUpperCase();
    if (!clean) return { valid: false, message: 'Ingrese una placa.' };

    if (!PLACA_REGEX.test(clean)) {
      return { 
        valid: false, 
        message: 'Formato inválido. Ejemplo correcto: ABC-1234 (hasta 5 caracteres, guion y serie).' 
      };
    }

    const parts = clean.split('-');
    if (parts.length !== 2 || parts[1].length < 3) {
      return { 
        valid: false, 
        message: 'Formato inválido. La numeración después del guion debe contener al menos 3 dígitos (ej. ABC-1234 o GS12-098).' 
      };
    }

    return { valid: true, message: null };
  };

  const validationState = validatePlaca(inputPlaca);
  const isInputValid = validationState.valid;

  // Manejo de input con auto-mayúsculas y máscara amigable
  const handlePlacaChange = (e) => {
    let val = e.target.value.toUpperCase();
    
    // Auto-formato amigable: si el usuario escribe 3-4 letras y luego números sin guion, insertar guion
    // Ej: "ABC1234" -> "ABC-1234"
    if (!val.includes('-') && val.length >= 4) {
      const match = val.match(/^([A-Z0-9]{2,4})([0-9].*)$/);
      if (match) {
        val = `${match[1]}-${match[2]}`;
      }
    }

    setInputPlaca(val);
    setFormError(null);
  };

  // Enviar nueva placa al backend
  const handleAddPlaca = async (e) => {
    e.preventDefault();
    const cleanPlaca = inputPlaca.trim().toUpperCase();

    const check = validatePlaca(cleanPlaca);
    if (!check.valid) {
      setFormError(check.message);
      return;
    }

    try {
      setSaving(true);
      setFormError(null);
      setSuccessMsg(null);
      const token = localStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/config/placas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          placa: cleanPlaca,
          descripcion_vehiculo: inputDescripcion.trim() || null,
          activo: true
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Error al guardar la placa');
      }

      const newPlateData = await res.json();
      setSuccessMsg(`Placa ${cleanPlaca} registrada con éxito`);
      setInputPlaca('');
      setInputDescripcion('');

      await refetchPlacas();

      if (onPlacasUpdated) {
        onPlacasUpdated();
      }

      if (onPlateAdded) {
        onPlateAdded(newPlateData.placa);
      }

    } catch (err) {
      console.error(err);
      setFormError(err.message || 'Error al registrar la placa');
    } finally {
      setSaving(false);
    }
  };

  // Eliminar o alternar estado
  const handleDeletePlaca = async (id, placaNum) => {
    if (!window.confirm(`¿Está seguro de eliminar la placa ${placaNum}?`)) {
      return;
    }

    try {
      setDeletingId(id);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/dispatch-cliente/config/placas/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Error al eliminar');

      await refetchPlacas();
      if (onPlacasUpdated) onPlacasUpdated();
    } catch (err) {
      alert(err.message || 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">Administración de Placas</h2>
                <span className="px-2 py-0.5 rounded-md bg-blue-500/30 text-blue-200 text-[10px] font-black uppercase tracking-wider border border-blue-400/30">
                  {placas.length} Registradas
                </span>
              </div>
              <p className="text-xs text-blue-100 font-medium">
                Catálogo de placas vehiculares con formato estricto para Guías de Remisión.
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

        {/* Content Body */}
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-6">
          
          {/* Formulario de Registro de Nueva Placa */}
          <form onSubmit={handleAddPlaca} className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-3.5 shadow-xs">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              Registrar Nueva Placa
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Input Placa */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número de Placa <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={inputPlaca}
                    onChange={handlePlacaChange}
                    placeholder="Ej. PBX-1234"
                    maxLength={12}
                    className={`w-full pl-9 pr-8 py-2 bg-white border rounded-xl text-sm font-black tracking-wider uppercase transition-all focus:outline-none focus:ring-2 ${
                      inputPlaca.trim()
                        ? isInputValid
                          ? 'border-emerald-400 focus:ring-emerald-500/20 text-slate-800'
                          : 'border-rose-300 focus:ring-rose-500/20 text-rose-700'
                        : 'border-slate-200 focus:ring-blue-500/20 text-slate-800'
                    }`}
                  />
                  {inputPlaca.trim() && (
                    <div className="absolute right-2.5 top-2.5">
                      {isInputValid ? (
                        <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Formato: <span className="font-mono font-bold text-slate-600">ABC-1234</span> o <span className="font-mono font-bold text-slate-600">GS12-098</span>
                </p>
              </div>

              {/* Input Descripción */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Descripción del Vehículo <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <div className="relative">
                  <Car className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={inputDescripcion}
                    onChange={(e) => setInputDescripcion(e.target.value)}
                    placeholder="Ej. Camión Blanco 3.5T"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Error or Success notification */}
            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Action Button */}
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={saving || !inputPlaca.trim() || !isInputValid}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Guardar Placa</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Listado de Placas Registradas */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center justify-between">
              <span>Placas Registradas ({placas.length})</span>
            </h3>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span className="text-xs font-semibold">Cargando catálogo...</span>
              </div>
            ) : placas.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-400">
                <Hash className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-bold text-slate-600">No hay placas registradas</p>
                <p className="text-[11px] mt-0.5">Utilice el formulario superior para registrar la primera placa.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs max-h-64 overflow-y-auto custom-scrollbar">
                {placas.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 px-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1 rounded-lg bg-slate-900 text-white font-mono font-black text-xs tracking-wider border border-slate-700 shadow-xs">
                        {p.placa}
                      </div>

                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {p.descripcion_vehiculo || 'Sin descripción'}
                        </p>
                        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-500" />
                          Habilitada para Guías
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeletePlaca(p.id, p.placa)}
                        disabled={deletingId === p.id}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Eliminar placa"
                      >
                        {deletingId === p.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-500" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold rounded-xl text-xs transition-colors shadow-xs"
          >
            Listo / Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};

export default ManagePlacasModal;
