import React from 'react';
import logoCircular from '../assets/logo_circular.png';

function Dashboard({ user }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-slate-800 bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
      <div className="flex flex-col items-center max-w-lg text-center space-y-6">
        <img 
          src={logoCircular} 
          alt="Nutriestación" 
          className="w-24 h-24 object-contain mb-2 opacity-90"
        />
        
        <div className="space-y-2">
          <h1 className="text-3xl font-light tracking-wide text-slate-800">
            Sistema de Operaciones
          </h1>
          <h2 className="text-xl font-semibold tracking-widest text-slate-400 uppercase">
            Nutriestación SAS
          </h2>
        </div>
        
        <div className="h-px w-16 bg-slate-200 my-4"></div>
        
        <p className="text-slate-500 font-medium text-sm">
          Bienvenido, <span className="text-slate-700">{user?.nombre}</span>.
        </p>
        <p className="text-slate-400 text-sm font-light mt-1">
          Por favor, selecciona un módulo del menú lateral para comenzar.
        </p>
      </div>
    </div>
  );
}

export default Dashboard;
