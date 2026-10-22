'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function formatRelativeTime(dateInput: string | Date): string {
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (isNaN(diff)) return 'recently';
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  } catch {
    return 'recently';
  }
}
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { KitCardSkeleton } from '@/components/ui/Skeleton';
import {
  IconPlus,
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconTrash,
  IconArrowRight,
  IconSearch,
  IconUpload,
  IconPlay,
  IconRotateCw,
  IconSparkles,
} from '@/components/Icons';

interface KitItem {
  id: string;
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  status: 'draft' | 'generating' | 'ready' | 'failed' | 'archived';
  generationError?: string | null;
  kitData?: {
    company_brief?: {
      name?: string;
      summary?: string;
    };
    role?: {
      title?: string;
      seniority?: string;
      domain?: string;
    };
    requirements?: any[];
    questions?: any[];
    flashcards?: any[];
    coverage?: {
      coverage_percentage?: number;
      must_have_coverage_percentage?: number;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'generating' | 'failed'>('all');
  const [kitToDelete, setKitToDelete] = useState<KitItem | null>(null);

  // Fetch all user's kits
  const { data, isLoading, error, refetch } = useQuery<{ kits: KitItem[]; total: number }>({
    queryKey: ['kits'],
    queryFn: async () => {
      const res = await api.get('/kits');
      return res.data;
    },
    enabled: isAuthenticated,
    refetchInterval: 5000, // poll so active generating jobs update automatically
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/kits/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kits'] });
      setKitToDelete(null);
    },
  });

  const kits = data?.kits || [];

  // Filter kits
  const filteredKits = kits.filter((kit) => {
    const roleTitle = kit.kitData?.role?.title || 'Target Role';
    const companyName = kit.kitData?.company_brief?.name || kit.companyUrl;
    const matchesSearch =
      roleTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kit.companyUrl.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    return kit.status === statusFilter;
  });

  // Calculate summary stats
  const totalKits = kits.length;
  const readyKits = kits.filter((k) => k.status === 'ready').length;
  const generatingKits = kits.filter((k) => k.status === 'generating').length;
  const totalQuestions = kits.reduce((acc, k) => acc + (k.kitData?.questions?.length || 0), 0);
  const totalFlashcards = kits.reduce((acc, k) => acc + (k.kitData?.flashcards?.length || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Candidate Workspace
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Welcome back, {user?.name || user?.email?.split('@')[0] || 'Candidate'}. Manage your AI-tailored interview kits.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Link
              href="/kits/batch"
              className="btn-secondary flex items-center space-x-2 text-xs sm:text-sm"
            >
              <IconUpload className="w-4 h-4 text-slate-400" />
              <span>Batch Upload</span>
            </Link>
            <Link
              href="/kits/new"
              className="btn-primary flex items-center space-x-2 text-xs sm:text-sm"
            >
              <IconPlus className="w-4 h-4" />
              <span>Create New Kit</span>
            </Link>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4 border-slate-800 bg-slate-900/60">
            <div className="text-xs uppercase font-medium text-slate-400">Total Kits</div>
            <div className="mt-1 text-2xl font-bold text-white">{totalKits}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{readyKits} ready to study</div>
          </div>
          <div className="card p-4 border-slate-800 bg-slate-900/60">
            <div className="text-xs uppercase font-medium text-slate-400">Generating</div>
            <div className="mt-1 text-2xl font-bold text-cyan-400 flex items-center space-x-2">
              <span>{generatingKits}</span>
              {generatingKits > 0 && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Active AI pipelines</div>
          </div>
          <div className="card p-4 border-slate-800 bg-slate-900/60">
            <div className="text-xs uppercase font-medium text-slate-400">Question Bank</div>
            <div className="mt-1 text-2xl font-bold text-white">{totalQuestions}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Tailored interview queries</div>
          </div>
          <div className="card p-4 border-slate-800 bg-slate-900/60">
            <div className="text-xs uppercase font-medium text-slate-400">Flashcards Ready</div>
            <div className="mt-1 text-2xl font-bold text-emerald-400">{totalFlashcards}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">SRS memory cards</div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <IconSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by role, company name, or URL..."
              className="input pl-10 !py-2 text-xs sm:text-sm"
            />
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            {(['all', 'ready', 'generating', 'failed'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                  statusFilter === filter
                    ? 'bg-slate-800 text-cyan-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Main Kits Grid or Loading / Empty States */}
        {isLoading || authLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <KitCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="card p-8 text-center border-rose-900/40 bg-rose-950/10">
            <p className="text-rose-400 text-sm">Failed to load kits. Check your connection or login status.</p>
            <button onClick={() => refetch()} className="btn-secondary mt-4 text-xs">
              <IconRotateCw className="w-3.5 h-3.5 mr-1.5" />
              Try Again
            </button>
          </div>
        ) : filteredKits.length === 0 ? (
          <div className="card p-12 text-center border-dashed border-slate-800 bg-slate-900/40 flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <IconBriefcase className="w-8 h-8" />
            </div>
            <div className="max-w-md">
              <h3 className="text-lg font-bold text-white">
                {searchQuery ? 'No matching kits found' : 'No interview kits created yet'}
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-slate-400">
                {searchQuery
                  ? 'Try clearing your search query or switching your status filter.'
                  : 'Paste any target job description and company URL to generate an end-to-end interview prep system with evidence-grounded research, questions, and study schedule.'}
              </p>
            </div>
            {!searchQuery && (
              <div className="flex items-center space-x-3 pt-2">
                <Link href="/kits/new" className="btn-primary text-xs sm:text-sm flex items-center space-x-2">
                  <IconPlus className="w-4 h-4" />
                  <span>Create Your First Kit</span>
                </Link>
                <Link href="/kits/batch" className="btn-secondary text-xs sm:text-sm flex items-center space-x-2">
                  <IconUpload className="w-4 h-4 text-slate-400" />
                  <span>Batch Upload</span>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredKits.map((kit) => {
              const roleTitle = kit.kitData?.role?.title || 'Target Role';
              const seniority = kit.kitData?.role?.seniority;
              const companyName = kit.kitData?.company_brief?.name || kit.companyUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
              const questionCount = kit.kitData?.questions?.length || 0;
              const flashcardCount = kit.kitData?.flashcards?.length || 0;
              const coveragePct = kit.kitData?.coverage?.coverage_percentage ?? (kit.status === 'ready' ? 100 : 0);
              const isGenerating = kit.status === 'generating';
              const isFailed = kit.status === 'failed';

              return (
                <div
                  key={kit.id}
                  className="card p-5 border-slate-800 bg-slate-900/80 hover:border-slate-700/80 transition-all flex flex-col justify-between group relative"
                >
                  <div>
                    {/* Top row: Company, status badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2 overflow-hidden">
                        <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 flex-shrink-0">
                          <IconBuilding className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-semibold text-slate-300 truncate" title={companyName}>
                          {companyName}
                        </span>
                      </div>
                      <StatusBadge status={kit.status} />
                    </div>

                    {/* Role Title & Seniority */}
                    <div className="mt-3">
                      <h3 className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors line-clamp-1" title={roleTitle}>
                        {roleTitle}
                      </h3>
                      {seniority && (
                        <span className="inline-block mt-0.5 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                          {seniority} Level
                        </span>
                      )}
                    </div>

                    {/* Status Info / Failure Message */}
                    {isFailed ? (
                      <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                        {kit.generationError || 'Pipeline encountered an issue. Click retry in progress tracker.'}
                      </div>
                    ) : isGenerating ? (
                      <div className="mt-3 p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 flex items-center space-x-2">
                        <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        <span>AI pipeline actively crawling and synthesizing...</span>
                      </div>
                    ) : (
                      /* Coverage progress bar */
                      <div className="mt-4 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Must-Have Coverage</span>
                          <span className="font-semibold text-slate-200">{coveragePct}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${
                              coveragePct >= 80 ? 'bg-emerald-400' : coveragePct >= 50 ? 'bg-amber-400' : 'bg-cyan-500'
                            }`}
                            style={{ width: `${coveragePct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Meta stats */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-xs text-slate-400">
                      <div>
                        <div className="font-semibold text-slate-200">{questionCount}</div>
                        <div className="text-[10px] text-slate-500">Questions</div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200">{flashcardCount}</div>
                        <div className="text-[10px] text-slate-500">Flashcards</div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200">{kit.daysAvailable}d</div>
                        <div className="text-[10px] text-slate-500">Plan Days</div>
                      </div>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      Updated {formatRelativeTime(kit.updatedAt)}
                    </span>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => setKitToDelete(kit)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        title="Delete Kit"
                        aria-label="Delete Kit"
                      >
                        <IconTrash className="w-4 h-4" />
                      </button>

                      {isGenerating ? (
                        <Link
                          href={`/kits/${kit.id}/progress`}
                          className="btn-secondary !py-1 !px-2.5 text-xs flex items-center space-x-1 text-cyan-400 border-cyan-500/30 hover:border-cyan-500/60"
                        >
                          <span>Live Progress</span>
                          <IconArrowRight className="w-3 h-3" />
                        </Link>
                      ) : (
                        <Link
                          href={`/kits/${kit.id}`}
                          className="btn-primary !py-1 !px-2.5 text-xs flex items-center space-x-1"
                        >
                          <span>Open Kit</span>
                          <IconArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!kitToDelete}
        onClose={() => setKitToDelete(null)}
        title="Delete Interview Prep Kit"
        description="Are you sure you want to permanently delete this preparation kit? All questions, flashcards, and study schedules will be removed."
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 text-xs">
            <span className="text-slate-400 font-semibold block">Target Kit:</span>
            <span className="text-white font-medium text-sm">
              {kitToDelete?.kitData?.role?.title || 'Prep Kit'} —{' '}
              {kitToDelete?.kitData?.company_brief?.name || kitToDelete?.companyUrl}
            </span>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={() => setKitToDelete(null)}
              className="btn-secondary text-xs"
              disabled={deleteMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => kitToDelete && deleteMutation.mutate(kitToDelete.id)}
              disabled={deleteMutation.isPending}
              className="btn-danger text-xs flex items-center space-x-1.5"
            >
              {deleteMutation.isPending ? (
                <span>Deleting...</span>
              ) : (
                <>
                  <IconTrash className="w-3.5 h-3.5" />
                  <span>Confirm Delete</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
