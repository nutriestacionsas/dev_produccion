import React from 'react';
import { ChefHat, Info, AlertTriangle, MessageSquare } from 'lucide-react';

const DishRowItem = ({ producto, onClick }) => {
  const { plato_nombre, tipo, cantidad_teorica, peso_despachado, unidades_despachadas, novedad, estado_badge, delta } = producto;

  const renderBadge = () => {
    switch (estado_badge) {
      case 'adicional':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black rounded-full whitespace-nowrap">
            <AlertTriangle className="w-3.5 h-3.5" />
            +{delta} Adicional
          </span>
        );
      case 'faltante':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-orange-700 text-xs font-black rounded-full whitespace-nowrap">
            <AlertTriangle className="w-3.5 h-3.5" />
            {delta} Faltante
          </span>
        );
      case 'exacto':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-black rounded-full whitespace-nowrap">
            Exacto
          </span>
        );
    }
  };

  return (
    <div 
      onClick={onClick}
      className="group grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer items-center"
    >
      {/* Mobile: Label, Desktop: Hidden */}
      <div className="md:hidden text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Producto / Plato</div>
      
      {/* Column 1: Producto */}
      <div className="md:col-span-5 flex items-start gap-3">
        <div className="p-2 bg-slate-100 text-slate-500 rounded-lg group-hover:bg-white group-hover:shadow-sm transition-all shrink-0">
          <ChefHat className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800 line-clamp-2 leading-tight">{plato_nombre}</h4>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{tipo}</span>
        </div>
      </div>

      {/* Mobile: Label */}
      <div className="md:hidden text-xs font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1">Cantidades</div>

      {/* Column 2: Cantidades */}
      <div className="md:col-span-4 flex flex-col md:flex-row gap-2 md:items-center text-sm font-medium">
        <div className="flex flex-col">
          <span className="text-slate-500 text-xs font-bold uppercase">Solicitado</span>
          <span className="text-slate-700">{cantidad_teorica} Unds</span>
        </div>
        <div className="hidden md:block w-px h-8 bg-slate-200 mx-2"></div>
        <div className="flex flex-col">
          <span className="text-slate-500 text-xs font-bold uppercase">Despachado</span>
          <span className="text-slate-800 font-bold">{unidades_despachadas} Unds <span className="text-slate-400 text-xs font-medium ml-1">({peso_despachado} kg)</span></span>
        </div>
      </div>

      {/* Column 3: Badge and Info */}
      <div className="md:col-span-3 flex items-center justify-between md:justify-end gap-4 mt-2 md:mt-0">
        <div className="flex items-center gap-2">
          {novedad && (
            <div className="p-1.5 bg-yellow-50 text-yellow-600 rounded-lg" title="Tiene novedades">
              <MessageSquare className="w-4 h-4" />
            </div>
          )}
          {renderBadge()}
        </div>
        <div className="p-2 text-slate-300 group-hover:text-indigo-500 transition-colors">
          <Info className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};

export default DishRowItem;
