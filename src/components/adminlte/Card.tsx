import React, { useState } from 'react';
import { Minus, Plus, Maximize2, Minimize2 } from 'lucide-react';

export type CardVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'secondary' | 'dark' | 'default';

interface CardProps {
  title?: React.ReactNode;
  variant?: CardVariant;
  outline?: boolean;
  tools?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  collapsible?: boolean;
  maximizable?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
  noPadding?: boolean;
}

const outlineTopBorders: Record<CardVariant, string> = {
  primary: '',
  success: '',
  warning: '',
  danger: '',
  info: '',
  secondary: '',
  dark: '',
  default: '',
};

const solidHeaderBgs: Record<CardVariant, string> = {
  primary: 'bg-[#0270B8] text-white',
  success: 'bg-[#48B068] text-white',
  warning: 'bg-[#f59e0b] text-gray-900',
  danger: 'bg-[#dc2626] text-white',
  info: 'bg-[#0284c7] text-white',
  secondary: 'bg-[#64748b] text-white',
  dark: 'bg-[#1e293b] text-white',
  default: 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white',
};

export const Card: React.FC<CardProps> = ({
  title,
  variant = 'primary',
  outline = true,
  tools,
  children,
  footer,
  collapsible = false,
  maximizable = false,
  defaultCollapsed = false,
  className = '',
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  icon,
  noPadding = false,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [maximized, setMaximized] = useState(false);

  const outlineStyle = outline ? outlineTopBorders[variant] : '';
  const headerSolidStyle = !outline && variant !== 'default' ? solidHeaderBgs[variant] : '';

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && 'render' in icon)) {
      const IconComp = icon as React.ComponentType<{ className?: string }>;
      return <IconComp className="w-4 h-4" />;
    }
    if (typeof icon === 'string') {
      return <i className={`${icon} text-base`} />;
    }
    return null;
  };

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-xs transition-all duration-200 ${
        maximized
          ? 'fixed inset-4 z-50 overflow-auto shadow-2xl bg-white dark:bg-slate-900'
          : ''
      } ${outlineStyle} ${className}`}
    >
      {/* Card Header */}
      {(title || tools || collapsible || maximizable) && (
        <div
          className={`flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-800 ${headerSolidStyle} ${headerClassName}`}
        >
          {/* Card Title */}
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="flex-shrink-0 text-current opacity-85">{renderIcon()}</span>}
            {typeof title === 'string' ? (
              <h3 className="text-base font-semibold tracking-tight truncate">
                {title}
              </h3>
            ) : (
              title
            )}
          </div>

          {/* Card Tools */}
          <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
            {tools}

            {collapsible && (
              <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                title={collapsed ? 'Agrandir' : 'Réduire'}
              >
                {collapsed ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
              </button>
            )}

            {maximizable && (
              <button
                type="button"
                onClick={() => setMaximized(!maximized)}
                className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                title={maximized ? 'Restaurer' : 'Plein écran'}
              >
                {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Card Body */}
      {!collapsed && (
        <div className={`${noPadding ? 'p-0' : 'p-4 sm:p-5'} ${bodyClassName}`}>
          {children}
        </div>
      )}

      {/* Card Footer */}
      {!collapsed && footer && (
        <div
          className={`px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-800 rounded-b-md ${footerClassName}`}
        >
          {footer}
        </div>
      )}
    </div>
  );
};
