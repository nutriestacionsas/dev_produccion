import React, { useState, useEffect } from 'react';
import { Settings, Plus, Search, MapPin, Tag, QrCode, X, Camera, AlertCircle, Save, Paperclip, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../../App';
import { QRCodeCanvas } from 'qrcode.react';
import logoCircular from '../../assets/logo_circular.png';

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [dbCategorias, setDbCategorias] = useState([]);
  const [dbUbicaciones, setDbUbicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [qrAsset, setQrAsset] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(null); // 'categoria' | 'ubicacion' | null
  
  const [newAsset, setNewAsset] = useState({
    codigo_activo: '',
    nombre: '',
    categoria: '',
    marca: '',
    modelo: '',
    numero_serie: '',
    ubicacion_planta: '',
    criticidad_proceso: 'Media',
    estado: 'Operativo'
  });
  const [previewCode, setPreviewCode] = useState('');
  const [documentFile, setDocumentFile] = useState(null);
  const [newConfigItem, setNewConfigItem] = useState('');

  const criticidades = ['Baja', 'Media', 'Alta', 'Crítica'];
  const estados = ['Operativo', 'En Preventivo', 'En Falla', 'Fuera de Servicio'];

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchNextCode = async (categoria) => {
    if (!categoria) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/gmao/equipos/next-code?categoria=${encodeURIComponent(categoria)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewCode(data.next_code);
        setNewAsset(prev => ({...prev, codigo_activo: data.next_code}));
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (showCreateModal && newAsset.categoria) {
      fetchNextCode(newAsset.categoria);
    }
  }, [newAsset.categoria, showCreateModal]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [resEq, resCat, resUb] = await Promise.all([
        fetch(`${API_BASE_URL}/gmao/equipos`, { headers }),
        fetch(`${API_BASE_URL}/gmao/categorias`, { headers }),
        fetch(`${API_BASE_URL}/gmao/ubicaciones`, { headers })
      ]);
      
      if (resEq.ok) setAssets(await resEq.json());
      if (resCat.ok) {
        const catData = await resCat.json();
        setDbCategorias(catData);
        if (catData.length > 0 && !newAsset.categoria) {
          setNewAsset(prev => ({...prev, categoria: catData[0].nombre}));
        }
      }
      if (resUb.ok) {
        const ubData = await resUb.json();
        setDbUbicaciones(ubData);
        if (ubData.length > 0 && !newAsset.ubicacion_planta) {
          setNewAsset(prev => ({...prev, ubicacion_planta: ubData[0].nombre}));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAsset = async (e) => {
    e.preventDefault();
    if (!newAsset.categoria || !newAsset.ubicacion_planta) {
      alert("Debes crear y seleccionar una Categoría y una Ubicación primero.");
      return;
    }
    
    // Clean up empty strings to be null if preferred, or leave as empty strings
    const payload = { ...newAsset };
    if (!payload.marca) payload.marca = "No especificado";
    if (!payload.modelo) payload.modelo = "No especificado";
    if (!payload.numero_serie) payload.numero_serie = "No especificado";

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/gmao/equipos`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Error al crear activo');
      }
      const createdAsset = await res.json();
      
      // Upload file if selected
      if (documentFile) {
        const formData = new FormData();
        formData.append("file", documentFile);
        await fetch(`${API_BASE_URL}/gmao/equipos/${createdAsset.id}/upload-documento`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
      }
      
      setShowCreateModal(false);
      fetchInitialData();
      setNewAsset({
        codigo_activo: '', nombre: '', categoria: dbCategorias[0]?.nombre || '',
        marca: '', modelo: '', numero_serie: '', ubicacion_planta: dbUbicaciones[0]?.nombre || '',
        criticidad_proceso: 'Media', estado: 'Operativo'
      });
      setDocumentFile(null);
    } catch (err) {
      alert(err.message);
    }
  };

  // Lógica de Configuración (Categorías y Ubicaciones)
  const addConfigItem = async () => {
    if (!newConfigItem.trim()) return;
    try {
      const token = localStorage.getItem('token');
      const endpoint = showConfigModal === 'categoria' ? '/gmao/categorias' : '/gmao/ubicaciones';
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: newConfigItem.trim() })
      });
      if (res.ok) {
        setNewConfigItem('');
        fetchInitialData();
      } else {
        alert("Error, probablemente ya existe.");
      }
    } catch (err) { console.error(err); }
  };

  const deleteConfigItem = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const endpoint = showConfigModal === 'categoria' ? `/gmao/categorias/${id}` : `/gmao/ubicaciones/${id}`;
      await fetch(`${API_BASE_URL}${endpoint}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      fetchInitialData();
    } catch (err) { console.error(err); }
  };
  const filteredAssets = assets.filter(a => 
    a.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (a.codigo_activo && a.codigo_activo.toLowerCase().includes(searchTerm.toLowerCase())) ||
    a.categoria.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.ubicacion_planta.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto h-[calc(100vh-80px)] overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <Settings className="w-8 h-8 text-blue-600" />
            Equipos y Activos
          </h1>
          <p className="text-slate-500 font-medium mt-1">Inventario técnico, hojas de vida y códigos QR.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={() => setShowCreateModal(true)} className="flex-1 md:flex-none flex justify-center items-center gap-2 px-5 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20">
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Nuevo Activo</span>
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
        <Search className="w-6 h-6 text-slate-400" />
        <input 
          type="text"
          placeholder="Buscar por nombre, código, categoría o ubicación..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 outline-none text-slate-700 font-bold text-lg bg-transparent"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="p-1 text-slate-400 hover:text-rose-500 rounded-full">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Grid de Activos */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
          <Settings className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-500">No se encontraron equipos</h3>
          <p className="text-slate-400 mt-2">Prueba buscando con otro término o registra uno nuevo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
          {filteredAssets.map(asset => (
            <div key={asset.id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden flex flex-col">
              <div className={`absolute top-0 left-0 w-1.5 h-full ${
                asset.estado === 'Operativo' ? 'bg-emerald-500' : 
                asset.estado === 'En Falla' ? 'bg-rose-500' : 
                asset.estado === 'En Preventivo' ? 'bg-amber-500' : 'bg-slate-500'
              }`}></div>
              
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 px-2.5 py-1 rounded-lg">
                  {asset.codigo_activo}
                </span>
                <div className="flex gap-1">
                  {asset.documento_adjunto && (
                    <button title="Ver Documento" onClick={() => window.open(`${API_BASE_URL}/${asset.documento_adjunto.replace('uploads/', '')}`, '_blank')} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
                      <Paperclip className="w-5 h-5" />
                    </button>
                  )}
                  <button title="Imprimir Código QR" onClick={() => setQrAsset(asset)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                    <QrCode className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <h3 className="font-extrabold text-slate-800 text-xl leading-tight mb-4 flex-1">{asset.nombre}</h3>
              
              <div className="space-y-2.5 mt-auto text-sm font-medium text-slate-600 bg-slate-50 p-4 rounded-2xl">
                <div className="flex items-center gap-3">
                  <Tag className="w-4 h-4 text-slate-400" />
                  <span className="truncate">{asset.categoria}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span className="truncate">{asset.ubicacion_planta}</span>
                </div>
                <div className="flex items-center gap-3">
                  <AlertCircle className={`w-4 h-4 ${
                    asset.estado === 'Operativo' ? 'text-emerald-500' : 
                    asset.estado === 'En Falla' ? 'text-rose-500' : 'text-amber-500'
                  }`} />
                  <span className={`font-bold ${
                    asset.estado === 'Operativo' ? 'text-emerald-600' : 
                    asset.estado === 'En Falla' ? 'text-rose-600' : 'text-amber-600'
                  }`}>{asset.estado}</span>
                </div>
              </div>

              <button className="w-full mt-4 py-3 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 font-bold rounded-xl transition-colors text-sm">
                Ver Hoja de Vida
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear Activo */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scale-up">
            <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex justify-between items-center shrink-0">
              <h3 className="text-xl font-black flex items-center gap-2">
                <Settings className="w-6 h-6" /> Registro de Activo
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <form id="create-asset-form" onSubmit={handleCreateAsset} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Fila 1: Categoría y Ubicación primero */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Categoría *</label>
                    <div className="flex items-center gap-2">
                      <select required value={newAsset.categoria} onChange={(e) => setNewAsset({...newAsset, categoria: e.target.value})}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
                        {dbCategorias.length === 0 && <option value="">Crear categoría primero...</option>}
                        {dbCategorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                      </select>
                      <button type="button" onClick={() => setShowConfigModal('categoria')} className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors">
                        <Settings className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Ubicación *</label>
                    <div className="flex items-center gap-2">
                      <select required value={newAsset.ubicacion_planta} onChange={(e) => setNewAsset({...newAsset, ubicacion_planta: e.target.value})}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
                        {dbUbicaciones.length === 0 && <option value="">Crear ubicación primero...</option>}
                        {dbUbicaciones.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                      </select>
                      <button type="button" onClick={() => setShowConfigModal('ubicacion')} className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors">
                        <Settings className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Fila 2: Nombre y Código visible */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>Nombre del Equipo *</span>
                      <span className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-medium">CÓDIGO ASIGNADO:</span>
                        <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md font-black tracking-widest">{previewCode}</span>
                      </span>
                    </label>
                    <input type="text" required
                      placeholder="Ej. Horno Convencional 1"
                      value={newAsset.nombre} onChange={(e) => setNewAsset({...newAsset, nombre: e.target.value})}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>

                  {/* Resto de campos opcionales */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Marca (Opcional)</label>
                    <input type="text" placeholder="Ej. Rational"
                      value={newAsset.marca} onChange={(e) => setNewAsset({...newAsset, marca: e.target.value})}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Modelo (Opcional)</label>
                    <input type="text" placeholder="Ej. SCC 101"
                      value={newAsset.modelo} onChange={(e) => setNewAsset({...newAsset, modelo: e.target.value})}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Número de Serie (Opcional)</label>
                    <input type="text" placeholder="S/N..."
                      value={newAsset.numero_serie} onChange={(e) => setNewAsset({...newAsset, numero_serie: e.target.value})}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Nivel de Criticidad</label>
                    <select value={newAsset.criticidad_proceso} onChange={(e) => setNewAsset({...newAsset, criticidad_proceso: e.target.value})}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
                      {criticidades.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Campo de Archivo */}
                  <div className="space-y-1.5 md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-slate-400" />
                      Documento Adjunto / Foto (Opcional)
                    </label>
                    <input type="file" onChange={(e) => setDocumentFile(e.target.files[0])}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                  </div>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end gap-3">
              <button type="button" onClick={() => setShowCreateModal(false)}
                className="px-6 py-3 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
                Cancelar
              </button>
              <button type="submit" form="create-asset-form"
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-extrabold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20">
                <Save className="w-5 h-5" /> Guardar Activo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal CRUD Categorias/Ubicaciones */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm flex flex-col overflow-hidden shadow-2xl animate-scale-up">
            <div className="px-6 py-4 bg-slate-800 text-white flex justify-between items-center">
              <h3 className="font-bold">Gestionar {showConfigModal === 'categoria' ? 'Categorías' : 'Ubicaciones'}</h3>
              <button onClick={() => setShowConfigModal(null)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <input type="text" placeholder="Nuevo elemento..." value={newConfigItem} onChange={e => setNewConfigItem(e.target.value)}
                  className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={addConfigItem} className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar">
                {(showConfigModal === 'categoria' ? dbCategorias : dbUbicaciones).map(item => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="font-bold text-slate-700">{item.nombre}</span>
                    <button onClick={() => deleteConfigItem(item.id)} className="text-slate-400 hover:text-rose-500 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Scanner QR -> Convertido a Modal Imprimir QR */}
      {qrAsset && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[110] flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl relative flex flex-col">
            <div className="px-6 py-4 bg-slate-800 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2"><QrCode className="w-5 h-5" /> Etiqueta QR</h3>
              <button onClick={() => setQrAsset(null)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 flex flex-col items-center bg-white" id="qr-print-area">
              <div className="text-center mb-4">
                <h4 className="font-black text-xl text-slate-800">{qrAsset.codigo_activo}</h4>
                <p className="text-sm text-slate-500 font-medium">{qrAsset.nombre}</p>
              </div>
              
              <div className="p-4 border-4 border-slate-800 rounded-2xl bg-white">
                <QRCodeCanvas 
                  value={qrAsset.codigo_activo}
                  size={200}
                  level={"H"}
                  includeMargin={false}
                  imageSettings={{
                    src: logoCircular,
                    height: 48,
                    width: 48,
                    excavate: true,
                  }}
                />
              </div>
              <p className="text-xs font-bold text-slate-400 mt-4 uppercase tracking-widest">Nutriestación GMAO</p>
            </div>

            <div className="p-4 bg-slate-50 flex gap-3 border-t border-slate-100">
              <button onClick={() => setQrAsset(null)} className="flex-1 py-3 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={() => {
                const printContent = document.getElementById('qr-print-area').innerHTML;
                const originalContent = document.body.innerHTML;
                document.body.innerHTML = `<div style="display: flex; justify-content: center; align-items: center; height: 100vh; padding: 20px;">${printContent}</div>`;
                window.print();
                document.body.innerHTML = originalContent;
                window.location.reload();
              }} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors">
                Imprimir QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
