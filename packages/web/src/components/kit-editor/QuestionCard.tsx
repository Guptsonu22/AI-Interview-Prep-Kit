'use client';

import React, { useState } from 'react';
import { ProvenanceBadge } from './ProvenanceBadge';
import { AnswerOutlineEditor } from './AnswerOutlineEditor';
import {
  IconPin,
  IconEdit,
  IconTrash,
  IconCheck,
  IconX,
} from '../Icons';

export interface QuestionCardItem {
  id: string;
  prompt: string;
  category: 'technical' | 'behavioural' | 'system-design' | 'company-fit';
  difficulty?: number;
  answer_outline?: string;
  requirement_ids?: string[];
  pinned?: boolean;
  edited?: boolean;
  provenance?: 'generated' | 'edited' | 'pinned';
}

interface QuestionCardProps {
  question: QuestionCardItem;
  index: number;
  totalInList: number;
  onUpdate: (id: string, updates: Partial<QuestionCardItem>) => Promise<void> | void;
  onDelete: (id: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isSaving?: boolean;
}

export function QuestionCard({
  question,
  index,
  totalInList,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  isSaving = false,
}: QuestionCardProps) {
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState(question.prompt);
  const [isDragging, setIsDragging] = useState(false);

  const handleTogglePin = () => {
    onUpdate(question.id, { pinned: !question.pinned });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate(question.id, { category: e.target.value as any });
  };

  const handleSavePrompt = async () => {
    if (!promptText.trim()) return;
    await onUpdate(question.id, { prompt: promptText.trim(), edited: true });
    setIsEditingPrompt(false);
  };

  const handleCancelPrompt = () => {
    setPromptText(question.prompt);
    setIsEditingPrompt(false);
  };

  const handleSaveOutline = async (newOutline: string) => {
    await onUpdate(question.id, { answer_outline: newOutline, edited: true });
  };

  const isPinned = !!question.pinned;

  return (
    <div
      draggable
      onDragStart={(e) => {
        setIsDragging(true);
        onDragStart?.(e);
      }}
      onDragEnd={() => setIsDragging(false)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`card p-5 border transition-all ${
        isDragging
          ? 'opacity-40 border-cyan-500 scale-[0.99]'
          : isPinned
          ? 'border-cyan-500/40 bg-slate-900/90 shadow-md shadow-cyan-950/20'
          : 'border-slate-800 bg-slate-900/75 hover:border-slate-700/80'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        {/* Left: Drag Handle + ID + Category + Provenance Badge */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          {/* Visual Grab Handle */}
          <div
            className="cursor-grab active:cursor-grabbing p-1 text-slate-500 hover:text-slate-300"
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>

          <span className="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
            {question.id}
          </span>

          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 text-[10px] font-semibold uppercase tracking-wider">
            {question.category}
          </span>

          <ProvenanceBadge
            pinned={question.pinned}
            edited={question.edited}
            state={question.provenance}
          />

          <span className="text-[10px] text-slate-500 font-mono">
            Diff: {question.difficulty === 3 ? 'Senior' : question.difficulty === 2 ? 'Mid' : 'Entry'}
          </span>
        </div>

        {/* Right Actions: Reorder Keyboard Controls, Pin, Delete */}
        <div className="flex items-center space-x-1">
          {/* Accessible Keyboard Move Up */}
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              disabled={index === 0}
              className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20"
              title="Move question up"
              aria-label="Move question up"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          )}

          {/* Accessible Keyboard Move Down */}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              disabled={index === totalInList - 1}
              className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20"
              title="Move question down"
              aria-label="Move question down"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {/* Pin Toggle */}
          <button
            type="button"
            onClick={handleTogglePin}
            className={`p-1.5 rounded-lg transition-colors ${
              isPinned
                ? 'text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
            title={isPinned ? 'Unpin question' : 'Pin question (protects from regeneration)'}
            aria-label={isPinned ? 'Unpin question' : 'Pin question'}
          >
            <IconPin className="w-4 h-4" />
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={() => onDelete(question.id)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            title="Delete question"
            aria-label="Delete question"
          >
            <IconTrash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Prompt Body (Inline Editable) */}
      <div className="mt-3">
        {isEditingPrompt ? (
          <div className="space-y-2">
            <textarea
              rows={2}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              className="input text-xs font-semibold leading-relaxed"
              autoFocus
            />
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleSavePrompt}
                disabled={isSaving || !promptText.trim()}
                className="btn-primary !py-0.5 !px-2.5 text-xs flex items-center space-x-1"
              >
                <IconCheck className="w-3 h-3" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={handleCancelPrompt}
                className="btn-secondary !py-0.5 !px-2 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between group/prompt">
            <h3
              onClick={() => setIsEditingPrompt(true)}
              className="text-sm font-bold text-white hover:text-cyan-400 cursor-pointer transition-colors leading-snug"
              title="Click to edit prompt inline"
            >
              {question.prompt}
            </h3>
            <button
              type="button"
              onClick={() => setIsEditingPrompt(true)}
              className="opacity-0 group-hover/prompt:opacity-100 p-1 text-slate-500 hover:text-cyan-400 transition-opacity ml-2 flex-shrink-0"
              title="Edit prompt"
            >
              <IconEdit className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Answer Outline Editor */}
      <AnswerOutlineEditor
        initialOutline={question.answer_outline || ''}
        onSave={handleSaveOutline}
        isSaving={isSaving}
      />

      {/* Bottom Footer: Linked Requirements & Category Changer */}
      <div className="mt-3.5 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
        {/* Linked Requirements */}
        <div className="flex items-center space-x-1.5 flex-wrap">
          <span className="text-[11px] text-slate-500">Targets:</span>
          {(question.requirement_ids || []).length > 0 ? (
            question.requirement_ids?.map((rid) => (
              <span
                key={rid}
                className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800"
                title={`Mapped to requirement ${rid}`}
              >
                {rid}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-slate-600 italic">None</span>
          )}
        </div>

        {/* Change Category Selector */}
        <div className="flex items-center space-x-1.5">
          <span className="text-[10px] text-slate-500">Category:</span>
          <select
            value={question.category}
            onChange={handleCategoryChange}
            className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="technical">Technical</option>
            <option value="behavioural">Behavioural</option>
            <option value="system-design">System Design</option>
            <option value="company-fit">Company Fit</option>
          </select>
        </div>
      </div>
    </div>
  );
}
