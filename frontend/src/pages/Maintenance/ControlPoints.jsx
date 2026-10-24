import React from 'react';
import { Target } from 'lucide-react';

export default function ControlPoints() {
  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto text-center">
      <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Target className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-black text-slate-800 tracking-tight">Puntos de Control Crítico</h1>
      <p className="text-slate-500 font-medium">Módulo en construcción (Fase 4)</p>
    </div>
  );
}
