import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { hideSplash } from '@/lib/splash';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('YOS360 Uncaught Error:', error, errorInfo);
    hideSplash(); // l'écran de chargement ne doit pas masquer le message d'erreur
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 rounded-2xl border border-red-500/40 p-8 text-center text-slate-100 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-400" />
            </div>
            <h1 className="text-xl font-bold mb-2">Une erreur est survenue</h1>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              L'application a rencontré un problème inattendu lors de l'affichage.
            </p>
            {this.state.error?.message && (
              <div className="bg-slate-950 text-red-300 font-mono text-xs p-3 rounded-xl mb-6 text-left overflow-x-auto border border-slate-700">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-all shadow-lg shadow-sky-600/30"
            >
              <RefreshCw className="w-4 h-4" /> Recharger la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
