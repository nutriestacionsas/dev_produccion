import React, { useState, useEffect } from 'react';
import { Database, AlertCircle, CheckCircle, RefreshCw, Save } from 'lucide-react';
import { API_BASE_URL } from '../App';

function Settings({ user }) {
  const [odooUrl, setOdooUrl] = useState('');
  const [odooDb, setOdooDb] = useState('');
  const [odooUsername, setOdooUsername] = useState('');
  const [odooPassword, setOdooPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Authorization token
  const token = localStorage.getItem('token');

  const fetchOdooConfig = async () => {
    setLoading(true);
    setFeedback({ type: '', message: '' });
    try {
      const res = await fetch(`${API_BASE_URL}/auth/odoo-config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOdooUrl(data.url || '');
        setOdooDb(data.db || '');
        setOdooUsername(data.username || '');
        setOdooPassword('********');
      } else {
        const errData = await res.json();
        throw new Error(errData.detail || 'Fallo al cargar la configuración de Odoo');
      }
    } catch (err) {
      console.error("Error al cargar configuración de Odoo:", err);
      setFeedback({ type: 'error', message: err.message || 'No se pudo obtener la configuración del servidor.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.rol === 'admin') {
      fetchOdooConfig();
    }
  }, [user]);

  // Safeguard check
  if (!user || user.rol !== 'admin') {
    return (
      <div className="p-5 bg-rose-50 border border-rose-250 rounded-xl text-rose-800 text-sm flex items-center gap-3 shadow-xs">
        <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
        <div>
          <span className="font-semibold block">Acceso Restringido</span>
          <p className="text-rose-600 text-xs mt-0.5">Esta página de configuración es exclusiva para usuarios con rol de administrador.</p>
        </div>
      </div>
    );
  }

  const handleTestConnection = async () => {
    setTesting(true);
    setFeedback({ type: '', message: '' });
    try {
      const response = await fetch(`${API_BASE_URL}/auth/odoo-config/test`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          url: odooUrl,
          db: odooDb,
          username: odooUsername,
          password: odooPassword
        })
      });
      const data = await response.json();
      if (response.ok) {
        setFeedback({ type: 'success', message: '¡Conexión exitosa a Odoo! Las credenciales de conexión son válidas.' });
      } else {
        setFeedback({ type: 'error', message: data.detail || 'Fallo de conexión' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Error de red al intentar conectar con Odoo.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFeedback({ type: '', message: '' });
    try {
      const response = await fetch(`${API_BASE_URL}/auth/odoo-config`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          url: odooUrl,
          db: odooDb,
          username: odooUsername,
          password: odooPassword
        })
      });
      const data = await response.json();
      if (response.ok) {
        setFeedback({ type: 'success', message: 'Configuración guardada y activada correctamente.' });
        // Update input states with the saved database response values
        setOdooUrl(data.url || '');
        setOdooDb(data.db || '');
        setOdooUsername(data.username || '');
        setOdooPassword('********');
      } else {
        setFeedback({ type: 'error', message: data.detail || 'No se pudo guardar la configuración.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Error de red al guardar la configuración.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Configuración del Sistema</h1>
        <p className="text-slate-500 mt-1">
          Administra las conexiones externas, integraciones del ERP Odoo v19 y parámetros globales.
        </p>
      </div>

      {feedback.message && (
        <div className={`p-4 rounded-xl text-sm border flex items-start gap-3 shadow-xs animate-shake ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          )}
          <div>
            <span className="font-bold">
              {feedback.type === 'success' ? 'Operación exitosa' : 'Mensaje del sistema'}
            </span>
            <p className="text-xs mt-0.5 leading-relaxed">{feedback.message}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-xs flex flex-col items-center justify-center min-h-[300px]">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-slate-500 text-sm font-semibold mt-3 animate-pulse">Obteniendo configuración actual...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main settings card */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-5">
              <Database className="w-6 h-6 text-blue-600" />
              <div>
                <h3 className="font-bold text-lg text-slate-800">Conexión a Odoo ERP</h3>
                <p className="text-slate-400 text-xs">Especifica el endpoint XML-RPC y la base de datos de producción.</p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  URL del Servidor Odoo (XML-RPC)
                </label>
                <input
                  type="url"
                  required
                  value={odooUrl}
                  onChange={(e) => setOdooUrl(e.target.value)}
                  placeholder="Ej: http://192.168.1.50:8069 o https://mi-empresa.odoo.com"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-slate-800 placeholder-slate-400 outline-none text-sm transition-all focus:bg-white shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Base de Datos Odoo
                </label>
                <input
                  type="text"
                  required
                  value={odooDb}
                  onChange={(e) => setOdooDb(e.target.value)}
                  placeholder="Ej: dev_produccion"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-slate-800 placeholder-slate-400 outline-none text-sm transition-all focus:bg-white shadow-xs"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Usuario / Email de Odoo
                  </label>
                  <input
                    type="text"
                    required
                    value={odooUsername}
                    onChange={(e) => setOdooUsername(e.target.value)}
                    placeholder="Ej: admin@mi-empresa.com"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-slate-800 placeholder-slate-400 outline-none text-sm transition-all focus:bg-white shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Contraseña / API Key de Odoo
                  </label>
                  <input
                    type="password"
                    required
                    value={odooPassword}
                    onChange={(e) => setOdooPassword(e.target.value)}
                    placeholder="Ej: tu_password_o_api_key"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-slate-800 placeholder-slate-400 outline-none text-sm transition-all focus:bg-white shadow-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing || saving || !odooUrl || !odooDb || !odooUsername || !odooPassword}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-350 text-slate-700 rounded-xl text-sm font-semibold tracking-wide transition-all border border-slate-200 cursor-pointer flex items-center justify-center gap-2"
                >
                  {testing ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                  ) : (
                    "Probar Conexión"
                  )}
                </button>

                <button
                  type="submit"
                  disabled={saving || testing || !odooUrl || !odooDb || !odooUsername || !odooPassword}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white rounded-xl text-sm font-semibold tracking-wide transition-all shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 cursor-pointer flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Guardar Configuración</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Sidebar guidelines card */}
          <div className="bg-slate-55 border border-slate-200 rounded-2xl p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Notas de Integración</h4>
              <ul className="space-y-3 text-xs text-slate-500 leading-relaxed list-disc list-inside">
                <li>
                  <span className="font-semibold text-slate-650">Credenciales de Conexión:</span> Las credenciales de Odoo (`Usuario/Email` y `Clave/API Key`) se pueden configurar dinámicamente desde este panel y se almacenan localmente. El sistema recurre al archivo `.env` si no se definen.
                </li>
                <li>
                  <span className="font-semibold text-slate-650">Modificaciones Dinámicas:</span> Al presionar 'Guardar Configuración', el backend actualizará la base de datos PostgreSQL local y restablecerá el pool de conexión para interactuar instantáneamente con el nuevo servidor Odoo configurado.
                </li>
                <li>
                  <span className="font-semibold text-slate-650">XML-RPC:</span> Asegúrate de que la URL contenga el protocolo correcto (http o https) y el puerto de escucha configurado de Odoo (por defecto, 8069).
                </li>
              </ul>
            </div>
            
            <div className="mt-8 pt-4 border-t border-slate-200/50 text-[10px] text-slate-400 text-center uppercase tracking-widest">
              NutriEstación ERP 19
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
