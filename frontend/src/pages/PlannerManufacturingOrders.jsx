import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import DatePicker, { registerLocale } from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

registerLocale('es', es);
import { 
  Upload, 
  Settings, 
  Users, 
  Trash, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  FileSpreadsheet, 
  PlusCircle, 
  X, 
  Loader2, 
  Building,
  CheckCircle2,
  Calendar,
  Clock,
  BookOpen,
  CalendarRange,
  Pencil,
  MoreVertical,
  AlertTriangle,
  Check,
  RefreshCw,
  Database,
  Factory,
  Warehouse,
  ChefHat,
  Utensils
} from 'lucide-react';
import { API_BASE_URL } from '../App';
import logoCircular from '../assets/logo_circular.png';
// Helper to parse Spanish dates like "FECHA: LUNES, 22 DE JUNIO DE 2026"
function SearchableSelect({ options, value, onChange, placeholder = "-- Selecciona --", className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      const selectedOpt = options.find(o => o.value === value);
      setSearch(selectedOpt ? selectedOpt.label : (value || ""));
    }
  }, [value, isOpen, options]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const safeSearch = (search || "").toString().toLowerCase();
  const filtered = options.filter(opt =>
    (opt.label || opt.value || "").toString().toLowerCase().includes(safeSearch)
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={search}
          placeholder={placeholder}
          onFocus={() => {
            setIsOpen(true);
            setSearch("");
          }}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-xs font-bold text-slate-700 outline-none pr-8 cursor-pointer shadow-3xs"
        />
        <span 
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer select-none"
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto divide-y divide-slate-50">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400 font-bold italic">
              No hay coincidencias
            </div>
          ) : (
            filtered.map((opt) => (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setSearch(opt.label);
                  setIsOpen(false);
                }}
                className={`px-3 py-2 text-xs font-bold cursor-pointer transition-colors ${
                  value === opt.value
                    ? "bg-blue-50 text-blue-700 font-extrabold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function parseSpanishDate(dateStr) {
  if (!dateStr) return null;
  const clean = dateStr
    .replace(/FECHA:\s*/i, "")
    .replace(/LUNES|MARTES|MIERCOLES|MIÉRCOLES|JUEVES|VIERNES|SABADO|SÁBADO|DOMINGO/i, "")
    .replace(/,/, "")
    .trim();
  
  const parts = clean.split(/\s+/);
  // Expected structure: ["22", "de", "junio", "de", "2026"]
  const months = {
    enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
    julio: "07", agosto: "08", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12"
  };
  
  let day = "";
  let month = "";
  let year = "";
  
  if (parts.length >= 5) {
    day = parts[0];
    month = months[parts[2].toLowerCase()] || "";
    year = parts[4];
  } else {
    const match = clean.match(/(\d+)\s+de\s+([a-zA-ZáéíóúÁÉÍÓÚ]+)\s+de\s+(\d+)/i);
    if (match) {
      day = match[1];
      month = months[match[2].toLowerCase()] || "";
      year = match[3];
    }
  }
  
  if (day && month && year) {
    return `${year}-${month}-${day.padStart(2, "0")}`;
  }
  return null;
}

const getMonthYearKey = (dateStr) => {
  if (!dateStr) return '';
  const [year, month] = dateStr.split('-');
  return `${year}-${month}`;
};

function PlannerManufacturingOrders({ user }) {
  const token = localStorage.getItem('token');

  // Core states
  const [productionDays, setProductionDays] = useState([]);
  // sectors state removed
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successToast, setSuccessToast] = useState('');
  const [activeDateStr, setActiveDateStr] = useState(() => new Date().toLocaleDateString('en-CA'));

  // Auto-clear error after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => { setError(''); }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Auto-clear success toast after 5 seconds
  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => { setSuccessToast(''); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  // Auto-scroll to active day block on data load or date switch
  useEffect(() => {
    if (activeDateStr) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`day-block-${activeDateStr}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeDateStr, productionDays]);
  

  // MenuType tabs inside the expanded date
  const [activeTabs, setActiveTabs] = useState({}); // dateStr -> menuTypeId (or 'general')

  // Modals
  // showSectorModal state removed
  const [showClientModal, setShowClientModal] = useState(false);
    const [showParamsModal, setShowParamsModal] = useState(false);
  const [paramsModalData, setParamsModalData] = useState(null);
  const [savingParams, setSavingParams] = useState(false);
  const [modalF1, setModalF1] = useState('');
  const [modalF2, setModalF2] = useState('');
  const [modalMs, setModalMs] = useState('');
  const [modalTotal, setModalTotal] = useState('');
  const [modalJugo2, setModalJugo2] = useState('');
  
  // New entry states
  // newSectorName state removed
  const [newClientName, setNewClientName] = useState('');
  const [newClientType, setNewClientType] = useState('porcentaje');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Manual order states
  const [recipes, setRecipes] = useState([]);
  const [changeDishModalOpen, setChangeDishModalOpen] = useState(false);
  const [changeDishItem, setChangeDishItem] = useState(null);
  const [changeDishCategory, setChangeDishCategory] = useState('');
  const [changeDishSearch, setChangeDishSearch] = useState('');
                        const [showSelectionsModal, setShowSelectionsModal] = useState(false);
            const [isLockedContext, setIsLockedContext] = useState(false);
    const [showManageModal, setShowManageModal] = useState(false);
  const [manageDayRecord, setManageDayRecord] = useState(null);
  const [savingManage, setSavingManage] = useState(false);
  const [localManageItems, setLocalManageItems] = useState(null);
  const [isSavingManage, setIsSavingManage] = useState(false);

  // Nuevo Cliente Excel Modal States
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientTurnoId, setNewClientTurnoId] = useState('');
  const [newClientMenuId, setNewClientMenuId] = useState('');
  const [newClientUploading, setNewClientUploading] = useState(false);
  const newClientFileInputRef = useRef(null);

  // Nueva Producción Modal States
  const [showNewProductionModal, setShowNewProductionModal] = useState(false);
  const [newProdStep, setNewProdStep] = useState(1); // 1 = datos, 2 = confirmar & enviar
  const [newProdName, setNewProdName] = useState('');
  const [newProdDate, setNewProdDate] = useState('');
  const [newProdShift, setNewProdShift] = useState('');
  const [newProdMenuType, setNewProdMenuType] = useState('');
  const [newProdClient, setNewProdClient] = useState('');
  const [newProdQty, setNewProdQty] = useState('');
  const [newProdMaterials, setNewProdMaterials] = useState([]);
  const [isSavingNewProd, setIsSavingNewProd] = useState(false);
  const [newProdError, setNewProdError] = useState('');

  // MO Detail Modal States
  const [moDetailModal, setMoDetailModal] = useState(null); // { loading, data, error, moName }
  useEffect(() => {
    if (showManageModal && manageDayRecord) {
      setLocalManageItems(JSON.parse(JSON.stringify(manageDayRecord.items)));
    } else {
      setLocalManageItems(null);
    }
  }, [showManageModal, manageDayRecord]);

  // New excel upload preview states
  const [tempImportItems, setTempImportItems] = useState([]);
  const [showImportPreviewModal, setShowImportPreviewModal] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [previewAssignments, setPreviewAssignments] = useState({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');

  // New turnos & tipos de menú states
  const [shifts, setShifts] = useState([]);
  const [menuTypes, setMenuTypes] = useState([]);

  const [showAddClientToDayModal, setShowAddClientToDayModal] = useState(false);
  const [addClientToDayRecord, setAddClientToDayRecord] = useState(null);
  const [selectedClientToAdd, setSelectedClientToAdd] = useState('');
  const [savingAddClient, setSavingAddClient] = useState(false);

  const [showRemoveClientModal, setShowRemoveClientModal] = useState(false);
  const [removeClientData, setRemoveClientData] = useState({ cliente: '', fechaInicio: '', fechaFin: '' });
  const [isRemovingClient, setIsRemovingClient] = useState(false);

  const handleAddClientToDay = async () => {
    if (!addClientToDayRecord || !selectedClientToAdd) return;
    setSavingAddClient(true);
    try {
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/days/${addClientToDayRecord.id}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ cliente_nombre: selectedClientToAdd })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al agregar el cliente");
      }
      await fetchData();
      setShowAddClientToDayModal(false);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setSavingAddClient(false);
    }
  };

  const [showAddPlateModal, setShowAddPlateModal] = useState(false);
  const [addPlateDayRecord, setAddPlateDayRecord] = useState(null);
  const [newPlateTipo, setNewPlateTipo] = useState('SOPA');
  const [newPlateNombre, setNewPlateNombre] = useState('');
  const [savingNewPlate, setSavingNewPlate] = useState(false);
  const [modalManualQty, setModalManualQty] = useState({});
  const [mathModalOpen, setMathModalOpen] = useState(false);
  const [mathModalData, setMathModalData] = useState({ client: null, item: null, qty: 0, recordId: null });
  const [mathOperation, setMathOperation] = useState('+');
  const [mathInputValue, setMathInputValue] = useState('');
  const [savingMath, setSavingMath] = useState(false);
  const [applyToFuture, setApplyToFuture] = useState(false);

  const handleCellClick = (c, item, currentCant, record) => {
    setMathModalData({ client: c, item: item, qty: currentCant, recordId: record?.id });
    setMathOperation('+');
    setMathInputValue('');
    setApplyToFuture(false);
    setMathModalOpen(true);
  };

  const handleMathOperationSave = async () => {
    if (!mathModalData.item || !mathInputValue) return;
    const inputStr = mathInputValue.toString().replace(',', '.');
    const inputVal = parseFloat(inputStr);
    if (isNaN(inputVal)) return;

    let newQty = parseFloat(mathModalData.qty) || 0;
    switch (mathOperation) {
      case '+': newQty += inputVal; break;
      case '-': newQty -= inputVal; break;
      case '*': newQty *= inputVal; break;
      case '/': newQty = newQty / inputVal; break;
    }
    
    // Round to integer and prevent negative
    newQty = Math.round(newQty);
    if (isNaN(newQty) || newQty < 0) newQty = 0;

    setSavingMath(true);
    try {
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/items/update-math-qty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          item_id: mathModalData.item.id,
          cliente_nombre: mathModalData.client,
          new_cant: newQty,
          reset: false,
          operation: mathOperation,
          operation_value: inputVal,
          apply_to_future: applyToFuture,
          dia_id: mathModalData.recordId
        })
      });
      if (!res.ok) throw new Error('Error al actualizar cantidad');
      
      if (applyToFuture) {
        await fetchData();
        setMathModalOpen(false);
        setSuccessToast(`Cantidades actualizadas para este y futuros días.`);
        setTimeout(() => setSuccessToast(''), 3000);
      } else {
        // Update immutably to trigger re-render
        const updatedDays = productionDays.map(d => ({
          ...d,
          items: d.items.map(it => {
          if (it.id === mathModalData.item.id) {
             const newCantidades = { ...it.cantidades_clientes };
             const clientData = { ...newCantidades[mathModalData.client] };
             if (clientData.base_cant === undefined) {
                 clientData.base_cant = clientData.cant || 0;
             }
             clientData.cant = newQty;
             newCantidades[mathModalData.client] = clientData;
             const total = Object.values(newCantidades).reduce((acc, cObj) => acc + (cObj.cant || 0), 0);
             return { ...it, cantidades_clientes: newCantidades, total };
          }
          return it;
        })
      }));
      setProductionDays(updatedDays);
      setMathModalOpen(false);
      setSuccessToast(`Cantidad actualizada correctamente a ${newQty}.`);
      setTimeout(() => setSuccessToast(''), 3000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingMath(false);
    }
  };

  const handleMathOperationReset = async () => {
    if (!mathModalData.item) return;

    setSavingMath(true);
    try {
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/items/update-math-qty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          item_id: mathModalData.item.id,
          cliente_nombre: mathModalData.client,
          new_cant: 0,
          reset: true,
          apply_to_future: applyToFuture,
          dia_id: mathModalData.recordId
        })
      });
      if (!res.ok) throw new Error('Error al restablecer cantidad');
      
      if (applyToFuture) {
        await fetchData();
        setMathModalOpen(false);
        setSuccessToast(`Cantidades restablecidas para este y futuros días.`);
        setTimeout(() => setSuccessToast(''), 3000);
      } else {
        // Update immutably
        const updatedDays = productionDays.map(d => ({
          ...d,
          items: d.items.map(it => {
          if (it.id === mathModalData.item.id) {
             const newCantidades = { ...it.cantidades_clientes };
             const clientData = { ...newCantidades[mathModalData.client] };
             if (clientData.base_cant !== undefined) {
                 clientData.cant = clientData.base_cant;
                 delete clientData.base_cant;
             }
             newCantidades[mathModalData.client] = clientData;
             const total = Object.values(newCantidades).reduce((acc, cObj) => acc + (cObj.cant || 0), 0);
             return { ...it, cantidades_clientes: newCantidades, total };
          }
          return it;
        })
      }));
      setProductionDays(updatedDays);
      setMathModalOpen(false);
      setSuccessToast(`Cantidad restablecida a su valor original.`);
      setTimeout(() => setSuccessToast(''), 3000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingMath(false);
    }
  };

  const handleAddPlateToDay = async () => {
    if (!addPlateDayRecord || !newPlateNombre || !newPlateTipo) return;
    setSavingNewPlate(true);
    try {
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/days/${addPlateDayRecord.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ plato_nombre: newPlateNombre, tipo: newPlateTipo })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al agregar el plato");
      }
      await fetchData();
      setShowAddPlateModal(false);
      setNewPlateNombre('');
      setNewPlateTipo('SOPA');
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setSavingNewPlate(false);
    }
  };

  const [showOdooSyncModal, setShowOdooSyncModal] = useState(false);
  const [selectedSyncMonths, setSelectedSyncMonths] = useState([]);
  const [selectedOdooDays, setSelectedOdooDays] = useState({});
  const [syncingOdooProducts, setSyncingOdooProducts] = useState(false);
  const [odooSyncResult, setOdooSyncResult] = useState(null);
  const [expandedOdooYears, setExpandedOdooYears] = useState({});
  
  // Odoo Multi-step Sync Wizard States
  const [odooSyncStep, setOdooSyncStep] = useState(1);
  const [odooMoResults, setOdooMoResults] = useState([]);
  const [step2Confirmed, setStep2Confirmed] = useState(false);
  const [syncingOdooMOs, setSyncingOdooMOs] = useState(false);
  const [replenishingOdooInsumos, setReplenishingOdooInsumos] = useState(false);
  const [replenishResults, setReplenishResults] = useState(null);
  const [updatingOdooDayId, setUpdatingOdooDayId] = useState(null);

  const getOdooSpecialTitle = (dia) => {
    if (!dia || !dia.fecha) return '';
    const [year, month, day] = dia.fecha.split('-');
    const yy = year.substring(2);
    const menuName = (dia.tipo_menu && dia.tipo_menu.nombre ? dia.tipo_menu.nombre.toUpperCase() : 'SIN MENU').trim();
    return `${menuName} ${day}${month}${yy}`;
  };

  const handleSafeCloseOdooModal = () => {
    if (odooSyncStep > 1 && odooSyncStep < 4) {
      if (!window.confirm("Al salir de este modal o cerrarlo antes de completar todos los pasos se dañará el flujo del proceso de sincronización con Odoo. ¿Estás seguro de que deseas salir?")) {
        return;
      }
    }
    setShowOdooSyncModal(false);
    setOdooSyncStep(1);
    setSelectedSyncMonths([]);
    setSelectedOdooDays({});
    setOdooSyncResult(null);
    setOdooMoResults([]);
    setStep2Confirmed(false);
    setReplenishResults(null);
  };

  const handleUpdateOdooDay = async (record) => {
    const hasSync = !!record.odoo_product_id;
    const confirmMsg = hasSync
      ? "Esta acción cancelará y eliminará las órdenes de fabricación anteriores en Odoo para este día, actualizará la Lista de Materiales (BoM) con las nuevas cantidades y volverá a generar el reabastecimiento en Odoo. ¿Deseas continuar?"
      : "¿Deseas sincronizar este día con Odoo creando el producto, la Lista de Materiales (BoM), la Orden de Fabricación y el reabastecimiento?";

    if (!window.confirm(confirmMsg)) {
      return;
    }
    setUpdatingOdooDayId(record.id);
    try {
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/actualizar-dia-odoo`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ dia_id: record.id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Error al sincronizar en Odoo");
      }
      if (data.mo_id) {
        fetchData();
      }
      alert(data.message || "Día sincronizado exitosamente en Odoo.");
    } catch (err) {
      console.error("Error updating Odoo day:", err);
      alert(err.message || "Error al conectar con el servidor.");
    } finally {
      setUpdatingOdooDayId(null);
    }
  };

  const handleToggleSendDispatch = async (dia_id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/days/${dia_id}/send-dispatch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al cambiar estado de despacho.");
      }
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const handleBatchOdooSync = async () => {
    const mDays = productionDays.filter(d => selectedSyncMonths.includes(getMonthYearKey(d.fecha)));
    const selectedList = mDays.filter(d => selectedOdooDays[d.id]);
    
    if (selectedList.length === 0) {
      alert("Selecciona al menos una orden de fabricación para sincronizar.");
      return;
    }
    
    setSyncingOdooProducts(true);
    setOdooSyncResult(null);
    try {
      const payload = {
        products: selectedList.map(d => ({
          special_title: getOdooSpecialTitle(d),
          dia_id: d.id
        }))
      };
      
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/crear-productos-odoo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al sincronizar productos con Odoo");
      }
      
      const data = await res.json();
      setOdooSyncResult(data.results || []);
      await fetchData(); // Refresh data to update local odoo_product_ids
      
      // Transition to Step 2 of the wizard
      setOdooSyncStep(2);
      setStep2Confirmed(false);
    } catch (err) {
      console.error(err);
      alert(err.message || "Error de conexión al sincronizar con Odoo");
    } finally {
      setSyncingOdooProducts(false);
    }
  };

  const handleCreateOdooMOs = async () => {
    const mDays = productionDays.filter(d => selectedSyncMonths.includes(getMonthYearKey(d.fecha)));
    const selectedList = mDays.filter(d => selectedOdooDays[d.id]);
    
    setSyncingOdooMOs(true);
    try {
      const payload = {
        items: selectedList.map(d => ({
          special_title: getOdooSpecialTitle(d),
          dia_id: d.id
        }))
      };
      
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/crear-ordenes-fabricacion-odoo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al crear órdenes de fabricación en Odoo.");
      }
      
      const data = await res.json();
      setOdooMoResults(data.results || []);
      setOdooSyncStep(3);
    } catch (err) {
      console.error(err);
      alert(err.message || "Error de conexión al confirmar órdenes de fabricación.");
    } finally {
      setSyncingOdooMOs(false);
    }
  };

  const handleReplenishOdooComponents = async () => {
    const mDays = productionDays.filter(d => selectedSyncMonths.includes(getMonthYearKey(d.fecha)));
    const selectedList = mDays.filter(d => selectedOdooDays[d.id]);
    
    setReplenishingOdooInsumos(true);
    try {
      const payload = {
        items: selectedList.map(d => ({
          special_title: getOdooSpecialTitle(d),
          dia_id: d.id
        }))
      };
      
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/reabastecer-componentes-odoo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al reabastecer componentes en Odoo.");
      }
      
      const data = await res.json();
      setReplenishResults(data.results || []);
      setOdooSyncStep(4);
    } catch (err) {
      console.error(err);
      alert(err.message || "Error de conexión al reabastecer componentes.");
    } finally {
      setReplenishingOdooInsumos(false);
    }
  };

  const [editingItemId, setEditingItemId] = useState(null);
  const [updatingItemId, setUpdatingItemId] = useState(null);
  const [activeMenuForItemId, setActiveMenuForItemId] = useState(null);

  const handleDeleteItemPlate = async (itemId, plateName) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el plato "${plateName}" de la planificación? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/items/${itemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al eliminar el plato");
      }
      await fetchData();
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  const getMatchingRecipesForItem = (item) => {
    if (!item || !item.tipo) return [];
    const tipo = item.tipo.trim().toUpperCase().replace("Ó", "O");
    
    return recipes.filter(r => {
      if (!r.categ_name) return false;
      const cat = r.categ_name.toUpperCase();
      
      if (tipo === "SOPA") {
        return cat.includes("SOPA");
      }
      if (tipo === "FUERTE #1") {
        return cat.includes("FUERTE TIPO 1") || cat.includes("DESAYUNO TIPO 1");
      }
      if (tipo === "FUERTE #2") {
        return cat.includes("FUERTE TIPO 2");
      }
      if (tipo === "ARROZ") {
        return cat.includes("ARROCES");
      }
      if (tipo === "JUGO #1" || tipo === "JUGO #2" || tipo === "AGUA SABORIZADA") {
        return cat.includes("JUGOS");
      }
      if (tipo === "POSTRE") {
        return cat.includes("POSTRES");
      }
      if (tipo === "GUARNICION #1") {
        return cat.includes("GUARNICIONES");
      }
      if (tipo === "GUARNICION #2") {
        return cat.includes("GUARNICION TIPO 2");
      }
      if (tipo === "GUARNICION SALUDABLE") {
        return cat.includes("SALUDABLE") || cat.includes("GUARNICION") || cat.includes("ENSALADA");
      }
      if (tipo === "MENU SALUDABLE") {
        return cat.includes("SALUDABLE") || cat.includes("MENU");
      }
      if (tipo.startsWith("ADEREZO")) {
        return cat.includes("ADEREZOS");
      }
      return false;
    }).sort((a, b) => a.nombre.localeCompare(b.nombre));
  };

  const handleUpdateItemPlate = async (itemId, newPlateNombre) => {
    if (!newPlateNombre) return;
    setUpdatingItemId(itemId);
    try {
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ plato_nombre: newPlateNombre })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al actualizar el plato");
      }
      await fetchData();
      setEditingItemId(null);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const getRecipeCostLabel = (platoNombre) => {
    if (user?.rol !== 'admin') return null;
    const rObj = recipes.find(r => r.nombre === platoNombre);
    if (!rObj) return null;
    const cost = rObj.bom_cost != null ? rObj.bom_cost : 0;
    return (
      <span className="ml-2 inline-block text-[10px] font-black text-emerald-650 bg-emerald-50 border border-emerald-100 rounded-md px-1.5 py-0.5">
        ${cost.toFixed(2)}
      </span>
    );
  };
  const [showShiftsModal, setShowShiftsModal] = useState(false);
  const [showMenuTypesModal, setShowMenuTypesModal] = useState(false);
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftHours, setNewShiftHours] = useState('');
  const [newMenuTypeName, setNewMenuTypeName] = useState('');
  const [savingShift, setSavingShift] = useState(false);
  const [savingMenuType, setSavingMenuType] = useState(false);

  // Accordion of Months state: open/closed status for each month (e.g. '2026-06' -> true/false)
  const [expandedMonths, setExpandedMonths] = useState({});
  const [activeShiftTab, setActiveShiftTab] = useState('none');
  const [activeMenuTypesByDate, setActiveMenuTypesByDate] = useState({});

  useEffect(() => {
    if (shifts.length > 0 && activeShiftTab === 'none') {
      setActiveShiftTab(shifts[0].id.toString());
    }
  }, [shifts]);

  useEffect(() => {
    if (productionDays.length > 0) {
      const filtered = productionDays.filter(dia => {
        if (activeShiftTab === 'none') {
          return !dia.turno_id;
        } else {
          return dia.turno_id === Number(activeShiftTab);
        }
      });
      if (filtered.length > 0) {
        // Use functional update to check the absolute latest activeDateStr
        setActiveDateStr(currentActive => {
          const exists = filtered.some(dia => dia.fecha === currentActive);
          let targetDate = currentActive;
          
          if (!exists) {
            const todayStr = new Date().toISOString().split('T')[0];
            const hasToday = filtered.some(dia => dia.fecha === todayStr);
            if (hasToday) {
              targetDate = todayStr;
            } else {
              const sorted = [...filtered].sort((a, b) => b.fecha.localeCompare(a.fecha));
              targetDate = sorted[0].fecha;
            }
          }
          
          // Auto-expand the month that contains targetDate
          if (targetDate) {
            const monthKey = getMonthYearKey(targetDate);
            setExpandedMonths(prev => ({ ...prev, [monthKey]: true }));
          }
          
          return targetDate;
        });
      }
    }
  }, [activeShiftTab, productionDays]);

  useEffect(() => {
    if (paramsModalData) {
      let f1 = paramsModalData.f1Val;
      let f2 = paramsModalData.f2Val;
      if (paramsModalData.clientType === 'porcentaje') {
        f1 = Math.round(f1 / 5) * 5;
        f2 = 100 - f1;
      }
      setModalF1(f1.toString());
      setModalF2(f2.toString());
      setModalMs(paramsModalData.msVal.toString());
      setModalTotal(paramsModalData.totalVal ? paramsModalData.totalVal.toString() : '0');
      setModalJugo2(paramsModalData.jugo2Val ? paramsModalData.jugo2Val.toString() : '0');

      const manualQtys = {};
      const items = paramsModalData.items || [];
      items.forEach(item => {
        if (item.cantidades_clientes && item.cantidades_clientes.__manual_qty__ === true) {
          const qty = item.cantidades_clientes[paramsModalData.clientName]?.cant || 0;
          manualQtys[item.id] = qty.toString();
        }
      });
      setModalManualQty(manualQtys);
    }
  }, [paramsModalData]);

  // Fetch all initial data
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // Sectors fetch removed

      // 2. Get Clients
      const cliRes = await fetch(`${API_BASE_URL}/planner/clientes`, { headers });
      if (!cliRes.ok) throw new Error("Error cargando clientes");
      const cliData = await cliRes.json();
      setClients(cliData);

      // 3. Get Imported Production
      const prodRes = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion`, { headers });
      if (!prodRes.ok) throw new Error("Error cargando órdenes de fabricación");
      const prodData = await prodRes.json();
      setProductionDays(prodData);

      // 4. Get Active Recipes
      const recRes = await fetch(`${API_BASE_URL}/recipes/?active_only=true`, { headers });
      if (recRes.ok) {
        const recData = await recRes.json();
        setRecipes(recData);
      }

      // 4b. Get Turnos
      const shRes = await fetch(`${API_BASE_URL}/planner/turnos`, { headers });
      if (shRes.ok) {
        const shData = await shRes.json();
        setShifts(shData);
      }

      // 4c. Get Tipos de Menú
      const mtRes = await fetch(`${API_BASE_URL}/planner/tipos-menu`, { headers });
      if (mtRes.ok) {
        const mtData = await mtRes.json();
        setMenuTypes(mtData);
      }

      // 5. Check for pending temporary imports in DB
      const tempRes = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/importacion-temporal`, { headers });
      if (tempRes.ok) {
        const tempData = await tempRes.json();
        if (tempData && tempData.length > 0) {
          setTempImportItems(tempData);
          setShowImportPreviewModal(true);
        }
      }

      // Preserve currently active date if it exists, otherwise set default (closest to today)
      if (prodData.length > 0) {
        setActiveDateStr(currentActive => {
          const exists = prodData.some(d => d.fecha === currentActive);
          if (exists) return currentActive;
          
          const todayStr = new Date().toISOString().split('T')[0];
          const closest = prodData.find(d => d.fecha === todayStr) || prodData[0];
          return closest.fecha;
        });
      }
      return prodData;
    } catch (err) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Excel Upload Handler (Server-side parsing, temporary DB storage, cleanup, and modal preview)
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError('');
    setPreviewAssignments({}); // Clear any previous assignments

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/cargar-excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Error al cargar el archivo en el servidor.");
      }

      // Obtener los datos reservados de la base de datos
      const tempRes = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/importacion-temporal`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!tempRes.ok) {
        throw new Error("Error al obtener la vista previa de la importación reservada.");
      }

      const tempItems = await tempRes.json();
      setTempImportItems(tempItems);
      setShowImportPreviewModal(true);
    } catch (err) {
      alert(err.message || 'Error al procesar la subida del Excel.');
      setError(err.message || 'Error al procesar el archivo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleNewClientUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !newClientTurnoId || !newClientMenuId) return;

    setNewClientUploading(true);
    setError('');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('turno_id', newClientTurnoId);
      formData.append('menu_tipo_id', newClientMenuId);

      const response = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/cargar-cliente-excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Error al procesar el archivo Excel del nuevo cliente.");
      }

      setSuccessToast(data.message || "Cliente añadido exitosamente.");
      setShowNewClientModal(false);
      
      // Clear inputs
      setNewClientTurnoId('');
      setNewClientMenuId('');
      if (newClientFileInputRef.current) newClientFileInputRef.current.value = '';
      
      // Refrescar los datos
      fetchData();
    } catch (err) {
      alert(err.message || 'Error al procesar la subida del Excel para nuevo cliente.');
      setError(err.message || 'Error al procesar el archivo.');
    } finally {
      setNewClientUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    setConfirmingImport(true);
    try {
      const response = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/confirmar-importacion`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ asignaciones: previewAssignments })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Error al confirmar la importación.");
      }

      const res = await response.json();
      setSuccessModalMessage(`Se han guardado de forma permanente las órdenes de producción para ${res.fechas.length} fecha(s) en la base de datos.`);
      setShowSuccessModal(true);
      setShowImportPreviewModal(false);
      setTempImportItems([]);
      setPreviewAssignments({});
      fetchData();
    } catch (err) {
      alert(err.message || "Error al confirmar la importación.");
    } finally {
      setConfirmingImport(false);
    }
  };

  const handleGlobalTurnoChange = (turnoId) => {
    const nextAsg = {};
    const dateKeys = Array.from(new Set(tempImportItems.map(item => item.fecha)));
    dateKeys.forEach(fecha => {
      nextAsg[fecha] = {
        ...previewAssignments[fecha],
        turno_id: turnoId
      };
    });
    setPreviewAssignments(prev => ({
      ...prev,
      ...nextAsg
    }));
  };

  const handleGlobalMenuTypeChange = (menuTypeId) => {
    const nextAsg = {};
    const dateKeys = Array.from(new Set(tempImportItems.map(item => item.fecha)));
    dateKeys.forEach(fecha => {
      nextAsg[fecha] = {
        ...previewAssignments[fecha],
        tipo_menu_id: menuTypeId
      };
    });
    setPreviewAssignments(prev => ({
      ...prev,
      ...nextAsg
    }));
  };

  const handleSaveParams = async () => {
    if (!paramsModalData) return;
    setSavingParams(true);
    try {
      const { fecha, clientName, clientType, f1Val, f2Val, msVal, totalVal, jugo2Val, tipoMenuId, turnoId } = paramsModalData;
      
      const numF1 = Number(modalF1) || 0;
      const numF2 = Number(modalF2) || 0;
      const numMs = Number(modalMs) || 0;
      const numTotal = Number(modalTotal) || 0;
      const numJugo2 = Number(modalJugo2) || 0;

      if (clientType === 'porcentaje') {
        const totalChanged = numTotal !== totalVal;
        const jugo2Changed = numJugo2 !== jugo2Val;
        
        // Percentage client: update F1%, F2% and client total via /update-pct and MS qty via /update-ms
        if (numF1 !== f1Val || totalChanged || jugo2Changed) {
          const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/update-pct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              fecha,
              cliente_nombre: clientName,
              tipo: 'FUERTE #1',
              nuevo_porcentaje: numF1,
              total_cantidad: totalChanged ? numTotal : null,
              jugo2_cantidad: jugo2Changed ? numJugo2 : null,
              tipo_menu_id: tipoMenuId ? Number(tipoMenuId) : null,
              turno_id: turnoId ? Number(turnoId) : null
            })
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Error al actualizar Fuerte 1 / Total / Jugo #2");
          }
        }

        if (numF2 !== f2Val) {
          const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/update-pct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              fecha,
              cliente_nombre: clientName,
              tipo: 'FUERTE #2',
              nuevo_porcentaje: numF2,
              tipo_menu_id: tipoMenuId ? Number(tipoMenuId) : null,
              turno_id: turnoId ? Number(turnoId) : null
            })
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Error al actualizar Fuerte 2");
          }
        }

        if (numMs !== msVal) {
          const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/update-ms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              fecha,
              cliente_nombre: clientName,
              ms_cantidad: numMs,
              tipo_menu_id: tipoMenuId ? Number(tipoMenuId) : null,
              turno_id: turnoId ? Number(turnoId) : null
            })
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Error al actualizar Menú Saludable");
          }
        }
      } else {
        // Quantity client: update all via /update-qty
        const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/update-qty`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            fecha,
            cliente_nombre: clientName,
            f1_cantidad: numF1,
            f2_cantidad: numF2,
            ms_cantidad: numMs,
            jugo2_cantidad: numJugo2,
            tipo_menu_id: tipoMenuId ? Number(tipoMenuId) : null,
            turno_id: turnoId ? Number(turnoId) : null
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Error al actualizar cantidades");
        }
      }

      // Save manual quantities
      const customQtyEntries = Object.entries(modalManualQty);
      if (customQtyEntries.length > 0) {
        const manualPayload = {
          cliente_nombre: clientName,
          quantities: {}
        };
        customQtyEntries.forEach(([itemId, val]) => {
          manualPayload.quantities[Number(itemId)] = Number(val) || 0;
        });
        
        const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/items/update-manual-quantities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(manualPayload)
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Error al guardar cantidades manuales");
        }
      }

      setShowParamsModal(false);
      setParamsModalData(null);
      fetchData();
    } catch (err) {
      alert(err.message || "Error al guardar parámetros");
    } finally {
      setSavingParams(false);
    }
  };

  const handleDiscardImport = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/descartar-importacion`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Error al descartar la importación.");
      }

      setShowImportPreviewModal(false);
      setTempImportItems([]);
      setPreviewAssignments({});
    } catch (err) {
      alert(err.message || "Error al descartar la importación.");
    }
  };

  const handleVaciarPlanificacion = async () => {
    if (!window.confirm("¿Estás absolutamente seguro de que deseas eliminar TODA la planificación actual? Esta acción no se puede deshacer y borrará permanentemente todos los días, platos y cantidades planificadas de forma local.")) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/vaciar-planificacion`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Error al vaciar la planificación.");
      }
      
      alert("Planificación vaciada exitosamente.");
      fetchData(); // Reload productionDays list
    } catch (err) {
      console.error("Error al vaciar planificación:", err);
      alert(err.message || "Error de red al vaciar la planificación.");
    }
  };

  const handleDeletePlanificacionDia = async (diaId) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar la planificación para este menú y turno específicos? Esta acción no se puede deshacer y borrará permanentemente sus platos y cantidades planificadas de forma local.")) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/${diaId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Error al eliminar la planificación.");
      }
      
      setSuccessToast("Planificación eliminada exitosamente.");
      fetchData(); // Reload productionDays list
    } catch (err) {
      console.error("Error al eliminar planificación:", err);
      alert(err.message || "Error de red al eliminar la planificación.");
    }
  };

  const handleRemoveClientBulk = async (e) => {
    e.preventDefault();
    if (!removeClientData.cliente || !removeClientData.fechaInicio || !removeClientData.fechaFin) {
      alert("Por favor selecciona un cliente y un rango de fechas válido.");
      return;
    }
    
    if (new Date(removeClientData.fechaFin) < new Date(removeClientData.fechaInicio)) {
      alert("La fecha final debe ser mayor o igual a la fecha inicial.");
      return;
    }

    if (!window.confirm(`¿Estás seguro que deseas eliminar al cliente ${removeClientData.cliente} de TODOS los días desde ${removeClientData.fechaInicio} hasta ${removeClientData.fechaFin}?`)) {
      return;
    }

    setIsRemovingClient(true);
    try {
      const response = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/quitar-cliente`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          cliente_nombre: removeClientData.cliente,
          fecha_inicio: removeClientData.fechaInicio,
          fecha_fin: removeClientData.fechaFin
        })
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Error al quitar cliente.");
      }
      
      alert(result.message || "Cliente quitado exitosamente.");
      setShowRemoveClientModal(false);
      setRemoveClientData({ cliente: '', fechaInicio: '', fechaFin: '' });
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.message || "Error al quitar cliente masivamente.");
    } finally {
      setIsRemovingClient(false);
    }
  };

  // Turnos & TiposMenu Handlers
  const handleAddShift = async (e) => {
    e.preventDefault();
    if (!newShiftName.trim() || !newShiftHours.trim()) return;

    setSavingShift(true);
    try {
      const response = await fetch(`${API_BASE_URL}/planner/turnos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nombre: newShiftName.trim(),
          franja_horaria: newShiftHours.trim()
        })
      });
      if (response.ok) {
        setNewShiftName('');
        setNewShiftHours('');
        fetchData();
      } else {
        const err = await response.json();
        alert(err.detail || "Error al crear turno");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al crear turno");
    } finally {
      setSavingShift(false);
    }
  };

  const handleDeleteShift = async (shiftId) => {
    if (!confirm("¿Está seguro de eliminar este turno?")) return;
    try {
      const response = await fetch(`${API_BASE_URL}/planner/turnos/${shiftId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchData();
      } else {
        const err = await response.json();
        alert(err.detail || "Error al eliminar turno");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al eliminar turno");
    }
  };

  const handleAddMenuType = async (e) => {
    e.preventDefault();
    if (!newMenuTypeName.trim()) return;

    setSavingMenuType(true);
    try {
      const response = await fetch(`${API_BASE_URL}/planner/tipos-menu`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nombre: newMenuTypeName.trim()
        })
      });
      if (response.ok) {
        setNewMenuTypeName('');
        fetchData();
      } else {
        const err = await response.json();
        alert(err.detail || "Error al crear tipo de menú");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al crear tipo de menú");
    } finally {
      setSavingMenuType(false);
    }
  };

  const handleDeleteMenuType = async (menuTypeId) => {
    if (!confirm("¿Está seguro de eliminar este tipo de menú?")) return;
    try {
      const response = await fetch(`${API_BASE_URL}/planner/tipos-menu/${menuTypeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchData();
      } else {
        const err = await response.json();
        alert(err.detail || "Error al eliminar tipo de menú");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al eliminar tipo de menú");
    }
  };

  const handleAssignShiftAndMenu = async (ordenDiaId, turnoId, tipoMenuId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/${ordenDiaId}/asignacion`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          turno_id: turnoId ? Number(turnoId) : null,
          tipo_menu_id: tipoMenuId ? Number(tipoMenuId) : null
        })
      });
      if (response.ok) {
        fetchData();
      } else {
        const err = await response.json();
        alert(err.detail || "Error al guardar asignación");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al guardar asignación");
    }
  };

  // Cliente CRUD Handlers
  const handleCreateClient = async (name, tipo) => {
    try {
      const response = await fetch(`${API_BASE_URL}/planner/clientes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nombre: name, tipo })
      });
      if (response.ok) {
        fetchData();
      } else {
        const err = await response.json();
        alert(err.detail || "Error al crear cliente");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al crear cliente");
    }
  };

  const handleUpdateClientType = async (clientId, tipo) => {
    try {
      const response = await fetch(`${API_BASE_URL}/planner/clientes/${clientId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tipo })
      });
      if (response.ok) {
        fetchData();
      } else {
        const err = await response.json();
        alert(err.detail || "Error al actualizar tipificación");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al actualizar tipificación");
    }
  };

  const handleUpdateClientPct = async (fecha, clientName, tipo, newPct, tipoMenuId, turnoId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/update-pct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fecha,
          cliente_nombre: clientName,
          tipo,
          nuevo_porcentaje: Number(newPct),
          tipo_menu_id: tipoMenuId ? Number(tipoMenuId) : null,
          turno_id: turnoId ? Number(turnoId) : null
        })
      });
      if (response.ok) {
        fetchData();
      } else {
        const err = await response.json();
        alert(err.detail || "Error al actualizar porcentaje");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al actualizar porcentaje");
    }
  };

  const handleUpdateClientQty = async (fecha, clientName, f1Qty, f2Qty, msQty, tipoMenuId, turnoId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/update-qty`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fecha,
          cliente_nombre: clientName,
          f1_cantidad: Number(f1Qty),
          f2_cantidad: Number(f2Qty),
          ms_cantidad: Number(msQty),
          tipo_menu_id: tipoMenuId ? Number(tipoMenuId) : null,
          turno_id: turnoId ? Number(turnoId) : null
        })
      });
      if (response.ok) {
        fetchData();
      } else {
        const err = await response.json();
        alert(err.detail || "Error al actualizar cantidades");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al actualizar cantidades");
    }
  };

  const handleUpdateClientMs = async (fecha, clientName, msQty, tipoMenuId, turnoId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/update-ms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fecha,
          cliente_nombre: clientName,
          ms_cantidad: Number(msQty),
          tipo_menu_id: tipoMenuId ? Number(tipoMenuId) : null,
          turno_id: turnoId ? Number(turnoId) : null
        })
      });
      if (response.ok) {
        fetchData();
      } else {
        const err = await response.json();
        alert(err.detail || "Error al actualizar menú saludable");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al actualizar menú saludable");
    }
  };


  const handleDeleteClient = async (clientName) => {
    if (!confirm(`¿Estás seguro de eliminar por completo al cliente "${clientName}"? Se borrarán todas sus raciones asignadas de todas las fechas y su mapeo de tipo de menú.`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/planner/clientes/${encodeURIComponent(clientName)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchData();
      } else {
        const err = await response.json();
        alert(err.detail || "Error al eliminar cliente");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al eliminar cliente");
    }
  };

  const isFuerte = (tipo) => {
    const t = (tipo || '').toUpperCase().trim();
    return t === "FUERTE #1" || t === "FUERTE #2" || t === "MENU SALUDABLE" || t === "MENÚ SALUDABLE";
  };



  const handleRecipeChange = (recipeName) => {
    setManualPlato(recipeName);
    // Find recipe object to guess type
    const recipeObj = recipes.find(r => r.nombre === recipeName);
    let guessedType = "FUERTE #1";
    if (recipeObj) {
      const category = (recipeObj.categ_name || '').toUpperCase().trim();
      const name = recipeName.toUpperCase();
      if (category.includes("SOPA") || category.includes("CALDO") || name.includes("CALDO") || name.includes("CREMA") || name.includes("SOPA")) {
        guessedType = "SOPA";
      } else if (category.includes("ARROZ") || name.includes("ARROZ")) {
        guessedType = "ARROZ";
      } else if (category.includes("ENSALADA") || category.includes("GUARNICION") || category.includes("GUARNICIÓ") || name.includes("ENSALADA")) {
        guessedType = category.includes("SALUDABLE") ? "GUARNICIÓN SALUDABLE" : "GUARNICION #2";
      } else if (category.includes("SALUDABLE") || name.includes("SALUDABLE")) {
        guessedType = "MENÚ SALUDABLE";
      } else if (category.includes("POSTRE") || name.includes("POSTRE")) {
        guessedType = "POSTRE";
      } else if (category.includes("JUGO") || name.includes("JUGO") || name.includes("LIMONADA")) {
        guessedType = "JUGO";
      }
    }
    setManualTipo(guessedType);
  };

  const handleOpenManageModalForDay = (record) => {
    setManageDayRecord(record);
    setShowManageModal(true);
  };

  const handleDeleteDay = async (record) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la planificación completa del día ${getFormatDateTitle(record.fecha)}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/${record.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al eliminar la planificación");
      }
      if (activeDateStr === record.fecha) {
        setActiveDateStr('');
      }
      await fetchData();
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  const handleNewProductionSubmit = async (e) => {
    e.preventDefault();
    setNewProdError('');
    if (!newProdName || !newProdDate || newProdMaterials.length === 0) {
      setNewProdError("Por favor completa el nombre, la fecha y agrega al menos un ingrediente/receta.");
      return;
    }
    if (newProdStep === 1) {
      // Go to step 2: show summary before sending
      setNewProdStep(2);
      return;
    }

    // Step 2: actually submit to Odoo
    setIsSavingNewProd(true);
    try {
      const payload = {
        nombre: newProdName,
        fecha: newProdDate,
        turno: newProdShift,
        tipo_menu: newProdMenuType,
        cliente_nombre: newProdClient,
        cantidad: parseInt(newProdQty, 10) || 1,
        materiales: newProdMaterials.map(m => ({ product_id: m.odoo_product_id, qty: parseFloat(m.qty), nombre: m.nombre || '', tipo: m.tipo || '' }))
      };

      const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/nueva-produccion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || "Error al crear la producción");
      }

      // Automágicamente sincronizar Odoo con este nuevo día/evento
      if (data.dia_id) {
        try {
          await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/actualizar-dia-odoo`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ dia_id: data.dia_id })
          });
        } catch (syncErr) {
          console.error("Error al sincronizar Odoo automáticamente:", syncErr);
        }
      }
      
      // Reset all states and close
      const savedDate = newProdDate;
      setShowNewProductionModal(false);
      setNewProdStep(1);
      setNewProdName('');
      setNewProdDate('');
      setNewProdShift('');
      setNewProdMenuType('');
      setNewProdClient('');
      setNewProdQty('');
      setNewProdMaterials([]);
      
      setActiveDateStr(savedDate);
      await fetchData();
      setSuccessToast('✅ ¡Producción creada exitosamente! El producto, BoM y Orden de Fabricación fueron generados en Odoo.');
    } catch (err) {
      console.error(err);
      setNewProdError(err.message);
    } finally {
      setIsSavingNewProd(false);
    }
  };

  const handleLocalDeletePlate = (clientName, plateName, isFuertePlate) => {
    if (isFuertePlate) {
      const confirmDelete = window.confirm(
        `Eliminar el plato principal (${plateName}) para ${clientName} eliminará toda la orden de este cliente para este día. ¿Deseas continuar?`
      );
      if (!confirmDelete) return;
      
      setLocalManageItems(prev => {
        const next = JSON.parse(JSON.stringify(prev));
        next.forEach(it => {
          if (it.cantidades_clientes[clientName]) {
            it.cantidades_clientes[clientName].cant = 0;
          }
        });
        return next;
      });
    } else {
      const confirmDelete = window.confirm(`¿Seguro que deseas eliminar el acompañamiento (${plateName}) para ${clientName}?`);
      if (!confirmDelete) return;
      
      setLocalManageItems(prev => {
        const next = JSON.parse(JSON.stringify(prev));
        const item = next.find(it => it.plato_nombre === plateName);
        if (item && item.cantidades_clientes[clientName]) {
          item.cantidades_clientes[clientName].cant = 0;
        }
        return next;
      });
    }
  };

  const handleLocalUpdateQty = (clientName, plateName, quantity) => {
    const qtyInt = parseInt(quantity, 10);
    if (isNaN(qtyInt) || qtyInt < 0) {
      alert("Por favor ingresa una cantidad válida.");
      return;
    }
    setLocalManageItems(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const item = next.find(it => it.plato_nombre === plateName);
      if (item && item.cantidades_clientes[clientName]) {
        item.cantidades_clientes[clientName].cant = qtyInt;
      }
      return next;
    });
  };

  const handleSaveManageModal = async () => {
    setIsSavingManage(true);
    try {
      const clientsWithDeletedFuerte = new Set();
      
      // Pass 1: delete Fuerte plates
      for (const origItem of manageDayRecord.items) {
        const localItem = localManageItems.find(it => it.plato_nombre === origItem.plato_nombre);
        const tipoUpper = (origItem.tipo || "").trim().toUpperCase().replace("Ó", "O");
        const isFuerte = ["FUERTE #1", "FUERTE #2", "MENU SALUDABLE", "MENÚ SALUDABLE"].includes(tipoUpper);
        
        for (const clientName of Object.keys(origItem.cantidades_clientes)) {
          const origCant = origItem.cantidades_clientes[clientName].cant;
          const localCant = localItem ? (localItem.cantidades_clientes[clientName]?.cant || 0) : 0;
          
          if (isFuerte && origCant > 0 && localCant === 0) {
            clientsWithDeletedFuerte.add(clientName);
            const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/${manageDayRecord.id}/clientes/${encodeURIComponent(clientName)}/platos/${encodeURIComponent(origItem.plato_nombre)}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Error eliminando plato principal");
          }
        }
      }
      
      // Pass 2: update qty and delete guarniciones
      for (const origItem of manageDayRecord.items) {
        const localItem = localManageItems.find(it => it.plato_nombre === origItem.plato_nombre);
        const tipoUpper = (origItem.tipo || "").trim().toUpperCase().replace("Ó", "O");
        const isFuerte = ["FUERTE #1", "FUERTE #2", "MENU SALUDABLE", "MENÚ SALUDABLE"].includes(tipoUpper);
        
        for (const clientName of Object.keys(origItem.cantidades_clientes)) {
          if (clientsWithDeletedFuerte.has(clientName)) continue;
          
          const origCant = origItem.cantidades_clientes[clientName].cant;
          const localCant = localItem ? (localItem.cantidades_clientes[clientName]?.cant || 0) : 0;
          
          if (origCant > 0 && localCant === 0 && !isFuerte) {
            const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/${manageDayRecord.id}/clientes/${encodeURIComponent(clientName)}/platos/${encodeURIComponent(origItem.plato_nombre)}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Error eliminando acompañamiento");
          } else if (origCant !== localCant && localCant > 0) {
            const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/${manageDayRecord.id}/clientes/${encodeURIComponent(clientName)}/platos/${encodeURIComponent(origItem.plato_nombre)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ cantidad: localCant })
            });
            if (!res.ok) throw new Error("Error actualizando cantidad");
          }
        }
      }
      
      await fetchData();
      setShowManageModal(false);
      alert("Cambios guardados exitosamente.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error al guardar los cambios");
    } finally {
      setIsSavingManage(false);
    }
  };

  const getMenuTypesWithContentInRange = (startDate, endDate, menuTypeName) => {
    if (!startDate || !endDate || !menuTypeName.trim()) return [];
    
    // Find menu type object by name
    const menuTypeObj = menuTypes.find(m => m.nombre.toLowerCase() === menuTypeName.trim().toLowerCase());
    if (!menuTypeObj) return [];
    
    // Loop through dates
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    
    const datesWithContent = [];
    
    productionDays.forEach(dia => {
      if (dia.tipo_menu_id === menuTypeObj.id) {
        const diaDate = new Date(dia.fecha + 'T00:00:00');
        if (diaDate >= start && diaDate <= end) {
          datesWithContent.push(dia);
        }
      }
    });
    
    return datesWithContent;
  };

  const getSelectedClientType = () => {
    if (!manualCliente.trim()) return 'porcentaje';
    const found = clients.find(c => c.nombre.toLowerCase() === manualCliente.trim().toLowerCase());
    return found ? found.tipo : manualClienteTipo;
  };


  // Dynamic grouping logic inside the active date card
  const getGroupedProductionForDateGroup = (dateGroup) => {
    if (!dateGroup || !dateGroup.records) return {};

    const result = {};

    dateGroup.records.forEach(record => {
      const menuTypeId = record.tipo_menu_id;
      const menuTypeObj = menuTypes.find(m => m.id === menuTypeId) || { id: menuTypeId, nombre: `Menú #${menuTypeId}` };
      const turnoObj = shifts.find(sh => sh.id === record.turno_id);
      
      const groupKey = `${menuTypeId || 'none'}_${record.turno_id || 'none'}`;

      // Find all clients in this record's items
      const clientSet = new Set();
      record.items.forEach(item => {
        Object.keys(item.cantidades_clientes || {}).forEach(name => {
          if (name !== 'TOTAL' && name !== 'CANT TOTAL') {
            clientSet.add(name);
          }
        });
      });
      const clientsList = Array.from(clientSet);

      result[groupKey] = {
        key: groupKey,
        menuType: menuTypeObj,
        turno: turnoObj,
        clients: clientsList,
        items: record.items,
        record: record
      };
    });

    return result;
  };

  // Theme colors for menu types in the general combined table
  const getMenuTypeStyle = (index, isMain) => {
    if (isMain) return {
      badge: "bg-blue-100 text-blue-800 border-blue-200",
      row: "hover:bg-slate-50/50",
      header: "bg-blue-600/10 text-blue-900 border-blue-200"
    };

    const colors = [
      { badge: "bg-emerald-100 text-emerald-800 border-emerald-200", row: "bg-emerald-50/10 hover:bg-emerald-50/20", header: "bg-emerald-600/15 text-emerald-900 border-emerald-200" },
      { badge: "bg-purple-100 text-purple-800 border-purple-200", row: "bg-purple-50/10 hover:bg-purple-50/20", header: "bg-purple-600/15 text-purple-900 border-purple-200" },
      { badge: "bg-amber-100 text-amber-800 border-amber-200", row: "bg-amber-50/10 hover:bg-amber-50/20", header: "bg-amber-600/15 text-amber-900 border-amber-200" },
      { badge: "bg-rose-100 text-rose-800 border-rose-200", row: "bg-rose-50/10 hover:bg-rose-50/20", header: "bg-rose-600/15 text-rose-900 border-rose-200" }
    ];

    return colors[index % colors.length];
  };

  const getFormatDateTitle = (dateStr) => {
    if (!dateStr) return '';
    const dateObj = new Date(dateStr + 'T00:00:00');
    return dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };


  const getMonthYearLabel = (monthKey) => {
    if (!monthKey) return '';
    const [year, month] = monthKey.split('-');
    const monthsSpanish = {
      '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
      '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
      '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
    };
    return `${monthsSpanish[month] || month} ${year}`;
  };

  const getClientDayTotal = (record, clientName) => {
    if (!record || !record.items) return 0;
    const clientObj = clients.find(cl => cl.nombre === clientName);
    const isPct = clientObj ? clientObj.tipo === 'porcentaje' : true;
    
    const sopaItem = record.items.find(it => it.tipo?.toString().trim().toUpperCase() === 'SOPA');
    const f1Item = record.items.find(it => it.tipo?.toString().trim().toUpperCase() === 'FUERTE #1');
    const f2Item = record.items.find(it => it.tipo?.toString().trim().toUpperCase() === 'FUERTE #2');
    const msItem = record.items.find(it => {
      const t = it.tipo?.toString().trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return t === 'MENU SALUDABLE';
    });
    
    const getQty = (it) => {
      const c = it?.cantidades_clientes?.[clientName] || {};
      return c.base_cant !== undefined ? c.base_cant : (c.cant || 0);
    };

    const sopa = getQty(sopaItem);
    const f1 = getQty(f1Item);
    const f2 = getQty(f2Item);
    const ms = getQty(msItem);


    let total = isPct ? Math.max(sopa, f1 + f2 + ms) : (f1 + f2 + ms);

    if (total === 0) {
      let maxCant = 0;
      record.items.forEach(it => {
        const cant = getQty(it);
        if (cant > maxCant) maxCant = cant;
      });
      total = maxCant;
    }

    return total;
  };

  const getDailyCost = (record) => {
    if (!record || !record.items || record.items.length === 0) return 0;
    
    let totalCostSum = 0;
    record.items.forEach(item => {
      const rObj = recipes.find(r => r.nombre === item.plato_nombre);
      const unitCost = rObj && rObj.bom_cost != null ? rObj.bom_cost : 0;
      totalCostSum += unitCost * (item.total || 0);
    });

    const isInternal = record.tipo_menu?.nombre?.toUpperCase().includes('INTERNA') && !record.tipo_menu?.nombre?.toUpperCase().includes('MANUAL');
    if (isInternal) {
      return totalCostSum; // Costo Total (Materiales * Cantidad)
    }

    const dayClients = Array.from(new Set(record.items.flatMap(item => 
      Object.keys(item.cantidades_clientes || {}).filter(c => c !== "TOTAL" && c !== "CANT TOTAL")
    )));
    const totalRaciones = dayClients.reduce((acc, c) => acc + getClientDayTotal(record, c), 0);

    let finalRaciones = totalRaciones;
    
    if (finalRaciones <= 0) {
      let sopaQty = 0, f1Qty = 0, f2Qty = 0, msQty = 0, maxQty = 0;
      record.items.forEach(it => {
        const t = (it.tipo || "").toString().trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const qty = Number(it.total || 0);
        if (t === 'SOPA') sopaQty += qty;
        else if (t === 'FUERTE #1') f1Qty += qty;
        else if (t === 'FUERTE #2') f2Qty += qty;
        else if (t === 'MENU SALUDABLE') msQty += qty;
        
        if (qty > maxQty) maxQty = qty;
      });
      
      finalRaciones = f1Qty + f2Qty + msQty;
      if (finalRaciones === 0) {
        finalRaciones = maxQty;
      }
    }

    if (finalRaciones <= 0) return totalCostSum;
    return totalCostSum / finalRaciones;
  };

  const formatDailyCost = (record) => {
    const cost = getDailyCost(record);
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const defaultMenuType = menuTypes.find(m => m.nombre.toLowerCase() === "almuerzo tipo 1") || menuTypes[0] || { id: 1 };
  const defaultMenuTypeId = defaultMenuType.id;

  const availableMonths = Array.from(new Set(productionDays.map(d => getMonthYearKey(d.fecha))))
    .sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {/* Global Success Toast */}
      {successToast && (
        <div className="fixed top-6 right-6 z-[200] animate-fade-in">
          <div className="bg-emerald-600 text-white px-5 py-4 rounded-2xl shadow-2xl flex items-start gap-3 max-w-sm border border-emerald-500">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-200" />
            <div>
              <p className="text-sm font-black">¡Operación Exitosa!</p>
              <p className="text-xs font-medium text-emerald-100 mt-0.5 leading-relaxed">{successToast}</p>
            </div>
            <button
              onClick={() => setSuccessToast('')}
              className="ml-2 text-emerald-200 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <style>{`
        /* Hide spin-buttons for input number */
        .no-spinner::-webkit-outer-spin-button,
        .no-spinner::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>
      
      {/* Sticky Header and Turno Tabs */}
      <div className="sticky -top-6 md:-top-10 bg-slate-50 z-30 pt-6 md:pt-10 pb-3 -mx-6 md:-mx-10 px-6 md:px-10 -mt-6 md:-mt-10 border-b border-slate-200/80 space-y-3">
        {/* Header and Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5.5 h-5.5 text-blue-600" />
              <span>Órdenes de Fabricación</span>
            </h1>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* hidden input for xlsx file selection */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".xlsx" 
              className="hidden" 
            />
            {(user?.rol === 'admin' || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Importar .xlsx']) && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 cursor-pointer text-xs flex items-center gap-1"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>{uploading ? "Procesando Excel..." : "Importar .xlsx"}</span>
            </button>
            )}
            
            {(user?.rol === 'admin' || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Sincronizar con Odoo']) && (
            <button
              onClick={() => {
                setSelectedSyncMonths([]);
                setSelectedOdooDays({});
                setOdooSyncResult(null);
                
                // Get unique years and expand the latest one
                const years = Array.from(new Set(productionDays.map(d => getMonthYearKey(d.fecha).split('-')[0])));
                const latestYear = years.sort((a, b) => b.localeCompare(a))[0] || '';
                setExpandedOdooYears({ [latestYear]: true });
                
                setShowOdooSyncModal(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 cursor-pointer text-xs flex items-center gap-1"
            >
              <CalendarRange className="w-3.5 h-3.5 text-emerald-100" />
              <span>Sincronizar con Odoo</span>
            </button>
            )}

            {((user?.rol === 'admin' || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Eliminar planificación'] || user?.permisos?.modules?.['Planificador']?.actions?.['Ver Costos Diarios']) || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Eliminar planificación'] || user?.permisos?.modules?.['Planificador']?.actions?.['Ver Costos Diarios']) && (
              <>
                {(user?.rol === 'admin' || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Eliminar planificación']) && (
                  <button
                  onClick={handleVaciarPlanificacion}
                  className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow-md shadow-rose-500/10 hover:shadow-rose-500/20 cursor-pointer text-xs flex items-center gap-1"
                >
                  <Trash className="w-3.5 h-3.5 text-rose-100" />
                  <span>Vaciar Planificación</span>
                </button>
                )}
                {(user?.rol === 'admin' || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Quitar y eliminar clientes']) && (
                  <button
                  onClick={() => setShowRemoveClientModal(true)}
                  className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow-md shadow-orange-500/10 hover:shadow-orange-500/20 cursor-pointer text-xs flex items-center gap-1"
                >
                  <Users className="w-3.5 h-3.5 text-orange-100" />
                  <span>Quitar Clientes</span>
                </button>
                )}
              </>
            )}
            
            {(user?.rol === 'admin' || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Nuevo Cliente']) && (
            <button
              onClick={() => setShowNewClientModal(true)}
              className="bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 cursor-pointer text-xs flex items-center gap-1"
            >
              <Users className="w-3.5 h-3.5 text-indigo-100" />
              <span>Nuevo Cliente</span>
            </button>
            )}

            <button
              onClick={() => setShowNewProductionModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 cursor-pointer text-xs flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-100" />
              <span>Nueva Producción</span>
            </button>
            


            {(user?.rol === 'admin' || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Gestionar clientes, turnos y menús']) && (
            <button
              onClick={() => setShowClientModal(true)}
              className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-bold transition-all shadow-2xs cursor-pointer text-xs flex items-center gap-1"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Gestionar Clientes</span>
            </button>
            )}

            {(user?.rol === 'admin' || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Gestionar clientes, turnos y menús']) && (
            <button
              onClick={() => {
                setNewShiftName('');
                setNewShiftHours('');
                setShowShiftsModal(true);
              }}
              className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-705 px-3 py-1.5 rounded-xl font-bold transition-all shadow-2xs cursor-pointer text-xs flex items-center gap-1"
            >
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Gestionar Turnos</span>
            </button>
            )}

            {(user?.rol === 'admin' || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Gestionar clientes, turnos y menús']) && (
            <button
              onClick={() => {
                setNewMenuTypeName('');
                setShowMenuTypesModal(true);
              }}
              className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-705 px-3 py-1.5 rounded-xl font-bold transition-all shadow-2xs cursor-pointer text-xs flex items-center gap-1"
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              <span>Gestionar Menús</span>
            </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center gap-2.5 shadow-xs animate-fade-in">
            <X className="w-5 h-5 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && productionDays.length > 0 && (
          <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-3xs flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2 font-mono">Grupo de Trabajo / Turno:</span>
            {shifts.map(sh => {
              const isSelected = activeShiftTab === sh.id.toString();
              return (
                <button
                  key={sh.id}
                  onClick={() => setActiveShiftTab(sh.id.toString())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {sh.nombre}
                </button>
              );
            })}
            <button
              onClick={() => setActiveShiftTab('none')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                activeShiftTab === 'none'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              Sin Asignar
            </button>
          </div>
        )}
      </div>

      {/* Main Workspace (Scrollable Content area) */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, idx) => (
            <div key={idx} className="bg-white border border-slate-200 p-6 rounded-2xl animate-pulse space-y-3">
              <div className="w-1/4 h-5 bg-slate-100 rounded" />
              <div className="w-1/2 h-4 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : productionDays.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200 border-dashed rounded-3xl text-slate-400 font-bold italic shadow-sm max-w-lg mx-auto space-y-4">
          <FileSpreadsheet className="w-14 h-14 mx-auto text-slate-300 animate-bounce" />
          <div className="space-y-1">
            <p className="text-slate-650 font-extrabold text-base">No hay órdenes de fabricación importadas</p>
            <p className="text-xs text-slate-400 font-normal">Sube un archivo de planificación .xlsx para iniciar la planificación.</p>
            <button
              onClick={() => handleOpenManualModal()}
              className="bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-2 rounded-xl font-bold transition-all shadow-md cursor-pointer text-xs flex items-center gap-1.5 mx-auto mt-4"
            >
              <PlusCircle className="w-4 h-4 text-slate-200" />
              <span>Crear Planificación Manual</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 pb-12">
          {(() => {
            // Filter productionDays by active shift tab
            const filteredDays = productionDays.filter(dia => {
              if (activeShiftTab === 'none') {
                return !dia.turno_id;
              } else {
                return dia.turno_id === Number(activeShiftTab);
              }
            });

            if (filteredDays.length === 0) {
              return (
                <div className="text-center py-16 bg-white border border-slate-200 border-dashed rounded-3xl text-slate-400 font-bold italic shadow-3xs max-w-md mx-auto">
                  <p className="text-slate-650 font-extrabold text-sm">Sin órdenes para este grupo de trabajo</p>
                  <p className="text-[11px] text-slate-400 font-normal mt-1">Carga un Excel o asigna un día planificado a este turno.</p>
                </div>
              );
            }

            // Group dates by month
            const groupedMonths = {};
            filteredDays.forEach(diaRecord => {
              const monthKey = getMonthYearKey(diaRecord.fecha);
              if (!groupedMonths[monthKey]) {
                groupedMonths[monthKey] = {
                  key: monthKey,
                  label: getMonthYearLabel(monthKey),
                  records: []
                };
              }
              groupedMonths[monthKey].records.push(diaRecord);
            });
            
            const sortedMonths = Object.values(groupedMonths).sort((a, b) => b.key.localeCompare(a.key));

            return sortedMonths.map((monthGroup) => {
              const isMonthExpanded = expandedMonths[monthGroup.key] === true;
              
              const recordsByDate = {};
              monthGroup.records.forEach(r => {
                  if(!recordsByDate[r.fecha]) recordsByDate[r.fecha] = [];
                  recordsByDate[r.fecha].push(r);
              });
              const dateKeys = Object.keys(recordsByDate).sort((a,b) => a.localeCompare(b));

              // Calculate total rations for the month
              const monthRaciones = monthGroup.records.reduce((totalMonth, record) => {
                const clientSet = new Set();
                record.items.forEach(item => {
                  Object.keys(item.cantidades_clientes || {}).forEach(name => {
                    if (name !== 'TOTAL' && name !== 'CANT TOTAL') {
                      clientSet.add(name);
                    }
                  });
                });
                const dayClients = Array.from(clientSet);
                return totalMonth + dayClients.reduce((acc, c) => acc + getClientDayTotal(record, c), 0);
              }, 0);

              return (
                <div key={monthGroup.key} className="bg-slate-50 border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs space-y-px">
                  {/* Month Accordion Header */}
                  <div 
                    onClick={() => setExpandedMonths(prev => ({ ...prev, [monthGroup.key]: !prev[monthGroup.key] }))}
                    className={`p-5 flex items-center justify-between cursor-pointer bg-white transition-colors select-none ${
                      isMonthExpanded ? 'border-b border-slate-100' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CalendarRange className={`w-5.5 h-5.5 ${isMonthExpanded ? 'text-blue-600 font-bold' : 'text-slate-400'}`} />
                      <div>
                        <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-wide">
                          {monthGroup.label}
                        </h3>
                        <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{dateKeys.length} Días planificados</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100/50 px-3 py-1 rounded-lg">
                        {monthRaciones} Raciones en el Mes
                      </span>
                      {isMonthExpanded ? (
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isMonthExpanded && (
                    <div className="p-5 space-y-4 bg-slate-50/20">
                                            {/* Days List for Month */}
                      {dateKeys.map((fecha) => {
                        const dayRecords = recordsByDate[fecha];
                        const isExpanded = activeDateStr === fecha;
                        
                        const presentMenuTypeIdsForDay = Array.from(new Set(dayRecords.map(r => r.tipo_menu_id)));
                        const activeMenuTypeIdForDay = activeMenuTypesByDate[fecha] || presentMenuTypeIdsForDay[0];
                        
                        const record = dayRecords.find(r => r.tipo_menu_id === activeMenuTypeIdForDay) || dayRecords[0];
                        
                        // Find all clients in this day record
                        const clientSet = new Set();
                        record.items.forEach(item => {
                          Object.keys(item.cantidades_clientes || {}).forEach(name => {
                            if (name !== 'TOTAL' && name !== 'CANT TOTAL') {
                              clientSet.add(name);
                            }
                          });
                        });
                        const dayClients = Array.from(clientSet).filter(c => getClientDayTotal(record, c) > 0);

                        const totalRaciones = dayClients.reduce((acc, c) => acc + getClientDayTotal(record, c), 0);

                        const targetGroup = {
                          menuType: menuTypes.find(m => m.id === record.tipo_menu_id) || { id: record.tipo_menu_id, nombre: `Menú #${record.tipo_menu_id}` },
                          turno: shifts.find(sh => sh.id === record.turno_id),
                          clients: dayClients,
                          items: record.items,
                          record: record
                        };

                        return (
                          <div 
                            key={fecha}
                            id={`day-block-${record.fecha}`}
                            className={`bg-white border transition-all duration-300 rounded-2xl shadow-xs overflow-hidden ${
                              isExpanded ? 'border-blue-300 ring-2 ring-blue-500/5' : 'border-slate-200 hover:border-slate-350'
                            }`}
                          >
                            {/* Date Header */}
                            <div 
                              onClick={() => setActiveDateStr(isExpanded ? '' : fecha)}
                              className={`p-5 flex items-center justify-between cursor-pointer select-none transition-colors ${
                                isExpanded ? 'bg-slate-50/50 border-b border-slate-100' : 'hover:bg-slate-50/30'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <Calendar className={`w-5 h-5 transition-colors ${isExpanded ? 'text-blue-600 font-bold' : 'text-slate-400'}`} />
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                  <h3 className={`text-base font-extrabold capitalize ${isExpanded ? 'text-slate-900' : 'text-slate-800'}`}>
                                    {getFormatDateTitle(record.fecha)}
                                  </h3>
                                  {((user?.rol === 'admin' || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Eliminar planificación'] || user?.permisos?.modules?.['Planificador']?.actions?.['Ver Costos Diarios']) || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Eliminar planificación'] || user?.permisos?.modules?.['Planificador']?.actions?.['Ver Costos Diarios']) && (
                                    <>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-blue-650 border border-blue-150/40 normal-case tracking-normal">
                                        costo diario: {formatDailyCost(record)}
                                      </span>
                                      {record.ruta_asignada && (
                                        <button
                                          type="button"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            setMoDetailModal({ loading: true, data: null, error: null, moName: record.ruta_asignada });
                                            try {
                                              const res = await fetch(`${API_BASE_URL}/planner/ordenes-fabricacion/mo-detalle?mo_name=${encodeURIComponent(record.ruta_asignada)}`, {
                                                headers: { 'Authorization': `Bearer ${token}` }
                                              });
                                              const json = await res.json();
                                              if (!res.ok) throw new Error(json.detail || 'Error al leer MO');
                                              setMoDetailModal({ loading: false, data: json, error: null, moName: record.ruta_asignada });
                                            } catch (err) {
                                              setMoDetailModal({ loading: false, data: null, error: err.message, moName: record.ruta_asignada });
                                            }
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 normal-case tracking-normal ml-2 hover:bg-emerald-100 transition-colors cursor-pointer"
                                        >
                                          <Factory className="w-3 h-3" />
                                          {record.ruta_asignada}
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-4">
                                <span className="text-xs font-bold text-slate-655 bg-slate-100 border border-slate-200/50 px-3 py-1 rounded-lg">
                                  {totalRaciones} Raciones Totales
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                            </div>

                            {/* Date Block Workspace Detail */}
                            {isExpanded && (
                              <div className="p-6 space-y-6 animate-scale-up">
                                
                                {/* Menu Types Sub-Tabs for this Date */}
                                {presentMenuTypeIdsForDay.length > 1 && (
                                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-2 font-mono">Tipo de Menú:</span>
                                    {presentMenuTypeIdsForDay.map(mtId => {
                                      const mtObj = menuTypes.find(m => m.id === mtId) || { id: mtId, nombre: `Menú #${mtId}` };
                                      const isSelected = activeMenuTypeIdForDay === mtId;
                                      return (
                                        <button
                                          key={mtId}
                                          onClick={() => setActiveMenuTypesByDate(prev => ({ ...prev, [fecha]: mtId }))}
                                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                                            isSelected
                                              ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-3xs'
                                              : 'bg-white hover:bg-slate-50 text-slate-500 border-slate-200'
                                          }`}
                                        >
                                          {mtObj.nombre}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                <div className="flex justify-between items-center bg-slate-50 border border-slate-200/60 p-3.5 rounded-2xl shadow-3xs">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono bg-slate-200/50 px-2 py-1 rounded-md">Contexto:</span>
                                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                      Turno: <span className="text-blue-700 font-extrabold">{targetGroup.turno?.nombre || "Sin Asignar"}</span>
                                      {record.ruta_asignada && record.fecha && (() => {
                                        const [y, m, d] = record.fecha.split('-');
                                        const title = `${targetGroup.menuType.nombre} ${d}${m}${y.slice(2)}`;
                                        return <> <span className="text-slate-400 mx-1">|</span> <span className="text-blue-700 font-extrabold">{title}</span></>;
                                      })()}
                                      {record.ruta_asignada && (
                                        <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 inline-flex items-center gap-1" title="Ruta de Producción en Odoo">
                                          <Warehouse className="w-3 h-3" /> {record.ruta_asignada}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleOpenManageModalForDay(record)}
                                      className="bg-slate-150 hover:bg-slate-200 border border-slate-250 text-slate-700 px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-xs cursor-pointer text-xs flex items-center gap-1.5"
                                    >
                                      <Settings className="w-4 h-4 text-slate-500 animate-spin-hover" />
                                      <span>Modificar Menú</span>
                                    </button>
                                    <button
                                      onClick={() => handleUpdateOdooDay(record)}
                                      disabled={updatingOdooDayId === record.id}
                                      className="bg-amber-600 hover:bg-amber-500 text-white px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-xs cursor-pointer text-xs flex items-center gap-1.5 disabled:bg-slate-350"
                                      title="Re sincronizar Producto, BoM y Orden de Fabricación en Odoo"
                                    >
                                      <RefreshCw className={`w-4 h-4 text-white ${updatingOdooDayId === record.id ? 'animate-spin' : 'animate-spin-hover'}`} />
                                      <span>{updatingOdooDayId === record.id ? 'Sincronizando...' : 'Re sincronizar en Odoo'}</span>
                                    </button>

                                    <button
                                      onClick={() => handleDeletePlanificacionDia(record.id)}
                                      className="bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-xs cursor-pointer text-xs flex items-center gap-1.5"
                                      title="Eliminar planificación de este turno y menú"
                                    >
                                      <Trash className="w-4 h-4 text-white" />
                                      <span>Eliminar Planificación</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setAddClientToDayRecord(record);
                                        setSelectedClientToAdd('');
                                        setShowAddClientToDayModal(true);
                                      }}
                                      className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-xs cursor-pointer text-xs flex items-center gap-1.5"
                                    >
                                      <PlusCircle className="w-4 h-4 text-white" />
                                      <span>Agregar Cliente</span>
                                    </button>
                                    
                                  </div>
                                </div>


                                {/* Matrix Client Grid */}
                                <div className="space-y-4">


                                  <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="bg-slate-50 border-b border-slate-205">
                                          <th className="px-4 py-3 text-xs font-extrabold text-slate-800 uppercase tracking-wider align-middle min-w-[200px]">
                                             <div className="flex items-center justify-between gap-2.5">
                                               <span>Plato</span>
                                               <button
                                                 type="button"
                                                 onClick={() => {
                                                   setAddPlateDayRecord(record);
                                                   setShowAddPlateModal(true);
                                                 }}
                                                 className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-md font-extrabold text-[10px] tracking-normal normal-case transition-all shadow-3xs cursor-pointer flex items-center gap-0.5 border border-blue-200"
                                                 title="Agregar plato extra a este día"
                                               >
                                                 <Plus className="w-3 h-3 text-blue-600" />
                                                 <span>agregar plato al menú</span>
                                               </button>
                                             </div>
                                           </th>
                                          <th className="px-4 py-3 text-xs font-extrabold text-slate-800 uppercase tracking-wider w-24 align-middle">Tipo</th>
                                          {dayClients.map(c => {
                                            const sopaItem = targetGroup.items.find(it => it.tipo?.toString().trim().toUpperCase() === 'SOPA');
                                            const f1Item = targetGroup.items.find(it => it.tipo?.toString().trim().toUpperCase() === 'FUERTE #1');
                                            const f2Item = targetGroup.items.find(it => it.tipo?.toString().trim().toUpperCase() === 'FUERTE #2');
                                            const msItem = targetGroup.items.find(it => {
                                              const t = it.tipo?.toString().trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
                                              return t === 'MENU SALUDABLE';
                                            });
                                            const jugo2Item = targetGroup.items.find(it => it.tipo?.toString().trim().toUpperCase() === 'JUGO #2');

                                            const clientObj = clients.find(cl => cl.nombre === c);
                                            const isPctBased = clientObj ? clientObj.tipo === 'porcentaje' : true;

                                            const f1Pct = f1Item?.cantidades_clientes?.[c]?.pct || 0;
                                            const f2Pct = f2Item?.cantidades_clientes?.[c]?.pct || 0;

                                            const f1Qty = f1Item?.cantidades_clientes?.[c]?.cant || 0;
                                            const f2Qty = f2Item?.cantidades_clientes?.[c]?.cant || 0;
                                            const msQty = msItem?.cantidades_clientes?.[c]?.cant || 0;
                                            const clientTotalVal = getClientDayTotal(record, c);
                                            const clientJugo2Val = jugo2Item?.cantidades_clientes?.[c]?.cant || 0;

                                            const displayClientName = c.split(/\s+/)[0];

                                            return (
                                              <th key={c} className="px-4 py-3 text-xs font-extrabold text-slate-900 uppercase tracking-wider text-center border-l border-slate-200 align-middle min-w-[110px]">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setParamsModalData({
                                                      fecha: record.fecha,
                                                      clientName: c,
                                                      clientType: clientObj ? clientObj.tipo : 'porcentaje',
                                                      f1Val: isPctBased ? (f1Pct ? Math.round(f1Pct * 100) : 0) : f1Qty,
                                                      f2Val: isPctBased ? (f2Pct ? Math.round(f2Pct * 100) : 0) : f2Qty,
                                                      msVal: msQty,
                                                      totalVal: clientTotalVal,
                                                      jugo2Val: clientJugo2Val,
                                                      hasJugo2: !!jugo2Item,
                                                      hasF1: !!f1Item,
                                                      hasF2: !!f2Item,
                                                      hasMs: !!msItem,
                                                      tipoMenuId: record.tipo_menu_id,
                                                      turnoId: record.turno_id,
                                                      items: record.items
                                                    });
                                                    setShowParamsModal(true);
                                                  }}
                                                  className="hover:text-blue-600 transition-colors cursor-pointer w-full text-center outline-none"
                                                  title={`Click para editar parámetros de ${c}`}
                                                >
                                                  <div className="line-clamp-2">{displayClientName}</div>
                                                  <div className="text-[9px] text-blue-600 font-bold hover:text-blue-800 transition-colors lowercase mt-0.5">(editar params)</div>
                                                </button>
                                              </th>
                                            );
                                          })}
                                          <th className="px-4 py-3 text-xs font-extrabold text-slate-800 uppercase tracking-wider text-right w-24 border-l border-slate-200 align-middle">
                                            Total
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(() => {
                                          const filteredItems = targetGroup.items.filter(item => {
                                            const isHealthyMenu = item.tipo?.toString().trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'MENU SALUDABLE';
                                            const isNameEmpty = !item.plato_nombre || item.plato_nombre.trim() === '' || item.plato_nombre.trim() === '-';
                                            if (isNameEmpty) return false;
                                            if (isHealthyMenu) return item.total > 0;
                                            return true;
                                          });

                                          const regularItems = filteredItems.filter(item => {
                                            const t = item.tipo?.toString().trim().toUpperCase();
                                            return t !== 'PRODUCCION' && t !== 'MANUAL';
                                          });

                                          const specialItems = filteredItems.filter(item => {
                                            const t = item.tipo?.toString().trim().toUpperCase();
                                            return t === 'PRODUCCION' || t === 'MANUAL';
                                          });

                                          const renderRow = (item, idx, isSpecial) => (
                                            <tr key={item.id || idx} className={`border-b border-slate-150 transition-colors ${isSpecial ? 'bg-amber-50/20 hover:bg-amber-50/60' : 'hover:bg-slate-50/50'}`}>
                                              <td className="px-4 py-2.5 text-xs font-extrabold text-slate-900 min-w-[200px]">
                                                <div className="flex items-center gap-1.5 group relative">
                                                  {item.id && (
                                                    <div className="relative shrink-0">
                                                      <button
                                                            onClick={() => setActiveMenuForItemId(activeMenuForItemId === item.id ? null : item.id)}
                                                            className="opacity-30 group-hover:opacity-100 text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition-all cursor-pointer inline-flex items-center justify-center"
                                                            title="Opciones de plato"
                                                          >
                                                            <MoreVertical className="w-3.5 h-3.5" />
                                                          </button>
                                                          
                                                          {activeMenuForItemId === item.id && (
                                                            <>
                                                              {/* Transparent click-outside overlay */}
                                                              <div 
                                                                className="fixed inset-0 z-40 cursor-default" 
                                                                onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  setActiveMenuForItemId(null);
                                                                }}
                                                              />
                                                              {/* Dropdown Menu */}
                                                              <div className="absolute left-0 mt-1 bg-white border border-slate-200 shadow-lg rounded-xl py-1 z-50 min-w-[125px] text-left">
                                                                <button
                                                                  onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setChangeDishItem(item);
                                                                    setChangeDishCategory('');
                                                                    setChangeDishSearch('');
                                                                    setChangeDishModalOpen(true);
                                                                    setActiveMenuForItemId(null);
                                                                  }}
                                                                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5"
                                                                >
                                                                  <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                                                  <span>Cambiar Plato</span>
                                                                </button>
                                                                <button
                                                                  onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteItemPlate(item.id, item.plato_nombre);
                                                                    setActiveMenuForItemId(null);
                                                                  }}
                                                                  className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-xs font-bold text-rose-655 cursor-pointer flex items-center gap-1.5 border-t border-slate-100"
                                                                >
                                                                  <Trash className="w-3.5 h-3.5 text-rose-500" />
                                                                  <span>Eliminar Plato</span>
                                                                </button>
                                                              </div>
                                                            </>
                                                          )}
                                                        </div>
                                                      )}
                                                      <div className="flex flex-col mt-1">
                                                        <div className="flex items-center flex-wrap">
                                                          <span>{item.plato_nombre}</span>
                                                          {getRecipeCostLabel(item.plato_nombre)}
                                                        </div>
                                                      </div>
                                                    </div>
                                              </td>
                                              <td className="px-4 py-2.5 text-xs text-slate-700 font-bold">{item.tipo}</td>
                                              {targetGroup.clients.map(c => {
                                                const cData = item.cantidades_clientes[c] || { pct: 0, cant: 0 };
                                                const pctPercent = cData.pct ? Math.round(cData.pct * 100) : 0;
                                                return (
                                                  <td 
                                                    key={`cell-${c}`} 
                                                    onClick={() => handleCellClick(c, item, cData.cant, targetGroup.record)}
                                                    title={pctPercent > 0 ? `Porcentaje: ${pctPercent}%` : undefined}
                                                    className={`cursor-pointer px-4 py-2.5 text-xs font-bold font-mono text-center border-l border-slate-100 hover:bg-slate-200 transition-colors ${cData.cant > 0 ? 'text-slate-950 font-extrabold' : 'text-slate-300'}`}
                                                  >
                                                    {cData.cant > 0 ? cData.cant : '-'}
                                                    {cData.base_cant !== undefined && cData.base_cant !== cData.cant && (
                                                       <span className="ml-1 text-[8px] text-blue-500 block leading-tight">({cData.base_cant})</span>
                                                    )}
                                                  </td>
                                                );
                                              })}
                                              <td className="px-4 py-2.5 text-xs font-black text-right font-mono text-slate-950 border-l border-slate-100 bg-slate-50/50">
                                                {item.total}
                                              </td>
                                            </tr>
                                          );

                                          return (
                                            <>
                                              {regularItems.map((item, idx) => renderRow(item, idx, false))}
                                              {specialItems.length > 0 && (
                                                <>
                                                  <tr className="bg-slate-50 border-y border-slate-200">
                                                    <td colSpan={targetGroup.clients.length + 3} className="px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center shadow-inner-y">
                                                      Producciones Especiales / Manuales
                                                    </td>
                                                  </tr>
                                                  {specialItems.map((item, idx) => renderRow(item, `spec-${idx}`, true))}
                                                </>
                                              )}
                                            </>
                                          );
                                        })()}
                                        {/* Total Cliente Row */}
                                        <tr className="bg-blue-50/40 font-extrabold border-t border-slate-200">
                                          <td className="px-4 py-3 text-xs text-slate-900 font-extrabold uppercase tracking-wide">Total Cliente</td>
                                          <td className="px-4 py-3 text-xs text-slate-550 font-bold">-</td>
                                          {targetGroup.clients.map(c => {
                                            const clientTotalVal = getClientDayTotal(record, c);
                                            return (
                                              <td 
                                                key={`total-${c}`} 
                                                className="px-4 py-3 text-xs font-mono font-extrabold text-center text-blue-700 bg-blue-50/10 border-l border-slate-200"
                                              >
                                                {clientTotalVal > 0 ? clientTotalVal : '-'}
                                              </td>
                                            );
                                          })}
                                          <td className="px-4 py-3 text-xs font-mono font-black text-right text-blue-800 border-l border-slate-200 bg-blue-50/30">
                                            {totalRaciones}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                  
                                  {/* Footer: Habilitar Despacho */}
                                  <div className="flex justify-end mt-4">
                                    <button
                                      onClick={() => handleToggleSendDispatch(record.id)}
                                      className={`${record.enviado_despacho_cliente ? 'bg-green-600 hover:bg-green-500 shadow-green-200' : 'bg-slate-700 hover:bg-slate-600 shadow-slate-200'} text-white px-5 py-2.5 rounded-xl font-black transition-all shadow-md cursor-pointer text-sm flex items-center gap-2 hover:-translate-y-0.5`}
                                      title="Habilitar el despacho a cliente en el módulo Despacho"
                                    >
                                      <Warehouse className="w-5 h-5 text-white" />
                                      <span>{record.enviado_despacho_cliente ? 'Despacho Habilitado' : 'Habilitar Despacho a Clientes'}</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}      {/* MODAL 2: Clients Typification Manager */}
      {showClientModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 max-w-lg w-full mx-4 space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span>Gestionar Clientes y Tipificación</span>
              </h3>
              <button onClick={() => setShowClientModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-500 text-xs leading-relaxed">
              Establece el tipo de cada cliente para determinar cómo se ingresan sus raciones en la planificación. Puedes elegir entre Porcentaje o Cantidades directas.
            </p>

            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Nombre del nuevo cliente"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs outline-none transition-all"
              />
              <select
                value={newClientType}
                onChange={(e) => setNewClientType(e.target.value)}
                className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
              >
                <option value="porcentaje">Porcentaje (%)</option>
                <option value="cantidad">Cantidad directa</option>
              </select>
              <button
                type="button"
                onClick={async () => {
                  if (!newClientName.trim()) return;
                  await handleCreateClient(newClientName.trim(), newClientType);
                  setNewClientName('');
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Cliente</span>
              </button>
            </div>

            {/* Clients mapping table list */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Cliente</th>
                    <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Tipo de Cliente</th>
                    <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-center w-20">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="text-center py-6 text-slate-400 italic text-xs">
                        No hay clientes registrados en el sistema. Agrega uno arriba o importa un Excel.
                      </td>
                    </tr>
                  ) : (
                    clients.map(client => (
                      <tr key={client.id} className="border-b border-slate-150 last:border-none hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-xs font-bold text-slate-700">{client.nombre}</td>
                        <td className="px-4 py-2.5">
                          <select
                            value={client.tipo}
                            onChange={(e) => handleUpdateClientType(client.id, e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-slate-205 rounded-lg text-xs font-bold text-slate-700 outline-none"
                          >
                            <option value="porcentaje">Porcentaje (%)</option>
                            <option value="cantidad">Cantidades Directas</option>
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => handleDeleteClient(client.nombre)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-slate-100 transition-all cursor-pointer inline-flex items-center justify-center"
                            title="Eliminar por completo del sistema"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowClientModal(false)}
                className="bg-slate-100 hover:bg-slate-200 border border-slate-205 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Manual Order Creator */}

      {/* MODAL: Gestionar Platos del Día */}
      {showManageModal && manageDayRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-scale-up">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-base font-extrabold text-slate-800 uppercase tracking-wide">
                  Modificar Menú del Día
                </h2>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  Fecha: {manageDayRecord.fecha}
                </p>
              </div>
              <button
                onClick={() => setShowManageModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {(() => {
                // Group items by client for this specific day record
                const clientSet = new Set();
                const itemsToUse = localManageItems || manageDayRecord.items;
                itemsToUse.forEach(it => {
                  Object.keys(it.cantidades_clientes).forEach(cName => {
                    if (it.cantidades_clientes[cName]?.cant > 0) {
                      clientSet.add(cName);
                    }
                  });
                });
                const dayClients = Array.from(clientSet).sort((a, b) => a.localeCompare(b));

                if (dayClients.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-400 font-semibold text-xs">
                      No hay platos planificados para ningún cliente en este día.
                    </div>
                  );
                }

                return dayClients.map(cName => {
                  // Get client object to check type
                  const clientObj = clients.find(cl => cl.nombre === cName);
                  const isPct = clientObj ? clientObj.tipo === 'porcentaje' : true;

                  // Find all items where this client has a quantity > 0
                  const clientItems = itemsToUse
                    .filter(it => it.cantidades_clientes[cName]?.cant > 0)
                    .map(it => {
                      const tipoUpper = (it.tipo || "").trim().toUpperCase().replace("Ó", "O");
                      const isFuerte = ["FUERTE #1", "FUERTE #2", "MENU SALUDABLE", "MENÚ SALUDABLE"].includes(tipoUpper);
                      return {
                        item: it,
                        plato_nombre: it.plato_nombre,
                        tipo: it.tipo,
                        cant: it.cantidades_clientes[cName].cant,
                        isFuerte
                      };
                    });

                  return (
                    <div key={cName} className="border border-slate-200/80 rounded-2xl p-4 bg-white shadow-3xs space-y-3">
                      {/* Client Header */}
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                          {cName}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono px-2 py-0.5 bg-slate-100 rounded-md">
                          Tipo: {isPct ? 'Porcentaje' : 'Cantidad'}
                        </span>
                      </div>

                      {/* Items List */}
                      <div className="divide-y divide-slate-100">
                        {clientItems.map(clItem => (
                          <div key={clItem.plato_nombre} className="py-2.5 flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">
                                {clItem.plato_nombre}
                              </p>
                              <span className="inline-block text-[9px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100/50 rounded-md px-1.5 py-0.5 uppercase mt-0.5 tracking-wider">
                                {clItem.tipo} {clItem.isFuerte && '(Principal)'}
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Quantity Input */}
                              <div className="flex items-center gap-1.5">
                                <label className="text-[10px] text-slate-400 font-bold uppercase">Cant:</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={clItem.cant.toString()}
                                  onChange={(e) => {
                                    let val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                    if (!isNaN(val) && val >= 0) {
                                      handleLocalUpdateQty(cName, clItem.plato_nombre, val);
                                    }
                                  }}
                                  className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-lg text-xs font-bold text-center text-slate-700 outline-none"
                                />
                              </div>

                              {/* Delete Button */}
                              <button
                                type="button"
                                onClick={() => handleLocalDeletePlate(cName, clItem.plato_nombre, clItem.isFuerte)}
                                className="p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-100"
                                title={clItem.isFuerte ? "Eliminar plato principal (elimina toda la orden)" : "Eliminar acompañamiento"}
                              >
                                <Trash className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/30">
              <button
                type="button"
                onClick={() => setShowManageModal(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                disabled={isSavingManage}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveManageModal}
                disabled={isSavingManage}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md flex items-center gap-2"
              >
                {isSavingManage ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Guardar Cambios</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODAL: Populated MenuType Selections */}
      {showSelectionsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl max-w-7xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 px-6 py-4.5 bg-slate-50/50">
              <div className="space-y-0.5">
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-blue-600 animate-pulse" />
                  <span>Poner Selecciones - Raciones de {manualCliente}</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Ingresa los parámetros de consumo para cada día planificado del tipo de menú <span className="font-bold text-slate-700">"{manualMenuType}"</span>.
                </p>
              </div>
              <button 
                onClick={() => setShowSelectionsModal(false)} 
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Table Container */}
            <div className="overflow-auto flex-1 p-6">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                <table className="w-full text-left border-collapse text-xs table-fixed">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                      <th className="px-5 py-3 font-bold text-slate-500 uppercase tracking-wider text-[10px] w-[160px] bg-slate-50">Fecha</th>
                      <th className="px-5 py-3 font-bold text-slate-500 uppercase tracking-wider text-[10px] w-[180px] bg-slate-50">Sopa</th>
                      <th className="px-5 py-3 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">Fuerte 1 / Guarnición</th>
                      <th className="px-5 py-3 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">Fuerte 2 / Guarnición</th>
                      <th className="px-5 py-3 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">Menú Saludable</th>
                      <th className="px-5 py-3 font-bold text-slate-500 uppercase tracking-wider text-[10px] w-[240px] text-center bg-slate-50 border-l border-slate-100">Raciones / Parámetros</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {getMenuTypesWithContentInRange(manualFechaInicio, manualFechaFin, manualMenuType).map(d => {
                      const clientType = getSelectedClientType();
                      const sel = manualSelections[d.fecha] || (clientType === 'porcentaje' ? { f1_pct: 0, f2_pct: 0, ms_qty: 0 } : { f1_qty: 0, f2_qty: 0, ms_qty: 0 });
                      
                      const updateSelField = (field, val) => {
                        const parsedVal = val === "" ? "" : parseInt(val, 10);
                        
                        if (field === 'f1_pct' || field === 'f2_pct') {
                          const otherField = field === 'f1_pct' ? 'f2_pct' : 'f1_pct';
                          const otherVal = (parsedVal === "" || isNaN(parsedVal)) ? "" : Math.max(0, Math.min(100, 100 - parsedVal));
                          
                          setManualSelections(prev => ({
                            ...prev,
                            [d.fecha]: {
                              ...(prev[d.fecha] || { f1_pct: 0, f2_pct: 0, ms_qty: 0 }),
                              [field]: parsedVal === "" || isNaN(parsedVal) ? "" : Math.max(0, Math.min(100, parsedVal)),
                              [otherField]: otherVal
                            }
                          }));
                        } else if (field === 'ms_qty') {
                          const msVal = parsedVal === "" || isNaN(parsedVal) ? 0 : parsedVal;
                          
                          // Check if this is the first non-zero/empty quantity in any input of the modal
                          const allDays = getMenuTypesWithContentInRange(manualFechaInicio, manualFechaFin, manualMenuType);
                          const isFirstMs = msVal > 0 && allDays.every(day => {
                            const currentMs = manualSelections[day.fecha]?.ms_qty;
                            return currentMs === undefined || currentMs === null || currentMs === 0 || currentMs === "";
                          });
                          
                          if (isFirstMs) {
                            const confirmAll = window.confirm("¿Deseas aplicar esta cantidad de Menú Saludable a todos los días de la selección?");
                            if (confirmAll) {
                              setManualSelections(prev => {
                                const nextSel = { ...prev };
                                allDays.forEach(day => {
                                  const currentDaySel = nextSel[day.fecha] || (clientType === 'porcentaje' ? { f1_pct: 0, f2_pct: 0, ms_qty: 0 } : { f1_qty: 0, f2_qty: 0, ms_qty: 0 });
                                  nextSel[day.fecha] = {
                                    ...currentDaySel,
                                    ms_qty: msVal
                                  };
                                });
                                return nextSel;
                              });
                              return;
                            }
                          }
                          
                          // Normal single update
                          setManualSelections(prev => ({
                            ...prev,
                            [d.fecha]: {
                              ...(prev[d.fecha] || (clientType === 'porcentaje' ? { f1_pct: 0, f2_pct: 0, ms_qty: 0 } : { f1_qty: 0, f2_qty: 0, ms_qty: 0 })),
                              [field]: parsedVal === "" || isNaN(parsedVal) ? "" : parsedVal
                            }
                          }));
                        } else {
                          // normal f1_qty, f2_qty
                          setManualSelections(prev => ({
                            ...prev,
                            [d.fecha]: {
                              ...(prev[d.fecha] || (clientType === 'porcentaje' ? { f1_pct: 0, f2_pct: 0, ms_qty: 0 } : { f1_qty: 0, f2_qty: 0, ms_qty: 0 })),
                              [field]: parsedVal === "" || isNaN(parsedVal) ? "" : parsedVal
                            }
                          }));
                        }
                      };

                      const getDish = (types) => {
                        const found = d.items.find(it => types.includes(it.tipo.toUpperCase().trim().replace("Ó", "O")));
                        return found ? found.plato_nombre : null;
                      };

                      const sopa = getDish(["SOPA"]);
                      
                      const f1 = getDish(["FUERTE #1", "FUERTE 1"]);
                      const g1 = getDish(["GUARNICION #1", "GUARNICION 1"]);

                      const f2 = getDish(["FUERTE #2", "FUERTE 2"]);
                      const g2 = getDish(["GUARNICION #2", "GUARNICION 2"]);

                      const ms = getDish(["MENU SALUDABLE", "MENÚ SALUDABLE"]);
                      const ms_g = getDish(["GUARNICION SALUDABLE", "GUARNICIÓ SALUDABLE", "GUARNICIÒ SALUDABLE"]);

                      const dateTitle = getFormatDateTitle(d.fecha);
                      const weekday = dateTitle.split(',')[0];
                      const restOfDate = dateTitle.split(',')[1] || '';

                      return (
                        <tr key={d.fecha} className="hover:bg-slate-50/50 transition-colors">
                          {/* Fecha */}
                          <td className="px-5 py-4 whitespace-nowrap align-middle">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-100/50 capitalize">
                              {weekday}
                            </span>
                            <span className="text-[11px] text-slate-600 font-semibold block mt-1.5">{restOfDate.trim()}</span>
                            {((user?.rol === 'admin' || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Eliminar planificación'] || user?.permisos?.modules?.['Planificador']?.actions?.['Ver Costos Diarios']) || user?.permisos?.modules?.['Órdenes de fabricación']?.actions?.['Eliminar planificación'] || user?.permisos?.modules?.['Planificador']?.actions?.['Ver Costos Diarios']) && (
                              <>
                                <span className="text-[10px] text-blue-650 font-bold block mt-1">
                                  Costo Diario: {formatDailyCost(d)}
                                </span>
                                {d.ruta_asignada && (
                                  <span className="text-[10px] text-emerald-650 font-bold block mt-1">
                                    {d.ruta_asignada}
                                  </span>
                                )}
                              </>
                            )}
                          </td>

                          {/* Sopa */}
                          <td className="px-5 py-4 text-slate-700 align-middle">
                            {sopa ? (
                              <div className="font-semibold text-slate-800 line-clamp-2 leading-relaxed" title={sopa}>{sopa}</div>
                            ) : (
                              <span className="text-slate-400 italic font-mono">-</span>
                            )}
                          </td>

                          {/* Fuerte 1 */}
                          <td className="px-5 py-4 text-slate-700 align-middle">
                            {f1 ? (
                              <div className="space-y-1.5">
                                <div className="font-semibold text-slate-800 line-clamp-2 leading-relaxed" title={f1}>{f1}</div>
                                {g1 && (
                                  <div className="inline-flex items-center gap-1 bg-slate-100/70 border border-slate-200/50 text-slate-650 px-1.5 py-0.5 rounded-md text-[9px] font-bold select-none max-w-full">
                                    <span className="text-slate-400 font-extrabold">Acomp:</span>
                                    <span className="font-medium text-slate-600 truncate" title={g1}>{g1}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic font-mono">-</span>
                            )}
                          </td>

                          {/* Fuerte 2 */}
                          <td className="px-5 py-4 text-slate-700 align-middle">
                            {f2 ? (
                              <div className="space-y-1.5">
                                <div className="font-semibold text-slate-800 line-clamp-2 leading-relaxed" title={f2}>{f2}</div>
                                {g2 && (
                                  <div className="inline-flex items-center gap-1 bg-slate-100/70 border border-slate-200/50 text-slate-650 px-1.5 py-0.5 rounded-md text-[9px] font-bold select-none max-w-full">
                                    <span className="text-slate-400 font-extrabold">Acomp:</span>
                                    <span className="font-medium text-slate-600 truncate" title={g2}>{g2}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic font-mono">-</span>
                            )}
                          </td>

                          {/* Menú Saludable */}
                          <td className="px-5 py-4 text-slate-700 align-middle">
                            {ms ? (
                              <div className="space-y-1.5">
                                <div className="font-semibold text-emerald-800 line-clamp-2 leading-relaxed" title={ms}>{ms}</div>
                                {ms_g && (
                                  <div className="inline-flex items-center gap-1 bg-emerald-50/70 border border-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md text-[9px] font-bold select-none max-w-full">
                                    <span className="text-emerald-555 font-extrabold">Acomp:</span>
                                    <span className="font-medium text-emerald-850 truncate" title={ms_g}>{ms_g}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic font-mono">-</span>
                            )}
                          </td>

                          {/* Raciones / Parámetros */}
                          <td className="px-5 py-4 bg-slate-50/30 border-l border-slate-100 align-middle">
                            <div className="flex items-center justify-center gap-3">
                              {clientType === 'porcentaje' ? (
                                <>
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Fuerte 1</span>
                                    <div className="relative flex items-center shadow-2xs rounded-lg overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 bg-white">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={sel.f1_pct ?? 0}
                                        onChange={(e) => updateSelField('f1_pct', e.target.value)}
                                        className="w-14 px-1.5 py-1.5 text-xs font-bold text-slate-800 text-center outline-none bg-transparent"
                                      />
                                      <span className="pr-1.5 text-[10px] font-bold text-slate-400 bg-transparent select-none">%</span>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Fuerte 2</span>
                                    <div className="relative flex items-center shadow-2xs rounded-lg overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 bg-white">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={sel.f2_pct ?? 0}
                                        onChange={(e) => updateSelField('f2_pct', e.target.value)}
                                        className="w-14 px-1.5 py-1.5 text-xs font-bold text-slate-800 text-center outline-none bg-transparent"
                                      />
                                      <span className="pr-1.5 text-[10px] font-bold text-slate-400 bg-transparent select-none">%</span>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">MS</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={sel.ms_qty ?? 0}
                                      onChange={(e) => updateSelField('ms_qty', e.target.value)}
                                      className="w-12 px-1 py-1.5 bg-white border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 rounded-lg text-xs font-bold text-slate-800 text-center outline-none shadow-2xs"
                                    />
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">F1</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={sel.f1_qty ?? 0}
                                      onChange={(e) => updateSelField('f1_qty', e.target.value)}
                                      className="w-12 px-1 py-1.5 bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-lg text-xs font-bold text-slate-800 text-center outline-none shadow-2xs"
                                    />
                                  </div>
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">F2</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={sel.f2_qty ?? 0}
                                      onChange={(e) => updateSelField('f2_qty', e.target.value)}
                                      className="w-12 px-1 py-1.5 bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-lg text-xs font-bold text-slate-800 text-center outline-none shadow-2xs"
                                    />
                                  </div>
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">MS</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={sel.ms_qty ?? 0}
                                      onChange={(e) => updateSelField('ms_qty', e.target.value)}
                                      className="w-12 px-1 py-1.5 bg-white border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 rounded-lg text-xs font-bold text-slate-800 text-center outline-none shadow-2xs"
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 border-t border-slate-100 p-6 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowSelectionsModal(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setShowSelectionsModal(false)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md hover:shadow-lg flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Aceptar y Guardar</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* SUB-MODAL: Excel Import Preview (Reserved in DB) */}
      {showImportPreviewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl max-w-4xl w-full flex flex-col max-h-[85vh] overflow-hidden animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 px-6 py-4.5 bg-slate-50/50">
              <div className="space-y-0.5">
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600 animate-pulse" />
                  <span>Vista Previa de Importación (Reservado en Base de Datos)</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Verifica las raciones y platos que se han extraído y reservado temporalmente antes de confirmar la importación final.
                </p>
              </div>
              <button 
                onClick={() => setShowImportPreviewModal(false)} 
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-auto flex-1 p-6 space-y-6">
              {/* Global Assignments Selector */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
                <div>
                  <h4 className="text-xs font-extrabold text-blue-800 uppercase tracking-wide">Asignación Masiva</h4>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Asigna un Turno y Menú a todas las fechas de esta importación.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  {/* Global Turno Selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-655 flex items-center gap-0.5">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      <span>Turno General:</span>
                    </span>
                    <select
                      onChange={(e) => handleGlobalTurnoChange(e.target.value)}
                      className="bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-700 outline-none shadow-3xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">(Selecciona Turno)</option>
                      {shifts.map(sh => (
                        <option key={sh.id} value={sh.id}>{sh.nombre} ({sh.franja_horaria})</option>
                      ))}
                    </select>
                  </div>

                  {/* Global Menu Selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-655 flex items-center gap-0.5">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      <span>Menú General:</span>
                    </span>
                    <select
                      onChange={(e) => handleGlobalMenuTypeChange(e.target.value)}
                      className="bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-700 outline-none shadow-3xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">(Selecciona Menú)</option>
                      {menuTypes.map(mt => (
                        <option key={mt.id} value={mt.id}>{mt.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {(() => {
                const grouped = {};
                tempImportItems.forEach(item => {
                  if (!grouped[item.fecha]) {
                    grouped[item.fecha] = [];
                  }
                  grouped[item.fecha].push(item);
                });

                const dateKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
                if (dateKeys.length === 0) {
                  return (
                    <div className="text-center py-8 text-slate-400 italic text-sm">
                      No hay datos reservados en la base de datos.
                    </div>
                  );
                }

                return dateKeys.map(fecha => {
                  const items = grouped[fecha];
                  return (
                    <div key={fecha} className="border border-slate-200 rounded-xl p-4 bg-slate-50/30 shadow-2xs space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-150/80 pb-2.5">
                        <h4 className="font-extrabold text-xs text-blue-700 bg-blue-50/50 border border-blue-100/50 rounded-lg px-3 py-1.5 inline-block uppercase tracking-wider">
                          {getFormatDateTitle(fecha)}
                        </h4>
                        
                        <div className="flex items-center gap-4 text-xs">
                          {/* Turno Selector */}
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-500 flex items-center gap-0.5">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Turno:</span>
                            </span>
                            <select
                              value={previewAssignments[fecha]?.turno_id || ''}
                              onChange={(e) => setPreviewAssignments(prev => ({
                                ...prev,
                                [fecha]: { ...prev[fecha], turno_id: e.target.value }
                              }))}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-700 outline-none shadow-3xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">(Sin asignar)</option>
                              {shifts.map(sh => (
                                <option key={sh.id} value={sh.id}>{sh.nombre} ({sh.franja_horaria})</option>
                              ))}
                            </select>
                          </div>

                          {/* Menu Selector */}
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-500 flex items-center gap-0.5">
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>Menú:</span>
                            </span>
                            <select
                              value={previewAssignments[fecha]?.tipo_menu_id || ''}
                              onChange={(e) => setPreviewAssignments(prev => ({
                                ...prev,
                                [fecha]: { ...prev[fecha], tipo_menu_id: e.target.value }
                              }))}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-700 outline-none shadow-3xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">(Sin asignar)</option>
                              {menuTypes.map(mt => (
                                <option key={mt.id} value={mt.id}>{mt.nombre}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                      
                      <div className="border border-slate-150 rounded-lg overflow-hidden bg-white shadow-3xs">
                        <table className="w-full text-left border-collapse text-[11px] table-fixed">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="px-3 py-2 font-bold text-slate-500 w-[200px]">Plato / Receta</th>
                              <th className="px-3 py-2 font-bold text-slate-500 w-[100px]">Tipo</th>
                              <th className="px-3 py-2 font-bold text-slate-500 w-[80px] text-center">Total</th>
                              <th className="px-3 py-2 font-bold text-slate-500">Distribución de Raciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {items.filter(item => {
                              const isNameEmpty = !item.plato_nombre || item.plato_nombre.trim() === '' || item.plato_nombre.trim() === '-';
                              if (isNameEmpty) return false;
                              return true;
                            }).map(item => (
                              <tr key={item.id} className="hover:bg-slate-50/40 transition-colors">
                                <td className="px-3 py-2 font-bold text-slate-800 truncate" title={item.plato_nombre}>
                                  <>
                                    <span>{item.plato_nombre}</span>
                                    {getRecipeCostLabel(item.plato_nombre)}
                                  </>
                                </td>
                                <td className="px-3 py-2">
                                  <span className="inline-block px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold text-slate-600 uppercase">
                                    {item.tipo}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center font-extrabold text-slate-900">
                                  {item.total}
                                </td>
                                <td className="px-3 py-2 text-slate-700 truncate">
                                  {Object.entries(item.cantidades_clientes).map(([cName, data]) => {
                                    const details = data.pct > 0 
                                      ? `${(data.pct * 100).toFixed(0)}%` 
                                      : `${data.cant} und`;
                                    return (
                                      <span 
                                        key={cName} 
                                        className="inline-flex items-center gap-0.5 bg-blue-50 border border-blue-100/50 text-blue-750 px-1.5 py-0.5 rounded-md text-[9px] font-bold mr-1.5 mb-1 select-none"
                                      >
                                        <span className="text-blue-400 font-extrabold">{cName.split(' ')[0]}:</span>
                                        <span>{details}</span>
                                      </span>
                                    );
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 border-t border-slate-100 p-6 bg-slate-50/50">
              <button
                type="button"
                onClick={handleDiscardImport}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar y Descartar
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={confirmingImport}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md hover:shadow-lg flex items-center gap-1.5"
              >
                {confirmingImport ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando Planificación...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar e Importar Planificación</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: Notificación de Éxito al Importar */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-slate-205 shadow-2xl rounded-3xl p-8 max-w-sm w-full space-y-6 text-center animate-scale-up">
            <div className="w-16 h-16 bg-emerald-50 border-4 border-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">¡Carga Completada!</h3>
              <p className="text-slate-650 text-xs leading-relaxed">
                {successModalMessage}
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowSuccessModal(false)}
                className="w-full bg-blue-600 hover:bg-blue-500 active:scale-98 text-white px-5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
              >
                <span>Entendido, Continuar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Gestionar Turnos */}
      {showShiftsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl p-6 max-w-lg w-full space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-extrabold text-slate-800">Gestionar Turnos de Trabajo</h3>
              </div>
              <button 
                onClick={() => setShowShiftsModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of existing shifts */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Turnos Registrados</h4>
              {shifts.length === 0 ? (
                <p className="text-xs text-slate-400 italic font-mono py-2">No hay turnos registrados en el sistema.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
                  {shifts.map(sh => (
                    <div key={sh.id} className="flex justify-between items-center px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-slate-800">{sh.nombre}</span>
                        <span className="text-[10px] text-slate-500 font-mono font-medium">Horario: {sh.franja_horaria}</span>
                      </div>
                      <button 
                        onClick={() => handleDeleteShift(sh.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form to create shift */}
            <form onSubmit={handleAddShift} className="border-t border-slate-100 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Crear Nuevo Turno</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nombre del Turno</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Mañana, T1"
                    value={newShiftName}
                    onChange={(e) => setNewShiftName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Franja Horaria</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. 06:00 - 14:00"
                    value={newShiftHours}
                    onChange={(e) => setNewShiftHours(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={savingShift}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-center gap-1"
              >
                {savingShift ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando Turno...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Agregar Turno</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Gestionar Tipos de Menú */}
      {showMenuTypesModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl p-6 max-w-md w-full space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-extrabold text-slate-800">Gestionar Tipos de Menú</h3>
              </div>
              <button 
                onClick={() => setShowMenuTypesModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of existing menu types */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tipos de Menú Registrados</h4>
              {menuTypes.length === 0 ? (
                <p className="text-xs text-slate-400 italic font-mono py-2">No hay tipos de menú registrados en el sistema.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
                  {menuTypes.map(mt => (
                    <div key={mt.id} className="flex justify-between items-center px-4 py-3 hover:bg-slate-50 transition-colors">
                      <span className="text-xs font-bold text-slate-800">{mt.nombre}</span>
                      <button 
                        onClick={() => handleDeleteMenuType(mt.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form to create menu type */}
            <form onSubmit={handleAddMenuType} className="border-t border-slate-100 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Crear Nuevo Tipo de Menú</h4>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nombre del Tipo de Menú</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Regular, Ejecutivo, Dieta"
                  value={newMenuTypeName}
                  onChange={(e) => setNewMenuTypeName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={savingMenuType}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-center gap-1"
              >
                {savingMenuType ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando Menú...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Agregar Tipo de Menú</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Sincronizar Mes con Odoo */}
      {showOdooSyncModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl p-6 max-w-4xl w-full space-y-4 animate-scale-up flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-extrabold text-slate-800">
                  {odooSyncStep === 1 && "Sincronizar Meses con Odoo - Paso 1: Selección"}
                  {odooSyncStep === 2 && "Sincronizar Meses con Odoo - Paso 2: Crear Productos en Odoo"}
                  {odooSyncStep === 3 && "Sincronizar Meses con Odoo - Paso 3: Confirmar Órdenes de Fabricación (MO)"}
                  {odooSyncStep === 4 && "Sincronizar Meses con Odoo - Paso 4: Finalizado"}
                </h3>
              </div>
              <button 
                onClick={handleSafeCloseOdooModal}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning Banner */}
            {(odooSyncStep > 1 && odooSyncStep < 4) && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2 shrink-0">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 animate-pulse" />
                <span>Al salir de este modal o cerrarlo antes de completar todos los pasos se dañará el flujo del proceso de sincronización con Odoo.</span>
              </div>
            )}

            {/* Step 1 Content */}
            {odooSyncStep === 1 && (
              <>
                <div className="space-y-3 shrink-0">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Selecciona los Meses a Procesar</label>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 p-3 space-y-4 max-h-56 overflow-y-auto shadow-3xs">
                      {(() => {
                        const years = Array.from(new Set(availableMonths.map(m => m.split('-')[0]))).sort((a, b) => b.localeCompare(a));
                        return years.map(yr => {
                          const monthsInYear = availableMonths.filter(m => m.startsWith(yr));
                          const allYearChecked = monthsInYear.length > 0 && monthsInYear.every(m => selectedSyncMonths.includes(m));
                          const isExpanded = !!expandedOdooYears[yr];
                          
                          return (
                            <div key={yr} className="space-y-2 border-b border-slate-200/60 pb-3 last:border-0 last:pb-0">
                              {/* Year header row */}
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedOdooYears(prev => ({
                                      ...prev,
                                      [yr]: !prev[yr]
                                    }));
                                  }}
                                  className="flex items-center gap-1.5 hover:bg-slate-200/50 px-2 py-1 rounded-lg transition-colors font-black text-xs text-slate-800 cursor-pointer focus:outline-none"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                  )}
                                  <Building className="w-3.5 h-3.5 text-blue-500" />
                                  <span>Año {yr}</span>
                                </button>
                                <label className="flex items-center gap-1 cursor-pointer text-[10px] font-bold text-blue-650 hover:text-blue-500 select-none">
                                  <input 
                                    type="checkbox"
                                    checked={allYearChecked}
                                    onChange={(e) => {
                                      setOdooSyncResult(null);
                                      const checked = e.target.checked;
                                      let newMonths = [...selectedSyncMonths];
                                      const newSel = { ...selectedOdooDays };
                                      
                                      monthsInYear.forEach(m => {
                                        if (checked) {
                                          if (!newMonths.includes(m)) {
                                            newMonths.push(m);
                                          }
                                          productionDays.filter(d => getMonthYearKey(d.fecha) === m).forEach(d => {
                                            newSel[d.id] = true;
                                          });
                                        } else {
                                          newMonths = newMonths.filter(x => x !== m);
                                          productionDays.filter(d => getMonthYearKey(d.fecha) === m).forEach(d => {
                                            delete newSel[d.id];
                                          });
                                        }
                                      });
                                      
                                      setSelectedSyncMonths(newMonths);
                                      setSelectedOdooDays(newSel);
                                    }}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span>Seleccionar Todo {yr}</span>
                                </label>
                              </div>
                              
                              {/* Months list inside year */}
                              {isExpanded && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pl-2">
                                  {monthsInYear.map(m => {
                                    const isChecked = selectedSyncMonths.includes(m);
                                    const count = productionDays.filter(d => getMonthYearKey(d.fecha) === m).length;
                                    const [_, mo] = m.split('-');
                                    const monthsSpanish = {
                                      '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
                                      '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
                                      '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
                                    };
                                    const monthName = monthsSpanish[mo] || mo;
                                    
                                    return (
                                      <label 
                                        key={m} 
                                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                                          isChecked 
                                            ? 'bg-white border-blue-200 text-blue-700 shadow-3xs' 
                                            : 'bg-white/50 border-slate-200/85 text-slate-700 hover:bg-white hover:border-slate-350'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => {
                                            setOdooSyncResult(null);
                                            if (isChecked) {
                                              const newMonths = selectedSyncMonths.filter(x => x !== m);
                                              setSelectedSyncMonths(newMonths);
                                              const newSel = { ...selectedOdooDays };
                                              productionDays.filter(d => getMonthYearKey(d.fecha) === m).forEach(d => {
                                                delete newSel[d.id];
                                              });
                                              setSelectedOdooDays(newSel);
                                            } else {
                                              const newMonths = [...selectedSyncMonths, m];
                                              setSelectedSyncMonths(newMonths);
                                              const newSel = { ...selectedOdooDays };
                                              productionDays.filter(d => getMonthYearKey(d.fecha) === m).forEach(d => {
                                                newSel[d.id] = true;
                                              });
                                              setSelectedOdooDays(newSel);
                                            }
                                          }}
                                          className="cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="truncate">{monthName} ({count})</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>

                {/* List of Days to Sync in selected months */}
                {selectedSyncMonths.length > 0 && (
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 flex flex-col">
                    {/* Checkbox table */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-3xs flex-1 min-h-0 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 sticky top-0 z-10">
                            <th className="px-3 py-2 w-10 text-center bg-slate-50">
                              <input 
                                type="checkbox"
                                className="cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                checked={
                                  productionDays.filter(d => selectedSyncMonths.includes(getMonthYearKey(d.fecha))).length > 0 &&
                                  productionDays.filter(d => selectedSyncMonths.includes(getMonthYearKey(d.fecha))).every(d => selectedOdooDays[d.id])
                                }
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  const newSel = {};
                                  productionDays.filter(d => selectedSyncMonths.includes(getMonthYearKey(d.fecha))).forEach(d => {
                                    newSel[d.id] = checked;
                                  });
                                  setSelectedOdooDays(newSel);
                                }}
                              />
                            </th>
                            <th className="px-3 py-2 bg-slate-50">Día / Fecha</th>
                            <th className="px-3 py-2 bg-slate-50">Título del Producto en Odoo (Menú + DDMMAA)</th>
                            <th className="px-3 py-2 text-right bg-slate-50">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                          {productionDays
                            .filter(d => selectedSyncMonths.includes(getMonthYearKey(d.fecha)))
                            .sort((a, b) => a.fecha.localeCompare(b.fecha))
                            .map(dia => {
                              const isSelected = !!selectedOdooDays[dia.id];
                              const title = getOdooSpecialTitle(dia);
                              const isSynced = !!dia.odoo_product_id;
                              
                              return (
                                <tr 
                                  key={dia.id} 
                                  className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                                  onClick={() => {
                                    setSelectedOdooDays(prev => ({
                                      ...prev,
                                      [dia.id]: !prev[dia.id]
                                    }));
                                  }}
                                >
                                  <td className="px-3 py-2 w-10 text-center">
                                    <input 
                                      type="checkbox"
                                      className="cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                                      checked={isSelected}
                                      readOnly
                                    />
                                  </td>
                                  <td className="px-3 py-2 font-mono whitespace-nowrap">
                                    {dia.fecha.split('-').reverse().join('/')}
                                  </td>
                                  <td className="px-3 py-2 font-bold text-slate-900 break-all select-all">
                                    {title}
                                  </td>
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    {isSynced ? (
                                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-black text-[9px] border border-emerald-200">
                                        En Odoo
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-black text-[9px] border border-slate-200">
                                        Pendiente
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex gap-2.5 pt-3 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={handleSafeCloseOdooModal}
                    className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-705 font-bold rounded-xl text-xs cursor-pointer transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchOdooSync}
                    disabled={syncingOdooProducts || selectedSyncMonths.length === 0 || Object.values(selectedOdooDays).filter(Boolean).length === 0}
                    className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10"
                  >
                    {syncingOdooProducts ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Sincronizando con Odoo...</span>
                      </>
                    ) : (
                      <>
                        <CalendarRange className="w-4 h-4 text-emerald-100" />
                        <span>Sincronizar Selección ({Object.values(selectedOdooDays).filter(Boolean).length})</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Step 2 Content */}
            {odooSyncStep === 2 && (
              <>
                <div className="space-y-4 flex flex-col flex-1 min-h-0">
                  <p className="text-xs text-slate-550 leading-relaxed font-bold">
                    Los productos y listas de materiales se han creado correctamente en Odoo. Confirma y revisa la lista antes de proceder a la creación y confirmación de Órdenes de Fabricación en Odoo.
                  </p>
                  
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-3xs flex-1 min-h-0 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 sticky top-0 z-10">
                          <th className="px-3 py-2 bg-slate-50">Producto</th>
                          <th className="px-3 py-2 bg-slate-50">Día / Fecha</th>
                          <th className="px-3 py-2 text-right bg-slate-50">Estado Odoo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                        {odooSyncResult?.map((res, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-3 py-2 font-bold text-slate-900">{res.special_title}</td>
                            <td className="px-3 py-2 font-mono">
                              {productionDays.find(d => d.id === res.dia_id)?.fecha.split('-').reverse().join('/')}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-black text-[9px] border ${
                                res.status === 'created' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                res.status === 'exists' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                                {res.message}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center gap-2.5 shrink-0">
                    <input 
                      type="checkbox"
                      id="step2_confirm_checkbox"
                      checked={step2Confirmed}
                      onChange={(e) => setStep2Confirmed(e.target.checked)}
                      className="cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <label htmlFor="step2_confirm_checkbox" className="text-xs font-black text-slate-750 cursor-pointer select-none">
                      He verificado los productos creados y deseo proceder con la confirmación de fabricación en Odoo.
                    </label>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-3 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={handleSafeCloseOdooModal}
                    className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-705 font-bold rounded-xl text-xs cursor-pointer transition-colors"
                  >
                    Descartar y Salir
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateOdooMOs}
                    disabled={!step2Confirmed || syncingOdooMOs}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-350 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10"
                  >
                    {syncingOdooMOs ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Confirmando MOs en Odoo...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-blue-100" />
                        <span>Continuar (Generar MOs)</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Step 3 Content */}
            {odooSyncStep === 3 && (
              <>
                <div className="space-y-4 flex flex-col flex-1 min-h-0">
                  <p className="text-xs text-slate-550 leading-relaxed font-bold">
                    Las Órdenes de Fabricación (MO) se han creado y confirmado de forma automática en Odoo. Cada producto cuenta con su ruta o código asignado:
                  </p>
                  
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-3xs flex-1 min-h-0 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 sticky top-0 z-10">
                          <th className="px-3 py-2 bg-slate-50">Producto</th>
                          <th className="px-3 py-2 bg-slate-50">Ruta / Secuencia Asignada en Odoo</th>
                          <th className="px-3 py-2 text-right bg-slate-50">Resultado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                        {odooMoResults?.map((res, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-3 py-2 font-bold text-slate-900">{res.special_title}</td>
                            <td className="px-3 py-2 font-mono font-bold text-blue-600 select-all">{res.mo_name || "N/A"}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-black text-[9px] border ${
                                res.status === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                                {res.status === 'success' ? 'Confirmado y Listo' : 'Error'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-3 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={handleSafeCloseOdooModal}
                    className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-705 font-bold rounded-xl text-xs cursor-pointer transition-colors"
                  >
                    Salir
                  </button>
                  <button
                    type="button"
                    onClick={handleReplenishOdooComponents}
                    disabled={replenishingOdooInsumos}
                    className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-350 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-md"
                  >
                    {replenishingOdooInsumos ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Reabasteciendo Componentes...</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4 text-indigo-100 animate-pulse" />
                        <span>Reabastecer Componentes</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Step 4 (Success / Finished screen) */}
            {odooSyncStep === 4 && (
              <>
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-5 flex-1 min-h-0">
                  <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/10 animate-bounce">
                    <Check className="w-12 h-12 stroke-[3]" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-extrabold text-slate-900">¡Sincronización Completada!</h3>
                    <p className="text-sm text-slate-650 max-w-md mx-auto leading-relaxed">
                      Todos los productos han sido creados, las órdenes de fabricación confirmadas y los componentes reabastecidos con la ruta <span className="font-bold text-slate-800">"Fabricación Platos de comida"</span>. ¡Todo está listo para ser cocinado!
                    </p>
                  </div>
                </div>

                <div className="flex pt-3 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={handleSafeCloseOdooModal}
                    className="w-full px-5 py-3 bg-emerald-600 hover:bg-emerald-550 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors shadow-md hover:shadow-lg text-center"
                  >
                    Finalizar
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* MODAL: Agregar Plato a la Planificación */}
      {showAddPlateModal && addPlateDayRecord && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h3 className="text-base font-extrabold text-slate-950">
                Agregar Plato
              </h3>
              <button 
                type="button"
                onClick={() => {
                  setShowAddPlateModal(false);
                  setNewPlateNombre('');
                }} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-550 leading-relaxed">
                Agrega un nuevo plato a la planificación del <span className="font-bold text-slate-800">{getFormatDateTitle(addPlateDayRecord.fecha)}</span>.
                Podrás ingresar sus cantidades de manera manual para cada cliente desde su panel de parámetros.
              </p>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tipo de Plato</label>
                <select
                  value={newPlateTipo}
                  onChange={(e) => {
                    setNewPlateTipo(e.target.value);
                    setNewPlateNombre('');
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-205 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer"
                >
                  <option value="SOPA">SOPA</option>
                  <option value="FUERTE #1">FUERTE #1</option>
                  <option value="FUERTE #2">FUERTE #2</option>
                  <option value="ARROZ">ARROZ</option>
                  <option value="JUGO #1">JUGO #1</option>
                  <option value="JUGO #2">JUGO #2</option>
                  <option value="POSTRE">POSTRE</option>
                  <option value="GUARNICION #1">GUARNICION #1</option>
                  <option value="GUARNICION #2">GUARNICION #2</option>
                  <option value="ADEREZO">ADEREZO</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Seleccionar Plato</label>
                <select
                  value={newPlateNombre}
                  onChange={(e) => setNewPlateNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-205 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer"
                >
                  <option value="">-- Selecciona un Plato --</option>
                  {recipes
                    .filter(r => {
                      if (!r.categ_name) return false;
                      const cat = r.categ_name.toUpperCase();
                      const tipo = newPlateTipo.trim().toUpperCase().replace("Ó", "O");
                      
                      if (tipo === "SOPA") return cat.includes("SOPA");
                      if (tipo === "FUERTE #1") return cat.includes("FUERTE TIPO 1") || cat.includes("DESAYUNO TIPO 1");
                      if (tipo === "FUERTE #2") return cat.includes("FUERTE TIPO 2");
                      if (tipo === "ARROZ") return cat.includes("ARROCES");
                      if (tipo === "JUGO #1" || tipo === "JUGO #2" || tipo === "AGUA SABORIZADA") return cat.includes("JUGOS");
                      if (tipo === "POSTRE") return cat.includes("POSTRES");
                      if (tipo === "GUARNICION #1") return cat.includes("GUARNICIONES");
                      if (tipo === "GUARNICION #2") return cat.includes("GUARNICION TIPO 2");
                      if (tipo.startsWith("ADEREZO")) return cat.includes("ADEREZOS");
                      return false;
                    })
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
                    .map(r => (
                      <option key={r.id} value={r.nombre}>{r.nombre}</option>
                    ))
                  }
                </select>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowAddPlateModal(false);
                  setNewPlateNombre('');
                }}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddPlateToDay}
                disabled={savingNewPlate || !newPlateNombre}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingNewPlate ? 'Agregando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Agregar Cliente a la Planificación de un Día */}
      {showAddClientToDayModal && addClientToDayRecord && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h3 className="text-base font-extrabold text-slate-950">
                Agregar Cliente
              </h3>
              <button 
                type="button"
                onClick={() => setShowAddClientToDayModal(false)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-550 leading-relaxed">
                Selecciona un cliente para agregar al plan del <span className="font-bold text-slate-800">{getFormatDateTitle(addClientToDayRecord.fecha)}</span>. 
                Se le asignarán parámetros iniciales automáticos (10 raciones para clientes de cantidad o 50%/50% y 10 raciones totales para clientes de porcentaje) para que puedas editarlos.
              </p>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cliente a Agregar</label>
                <select
                  value={selectedClientToAdd}
                  onChange={(e) => setSelectedClientToAdd(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-205 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer"
                >
                  <option value="">-- Selecciona un Cliente --</option>
                  {clients
                    .filter(c => {
                      return getClientDayTotal(addClientToDayRecord, c.nombre) === 0;
                    })
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
                    .map(c => (
                      <option key={c.id} value={c.nombre}>{c.nombre} ({c.tipo === 'porcentaje' ? 'Porcentaje' : 'Cantidad'})</option>
                    ))
                  }
                </select>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddClientToDayModal(false)}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddClientToDay}
                disabled={savingAddClient || !selectedClientToAdd}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingAddClient ? 'Agregando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Math Modal */}
      {mathModalOpen && mathModalData.item && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-slate-50 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Operación Matemática</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">{mathModalData.item.plato_nombre} - {mathModalData.client}</p>
              </div>
              <button onClick={() => setMathModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-xl hover:bg-slate-200">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-6 flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cantidad Actual</span>
                <span className="text-3xl font-black text-slate-800 font-mono">{mathModalData.qty}</span>
              </div>
              
              <div className="flex gap-2 mb-6">
                {['+', '-', '*', '/'].map(op => (
                  <button
                    key={op}
                    onClick={() => setMathOperation(op)}
                    className={`flex-1 py-3 text-xl font-black rounded-xl transition-all ${
                      mathOperation === op
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 scale-105'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {op}
                  </button>
                ))}
              </div>
              
              <div className="mb-6">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-widest mb-2 ml-1">Valor a operar</label>
                <input
                  type="number"
                  value={mathInputValue}
                  onChange={(e) => setMathInputValue(e.target.value)}
                  placeholder="Ej: 50"
                  className="w-full text-center text-xl font-black font-mono px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-300 placeholder:font-medium"
                />
              </div>

              <div className="mb-6">
                <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                  <div className="flex-shrink-0 mt-0.5">
                    <input 
                      type="checkbox" 
                      checked={applyToFuture}
                      onChange={(e) => setApplyToFuture(e.target.checked)}
                      className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 focus:ring-offset-slate-50 bg-white"
                    />
                  </div>
                  <div>
                    <span className="block text-sm font-bold text-slate-800">Aplicar a fechas futuras</span>
                    <span className="block text-xs font-semibold text-slate-500 mt-0.5 leading-tight">
                      Esta operación afectará también a todas las fechas posteriores con el mismo turno y menú.
                    </span>
                  </div>
                </label>
              </div>
              
              
              <div className="pt-4 border-t border-slate-100 flex gap-2 flex-wrap sm:flex-nowrap">
                <button
                  onClick={() => setMathModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-3 bg-slate-100 text-slate-600 font-black rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                {mathModalData.item?.cantidades_clientes?.[mathModalData.client]?.base_cant !== undefined && (
                  <button
                    onClick={handleMathOperationReset}
                    disabled={savingMath}
                    className="w-full sm:w-auto px-4 py-3 bg-amber-100 text-amber-700 font-black rounded-xl hover:bg-amber-200 transition-colors"
                  >
                    Restablecer
                  </button>
                )}
                <button
                  onClick={handleMathOperationSave}
                  disabled={savingMath || !mathInputValue}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {savingMath ? <Loader2 className="animate-spin" /> : <Check />}
                  <span>Aplicar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Client Day Params */}
      {showParamsModal && paramsModalData && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h3 className="text-base font-extrabold text-slate-950 truncate max-w-[240px]">
                Parámetros: {paramsModalData.clientName}
              </h3>
              <button onClick={() => setShowParamsModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="text-slate-500 text-xs font-semibold space-y-1">
              <p>Fecha: {getFormatDateTitle(paramsModalData.fecha)}</p>
              <p className="capitalize">Tipo de Cliente: <span className="font-extrabold text-blue-600">{paramsModalData.clientType}</span></p>
            </div>

            <div className="space-y-3.5">
              {paramsModalData.clientType === 'porcentaje' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Total del Cliente (Raciones)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={modalTotal}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setModalTotal(e.target.value.replace(/[^0-9]/g, ''))}
                    className="no-spinner w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 outline-none transition-all"
                  />
                </div>
              )}

              {paramsModalData.clientType === 'cantidad' && (
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Calculado (F1 + F2 + MS)</div>
                  <div className="text-sm font-black text-slate-900 mt-0.5">
                    {(Number(modalF1) || 0) + (Number(modalF2) || 0) + (Number(modalMs) || 0)} Raciones
                  </div>
                </div>
              )}

              {/* Fuerte 1 & Fuerte 2 side-by-side in the same row */}
              {(paramsModalData.hasF1 || paramsModalData.hasF2) && (
                <div className="grid grid-cols-2 gap-3">
                  {paramsModalData.hasF1 && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1 truncate">
                        {paramsModalData.clientType === 'porcentaje' ? 'Fuerte #1 (%)' : 'Fuerte #1 (Cant.)'}
                      </label>
                      <div className="relative">
                        {paramsModalData.clientType === 'porcentaje' ? (
                          <select
                            value={modalF1}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setModalF1(val.toString());
                              setModalF2((100 - val).toString());
                            }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer"
                          >
                            {Array.from({ length: 21 }, (_, i) => i * 5).map(val => (
                              <option key={val} value={val}>{val}%</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={modalF1}
                            onWheel={(e) => e.target.blur()}
                            onChange={(e) => setModalF1(e.target.value.replace(/[^0-9]/g, ''))}
                            className="no-spinner w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 outline-none transition-all"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {paramsModalData.hasF2 && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1 truncate">
                        {paramsModalData.clientType === 'porcentaje' ? 'Fuerte #2 (%)' : 'Fuerte #2 (Cant.)'}
                      </label>
                      <div className="relative">
                        {paramsModalData.clientType === 'porcentaje' ? (
                          <select
                            value={modalF2}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setModalF2(val.toString());
                              setModalF1((100 - val).toString());
                            }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer"
                          >
                            {Array.from({ length: 21 }, (_, i) => i * 5).map(val => (
                              <option key={val} value={val}>{val}%</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={modalF2}
                            onWheel={(e) => e.target.blur()}
                            onChange={(e) => setModalF2(e.target.value.replace(/[^0-9]/g, ''))}
                            className="no-spinner w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 outline-none transition-all"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {paramsModalData.hasMs && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Menú Saludable (Cantidad)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={modalMs}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setModalMs(e.target.value.replace(/[^0-9]/g, ''))}
                    className="no-spinner w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 outline-none transition-all"
                  />
                </div>
              )}

              {paramsModalData.hasJugo2 && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Jugo #2 (Cantidad)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={modalJugo2}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setModalJugo2(e.target.value.replace(/[^0-9]/g, ''))}
                    className="no-spinner w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 outline-none transition-all"
                  />
                </div>
              )}
              {/* Manual/Extra Plates Quantities */}
              {paramsModalData.items && paramsModalData.items.some(it => it.cantidades_clientes?.__manual_qty__ === true) && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Cantidades Manuales</h4>
                  {paramsModalData.items
                    .filter(it => it.cantidades_clientes?.__manual_qty__ === true)
                    .map(it => (
                      <div key={it.id}>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1 truncate">
                          {it.plato_nombre} ({it.tipo})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={modalManualQty[it.id] || '0'}
                          onWheel={(e) => e.target.blur()}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setModalManualQty(prev => ({
                              ...prev,
                              [it.id]: val
                            }));
                          }}
                          className="no-spinner w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 outline-none transition-all"
                          placeholder="Cantidad..."
                        />
                      </div>
                    ))
                  }
                </div>
              )}
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowParamsModal(false)}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveParams}
                disabled={savingParams}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-750 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5"
              >
                {savingParams ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <span>Guardar</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {updatingOdooDayId && (
        <div className="fixed inset-0 z-[9999] bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
          <img 
            src={logoCircular} 
            alt="Sincronizando..." 
            className="w-24 h-24 object-contain animate-spin drop-shadow-xl"
          />
          <span className="mt-6 text-xl font-extrabold text-slate-800 tracking-tight animate-pulse">Sincronizando con Odoo...</span>
          <span className="mt-2 text-sm font-medium text-slate-500">Por favor, espera mientras se completan las operaciones en el ERP.</span>
        </div>
      )}

      {showRemoveClientModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl p-6 w-full max-w-2xl animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-base font-extrabold text-slate-950 flex items-center gap-2">
                <Users className="w-5 h-5 text-orange-500" />
                Quitar Cliente de Días
              </h3>
              <button onClick={() => setShowRemoveClientModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRemoveClientBulk} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Cliente a quitar</label>
                <select
                  required
                  value={removeClientData.cliente}
                  onChange={e => setRemoveClientData(p => ({ ...p, cliente: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-bold outline-none"
                >
                  <option value="">-- Seleccionar cliente --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">Rango de Fechas</label>
                <div className="w-full flex justify-center bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto">
                  <DatePicker
                    selectsRange={true}
                    startDate={removeClientData.fechaInicio ? parseISO(removeClientData.fechaInicio) : null}
                    endDate={removeClientData.fechaFin ? parseISO(removeClientData.fechaFin) : null}
                    onChange={(update) => {
                      const [start, end] = update;
                      setRemoveClientData(p => ({
                        ...p,
                        fechaInicio: start ? format(start, 'yyyy-MM-dd') : '',
                        fechaFin: end ? format(end, 'yyyy-MM-dd') : ''
                      }));
                    }}
                    monthsShown={2}
                    locale="es"
                    inline
                    includeDates={productionDays.map(d => parseISO(d.fecha))}
                  />
                </div>
                <div className="text-[10px] text-slate-400 mt-2 text-center">
                  (Solo puedes seleccionar fechas que actualmente tengan una planificación cargada)
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRemoveClientModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                  disabled={isRemovingClient}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRemovingClient}
                  className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-xl flex items-center gap-2"
                >
                  {isRemovingClient ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Quitando...
                    </>
                  ) : (
                    <>
                      <Trash className="w-4 h-4" />
                      Confirmar
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* MO Detail Modal (NUT/FABAL) */}
      {moDetailModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh] animate-scale-up">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <Factory className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">{moDetailModal.moName}</h2>
                  <p className="text-xs text-slate-500 font-medium">Orden de Fabricación — Odoo</p>
                </div>
              </div>
              <button onClick={() => setMoDetailModal(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {moDetailModal.loading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                  <p className="text-sm font-bold text-slate-500">Consultando Odoo...</p>
                </div>
              )}

              {moDetailModal.error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm font-bold">{moDetailModal.error}</p>
                </div>
              )}

              {moDetailModal.data && (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Producto</p>
                      <p className="text-xs font-black text-slate-800 mt-1 leading-tight">{moDetailModal.data.product_name}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Cantidad</p>
                      <p className="text-lg font-black text-emerald-700 mt-0.5">{moDetailModal.data.qty} <span className="text-xs font-bold">{moDetailModal.data.uom}</span></p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Estado</p>
                      <p className="text-xs font-black text-blue-800 mt-1">{moDetailModal.data.state}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                      <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Fecha</p>
                      <p className="text-xs font-black text-amber-800 mt-1">{moDetailModal.data.date_start?.slice(0,10) || '—'}</p>
                    </div>
                  </div>

                  {/* Components table */}
                  <div>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Componentes / Ingredientes</p>
                    {moDetailModal.data.components.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-6">Sin componentes registrados.</p>
                    ) : (
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left px-4 py-2.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">Producto</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">Por Consumir</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">Consumido</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">UdM</th>
                            </tr>
                          </thead>
                          <tbody>
                            {moDetailModal.data.components.map((comp, i) => (
                              <tr key={i} className={`border-b border-slate-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                <td className="px-4 py-2.5 font-bold text-slate-800 text-xs">{comp.product_name}</td>
                                <td className="px-4 py-2.5 text-right font-black text-slate-700 text-xs">{comp.qty_to_consume.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-bold text-slate-400 text-xs">{comp.qty_consumed.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{comp.uom}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end">
              <button onClick={() => setMoDetailModal(null)} className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all cursor-pointer">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nuevo Cliente Modal */}
      {showNewClientModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh] animate-scale-up relative">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">Nuevo Cliente (Excel)</h3>
                  <p className="text-xs font-bold text-slate-500">Añade clientes a fechas existentes.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewClientModal(false)}
                disabled={newClientUploading}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Turno Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Turno Asignado</label>
                <select
                  value={newClientTurnoId}
                  onChange={(e) => setNewClientTurnoId(e.target.value)}
                  disabled={newClientUploading}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="">-- Selecciona un Turno --</option>
                  {shifts.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre} ({s.franja_horaria})</option>
                  ))}
                </select>
              </div>

              {/* Menu Type Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo de Menú</label>
                <select
                  value={newClientMenuId}
                  onChange={(e) => setNewClientMenuId(e.target.value)}
                  disabled={newClientUploading}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="">-- Selecciona un Tipo de Menú --</option>
                  {menuTypes.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>

              {/* File Upload Button */}
              <div className="pt-2">
                <input 
                  type="file" 
                  ref={newClientFileInputRef} 
                  onChange={handleNewClientUpload} 
                  accept=".xlsx" 
                  className="hidden" 
                />
                <button
                  onClick={() => newClientFileInputRef.current?.click()}
                  disabled={newClientUploading || !newClientTurnoId || !newClientMenuId}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-3 rounded-xl font-black transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {newClientUploading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Procesando y Validando...</>
                  ) : (
                    <><Upload className="w-5 h-5" /> Subir Archivo Excel</>
                  )}
                </button>
                <p className="text-center text-[10px] font-bold text-slate-400 mt-3">
                  Asegúrate de seleccionar el turno y menú correctos antes de subir el archivo. <br/>
                  Solo se añadirán datos a fechas que ya existen en el sistema.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nueva Produccion Modal */}
      {showNewProductionModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl w-full max-w-3xl flex flex-col max-h-[90vh] animate-scale-up relative">
            
            {isSavingNewProd && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-[60] flex flex-col items-center justify-center rounded-2xl">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-3" />
                <p className="text-sm font-bold text-slate-700">Orquestando en Odoo...</p>
                <p className="text-xs text-slate-500 mt-1">Por favor espera, no cierres esta ventana.</p>
              </div>
            )}

            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <PlusCircle className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">Nueva Producción (Manual)</h3>
                  <p className="text-xs font-bold text-slate-500">Crea un producto y su orden de fabricación en Odoo.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewProductionModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {newProdError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold">Ocurrió un problema</p>
                    <p className="text-xs mt-0.5">{newProdError}</p>
                  </div>
                </div>
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5 lg:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre del Producto</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Jugo Especial, Pollo al Horno..."
                    value={newProdName}
                    onChange={e => setNewProdName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha a Producir</label>
                  <input
                    type="date"
                    required
                    value={newProdDate}
                    onChange={e => setNewProdDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Turno</label>
                  <select
                    value={newProdShift}
                    onChange={e => setNewProdShift(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">-- Selecciona --</option>
                    {shifts.map(s => (
                      <option key={s.id} value={s.nombre}>{s.nombre} ({s.franja_horaria})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo de Menú</label>
                  <select
                    value={newProdMenuType}
                    onChange={e => setNewProdMenuType(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">-- Selecciona --</option>
                    {menuTypes.map(m => (
                      <option key={m.id} value={m.nombre}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cliente</label>
                  <SearchableSelect
                    options={clients.map(c => ({ label: c.nombre, value: c.nombre }))}
                    value={newProdClient}
                    onChange={val => setNewProdClient(val)}
                    placeholder="Selecciona Cliente..."
                  />
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-1.5 mt-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cantidad Total a Producir (Raciones / Unidades)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={newProdQty}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setNewProdQty(val);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Ej. 25"
                />
                <p className="text-[10px] text-slate-400">Esta cantidad se usará como Cantidad a Producir en la Orden de Fabricación de Odoo (ruta: Fabricación Almuerzos / FABA).</p>
              </div>

              {/* Materials */}
              <div className="space-y-3 pb-48">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Lista de Materiales (Ingredientes)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewProdMaterials([...newProdMaterials, { id: Date.now(), category: '', odoo_product_id: '', qty: '', tipo: '' }]);
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Añadir Insumo/Plato
                  </button>
                </div>
                
                <div className="space-y-2">
                  {newProdMaterials.map((mat, idx) => {
                    const uniqueCategories = Array.from(new Set(recipes.map(r => r.categ_name))).filter(Boolean).sort();
                    const filteredRecipes = mat.category 
                      ? recipes.filter(r => r.categ_name === mat.category)
                      : recipes;

                    return (
                      <div key={mat.id} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        {/* Category Select */}
                        <div className="w-full sm:w-1/3">
                          <select
                            value={mat.category || ''}
                            onChange={e => {
                              const updated = [...newProdMaterials];
                              updated[idx].category = e.target.value;
                              updated[idx].odoo_product_id = ''; // Reset product when category changes
                              setNewProdMaterials(updated);
                            }}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                          >
                            <option value="">Todas las Categorías</option>
                            {uniqueCategories.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        
                        {/* Product Select */}
                        <div className="w-full sm:flex-1">
                          <SearchableSelect
                            options={filteredRecipes.map(r => ({ label: r.nombre, value: r.odoo_product_id }))}
                            value={mat.odoo_product_id}
                            onChange={(val, option) => {
                              const updated = [...newProdMaterials];
                              updated[idx].odoo_product_id = val;
                              // Guardar el nombre del producto para enviarlo al backend
                              const found = filteredRecipes.find(r => r.odoo_product_id === val);
                              updated[idx].nombre = found ? found.nombre : '';
                              setNewProdMaterials(updated);
                            }}
                            placeholder="Buscar receta/insumo..."
                          />
                        </div>
                        
                        <div className="w-full sm:w-28 shrink-0">
                          <input
                            type="text"
                            placeholder="Tipo (SOPA, etc)"
                            value={mat.tipo}
                            onChange={e => {
                              const updated = [...newProdMaterials];
                              updated[idx].tipo = e.target.value.toUpperCase();
                              setNewProdMaterials(updated);
                            }}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 uppercase"
                          />
                        </div>
                        
                        {/* Quantity */}
                        <div className="w-full sm:w-32 flex items-center gap-2 shrink-0">
                          <input
                            type="number"
                            step="0.001"
                            placeholder="Cant. BoM"
                            value={mat.qty}
                            onChange={e => {
                              const updated = [...newProdMaterials];
                              updated[idx].qty = e.target.value;
                              setNewProdMaterials(updated);
                            }}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setNewProdMaterials(newProdMaterials.filter(m => m.id !== mat.id));
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer shrink-0"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {newProdMaterials.length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No hay insumos añadados. Haz clic en "Añadir Insumo" para empezar.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${newProdStep === 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${newProdStep === 1 ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}`}>1</span>
                  Datos
                </div>
                <div className="h-px flex-1 bg-slate-200" />
                <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${newProdStep === 2 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${newProdStep === 2 ? 'bg-indigo-600 text-white' : 'bg-slate-300 text-slate-500'}`}>2</span>
                  Confirmar &amp; Enviar a Odoo
                </div>
              </div>

              {newProdStep === 2 && (
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                  <p className="font-black text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Revisa antes de enviar a Odoo</p>
                  <p className="text-slate-700"><span className="font-bold">Producto:</span> {newProdName}</p>
                  <p className="text-slate-700"><span className="font-bold">Fecha:</span> {newProdDate} | <span className="font-bold">Turno:</span> {newProdShift} | <span className="font-bold">Menú:</span> {newProdMenuType}</p>
                  <p className="text-slate-700"><span className="font-bold">Cliente:</span> {newProdClient} | <span className="font-bold">Total a Producir:</span> {newProdQty} unidades</p>
                  <div className="text-slate-700 mt-2 border-t border-amber-200/50 pt-2">
                    <span className="font-bold">Lista de Materiales ({newProdMaterials.length}):</span>
                    <ul className="mt-1 space-y-1">
                      {newProdMaterials.map(m => (
                        <li key={m.id} className="text-xs">
                          • {m.nombre || 'Producto'} <span className="text-amber-700 font-semibold">({m.tipo || 'Sin Tipo'})</span> - Cant. BoM: {m.qty}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-[10px] text-amber-700 mt-1 font-semibold">Se creará el producto en Odoo, su BoM y se lanzará una Orden de Fabricación con ruta &quot;Fabricación Almuerzos&quot;.</p>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (newProdStep === 2) { setNewProdStep(1); setNewProdError(''); }
                    else { setShowNewProductionModal(false); setNewProdStep(1); }
                  }}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all cursor-pointer"
                  disabled={isSavingNewProd}
                >
                  {newProdStep === 2 ? '← Volver' : 'Cancelar'}
                </button>
                <button
                  onClick={handleNewProductionSubmit}
                  disabled={isSavingNewProd}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all"
                >
                  {isSavingNewProd ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando en Odoo...
                    </>
                  ) : newProdStep === 1 ? (
                    <>
                      <span>Siguiente →</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Enviar a Producir en Odoo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY DE ANIMACION DE REABASTECIMIENTO DE COMPONENTES */}
      {replenishingOdooInsumos && (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm transition-all duration-300">
          <div className="relative flex items-center justify-center w-32 h-32 mb-8">
            <div className="absolute inset-0 bg-indigo-500 rounded-full blur-3xl opacity-30 animate-pulse"></div>
            
            <ChefHat className="absolute w-24 h-24 text-white drop-shadow-xl animate-bounce" style={{ animationDuration: '2s' }} />
            
            <div className="absolute top-1/2 left-0 -translate-x-full animate-[spin_3s_linear_infinite]">
              <Utensils className="w-10 h-10 text-emerald-400" />
            </div>
            <div className="absolute top-1/2 right-0 translate-x-full animate-[spin_3s_linear_infinite_reverse]">
              <Utensils className="w-10 h-10 text-amber-400" />
            </div>
          </div>
          
          <h2 className="text-3xl font-black text-white tracking-tight drop-shadow-md mb-3 text-center">
            Reabasteciendo Componentes en Odoo...
          </h2>
          <p className="text-lg font-medium text-slate-300 animate-pulse text-center max-w-md">
            Estamos cocinando tu planificación en los hornos de Odoo. 
            Este proceso puede tomar varios minutos. Por favor, sé paciente y no cierres esta ventana.
          </p>
          
          <div className="mt-8 flex items-center gap-3 bg-indigo-600/30 border border-indigo-500/50 rounded-full px-5 py-2.5">
            <Loader2 className="w-5 h-5 text-indigo-300 animate-spin" />
            <span className="text-sm font-bold text-indigo-100 tracking-wider uppercase">Procesando</span>
          </div>
        </div>
      )}
      {/* CHANGE DISH MODAL */}
      {changeDishModalOpen && changeDishItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                  <ChefHat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Cambiar Plato</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Sustituyendo: <span className="font-bold text-slate-700">{changeDishItem.plato_nombre}</span></p>
                </div>
              </div>
              <button onClick={() => { setChangeDishModalOpen(false); setChangeDishItem(null); }} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Filtrar por Categoría</label>
                  <select
                    className="w-full text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
                    value={changeDishCategory}
                    onChange={(e) => setChangeDishCategory(e.target.value)}
                  >
                    <option value="">-- Todas las Categorías --</option>
                    {Array.from(new Set(recipes.map(r => r.categ_name))).filter(Boolean).sort().map((c, idx) => (
                      <option key={idx} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Buscar Plato</label>
                  <input
                    type="text"
                    placeholder="Escriba para buscar..."
                    className="w-full text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 placeholder-slate-400 shadow-sm"
                    value={changeDishSearch}
                    onChange={(e) => setChangeDishSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm">
                <div className="max-h-[350px] overflow-y-auto">
                  {recipes
                    .filter(r => !changeDishCategory || r.categ_name === changeDishCategory)
                    .filter(r => !changeDishSearch || r.nombre.toLowerCase().includes(changeDishSearch.toLowerCase()))
                    .map((r, idx) => (
                      <div 
                        key={idx}
                        onClick={() => {
                          handleUpdateItemPlate(changeDishItem.id, r.nombre);
                          setChangeDishModalOpen(false);
                          setChangeDishItem(null);
                        }}
                        className="px-4 py-3 border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors flex flex-col justify-center"
                      >
                        <p className="text-sm font-bold text-slate-800">{r.nombre}</p>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase mt-0.5">{r.categ_name || 'Sin categoría'}</p>
                      </div>
                  ))}
                  {recipes.filter(r => !changeDishCategory || r.categ_name === changeDishCategory).filter(r => !changeDishSearch || r.nombre.toLowerCase().includes(changeDishSearch.toLowerCase())).length === 0 && (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm font-bold text-slate-500">No se encontraron platos.</p>
                      <p className="text-xs text-slate-400 mt-1">Intenta con otra búsqueda o categoría.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-end shrink-0">
              <button 
                onClick={() => { setChangeDishModalOpen(false); setChangeDishItem(null); }}
                className="px-6 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default PlannerManufacturingOrders;
