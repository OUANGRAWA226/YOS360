import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type InfoBoxVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'secondary' | 'dark';

interface InfoBoxProps {
  title: string;
  value: string | number;
  variant?: InfoBoxVariant;
  icon?: LucideIcon | string | React.ComponentType<{ className?: string }> | React.ReactNode;
  progress?: number; // 0 to 100
  description?: string;
  className?: string;
  onClick?: () => void;
}

const iconVariantBg: Record<InfoBoxVariant, string> = {
  primary: 'bg-[#0d6efd] text-white',
  success: 'bg-[#198754] text-white',
  warning: 'bg-[#ffc107] text-gray-900',
  danger: 'bg-[#dc3545] text-white',
  info: 'bg-[#0dcaf0] text-gray-900',
  secondary: 'bg-[#6c757d] text-white',
  dark: 'bg-[#212529] text-white',
};

const progressVariantBg: Record<InfoBoxVariant, string> = {
  primary: 'bg-[#0d6efd]',
  success: 'bg-[#198754]',
  warning: 'bg-[#ffc107]',
  danger: 'bg-[#dc3545]',
  info: 'bg-[#0dcaf0]',
  secondary: 'bg-[#6c757d]',
  dark: 'bg-[#212529]',
};

export const InfoBox: React.FC<InfoBoxProps> = ({
  title,
  value,
  variant = 'primary',
  icon,
  progress,
  description,
  className = '',
  onClick,
}) => {
  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && 'render' in icon)) {
      const IconComp = icon as React.ComponentType<{ className?: string }>;
      return <IconComp className="w-7 h-7 sm:w-8 sm:h-8 stroke-[1.75]" />;
    }
    if (typeof icon === 'string') {
      return <i className={`${icon} text-2xl sm:text-3xl`} />;
    }
    return null;
  };

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center bg-white dark:bg-slate-900 rounded-md border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden p-2 min-h-[76px] transition-all duration-200 hover:shadow-md ${
        onClick ? 'cursor-pointer hover:border-sky-400' : ''
      } ${className}`}
    >
      {/* Icon Square */}
      <div
        className={`w-14 h-14 sm:w-16 sm:h-16 rounded flex items-center justify-center flex-shrink-0 shadow-sm ${iconVariantBg[variant]}`}
      >
        {renderIcon()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 px-3.5 py-1">
        <span className="block text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
          {title}
        </span>
        <span className="block text-xl sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">
          {value}
        </span>

        {/* Optional Progress Bar */}
        {typeof progress === 'number' && (
          <div className="mt-1.5 w-full bg-gray-200 dark:bg-slate-700 h-1 rounded-full overflow-hidden">
            <div
              className={`h-full ${progressVariantBg[variant]} transition-all duration-500`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}

        {/* Optional Description */}
        {description && (
          <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {description}
          </span>
        )}
      </div>
    </div>
  );
};
