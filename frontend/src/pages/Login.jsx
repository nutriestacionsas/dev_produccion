import React, { useState } from 'react';
import { Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import { API_BASE_URL } from '../App';
import logoVertical from '../assets/logo_vertical.png';
import logoCircular from '../assets/logo_circular.png';
import cateringBg from '../assets/catering_bg.png';

function Login({ setToken }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);



  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Error al iniciar sesión');
      }

      setToken(data.access_token);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      
      {/* Visual Cover Side (Hidden on Mobile) */}
      <div 
        className="hidden md:flex md:w-1/2 lg:w-3/5 relative bg-cover bg-center flex-col justify-between p-12 text-white overflow-hidden"
        style={{ backgroundImage: `url(${cateringBg})` }}
      >
        {/* Soft elegant overlay to darken just enough for high readability */}
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/80 via-slate-900/40 to-slate-950/20 z-0" />
        
        {/* Subtle decorative circles */}
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-2xl z-0" />
        <div className="absolute -bottom-10 -right-10 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl z-0" />

        <div className="relative z-10" />

        {/* Glassmorphism description card */}
        <div className="relative z-10 backdrop-blur-md bg-white/10 border border-white/15 p-8 rounded-2xl max-w-lg shadow-2xl flex flex-col gap-5 mt-auto">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 backdrop-blur-xs rounded-2xl p-2 flex items-center justify-center border border-white/20 shrink-0">
              <img src={logoCircular} className="w-10 h-10 object-contain" alt="Icono Circular" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Catering Empresarial</h2>
              <p className="text-blue-300 text-xs font-semibold uppercase tracking-wider">Gestión Integrada con Odoo ERP 19</p>
            </div>
          </div>
          
          <p className="text-slate-200 text-sm leading-relaxed">
            Plataforma centralizada para la optimización de planificación de menús, control exacto de pesaje con taras en despacho y conciliación de inventarios físicos en bodega.
          </p>

          <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4 mt-2">
            <div className="text-center border-r border-white/10">
              <div className="text-white font-bold text-base">Odoo 19</div>
              <div className="text-[10px] text-slate-300 uppercase font-semibold">Sincronizado</div>
            </div>
            <div className="text-center">
              <div className="text-white font-bold text-base">Plan</div>
              <div className="text-[10px] text-slate-300 uppercase font-semibold">Automático</div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Side */}
      <div className="w-full md:w-1/2 lg:w-2/5 bg-white flex items-center justify-center p-8 relative">
        <div className="w-full max-w-md flex flex-col">
          
          {/* Header Logo */}
          <div className="text-center mb-8">
            <img 
              src={logoVertical} 
              className="h-28 object-contain mx-auto mb-4 hover:scale-102 transition-transform duration-300" 
              alt="Logo NutriEstación" 
            />
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Portal de Operaciones</h1>
            <p className="text-slate-400 text-xs mt-1">Control de Producción y Bodega</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 text-sm animate-shake">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Error de autenticación</span>
                <p className="text-rose-600 text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Usuario o Correo
              </label>
              <div className="relative group">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <User className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ingresa tu usuario de Odoo o local"
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-slate-800 placeholder-slate-400 outline-none text-sm transition-all duration-200 focus:bg-white shadow-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Contraseña
              </label>
              <div className="relative group">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-slate-800 placeholder-slate-400 outline-none text-sm transition-all duration-200 focus:bg-white shadow-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white rounded-xl text-sm font-semibold tracking-wide transition-all shadow-md shadow-blue-500/10 hover:shadow-blue-500/25 active:scale-[0.99] mt-3 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Odoo 19 notice */}
          <div className="mt-12 text-center border-t border-slate-100 pt-6 flex flex-col items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">
              Autenticado vía Odoo ERP v19
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}

export default Login;


