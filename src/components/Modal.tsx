import React, { useEffect } from 'react';
import { X } from 'lucide-react';

type Props = {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
};

export function Modal({
  open,
  isOpen,
  onClose,
  title,
  children,
  footer,
  icon,
  size = 'md',
}: Props) {
  const isVisible = Boolean(open ?? isOpen);

  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-5xl',
  }[size] || 'max-w-lg';

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && 'render' in icon)) {
      const IconComp = icon as React.ComponentType<{ className?: string }>;
      return <IconComp className="w-4 h-4 text-[#0270B8] dark:text-[#4FAEEB]" />;
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs animate-[fadeIn_0.15s_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* AdminLTE v4 Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative bg-white dark:bg-[#0c1612] border border-slate-200 dark:border-[#192b22] rounded-xl shadow-2xl w-full ${sizeClass} max-h-[92vh] flex flex-col animate-[slideUp_0.2s_ease-out] overflow-hidden my-auto`}
      >
        {/* AdminLTE Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-[#192b22] bg-slate-50/80 dark:bg-[#08100c]/90 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {renderIcon()}
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide truncate">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer la boîte de dialogue"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors flex-shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* AdminLTE Modal Body */}
        <div className="px-5 py-4 sm:p-6 overflow-y-auto flex-1 text-slate-800 dark:text-slate-200">
          {children}
        </div>

        {/* Optional AdminLTE Modal Footer */}
        {footer && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-[#192b22] bg-slate-50/60 dark:bg-[#08100c]/60 flex items-center justify-end gap-2 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
