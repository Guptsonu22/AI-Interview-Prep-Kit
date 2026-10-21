'use client';

import React from 'react';
import { Modal } from '../ui/Modal';
import {
  IconRotateCw,
  IconAlertTriangle,
  IconShield,
  IconCheckCircle,
} from '../Icons';

export type RegenerationTarget =
  | { type: 'company-brief'; title: 'Company Intelligence Brief' }
  | { type: 'questions'; category: 'technical' | 'behavioural' | 'system-design' | 'company-fit'; title: string }
  | { type: 'schedule'; title: 'Day-by-Day Study Schedule' };

interface RegenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: RegenerationTarget | null;
  onConfirm: () => void;
  isPending: boolean;
  error?: string | null;
  currentVersion?: number;
}

export function RegenerationModal({
  isOpen,
  onClose,
  target,
  onConfirm,
  isPending,
  error,
  currentVersion,
}: RegenerationModalProps) {
  if (!target) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={isPending ? () => {} : onClose}
      title={`Regenerate ${target.title}`}
      description="Update this section using fresh LLM synthesis and verified research."
      maxWidth="md"
    >
      <div className="space-y-4 text-xs">
        {/* Preservation Guarantee Box */}
        <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center space-x-1.5 text-cyan-400 font-semibold text-xs">
            <IconShield className="w-4 h-4" />
            <span>State Preservation Rules Active</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1 leading-relaxed">
            <li>
              <strong>Pinned items:</strong> Any questions, flashcards, or briefs marked with a pin are <span className="text-cyan-300">never overwritten</span>.
            </li>
            <li>
              <strong>User modifications:</strong> Content you created or manually edited is preserved.
            </li>
            <li>
              <strong>Unrelated sections:</strong> All other kit sections remain untouched.
            </li>
            {currentVersion !== undefined && (
              <li className="text-slate-400">
                Server concurrency check: Version <span className="font-mono text-slate-200">v{currentVersion}</span>
              </li>
            )}
          </ul>
        </div>

        {/* Conflict / Error Banner */}
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 space-y-1">
            <div className="flex items-center space-x-1.5 font-bold">
              <IconAlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>Regeneration Failed</span>
            </div>
            <p className="text-[11px] text-rose-200/90 leading-relaxed pl-5">
              {error.includes('Conflict')
                ? 'Version Conflict: The kit was modified elsewhere. Please refresh your workspace before regenerating.'
                : error}
            </p>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="btn-secondary text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="btn-primary text-xs flex items-center space-x-1.5"
          >
            {isPending ? (
              <>
                <IconRotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Synthesizing...</span>
              </>
            ) : (
              <>
                <IconRotateCw className="w-3.5 h-3.5" />
                <span>Confirm & Regenerate</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
