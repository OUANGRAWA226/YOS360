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
    border: 'border-l-4 border-l-[#0270B8]',
    bg: 'bg-sky-50 dark:bg-sky-950/20',
    text: 'text-sky-950 dark:text-sky-200',
    titleColor: 'text-[#0270B8] dark:text-[#4FAEEB]',
    icon: Info,
  },
  warning: {
    border: 'border-l-4 border-l-[#f59e0b]',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-950 dark:text-amber-200',
    titleColor: 'text-amber-800 dark:text-amber-300',
    icon: AlertTriangle,
  },
  danger: {
    border: 'border-l-4 border-l-[#dc2626]',
    bg: 'bg-rose-50 dark:bg-rose-950/20',
    text: 'text-rose-950 dark:text-rose-200',
    titleColor: 'text-rose-800 dark:text-rose-300',
    icon: AlertCircle,
  },
  success: {
    border: 'border-l-4 border-l-[#48B068]',
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    text: 'text-emerald-950 dark:text-emerald-200',
    titleColor: 'text-[#117A35] dark:text-[#5CC47D]',
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
