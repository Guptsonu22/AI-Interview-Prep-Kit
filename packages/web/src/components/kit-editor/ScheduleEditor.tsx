'use client';

import React, { useState } from 'react';
import { RegenerationModal } from './RegenerationModal';
import { Modal } from '../ui/Modal';
import {
  IconCalendar,
  IconClock,
  IconEdit,
  IconRotateCw,
  IconBriefcase,
  IconCheck,
} from '../Icons';

export interface ScheduleDayItem {
  day: number;
  focus: string;
  minutes: number;
  question_ids: string[];
}

interface ScheduleEditorProps {
  days: ScheduleDayItem[];
  daysAvailable: number;
  kitVersion?: number;
  onUpdateDay: (dayNumber: number, updates: { focus: string; minutes: number }) => Promise<void> | void;
  onRegenerateSchedule: () => Promise<void>;
  isRegenerating?: boolean;
  regenerationError?: string | null;
}

export function ScheduleEditor({
  days,
  daysAvailable,
  kitVersion,
  onUpdateDay,
  onRegenerateSchedule,
  isRegenerating = false,
  regenerationError,
}: ScheduleEditorProps) {
  const [editingDay, setEditingDay] = useState<ScheduleDayItem | null>(null);
  const [dayFocus, setDayFocus] = useState('');
  const [dayMinutes, setDayMinutes] = useState(60);
  const [isRegenModalOpen, setIsRegenModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Ensure all requested days from 1 to daysAvailable are shown, filling any gaps with light workload placeholders if needed
  const normalizedDays: ScheduleDayItem[] = [];
  for (let i = 1; i <= daysAvailable; i++) {
    const existing = days.find((d) => d.day === i);
    if (existing) {
      normalizedDays.push(existing);
    } else {
      normalizedDays.push({
        day: i,
        focus: 'Review & Flashcard Reinforcement',
        minutes: 30,
        question_ids: [],
      });
    }
  }

  const handleStartEdit = (day: ScheduleDayItem) => {
    setEditingDay(day);
    setDayFocus(day.focus);
    setDayMinutes(day.minutes);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDay || !dayFocus.trim()) return;

    setIsSaving(true);
    try {
      await onUpdateDay(editingDay.day, {
        focus: dayFocus.trim(),
        minutes: Number(dayMinutes) || 60,
      });
      setEditingDay(null);
    } finally {
      setIsSaving(false);
    }
  };

  const totalAllocatedMinutes = normalizedDays.reduce((acc, d) => acc + (d.minutes || 0), 0);
  const totalHours = (totalAllocatedMinutes / 60).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Schedule Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <IconCalendar className="w-5 h-5 text-cyan-400" />
            <span>Deterministic Study Schedule ({daysAvailable} Days)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Total effort: <strong className="text-slate-200">{totalHours} hrs</strong> ({totalAllocatedMinutes} mins) scheduled across {daysAvailable} days.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsRegenModalOpen(true)}
          disabled={isRegenerating}
          className="btn-secondary text-xs flex items-center space-x-1.5 border-cyan-500/30 text-cyan-300 hover:bg-slate-800"
          title="Re-balance schedule algorithmically using bin-packing"
        >
          <IconRotateCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
          <span>Re-balance Schedule</span>
        </button>
      </div>

      {/* Days Timeline */}
      <div className="space-y-3.5">
        {normalizedDays.map((item) => (
          <div
            key={item.day}
            className="card p-5 border-slate-800 bg-slate-900/80 hover:border-slate-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <span className="px-3 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold text-xs flex-shrink-0">
                  Day {item.day}
                </span>
                <h3 className="text-sm font-bold text-white">{item.focus}</h3>
              </div>

              <div className="flex items-center space-x-4 text-xs text-slate-400">
                <span className="flex items-center space-x-1">
                  <IconClock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{item.minutes} minutes</span>
                </span>

                <span className="flex items-center space-x-1">
                  <IconBriefcase className="w-3.5 h-3.5 text-slate-500" />
                  <span>{item.question_ids.length} assigned question{item.question_ids.length === 1 ? '' : 's'}</span>
                </span>
              </div>

              {/* Question ID Pills */}
              {item.question_ids.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {item.question_ids.map((qid) => (
                    <span
                      key={qid}
                      className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800"
                    >
                      {qid}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleStartEdit(item)}
              className="btn-secondary text-xs self-start md:self-auto flex items-center space-x-1.5"
            >
              <IconEdit className="w-3.5 h-3.5" />
              <span>Edit Day Plan</span>
            </button>
          </div>
        ))}
      </div>

      {/* Edit Day Modal */}
      <Modal
        isOpen={!!editingDay}
        onClose={() => setEditingDay(null)}
        title={`Edit Day ${editingDay?.day} Plan`}
      >
        <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
          <div>
            <label className="label">Focus Topic / Core Goal</label>
            <input
              type="text"
              required
              value={dayFocus}
              onChange={(e) => setDayFocus(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="label">Time Budget (Minutes)</label>
            <input
              type="number"
              min={10}
              max={600}
              step={10}
              required
              value={dayMinutes}
              onChange={(e) => setDayMinutes(parseInt(e.target.value, 10))}
              className="input"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setEditingDay(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !dayFocus.trim()}
              className="btn-primary text-xs flex items-center space-x-1"
            >
              <IconCheck className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Update Day Plan'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Regeneration Modal */}
      <RegenerationModal
        isOpen={isRegenModalOpen}
        onClose={() => setIsRegenModalOpen(false)}
        target={{ type: 'schedule', title: 'Day-by-Day Study Schedule' }}
        onConfirm={async () => {
          await onRegenerateSchedule();
          setIsRegenModalOpen(false);
        }}
        isPending={isRegenerating}
        error={regenerationError}
        currentVersion={kitVersion}
      />
    </div>
  );
}
