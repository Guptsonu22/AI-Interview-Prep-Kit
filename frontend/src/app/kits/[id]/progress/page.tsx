'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Navbar } from '@/components/Navbar';
import {
  IconRotateCw,
  IconCheckCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconBriefcase,
  IconBuilding,
  IconLayers,
  IconInfo,
} from '@/components/Icons';

interface ProgressResponse {
  jobId?: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  currentStep?: string;
  stage?: string;
  progress?: number;
  error?: string | null;
  logs?: Array<{ step: string; message: string; timestamp?: string }>;
  resultKitId?: string;
}

const PIPELINE_STAGES = [
  { id: 'extract-jd-metadata', label: 'Extract Role & Job Requirements', category: 'jd' },
  { id: 'crawl-company-site', label: 'Crawl Company Domain & Products', category: 'research' },
  { id: 'search-interview-evidence', label: 'Retrieve Public Interview Insights', category: 'research' },
  { id: 'generate-company-brief', label: 'Synthesize Evidence-Grounded Brief', category: 'synthesis' },
  { id: 'generate-questions', label: 'Synthesize Questions (Tech, Beh, SysDesign, Fit)', category: 'questions' },
  { id: 'generate-flashcards', label: 'Generate Spaced Repetition Flashcards', category: 'flashcards' },
  { id: 'compute-coverage', label: '2-Pass Deterministic Coverage & Gap Filling', category: 'coverage' },
  { id: 'generate-schedule', label: 'Bin-Pack Deterministic Study Schedule', category: 'schedule' },
];

