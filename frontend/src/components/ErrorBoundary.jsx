import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-rose-200">
            <div className="bg-rose-50 px-6 py-4 border-b border-rose-200 flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-xl font-bold text-rose-800">Error Inesperado en la AplicaciA3n</h2>
            </div>
            <div className="p-6 overflow-auto max-h-[60vh]">
              <p className="text-sm text-slate-600 mb-4">
                Ha ocurrido un error al intentar mostrar esta pantalla. Por favor, toma una captura de pantalla de los detalles de abajo y envA-ala a soporte.
              </p>
              <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-rose-300 overflow-x-auto whitespace-pre-wrap">
                <p className="font-bold mb-2">{this.state.error && this.state.error.toString()}</p>
                <p className="text-slate-400">
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </p>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => {
                  this.setState({ hasError: false });
                  window.location.reload();
                }}
                className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition-colors"
              >
                Recargar pA!gina
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
