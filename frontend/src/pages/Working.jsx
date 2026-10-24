import React from 'react';
import { Settings, Wrench, Construction } from 'lucide-react';

const Working = () => {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-slate-800 bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
      <div className="relative mb-6">
        <div className="absolute -inset-4 bg-blue-100 rounded-full animate-ping opacity-25"></div>
        <div className="relative bg-blue-50 text-blue-600 p-6 rounded-full border-4 border-white shadow-lg">
          <Wrench className="w-16 h-16 animate-bounce" />
        </div>
      </div>
      <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-3 text-center">
        Estamos trabajando en este proceso
      </h2>
      <p className="text-slate-500 text-center max-w-md text-sm md:text-base">
        Este módulo se encuentra actualmente en desarrollo y estará disponible muy pronto. ¡Gracias por tu paciencia!
      </p>
    </div>
  );
};

export default Working;
