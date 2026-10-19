import React from 'react';
import { Info, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';

export type CalloutVariant = 'info' | 'warning' | 'danger' | 'success';

interface CalloutProps {
  title?: string;
  variant?: CalloutVariant;
  children: React.ReactNode;
  className?: string;
}

const calloutStyles: Record<CalloutVariant, {
  border: string;
  bg: string;
  text: string;
  titleColor: string;
  icon: typeof Info;
}> = {
  info: {
    border: 'border-l-4 border-l-[#0dcaf0]',
    bg: 'bg-cyan-50 dark:bg-cyan-950/20',
    text: 'text-cyan-900 dark:text-cyan-200',
    titleColor: 'text-cyan-800 dark:text-cyan-300',
    icon: Info,
  },
  warning: {
    border: 'border-l-4 border-l-[#ffc107]',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-900 dark:text-amber-200',
    titleColor: 'text-amber-800 dark:text-amber-300',
    icon: AlertTriangle,
  },
  danger: {
    border: 'border-l-4 border-l-[#dc3545]',
    bg: 'bg-rose-50 dark:bg-rose-950/20',
    text: 'text-rose-900 dark:text-rose-200',
    titleColor: 'text-rose-800 dark:text-rose-300',
    icon: AlertCircle,
  },
  success: {
    border: 'border-l-4 border-l-[#198754]',
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    text: 'text-emerald-900 dark:text-emerald-200',
    titleColor: 'text-emerald-800 dark:text-emerald-300',
    icon: CheckCircle2,
  },
};

export const Callout: React.FC<CalloutProps> = ({
  title,
  variant = 'info',
  children,
  className = '',
}) => {
  const style = calloutStyles[variant];
  const Icon = style.icon;

  return (
    <div
      className={`p-4 rounded-r-md ${style.border} ${style.bg} ${style.text} ${className}`}
    >
      {title && (
        <h5 className={`font-bold flex items-center gap-2 mb-1.5 text-sm sm:text-base ${style.titleColor}`}>
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span>{title}</span>
        </h5>
      )}
      <div className="text-xs sm:text-sm leading-relaxed">{children}</div>
    </div>
  );
};
