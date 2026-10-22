'use client';

import React, { useState } from 'react';
import { IconEdit, IconCheck, IconX } from '../Icons';

interface AnswerOutlineEditorProps {
  initialOutline: string;
  onSave: (newOutline: string) => Promise<void> | void;
  isSaving?: boolean;
}

export function AnswerOutlineEditor({
  initialOutline,
  onSave,
  isSaving = false,
}: AnswerOutlineEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [outline, setOutline] = useState(initialOutline);
  const [hasChanges, setHasChanges] = useState(false);

  const handleStartEdit = () => {
    setOutline(initialOutline);
    setIsEditing(true);
    setHasChanges(false);
  };

  const handleCancel = () => {
    setOutline(initialOutline);
    setIsEditing(false);
    setHasChanges(false);
  };

  const handleSave = async () => {
    await onSave(outline);
    setIsEditing(false);
    setHasChanges(false);
  };

  if (!isEditing) {
    return (
      <div className="mt-3 p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 group/outline transition-all">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Model Answer Outline & Key Points
          </span>
          <button
            type="button"
            onClick={handleStartEdit}
            className="text-[11px] text-slate-500 hover:text-cyan-400 flex items-center space-x-1 opacity-0 group-hover/outline:opacity-100 transition-opacity"
            title="Edit answer outline"
          >
            <IconEdit className="w-3 h-3" />
            <span>Edit</span>
          </button>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
          {initialOutline || <span className="italic text-slate-500">No answer outline provided. Click to add talking points.</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 p-3.5 bg-slate-950 rounded-xl border border-cyan-500/40 ring-1 ring-cyan-500/20 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
          Editing Model Answer Outline
        </span>
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="p-1 rounded text-slate-400 hover:text-slate-200"
            title="Cancel"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary !py-0.5 !px-2 text-[11px] flex items-center space-x-1"
            title="Save outline"
          >
            <IconCheck className="w-3 h-3" />
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      <textarea
        rows={4}
        value={outline}
        onChange={(e) => {
          setOutline(e.target.value);
          setHasChanges(true);
        }}
        placeholder="Key concepts, trade-offs, step-by-step approach, pitfalls..."
        className="input text-xs font-mono leading-relaxed"
        autoFocus
      />
    </div>
  );
}
