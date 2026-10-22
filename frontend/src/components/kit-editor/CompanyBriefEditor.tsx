'use client';

import React, { useState, useEffect } from 'react';
import { ProvenanceBadge } from './ProvenanceBadge';
import { RegenerationModal } from './RegenerationModal';
import {
  IconBuilding,
  IconEdit,
  IconCheck,
  IconX,
  IconRotateCw,
  IconExternalLink,
  IconPin,
  IconAlertTriangle,
} from '../Icons';

export interface CompanyBriefData {
  name?: string;
  summary?: string;
  what_they_do?: string;
  sources?: string[];
  pinned?: boolean;
  edited?: boolean;
}

interface CompanyBriefEditorProps {
  brief: CompanyBriefData;
  companyUrl: string;
  kitVersion?: number;
  onSaveBrief: (updates: Partial<CompanyBriefData>) => Promise<void>;
  onRegenerateBrief: () => Promise<void>;
  isSaving?: boolean;
  isRegenerating?: boolean;
  error?: string | null;
}

export function CompanyBriefEditor({
  brief,
  companyUrl,
  kitVersion,
  onSaveBrief,
  onRegenerateBrief,
  isSaving = false,
  isRegenerating = false,
  error,
}: CompanyBriefEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [summary, setSummary] = useState(brief.summary || '');
  const [whatTheyDo, setWhatTheyDo] = useState(brief.what_they_do || '');
  const [isRegenModalOpen, setIsRegenModalOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setSummary(brief.summary || '');
    setWhatTheyDo(brief.what_they_do || '');
  }, [brief]);

  const handleStartEdit = () => {
    setSummary(brief.summary || '');
    setWhatTheyDo(brief.what_they_do || '');
    setIsEditing(true);
    setLocalError(null);
  };

  const handleCancel = () => {
    setSummary(brief.summary || '');
    setWhatTheyDo(brief.what_they_do || '');
    setIsEditing(false);
    setLocalError(null);
  };

  const handleSave = async () => {
    try {
      await onSaveBrief({
        summary: summary.trim(),
        what_they_do: whatTheyDo.trim(),
        edited: true,
      });
      setIsEditing(false);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to save company brief.');
    }
  };

  const handleTogglePin = async () => {
    await onSaveBrief({ pinned: !brief.pinned });
  };

  const isPinned = !!brief.pinned;

  return (
    <div className="space-y-6">
      <div className="card p-6 border-slate-800 bg-slate-900/80 space-y-4">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <IconBuilding className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">
                  {brief.name || 'Company Intelligence Brief'}
                </h2>
                <ProvenanceBadge pinned={brief.pinned} edited={brief.edited} />
              </div>
              <a
                href={companyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-400 hover:text-cyan-400 flex items-center space-x-1 mt-0.5"
              >
                <span>{companyUrl}</span>
                <IconExternalLink className="w-3 h-3 text-slate-500" />
              </a>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Pin Toggle */}
            <button
              type="button"
              onClick={handleTogglePin}
              className={`p-1.5 rounded-lg border text-xs flex items-center space-x-1.5 transition-colors ${
                isPinned
                  ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title={isPinned ? 'Unpin Company Brief' : 'Pin Company Brief (protect against regeneration)'}
            >
              <IconPin className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">{isPinned ? 'Pinned' : 'Pin'}</span>
            </button>

            {/* Edit Button */}
            {!isEditing && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="btn-secondary text-xs flex items-center space-x-1.5"
              >
                <IconEdit className="w-3.5 h-3.5" />
                <span>Edit Brief</span>
              </button>
            )}

            {/* Regenerate Control */}
            <button
              type="button"
              onClick={() => setIsRegenModalOpen(true)}
              disabled={isPinned || isRegenerating}
              className="btn-secondary text-xs flex items-center space-x-1.5 border-cyan-500/30 text-cyan-300 hover:bg-slate-800 disabled:opacity-40"
              title={isPinned ? 'Section is pinned. Unpin to regenerate.' : 'Regenerate company brief'}
            >
              <IconRotateCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
              <span>Regen Brief</span>
            </button>
          </div>
        </div>

        {/* Local Error or Concurrency Error Banner */}
        {(localError || error) && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
            <IconAlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Error updating brief:</span>
              <span>{localError || error}</span>
            </div>
          </div>
        )}

        {/* Content Body */}
        {isEditing ? (
          <div className="space-y-4 pt-1">
            <div>
              <label className="label">Overview & Core Mission</label>
              <textarea
                rows={4}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="input text-xs leading-relaxed"
                placeholder="Company culture, mission, founding history..."
              />
            </div>

            <div>
              <label className="label">What They Do, Tech Stack & Business Model</label>
              <textarea
                rows={4}
                value={whatTheyDo}
                onChange={(e) => setWhatTheyDo(e.target.value)}
                className="input text-xs leading-relaxed"
                placeholder="Key software architecture, products, markets..."
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary text-xs flex items-center space-x-1.5"
              >
                <IconCheck className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div>
              <h3 className="text-xs uppercase font-semibold text-slate-400">Overview & Culture</h3>
              <p className="mt-1 text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                {brief.summary || 'Crawled company overview will appear here.'}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800">
              <h3 className="text-xs uppercase font-semibold text-slate-400">What They Do & Products</h3>
              <p className="mt-1 text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                {brief.what_they_do || 'Products, architecture, and technology initiatives.'}
              </p>
            </div>
          </div>
        )}

        {/* Verified Grounded Evidence Sources */}
        <div className="pt-4 border-t border-slate-800">
          <h3 className="text-xs uppercase font-semibold text-slate-400 mb-2">
            Verified Source Citations ({brief.sources?.length || 0})
          </h3>
          {brief.sources && brief.sources.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {brief.sources.map((src, idx) => (
                <a
                  key={idx}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-cyan-400 hover:text-cyan-300 hover:border-slate-700 flex items-center space-x-1.5 transition-colors"
                >
                  <span className="truncate max-w-xs">{src}</span>
                  <IconExternalLink className="w-3 h-3 text-slate-500 flex-shrink-0" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No external citations attached.</p>
          )}
        </div>
      </div>

      {/* Regeneration Modal */}
      <RegenerationModal
        isOpen={isRegenModalOpen}
        onClose={() => setIsRegenModalOpen(false)}
        target={{ type: 'company-brief', title: 'Company Intelligence Brief' }}
        onConfirm={async () => {
          await onRegenerateBrief();
          setIsRegenModalOpen(false);
        }}
        isPending={isRegenerating}
        error={error}
        currentVersion={kitVersion}
      />
    </div>
  );
}
