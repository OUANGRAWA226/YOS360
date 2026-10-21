import { AlertTriangle, X } from 'lucide-react';

type Props = {
  open?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning' | 'primary' | 'success';
};

export function ConfirmDialog({
  open,
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmer',
  variant = 'danger',
}: Props) {
  const isVisible = Boolean(open ?? isOpen);
  const handleClose = () => {
    if (onClose) onClose();
    if (onCancel) onCancel();
  };

  if (!isVisible) return null;

  const btnVariantClass = {
    danger: 'btn-lte-danger',
    warning: 'btn-lte-warning',
    primary: 'btn-lte-primary',
    success: 'btn-lte-success',
  }[variant] || 'btn-lte-danger';

  const textVariantClass = {
    danger: 'text-rose-600 dark:text-rose-400',
    warning: 'text-amber-600 dark:text-amber-400',
    primary: 'text-[#0270B8] dark:text-sky-400',
    success: 'text-[#48B068] dark:text-emerald-400',
  }[variant] || 'text-rose-600 dark:text-rose-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs animate-[fadeIn_0.15s_ease-out]"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* AdminLTE Dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative bg-white dark:bg-[#0c1612] border border-slate-200 dark:border-[#192b22] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-[slideUp_0.2s_ease-out]"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-[#192b22] bg-slate-50/80 dark:bg-[#08100c]/90">
          <div className={`flex items-center gap-2 ${textVariantClass} font-bold text-xs uppercase tracking-wider`}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Confirmation requise</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-[#192b22] bg-slate-50/60 dark:bg-[#08100c]/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              handleClose();
            }}
            className={`btn-lte btn-lte-sm ${btnVariantClass} font-semibold`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
