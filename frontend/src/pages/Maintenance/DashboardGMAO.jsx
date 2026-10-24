import React from 'react';
import { Activity } from 'lucide-react';

export default function DashboardGMAO() {
  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto text-center">
      <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Activity className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-black text-slate-800 tracking-tight">Analytics y KPIs GMAO</h1>
      <p className="text-slate-500 font-medium">Módulo en construcción (Fase 5)</p>
    </div>
  );
}
