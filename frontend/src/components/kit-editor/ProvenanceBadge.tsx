import React from 'react';
import { IconPin, IconEdit, IconSparkles } from '../Icons';

export type ProvenanceState = 'generated' | 'edited' | 'pinned';

interface ProvenanceBadgeProps {
  state?: ProvenanceState | string;
  pinned?: boolean;
  edited?: boolean;
  className?: string;
}

export function ProvenanceBadge({ state, pinned, edited, className = '' }: ProvenanceBadgeProps) {
  const actualState: ProvenanceState = pinned
    ? 'pinned'
    : edited || state === 'edited'
    ? 'edited'
    : 'generated';

  if (actualState === 'pinned') {
    return (
      <span
        title="Pinned: protected against all future regenerations"
        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 ${className}`}
      >
        <IconPin className="w-2.5 h-2.5" />
        <span>Pinned</span>
      </span>
    );
  }

  if (actualState === 'edited') {
    return (
      <span
        title="User Edited: customized content preserved during regeneration"
        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 ${className}`}
      >
        <IconEdit className="w-2.5 h-2.5" />
        <span>User Edited</span>
      </span>
    );
  }

  return (
    <span
      title="AI Generated: baseline content grounded in evidence"
      className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700/80 ${className}`}
    >
      <IconSparkles className="w-2.5 h-2.5 text-slate-500" />
      <span>AI Generated</span>
    </span>
  );
}
