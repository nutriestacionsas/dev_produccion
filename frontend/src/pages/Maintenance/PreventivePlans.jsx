import React, { useState, useEffect } from 'react';
import { CalendarDays, AlertCircle, Plus, CheckCircle2, Clock, Wrench } from 'lucide-react';
import { API_BASE_URL } from '../../App';

export default function PreventivePlans() {
  const [planes, setPlanes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [newPlan, setNewPlan] = useState({
    equipo_id: '',
    titulo_plan: '',
    frecuencia_dias: 30,
    frecuencia_nombre: 'Mensual',
    duracion_estimada_min: 60,
    responsables_rol: 'técnico',
    proxima_fecha: '',
    tareas: [{ descripcion: '', tipo_respuesta: 'boolean' }]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [planesRes, equiposRes] = await Promise.all([
        fetch(`${API_BASE_URL}/gmao/preventivo/planes`, { headers }),
        fetch(`${API_BASE_URL}/gmao/equipos`, { headers })
      ]);
      
      if (planesRes.ok && equiposRes.ok) {
        setPlanes(await planesRes.json());
        setEquipos(await equiposRes.json());
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/gmao/preventivo/planes`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlan)
      });
      if (res.ok) {
        setShowModal(false);
        fetchData();
      } else {
        alert("Error al crear el plan preventivo");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addTarea = () => {
    setNewPlan({ ...newPlan, tareas: [...newPlan.tareas, { descripcion: '', tipo_respuesta: 'boolean' }] });
  };

  const updateTarea = (index, value) => {
    const tareas = [...newPlan.tareas];
    tareas[index].descripcion = value;
    setNewPlan({ ...newPlan, tareas });
  };

  const getStatusColor = (estado) => {
    switch(estado) {
      case 'OK': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'PRÓXIMO_VENCIMIENTO': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'VENCIDO': return 'bg-rose-100 text-rose-700 border-rose-200 animate-pulse';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto h-[calc(100vh-80px)] overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <CalendarDays className="w-8 h-8 text-amber-500" />
            Mantenimiento Preventivo
          </h1>
          <p className="text-slate-500 font-medium mt-1">Programa y gestiona planes periódicos por equipo</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-colors shadow-md shadow-amber-500/20"
        >
          <Plus className="w-5 h-5" /> Nuevo Plan
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500">Cargando planes...</div>
      ) : planes.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
          <Wrench className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-500">No hay planes preventivos</h3>
          <p className="text-slate-400 mt-2">Crea tu primer plan para automatizar los mantenimientos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {planes.map(plan => {
            const equipo = equipos.find(e => e.id === plan.equipo_id);
            return (
              <div key={plan.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col relative overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <span className="text-xs font-black uppercase text-slate-500 bg-slate-100 px-2 py-1 rounded-md mb-2 inline-block">
                      {equipo?.nombre || 'Equipo Desconocido'}
                    </span>
                    <h3 className="text-lg font-bold text-slate-800 leading-tight">{plan.titulo_plan}</h3>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-black uppercase border ${getStatusColor(plan.estado_vencimiento)}`}>
                    {plan.estado_vencimiento}
                  </div>
                </div>

                <div className="space-y-3 mb-6 flex-1">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Clock className="w-4 h-4 text-slate-400" />
                    Frecuencia: <span className="font-bold text-slate-800">{plan.frecuencia_nombre} ({plan.frecuencia_dias} días)</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    Próxima Ejecución: <span className="font-bold text-slate-800">{plan.proxima_fecha}</span>
                  </div>
                </div>

                <button className="w-full py-3 bg-slate-50 hover:bg-amber-50 text-amber-700 font-bold rounded-xl border border-amber-100 transition-colors">
                  Generar Orden de Trabajo
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Crear Plan */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-t-3xl flex justify-between">
              <h3 className="text-xl font-bold">Crear Plan Preventivo</h3>
              <button onClick={() => setShowModal(false)}><CheckCircle2 className="w-6 h-6"/></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-bold text-slate-700">Equipo *</label>
                  <select required value={newPlan.equipo_id} onChange={e => setNewPlan({...newPlan, equipo_id: parseInt(e.target.value)})}
                    className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none">
                    <option value="">Seleccione equipo</option>
                    {equipos.map(eq => <option key={eq.id} value={eq.id}>{eq.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-700">Título del Plan *</label>
                  <input type="text" required value={newPlan.titulo_plan} onChange={e => setNewPlan({...newPlan, titulo_plan: e.target.value})}
                    className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none" />
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-700">Frecuencia (Días)</label>
                  <input type="number" required value={newPlan.frecuencia_dias} onChange={e => setNewPlan({...newPlan, frecuencia_dias: parseInt(e.target.value)})}
                    className="w-full p-3 bg-slate-50 border rounded-xl outline-none" />
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-700">Próxima Fecha (Arranque) *</label>
                  <input type="date" required value={newPlan.proxima_fecha} onChange={e => setNewPlan({...newPlan, proxima_fecha: e.target.value})}
                    className="w-full p-3 bg-slate-50 border rounded-xl outline-none" />
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-slate-800">Checklist de Tareas</h4>
                  <button type="button" onClick={addTarea} className="text-amber-600 text-sm font-bold flex items-center gap-1">
                    <Plus className="w-4 h-4"/> Añadir tarea
                  </button>
                </div>
                {newPlan.tareas.map((t, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input type="text" placeholder={`Tarea ${idx + 1}`} required value={t.descripcion} onChange={e => updateTarea(idx, e.target.value)}
                      className="w-full p-2 bg-slate-50 border rounded-lg text-sm outline-none" />
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t rounded-b-3xl">
              <button onClick={handleCreatePlan} className="w-full py-3 bg-amber-500 text-white font-bold rounded-xl">
                Guardar Plan Preventivo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
