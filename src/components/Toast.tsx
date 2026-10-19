import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

let toastId = 0;
const listeners: ((toast: Toast) => void)[] = [];

export function showToast(message: string, type: ToastType = 'success') {
  const toast = { id: ++toastId, message, type };
  listeners.forEach((l) => l(toast));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4000);
    };
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  const remove = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] space-y-2 max-w-sm">
      {toasts.map((toast) => {
        const config = {
          success: { icon: CheckCircle2, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', iconColor: 'text-emerald-600' },
          error: { icon: AlertCircle, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', iconColor: 'text-red-600' },
          info: { icon: Info, bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-800', iconColor: 'text-sky-600' },
        }[toast.type];
        const Icon = config.icon;
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 ${config.bg} ${config.border} border rounded-xl px-4 py-3 shadow-lg animate-[slideInRight_0.2s_ease-out]`}
          >
            <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
            <p className={`text-sm ${config.text} flex-1`}>{toast.message}</p>
            <button
              onClick={() => remove(toast.id)}
              className={`${config.iconColor} hover:opacity-70 transition-opacity flex-shrink-0`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
