import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' | 'must' | 'nice';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  error: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  info: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
  neutral: 'bg-slate-800 text-slate-300 border border-slate-700',
  primary: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  must: 'bg-rose-500/15 text-rose-300 font-semibold border border-rose-500/30 uppercase tracking-wider text-[10px]',
  nice: 'bg-slate-800 text-slate-400 border border-slate-700/80 text-[10px]',
};

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
    case 'ready':
      return <Badge variant="success">Ready</Badge>;
    case 'generating':
    case 'in_progress':
      return (
        <Badge variant="primary" className="animate-pulse">
          Generating...
        </Badge>
      );
    case 'failed':
      return <Badge variant="error">Failed</Badge>;
    case 'pending':
    default:
      return <Badge variant="warning">Queued</Badge>;
  }
}
