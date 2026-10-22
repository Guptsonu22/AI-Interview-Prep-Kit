'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '../ui/Badge';
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconPlay,
  IconBriefcase,
  IconLayers,
  IconRotateCw,
  IconInfo,
  IconArrowRight,
} from '../Icons';

export interface WeakSpotItem {
  requirementId: string;
  requirementText: string;
  category: string;
  priority: 'must' | 'nice';
  status: 'critical' | 'needs_practice' | 'proficient';
  urgencyScore: number;
  practiceCount: number;
  totalCards: number;
  averageConfidence: number | null;
  strugglingAttempts: number;
  linkedQuestionIds: string[];
  linkedQuestions: Array<{ id: string; prompt: string; category: string }>;
  linkedFlashcardIds: string[];
}

interface WeakSpotsResponse {
  generatedAt: string;
  totalRequirements: number;
  weakSpotsCount: number;
  rankedWeakSpots: WeakSpotItem[];
  recommendedPractice: {
    recommendedFlashcardIds: string[];
    focusTopics: string[];
    summary: string;
  };
  disclaimer: string;
}

interface WeakSpotsViewProps {
  kitId: string;
  onLaunchFocusedPractice?: (cardIds: string[]) => void;
}

export function WeakSpotsView({ kitId, onLaunchFocusedPractice }: WeakSpotsViewProps) {
  const { data, isLoading, error, refetch } = useQuery<WeakSpotsResponse>({
    queryKey: ['kit-weak-spots', kitId],
    queryFn: async () => {
      const res = await api.get(`/kits/${kitId}/weak-spots`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="card p-8 border-slate-800 bg-slate-900/60 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-400">Analyzing practice history and requirement coverage...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-6 border-rose-900/40 bg-rose-950/20 text-center space-y-3">
        <p className="text-xs text-rose-300">Failed to analyze weak spots.</p>
        <button onClick={() => refetch()} className="btn-secondary text-xs">
          <IconRotateCw className="w-3.5 h-3.5 mr-1" />
          <span>Retry Analysis</span>
        </button>
      </div>
    );
  }

  const { rankedWeakSpots, recommendedPractice, disclaimer, weakSpotsCount } = data;
  const criticalCount = rankedWeakSpots.filter((ws) => ws.status === 'critical').length;
  const needsPracticeCount = rankedWeakSpots.filter((ws) => ws.status === 'needs_practice').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="card p-6 border-slate-800 bg-slate-900/80 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase font-semibold text-cyan-400 tracking-wider">
                Targeted Remediation Engine
              </span>
            </div>
            <h2 className="text-lg font-bold text-white mt-1">
              Weak Spots & Topic Risk Analysis
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Identifies posting criteria connected to questions or flashcards that are either unreviewed or repeatedly rated low-confidence.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center space-x-2">
            <div className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              {criticalCount} Critical
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
              {needsPracticeCount} Needs Review
            </div>
          </div>
        </div>

        {/* Focused Next Practice Recommendation Card */}
        {recommendedPractice.recommendedFlashcardIds.length > 0 && (
          <div className="p-4 bg-cyan-950/30 border border-cyan-500/30 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-bold text-cyan-300 flex items-center space-x-1.5">
                  <IconCheckCircle className="w-4 h-4 text-cyan-400" />
                  <span>Recommended Next Practice Session</span>
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {recommendedPractice.summary}
                </p>
              </div>

              <Link
                href={`/kits/${kitId}/practice`}
                className="btn-primary !py-2 !px-4 text-xs font-semibold flex items-center space-x-1.5 flex-shrink-0 shadow-lg shadow-cyan-500/20"
              >
                <IconPlay className="w-3.5 h-3.5" />
                <span>Launch Focused Drill ({recommendedPractice.recommendedFlashcardIds.length} cards)</span>
              </Link>
            </div>

            {recommendedPractice.focusTopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-cyan-500/20">
                <span className="text-[11px] text-cyan-400/80 font-medium self-center">Focus Areas:</span>
                {recommendedPractice.focusTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-cyan-500/30 text-slate-200"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Grounding / Disclaimer Note */}
        <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-start space-x-2">
          <IconInfo className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <span>{disclaimer}</span>
        </div>
      </div>

      {/* Ranked Weak Spots List */}
      <div className="space-y-4">
        {rankedWeakSpots.map((ws, idx) => {
          const isCritical = ws.status === 'critical';
          const isNeedsPractice = ws.status === 'needs_practice';

          return (
            <div
              key={ws.requirementId}
              className={`card p-5 border transition-all ${
                isCritical
                  ? 'border-rose-900/50 bg-slate-900/90'
                  : isNeedsPractice
                  ? 'border-amber-900/40 bg-slate-900/80'
                  : 'border-slate-800 bg-slate-900/60'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span className="text-xs font-mono font-bold text-slate-500">
                      #{idx + 1}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                      {ws.requirementId}
                    </span>
                    <Badge variant={ws.priority === 'must' ? 'must' : 'nice'}>
                      {ws.priority === 'must' ? 'Must Have' : 'Nice to Have'}
                    </Badge>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                        isCritical
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : isNeedsPractice
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {ws.status.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Category: <strong className="text-slate-300">{ws.category}</strong>
                    </span>
                  </div>

                  <h3 className="text-xs sm:text-sm font-semibold text-white pt-1">
                    {ws.requirementText}
                  </h3>
                </div>

                {/* Score & Recall metrics */}
                <div className="flex sm:flex-col items-end sm:items-end justify-between text-right text-xs gap-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800">
                  <div className="text-[11px] text-slate-400">
                    Confidence:{' '}
                    <strong
                      className={`font-mono ${
                        ws.averageConfidence === null
                          ? 'text-slate-500'
                          : ws.averageConfidence < 3
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {ws.averageConfidence !== null ? `${ws.averageConfidence}/5.0` : 'Unreviewed'}
                    </strong>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {ws.practiceCount} of {ws.totalCards} cards practiced
                  </div>
                  {ws.strugglingAttempts > 0 && (
                    <div className="text-[10px] text-rose-400 font-medium">
                      {ws.strugglingAttempts} low-confidence recall{ws.strugglingAttempts > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>

              {/* Linked Questions Accordion / List */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center space-x-1">
                    <IconBriefcase className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Linked Interview Questions ({ws.linkedQuestions.length})</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <IconLayers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Linked Flashcards ({ws.linkedFlashcardIds.length})</span>
                  </span>
                </div>

                {ws.linkedQuestions.length > 0 ? (
                  <div className="space-y-1.5">
                    {ws.linkedQuestions.map((q) => (
                      <div
                        key={q.id}
                        className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800 text-xs text-slate-300 flex items-start space-x-2"
                      >
                        <span className="font-mono text-[10px] text-cyan-400 font-bold flex-shrink-0">
                          {q.id}
                        </span>
                        <span className="flex-1 text-[11px]">{q.prompt}</span>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          {q.category}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">No questions currently mapped.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