export default function GenerationProgressPage() {
  const params = useParams();
  const router = useRouter();
  const kitId = params['id'] as string;

  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Poll progress every 1.5 seconds while not completed or failed
  const { data: progressData, error: progressError, refetch } = useQuery<ProgressResponse>({
    queryKey: ['kit-progress', kitId],
    queryFn: async () => {
      const res = await api.get(`/kits/${kitId}/progress`);
      return res.data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 1500;
    },
  });

  // Fetch kit details to get company URL / role
  const { data: kitData } = useQuery({
    queryKey: ['kit', kitId],
    queryFn: async () => {
      const res = await api.get(`/kits/${kitId}`);
      return res.data.kit;
    },
  });

  const isCompleted = progressData?.status === 'completed' || kitData?.status === 'ready';
  const isFailed = progressData?.status === 'failed' || kitData?.status === 'failed';
  const currentStep = progressData?.currentStep || 'validate-input';

  // Check if there was partial research failure
  const logs = progressData?.logs || [];
  const partialResearchWarning = logs.find(
    (l) =>
      l.message?.toLowerCase().includes('partial') ||
      l.message?.toLowerCase().includes('crawler') ||
      l.message?.toLowerCase().includes('unreachable') ||
      l.message?.toLowerCase().includes('fallback')
  );

  // Retry mutation
  const handleRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      await api.post(`/kits/${kitId}/generate`);
      refetch();
    } catch (err: any) {
      setRetryError(err.response?.data?.error?.message || err.message || 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  // Determine stage active/completed state
  const getStageStatus = (stageId: string, index: number) => {
    if (isCompleted) return 'completed';
    if (isFailed) return 'failed';

    const stepLower = currentStep.toLowerCase();
    if (stepLower.includes(stageId.replace('-', '')) || stepLower.includes(stageId)) {
      return 'active';
    }

    // Heuristic based on step progression
    const stepOrder = [
      'validate',
      'extract',
      'crawl',
      'search',
      'brief',
      'questions',
      'flashcards',
      'coverage',
      'schedule',
      'finalize',
      'completed',
    ];

    const currentOrderIdx = stepOrder.findIndex((s) => stepLower.includes(s));
    const thisStageOrderIdx = stepOrder.findIndex((s) => stageId.includes(s));

    if (currentOrderIdx > thisStageOrderIdx) return 'completed';
    if (currentOrderIdx === thisStageOrderIdx) return 'active';
    return 'pending';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <Link href="/dashboard" className="hover:text-slate-200 transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-slate-200 font-medium">Generation Progress</span>
          </div>

          <Link
            href="/dashboard"
            className="text-slate-400 hover:text-slate-200 flex items-center space-x-1"
          >
            <span>Return to Saved Kits</span>
            <span className="text-[10px] text-slate-500">(Runs in background)</span>
          </Link>
        </div>

        {/* Progress Header Card */}
        <div className="card p-6 border-slate-800 bg-slate-900/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase font-semibold text-cyan-400 tracking-wider">
                  Target Company & Role
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">
                {kitData?.kitData?.role?.title || 'Personalized Interview Prep Kit'}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Target: <span className="text-slate-200 font-medium">{kitData?.companyUrl}</span>
              </p>
            </div>

            {/* Current State Pill */}
            <div>
              {isCompleted ? (
                <div className="px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold text-xs flex items-center space-x-2">
                  <IconCheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>Pipeline Completed</span>
                </div>
              ) : isFailed ? (
                <div className="px-4 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-semibold text-xs flex items-center space-x-2">
                  <IconAlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Pipeline Halted</span>
                </div>
              ) : (
                <div className="px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 font-semibold text-xs flex items-center space-x-2">
                  <IconRotateCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span>Actively Generating...</span>
                </div>
              )}
            </div>
          </div>

          {/* Current Stage Headline */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Current Active Stage:{' '}
              <span className="text-white font-semibold">
                {progressData?.stage || currentStep}
              </span>
            </span>

            {isCompleted && (
              <Link
                href={`/kits/${kitId}`}
                className="btn-primary !py-1.5 !px-3.5 text-xs flex items-center space-x-1.5 shadow-lg shadow-cyan-500/20"
              >
                <span>Open Kit Workspace</span>
                <IconArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* Partial Research Failure Notice */}
        {partialResearchWarning && !isFailed && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-start space-x-2.5">
            <IconAlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
            <div>
              <span className="font-semibold block">Notice on External Evidence:</span>
              <span className="text-amber-200/90 leading-relaxed">
                {partialResearchWarning.message || 'Direct company crawling encountered robots restriction; fell back to public verified repository analysis.'}
              </span>
            </div>
          </div>
        )}

        {/* Failure Box & Actionable Retry */}
        {isFailed && (
          <div className="card p-6 border-rose-900/60 bg-rose-950/20 space-y-4">
            <div className="flex items-start space-x-3">
              <IconAlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-rose-200">Generation Encountered an Error</h3>
                <p className="text-xs text-rose-300/90">
                  {progressData?.error || kitData?.generationError || 'An unexpected error occurred during research synthesis.'}
                </p>
                {retryError && <p className="text-xs text-rose-400 font-mono mt-2">{retryError}</p>}
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="btn-danger text-xs flex items-center space-x-1.5"
              >
                <IconRotateCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                <span>{retrying ? 'Restarting Pipeline...' : 'Retry Generation Pipeline'}</span>
              </button>
              <Link href="/dashboard" className="btn-secondary text-xs">
                Back to Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Real Discrete Pipeline Stages Checklist */}
        <div className="card p-6 border-slate-800 bg-slate-900/90 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pipeline Verification Milestones
          </h2>

          <div className="space-y-3">
            {PIPELINE_STAGES.map((st, idx) => {
              const status = getStageStatus(st.id, idx);

              return (
                <div
                  key={st.id}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                    status === 'completed'
                      ? 'bg-slate-900 border-emerald-500/30'
                      : status === 'active'
                      ? 'bg-cyan-500/10 border-cyan-500/40 shadow-sm'
                      : 'bg-slate-950/50 border-slate-800/60 opacity-60'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {status === 'completed' ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <IconCheckCircle className="w-4 h-4" />
                      </div>
                    ) : status === 'active' ? (
                      <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center animate-spin">
                        <IconRotateCw className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center text-xs font-semibold">
                        {idx + 1}
                      </div>
                    )}

                    <span
                      className={`text-xs font-medium ${
                        status === 'completed'
                          ? 'text-slate-200'
                          : status === 'active'
                          ? 'text-cyan-300 font-semibold'
                          : 'text-slate-400'
                      }`}
                    >
                      {st.label}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono capitalize text-slate-400">
                    {status === 'completed' ? 'Done' : status === 'active' ? 'Running' : 'Queued'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Event Stream Terminal */}
        <div className="card p-5 border-slate-800 bg-slate-950 font-mono text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-[11px] text-slate-400">
            <span>Live Activity Stream</span>
            <span className="text-[10px] text-slate-500">Auto-refreshing</span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 text-[11px] text-slate-300">
            {logs.length === 0 ? (
              <div className="text-slate-600 italic">Waiting for pipeline events...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="flex items-start space-x-2">
                  <span className="text-cyan-400 font-semibold select-none">{'>'}</span>
                  <span className="text-slate-500 select-none">[{log.step}]</span>
                  <span className="text-slate-300">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Completion Action */}
        {isCompleted && (
          <div className="card p-6 border-emerald-500/30 bg-emerald-950/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white">Your Kit is Prepared and Verified</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                All requirement gaps resolved, schedule optimized, and flashcards generated.
              </p>
            </div>
            <Link
              href={`/kits/${kitId}`}
              className="btn-primary py-2.5 px-5 text-xs font-semibold flex items-center space-x-2 shadow-xl shadow-cyan-500/25"
            >
              <span>Enter Kit Workspace</span>
              <IconArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
