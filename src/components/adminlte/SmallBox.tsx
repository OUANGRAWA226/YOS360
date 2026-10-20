import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRightCircle } from 'lucide-react';

export type SmallBoxVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'secondary' | 'dark';

interface SmallBoxProps {
  title?: string | number;
  value?: string | number;
  text?: string;
  variant?: SmallBoxVariant;
  icon?: LucideIcon | string | React.ComponentType<{ className?: string }> | React.ReactNode;
  linkText?: string;
  footerText?: string;
  onLinkClick?: () => void;
  className?: string;
}

const variantStyles: Record<SmallBoxVariant, {
  bg: string;
  text: string;
  footerBg: string;
  footerHover: string;
  iconColor: string;
}> = {
  primary: {
    bg: 'bg-[#0270B8]', // YOS Brand Azure Blue
    text: 'text-white',
    footerBg: 'bg-black/15',
    footerHover: 'hover:bg-black/25',
    iconColor: 'text-black/15 group-hover:text-black/25',
  },
  success: {
    bg: 'bg-[#48B068]', // YOS Brand Emerald Green
    text: 'text-white',
    footerBg: 'bg-black/15',
    footerHover: 'hover:bg-black/25',
    iconColor: 'text-black/15 group-hover:text-black/25',
  },
  warning: {
    bg: 'bg-[#ffc107]',
    text: 'text-gray-900',
    footerBg: 'bg-black/10',
    footerHover: 'hover:bg-black/20',
    iconColor: 'text-black/15 group-hover:text-black/25',
  },
  danger: {
    bg: 'bg-[#dc3545]',
    text: 'text-white',
    footerBg: 'bg-black/15',
    footerHover: 'hover:bg-black/25',
    iconColor: 'text-black/15 group-hover:text-black/25',
  },
  info: {
    bg: 'bg-[#0dcaf0]',
    text: 'text-gray-900',
    footerBg: 'bg-black/10',
    footerHover: 'hover:bg-black/20',
    iconColor: 'text-black/15 group-hover:text-black/25',
  },
  secondary: {
    bg: 'bg-[#6c757d]',
    text: 'text-white',
    footerBg: 'bg-black/15',
    footerHover: 'hover:bg-black/25',
    iconColor: 'text-black/15 group-hover:text-black/25',
  },
  dark: {
    bg: 'bg-[#212529]',
    text: 'text-white',
    footerBg: 'bg-white/10',
    footerHover: 'hover:bg-white/20',
    iconColor: 'text-white/15 group-hover:text-white/25',
  },
};

export const SmallBox: React.FC<SmallBoxProps> = ({
  title,
  value,
  text,
  variant = 'primary',
  icon,
  linkText = "Plus d'infos",
  footerText,
  onLinkClick,
  className = '',
}) => {
  const v = variantStyles[variant];
  const displayValue = value !== undefined ? value : title;
  const displayLabel = value !== undefined ? (title || text || '') : (text || '');
  const displayFooter = footerText || linkText;

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && 'render' in icon)) {
      const IconComp = icon as React.ComponentType<{ className?: string }>;
      return <IconComp className="w-16 h-16 sm:w-20 sm:h-20 stroke-[1.25]" />;
    }
    if (typeof icon === 'string') {
      return <i className={`${icon} text-6xl sm:text-7xl`} />;
    }
    return null;
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-md shadow-sm transition-all duration-300 hover:shadow-md ${v.bg} ${v.text} ${className}`}
    >
      {/* Inner Content */}
      <div className="relative z-10 p-4 sm:p-5">
        <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-none mb-1">
          {displayValue}
        </h3>
        <p className="text-sm font-semibold tracking-wide uppercase opacity-90 truncate">
          {displayLabel}
        </p>
      </div>

      {/* Watermark Icon (Scales up smoothly on hover - Iconic AdminLTE v4 effect) */}
      {icon && (
        <div
          className={`absolute top-2 right-2 pointer-events-none transition-transform duration-300 ease-out group-hover:scale-110 ${v.iconColor}`}
        >
          {renderIcon()}
        </div>
      )}

      {/* Small Box Footer */}
      {onLinkClick ? (
        <button
          onClick={onLinkClick}
          type="button"
          className={`relative z-20 w-full text-center py-1.5 px-3 text-xs font-semibold tracking-wide transition-colors duration-150 flex items-center justify-center gap-1.5 ${v.footerBg} ${v.footerHover}`}
        >
          <span>{displayFooter}</span>
          <ArrowRightCircle className="w-3.5 h-3.5" />
        </button>
      ) : (
        <div className={`py-1.5 px-3 text-center text-xs opacity-75 ${v.footerBg}`}>
          {displayFooter}
        </div>
      )}
    </div>
  );
};
