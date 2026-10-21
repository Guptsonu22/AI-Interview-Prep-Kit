'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Navbar } from '@/components/Navbar';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { WorkspaceSkeleton } from '@/components/ui/Skeleton';
import {
  IconSparkles,
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconCheckCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconPin,
  IconEdit,
  IconTrash,
  IconPlus,
  IconRotateCw,
  IconPlay,
  IconExternalLink,
  IconSearch,
  IconLayers,
  IconShield,
  IconClock,
} from '@/components/Icons';

type TabType = 'overview' | 'requirements' | 'questions' | 'flashcards' | 'schedule' | 'coverage';

export default function KitWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const kitId = params['id'] as string;

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [questionCategory, setQuestionCategory] = useState<string>('all');
  const [questionSearch, setQuestionSearch] = useState('');

  // Modals state
  const [isAddQuestionOpen, setIsAddQuestionOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);
  const [isAddFlashcardOpen, setIsAddFlashcardOpen] = useState(false);
  const [editingFlashcard, setEditingFlashcard] = useState<any | null>(null);
  const [isEditBriefOpen, setIsEditBriefOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<any | null>(null);

  // Form states for modals
  const [qPrompt, setQPrompt] = useState('');
  const [qCategory, setQCategory] = useState<'technical' | 'behavioural' | 'system-design' | 'company-fit'>('technical');
  const [qAnswer, setQAnswer] = useState('');
  const [qDifficulty, setQDifficulty] = useState<1 | 2 | 3>(2);

  const [fcFront, setFcFront] = useState('');
  const [fcBack, setFcBack] = useState('');

  const [briefSummary, setBriefSummary] = useState('');
  const [briefWhatTheyDo, setBriefWhatTheyDo] = useState('');

  const [dayFocus, setDayFocus] = useState('');
  const [dayMinutes, setDayMinutes] = useState(60);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Fetch Kit Details
  const { data: kit, isLoading, error, refetch } = useQuery({
    queryKey: ['kit', kitId],
    queryFn: async () => {
      const res = await api.get(`/kits/${kitId}`);
      return res.data.kit;
    },
  });

  const showToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const showError = (msg: string) => {
    setActionError(msg);
    setTimeout(() => setActionError(null), 5000);
  };

  // ─────────────────────────────────────────────────────────
  // Mutations
  // ─────────────────────────────────────────────────────────

  // Regenerate Company Brief
  const regenBriefMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/kits/${kitId}/regenerate/company-brief`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      showToast('Company Brief successfully regenerated with verified evidence.');
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  // Regenerate Questions by Category
  const regenQuestionsMutation = useMutation({
    mutationFn: async (cat: string) => {
      await api.post(`/kits/${kitId}/regenerate/questions/${cat}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      showToast('Category questions regenerated (pinned & user-edited items preserved).');
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  // Regenerate Schedule
  const regenScheduleMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/kits/${kitId}/regenerate/schedule`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      showToast('Schedule re-optimized with deterministic bin-packing.');
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  // Question CRUD
  const addQuestionMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/kits/${kitId}/questions`, {
        prompt: qPrompt,
        category: qCategory,
        difficulty: qDifficulty,
        answer_outline: qAnswer,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      setIsAddQuestionOpen(false);
      setQPrompt('');
      setQAnswer('');
      showToast('Question added to your custom bank.');
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  const editQuestionMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/kits/${kitId}/questions/${editingQuestion.id}`, {
        prompt: qPrompt,
        category: qCategory,
        difficulty: qDifficulty,
        answer_outline: qAnswer,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      setEditingQuestion(null);
      showToast('Question successfully updated.');
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (qId: string) => {
      await api.delete(`/kits/${kitId}/questions/${qId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      showToast('Question deleted.');
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  const togglePinQuestionMutation = useMutation({
    mutationFn: async ({ qId, pinned }: { qId: string; pinned: boolean }) => {
      await api.patch(`/kits/${kitId}/questions/${qId}/pin`, { pinned: !pinned });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  const changeCategoryMutation = useMutation({
    mutationFn: async ({ qId, category }: { qId: string; category: string }) => {
      await api.patch(`/kits/${kitId}/questions/${qId}/category`, { category });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      showToast('Question moved to new category.');
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  // Flashcard CRUD
  const addFlashcardMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/kits/${kitId}/flashcards`, {
        front: fcFront,
        back: fcBack,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      setIsAddFlashcardOpen(false);
      setFcFront('');
      setFcBack('');
      showToast('Flashcard added.');
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  const editFlashcardMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/kits/${kitId}/flashcards/${editingFlashcard.id}`, {
        front: fcFront,
        back: fcBack,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      setEditingFlashcard(null);
      showToast('Flashcard updated.');
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  const deleteFlashcardMutation = useMutation({
    mutationFn: async (fcId: string) => {
      await api.delete(`/kits/${kitId}/flashcards/${fcId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      showToast('Flashcard removed.');
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  const togglePinFlashcardMutation = useMutation({
    mutationFn: async ({ fcId, pinned }: { fcId: string; pinned: boolean }) => {
      await api.patch(`/kits/${kitId}/flashcards/${fcId}/pin`, { pinned: !pinned });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  // Edit Company Brief
  const editBriefMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/kits/${kitId}/company-brief`, {
        summary: briefSummary,
        what_they_do: briefWhatTheyDo,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      setIsEditBriefOpen(false);
      showToast('Company Brief saved.');
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  // Edit Schedule Day
  const editDayMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/kits/${kitId}/schedule/days/${editingDay.day}`, {
        focus: dayFocus,
        minutes: dayMinutes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
      setEditingDay(null);
      showToast(`Day ${editingDay?.day} schedule updated.`);
    },
    onError: (err: any) => showError(err.response?.data?.error?.message || err.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <WorkspaceSkeleton />
        </main>
      </div>
    );
  }

  if (error || !kit) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
          <IconAlertTriangle className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Kit Not Found or Unauthorized</h2>
          <p className="text-xs text-slate-400">
            This interview prep kit either does not exist or you do not have permission to view it.
          </p>
          <Link href="/dashboard" className="btn-primary inline-flex text-xs">
            Return to Dashboard
          </Link>
        </main>
      </div>
    );
  }

  const kitData = kit.kitData || {};
  const role = kitData.role || { title: 'Target Role', seniority: 'Mid-Senior' };
  const companyBrief = kitData.company_brief || { summary: '', what_they_do: '', sources: [] };
  const requirements = kitData.requirements || [];
  const questions = kitData.questions || [];
  const flashcards = kitData.flashcards || [];
  const schedule = kitData.schedule?.days || [];
  const coverage = kitData.coverage || { coverage_percentage: 100, uncovered_must_haves: [] };

  const mustHaves = requirements.filter((r: any) => r.priority === 'must');
  const niceToHaves = requirements.filter((r: any) => r.priority === 'nice');
  const uncoveredMusts = coverage.uncovered_must_haves || [];

  // Filter questions
  const filteredQuestions = questions.filter((q: any) => {
    if (questionCategory !== 'all' && q.category !== questionCategory) return false;
    if (questionSearch) {
      const s = questionSearch.toLowerCase();
      return (
        q.prompt.toLowerCase().includes(s) ||
        (q.answer_outline && q.answer_outline.toLowerCase().includes(s))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      {/* Floating Alerts */}
      {actionSuccess && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-500/90 text-white rounded-xl shadow-2xl backdrop-blur-md text-xs font-semibold flex items-center space-x-2 animate-bounce">
          <IconCheckCircle className="w-4 h-4 text-emerald-200" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-rose-600/90 text-white rounded-xl shadow-2xl backdrop-blur-md text-xs font-semibold flex items-center space-x-2">
          <IconAlertTriangle className="w-4 h-4 text-rose-200" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Workspace Banner */}
      <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <Link href="/dashboard" className="hover:text-slate-200">
                  Dashboard
                </Link>
                <span>/</span>
                <span className="text-cyan-400 font-semibold">{companyBrief.name || kit.companyUrl}</span>
              </div>

              <div className="mt-1 flex items-center space-x-3">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {role.title || 'Target Role'}
                </h1>
                {role.seniority && (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 uppercase tracking-wider">
                    {role.seniority}
                  </span>
                )}
                <StatusBadge status={kit.status} />
              </div>

              <div className="mt-1 flex items-center space-x-4 text-xs text-slate-400">
                <a
                  href={kit.companyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-cyan-400 flex items-center space-x-1"
                >
                  <IconBuilding className="w-3.5 h-3.5" />
                  <span>{kit.companyUrl.replace(/^https?:\/\//, '')}</span>
                  <IconExternalLink className="w-3 h-3 text-slate-500" />
                </a>

                <span className="text-slate-600">•</span>
                <span className="flex items-center space-x-1">
                  <IconCalendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{kit.daysAvailable} Days Plan</span>
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center space-x-3">
              <Link
                href={`/kits/${kitId}/practice`}
                className="btn-primary py-2 px-4 text-xs sm:text-sm font-semibold flex items-center space-x-2 shadow-lg shadow-cyan-500/20"
              >
                <IconPlay className="w-4 h-4 text-cyan-200" />
                <span>Practice Flashcards ({flashcards.length})</span>
              </Link>
            </div>
          </div>

          {/* Coverage Warning Banner if Must-Haves are Uncovered */}
          {uncoveredMusts.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <IconAlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                <span>
                  <strong>Coverage Alert:</strong> {uncoveredMusts.length} must-have requirement{uncoveredMusts.length > 1 ? 's are' : ' is'} currently uncovered in the question bank.
                </span>
              </div>
              <button
                type="button"
                onClick={() => regenQuestionsMutation.mutate('technical')}
                className="btn-secondary !py-1 !px-2.5 text-xs text-amber-300 border-amber-500/40 hover:bg-slate-800"
              >
                Auto-Fill Gap Questions
              </button>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex space-x-1 overflow-x-auto pt-2 border-t border-slate-800/80">
            {[
              { id: 'overview', label: 'Company Brief', count: companyBrief.sources?.length ? `${companyBrief.sources.length} sources` : null },
              { id: 'requirements', label: 'Job Requirements', count: requirements.length },
              { id: 'questions', label: 'Question Bank', count: questions.length },
              { id: 'flashcards', label: 'Flashcards (SRS)', count: flashcards.length },
              { id: 'schedule', label: 'Day-by-Day Schedule', count: `${schedule.length}d` },
              { id: 'coverage', label: 'Coverage Verification', count: `${coverage.coverage_percentage || 100}%` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-all flex items-center space-x-1.5 ${
                  activeTab === tab.id
                    ? 'bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                      activeTab === tab.id
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* TAB 1: Company Brief */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="card p-6 border-slate-800 bg-slate-900/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <IconBuilding className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-base font-bold text-white">Authentic Company Intelligence</h2>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBriefSummary(companyBrief.summary || '');
                      setBriefWhatTheyDo(companyBrief.what_they_do || '');
                      setIsEditBriefOpen(true);
                    }}
                    className="btn-secondary text-xs flex items-center space-x-1.5"
                  >
                    <IconEdit className="w-3.5 h-3.5" />
                    <span>Edit Brief</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => regenBriefMutation.mutate()}
                    disabled={regenBriefMutation.isPending}
                    className="btn-secondary text-xs flex items-center space-x-1.5 border-cyan-500/30 text-cyan-300"
                  >
                    <IconRotateCw
                      className={`w-3.5 h-3.5 ${regenBriefMutation.isPending ? 'animate-spin' : ''}`}
                    />
                    <span>Regenerate Brief</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <h3 className="text-xs uppercase font-semibold text-slate-400">Overview & Mission</h3>
                  <p className="mt-1 text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                    {companyBrief.summary || 'Crawled company overview will appear here.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <h3 className="text-xs uppercase font-semibold text-slate-400">What They Do & Core Products</h3>
                  <p className="mt-1 text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                    {companyBrief.what_they_do || 'Key products, tech stack, and initiatives.'}
                  </p>
                </div>
              </div>

              {/* Verified Sources / Citations */}
              <div className="pt-4 border-t border-slate-800">
                <h3 className="text-xs uppercase font-semibold text-slate-400 mb-2">
                  Grounded Evidence Sources ({companyBrief.sources?.length || 0})
                </h3>
                {companyBrief.sources && companyBrief.sources.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {companyBrief.sources.map((src: string, idx: number) => (
                      <a
                        key={idx}
                        href={src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-cyan-400 hover:text-cyan-300 hover:border-slate-700 flex items-center space-x-1.5"
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
          </div>
        )}

        {/* TAB 2: Requirements Breakdown */}
        {activeTab === 'requirements' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Extracted Job Requirements</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Extracted locally from the job description and classified by priority & domain.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">
                  Must: <strong className="text-rose-400">{mustHaves.length}</strong> | Nice:{' '}
                  <strong className="text-slate-300">{niceToHaves.length}</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {requirements.map((req: any) => {
                const isMust = req.priority === 'must';
                return (
                  <div
                    key={req.id}
                    className={`card p-4 border transition-all ${
                      isMust ? 'border-rose-900/40 bg-slate-900/80' : 'border-slate-800 bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                          {req.id}
                        </span>
                        <Badge variant={isMust ? 'must' : 'nice'}>
                          {isMust ? 'Must Have' : 'Nice to Have'}
                        </Badge>
                      </div>

                      <span className="text-[10px] uppercase font-semibold text-slate-400">
                        {req.category || 'General'}
                      </span>
                    </div>

                    <p className="mt-2.5 text-xs text-slate-200 leading-relaxed font-medium">
                      {req.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: Question Bank */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">Tailored Question Bank</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Interview questions mapped to your job requirements with model answer outlines.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {questionCategory !== 'all' && (
                  <button
                    type="button"
                    onClick={() => regenQuestionsMutation.mutate(questionCategory)}
                    disabled={regenQuestionsMutation.isPending}
                    className="btn-secondary text-xs flex items-center space-x-1.5 border-cyan-500/30 text-cyan-300"
                  >
                    <IconRotateCw
                      className={`w-3.5 h-3.5 ${
                        regenQuestionsMutation.isPending ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Regenerate {questionCategory}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setQPrompt('');
                    setQAnswer('');
                    setQCategory('technical');
                    setQDifficulty(2);
                    setIsAddQuestionOpen(true);
                  }}
                  className="btn-primary text-xs flex items-center space-x-1.5"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  <span>Add Question</span>
                </button>
              </div>
            </div>

            {/* Category Filter Pills & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800 overflow-x-auto">
                {['all', 'technical', 'behavioural', 'system-design', 'company-fit'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setQuestionCategory(cat)}
                    className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap ${
                      questionCategory === cat
                        ? 'bg-slate-800 text-cyan-400 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat.replace('-', ' ')}
                  </button>
                ))}
              </div>

              <div className="relative max-w-xs w-full">
                <IconSearch className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                  placeholder="Search questions..."
                  className="input pl-9 !py-1.5 text-xs"
                />
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {filteredQuestions.length === 0 ? (
                <div className="card p-8 text-center border-dashed border-slate-800">
                  <p className="text-xs text-slate-400">No questions found in this category.</p>
                </div>
              ) : (
                filteredQuestions.map((q: any) => {
                  const isPinned = !!q.pinned;
                  return (
                    <div
                      key={q.id}
                      className={`card p-5 border transition-all ${
                        isPinned ? 'border-cyan-500/40 bg-slate-900/90 shadow-md shadow-cyan-950/20' : 'border-slate-800 bg-slate-900/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                              {q.id}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 text-[10px] font-semibold uppercase tracking-wider">
                              {q.category}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Diff: {q.difficulty === 3 ? 'Senior' : q.difficulty === 2 ? 'Mid' : 'Entry'}
                            </span>
                            {isPinned && (
                              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-semibold flex items-center space-x-1">
                                <IconPin className="w-2.5 h-2.5" />
                                <span>Pinned</span>
                              </span>
                            )}
                          </div>

                          <h3 className="text-sm font-bold text-white pt-1">{q.prompt}</h3>
                        </div>

                        {/* Question Card Actions */}
                        <div className="flex items-center space-x-1.5">
                          {/* Pin Toggle */}
                          <button
                            type="button"
                            onClick={() =>
                              togglePinQuestionMutation.mutate({ qId: q.id, pinned: isPinned })
                            }
                            className={`p-1.5 rounded-lg transition-colors ${
                              isPinned
                                ? 'text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                            }`}
                            title={isPinned ? 'Unpin question' : 'Pin question (protects from regeneration)'}
                          >
                            <IconPin className="w-4 h-4" />
                          </button>

                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingQuestion(q);
                              setQPrompt(q.prompt);
                              setQCategory(q.category);
                              setQAnswer(q.answer_outline || '');
                              setQDifficulty(q.difficulty || 2);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                            title="Edit question"
                          >
                            <IconEdit className="w-4 h-4" />
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => deleteQuestionMutation.mutate(q.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800"
                            title="Delete question"
                          >
                            <IconTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Answer Outline */}
                      {q.answer_outline && (
                        <div className="mt-3 p-3 bg-slate-950/80 rounded-lg border border-slate-800/80 text-xs text-slate-300 space-y-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
                            Key Answer Talking Points & Verification
                          </span>
                          <p className="leading-relaxed whitespace-pre-line">{q.answer_outline}</p>
                        </div>
                      )}

                      {/* Requirement Tags & Category switch */}
                      <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className="text-slate-500">Requirements:</span>
                          {(q.requirement_ids || []).map((rid: string) => (
                            <span
                              key={rid}
                              className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800"
                            >
                              {rid}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-slate-500 text-[10px]">Move to:</span>
                          <select
                            value={q.category}
                            onChange={(e) =>
                              changeCategoryMutation.mutate({ qId: q.id, category: e.target.value })
                            }
                            className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-[11px] text-slate-300 focus:outline-none"
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
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Flashcards */}
        {activeTab === 'flashcards' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Spaced Repetition Flashcards</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  High-yield concepts for rapid recall using our SuperMemo SM-2 algorithm.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setFcFront('');
                    setFcBack('');
                    setIsAddFlashcardOpen(true);
                  }}
                  className="btn-secondary text-xs flex items-center space-x-1.5"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  <span>Add Flashcard</span>
                </button>

                <Link
                  href={`/kits/${kitId}/practice`}
                  className="btn-primary text-xs flex items-center space-x-1.5"
                >
                  <IconPlay className="w-3.5 h-3.5" />
                  <span>Launch Practice Deck</span>
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {flashcards.map((fc: any) => {
                const isPinned = !!fc.pinned;
                return (
                  <div
                    key={fc.id}
                    className={`card p-5 border transition-all flex flex-col justify-between ${
                      isPinned ? 'border-cyan-500/40 bg-slate-900/90' : 'border-slate-800 bg-slate-900/70'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <span className="font-mono text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                          {fc.id}
                        </span>

                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() =>
                              togglePinFlashcardMutation.mutate({ fcId: fc.id, pinned: isPinned })
                            }
                            className={`p-1 rounded ${
                              isPinned ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                            }`}
                            title={isPinned ? 'Unpin' : 'Pin flashcard'}
                          >
                            <IconPin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFlashcard(fc);
                              setFcFront(fc.front);
                              setFcBack(fc.back);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-slate-200"
                            title="Edit"
                          >
                            <IconEdit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteFlashcardMutation.mutate(fc.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400"
                            title="Delete"
                          >
                            <IconTrash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                          Front (Prompt)
                        </span>
                        <p className="text-xs font-semibold text-white">{fc.front}</p>
                      </div>

                      <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800/80 space-y-1">
                        <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider block">
                          Back (Answer Key)
                        </span>
                        <p className="text-xs text-slate-300 leading-relaxed">{fc.back}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 5: Day-by-Day Schedule */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Deterministic Study Schedule</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Algorithmic bin-packing: Prioritizes must-have requirements and difficult topics early.
                </p>
              </div>

              <button
                type="button"
                onClick={() => regenScheduleMutation.mutate()}
                disabled={regenScheduleMutation.isPending}
                className="btn-secondary text-xs flex items-center space-x-1.5 border-cyan-500/30 text-cyan-300"
              >
                <IconRotateCw
                  className={`w-3.5 h-3.5 ${
                    regenScheduleMutation.isPending ? 'animate-spin' : ''
                  }`}
                />
                <span>Re-balance Schedule</span>
              </button>
            </div>

            <div className="space-y-4">
              {schedule.map((day: any) => (
                <div
                  key={day.day}
                  className="card p-5 border-slate-800 bg-slate-900/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3">
                      <span className="px-3 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold text-xs">
                        Day {day.day}
                      </span>
                      <h3 className="text-sm font-bold text-white">{day.focus}</h3>
                    </div>

                    <div className="flex items-center space-x-4 text-xs text-slate-400">
                      <span className="flex items-center space-x-1">
                        <IconClock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{day.minutes} minutes allocated</span>
                      </span>

                      <span className="flex items-center space-x-1">
                        <IconBriefcase className="w-3.5 h-3.5 text-slate-500" />
                        <span>{(day.question_ids || []).length} assigned questions</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(day.question_ids || []).map((qid: string) => (
                        <span
                          key={qid}
                          className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800"
                        >
                          {qid}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingDay(day);
                      setDayFocus(day.focus);
                      setDayMinutes(day.minutes);
                    }}
                    className="btn-secondary text-xs self-start md:self-auto flex items-center space-x-1.5"
                  >
                    <IconEdit className="w-3.5 h-3.5" />
                    <span>Edit Day Plan</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: Coverage Verification */}
        {activeTab === 'coverage' && (
          <div className="space-y-6">
            <div className="card p-6 border-slate-800 bg-slate-900/80 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">2-Pass Requirement Coverage Audit</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Ensures every single must-have requirement from the job posting is covered by at least one question.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-emerald-400">
                    {coverage.coverage_percentage || 100}%
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Total Coverage
                  </div>
                </div>
              </div>

              {uncoveredMusts.length === 0 ? (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center space-x-2">
                  <IconCheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <span>
                    100% of Must-Have requirements are covered by validated interview questions!
                  </span>
                </div>
              ) : (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 space-y-2">
                  <div className="flex items-center space-x-2 font-bold">
                    <IconAlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>Uncovered Must-Have Requirements Found ({uncoveredMusts.length}):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 pl-2">
                    {uncoveredMusts.map((un: any, i: number) => (
                      <li key={i}>
                        <span className="font-mono text-[10px] text-rose-400">[{un.id || un}]</span>{' '}
                        {un.text || un}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => regenQuestionsMutation.mutate('technical')}
                    className="btn-primary !py-1 !px-3 text-xs mt-2"
                  >
                    Run Gap Synthesis Pass
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ───────────────────────────────────────────────────────── */}
      {/* Modals */}
      {/* ───────────────────────────────────────────────────────── */}

      {/* Add Question Modal */}
      <Modal
        isOpen={isAddQuestionOpen}
        onClose={() => setIsAddQuestionOpen(false)}
        title="Add Custom Question to Bank"
        description="Expand your prep kit with custom targeted questions."
      >
        <div className="space-y-4">
          <div>
            <label className="label">Question Prompt</label>
            <input
              type="text"
              value={qPrompt}
              onChange={(e) => setQPrompt(e.target.value)}
              placeholder="e.g. How would you design a distributed rate limiter in Redis?"
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select
                value={qCategory}
                onChange={(e) => setQCategory(e.target.value as any)}
                className="input"
              >
                <option value="technical">Technical</option>
                <option value="behavioural">Behavioural</option>
                <option value="system-design">System Design</option>
                <option value="company-fit">Company Fit</option>
              </select>
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select
                value={qDifficulty}
                onChange={(e) => setQDifficulty(parseInt(e.target.value, 10) as any)}
                className="input"
              >
                <option value={1}>1 - Entry / Fundamental</option>
                <option value={2}>2 - Mid / Intermediate</option>
                <option value={3}>3 - Senior / Advanced</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Model Answer Outline / Key Talking Points</label>
            <textarea
              rows={4}
              value={qAnswer}
              onChange={(e) => setQAnswer(e.target.value)}
              placeholder="List the key concepts, trade-offs, and examples to mention..."
              className="input text-xs font-mono"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddQuestionOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => addQuestionMutation.mutate()}
              disabled={!qPrompt || addQuestionMutation.isPending}
              className="btn-primary text-xs"
            >
              {addQuestionMutation.isPending ? 'Saving...' : 'Save Question'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Question Modal */}
      <Modal
        isOpen={!!editingQuestion}
        onClose={() => setEditingQuestion(null)}
        title="Edit Question"
        description="User edits are pinned and preserved across future section regenerations."
      >
        <div className="space-y-4">
          <div>
            <label className="label">Question Prompt</label>
            <input
              type="text"
              value={qPrompt}
              onChange={(e) => setQPrompt(e.target.value)}
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select
                value={qCategory}
                onChange={(e) => setQCategory(e.target.value as any)}
                className="input"
              >
                <option value="technical">Technical</option>
                <option value="behavioural">Behavioural</option>
                <option value="system-design">System Design</option>
                <option value="company-fit">Company Fit</option>
              </select>
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select
                value={qDifficulty}
                onChange={(e) => setQDifficulty(parseInt(e.target.value, 10) as any)}
                className="input"
              >
                <option value={1}>1 - Entry</option>
                <option value={2}>2 - Mid</option>
                <option value={3}>3 - Senior</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Model Answer Outline</label>
            <textarea
              rows={4}
              value={qAnswer}
              onChange={(e) => setQAnswer(e.target.value)}
              className="input text-xs font-mono"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingQuestion(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => editQuestionMutation.mutate()}
              disabled={!qPrompt || editQuestionMutation.isPending}
              className="btn-primary text-xs"
            >
              {editQuestionMutation.isPending ? 'Updating...' : 'Update Question'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Flashcard Modal */}
      <Modal
        isOpen={isAddFlashcardOpen}
        onClose={() => setIsAddFlashcardOpen(false)}
        title="Add Spaced Repetition Flashcard"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Front (Question or Concept)</label>
            <input
              type="text"
              value={fcFront}
              onChange={(e) => setFcFront(e.target.value)}
              placeholder="e.g. What is the CAP theorem?"
              className="input"
            />
          </div>

          <div>
            <label className="label">Back (Concise Answer / Key Fact)</label>
            <textarea
              rows={3}
              value={fcBack}
              onChange={(e) => setFcBack(e.target.value)}
              placeholder="e.g. A distributed system can only guarantee at most 2 out of: Consistency, Availability, Partition tolerance."
              className="input text-xs"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddFlashcardOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => addFlashcardMutation.mutate()}
              disabled={!fcFront || !fcBack || addFlashcardMutation.isPending}
              className="btn-primary text-xs"
            >
              {addFlashcardMutation.isPending ? 'Saving...' : 'Add Card'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Flashcard Modal */}
      <Modal
        isOpen={!!editingFlashcard}
        onClose={() => setEditingFlashcard(null)}
        title="Edit Flashcard"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Front</label>
            <input
              type="text"
              value={fcFront}
              onChange={(e) => setFcFront(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="label">Back</label>
            <textarea
              rows={3}
              value={fcBack}
              onChange={(e) => setFcBack(e.target.value)}
              className="input text-xs"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingFlashcard(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => editFlashcardMutation.mutate()}
              disabled={!fcFront || !fcBack || editFlashcardMutation.isPending}
              className="btn-primary text-xs"
            >
              {editFlashcardMutation.isPending ? 'Updating...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Brief Modal */}
      <Modal
        isOpen={isEditBriefOpen}
        onClose={() => setIsEditBriefOpen(false)}
        title="Edit Company Brief"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Company Overview & Culture</label>
            <textarea
              rows={4}
              value={briefSummary}
              onChange={(e) => setBriefSummary(e.target.value)}
              className="input text-xs leading-relaxed"
            />
          </div>

          <div>
            <label className="label">Products & Technology Focus</label>
            <textarea
              rows={4}
              value={briefWhatTheyDo}
              onChange={(e) => setBriefWhatTheyDo(e.target.value)}
              className="input text-xs leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditBriefOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => editBriefMutation.mutate()}
              disabled={editBriefMutation.isPending}
              className="btn-primary text-xs"
            >
              {editBriefMutation.isPending ? 'Saving...' : 'Save Brief'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Day Schedule Modal */}
      <Modal
        isOpen={!!editingDay}
        onClose={() => setEditingDay(null)}
        title={`Edit Day ${editingDay?.day} Study Plan`}
      >
        <div className="space-y-4">
          <div>
            <label className="label">Focus Area</label>
            <input
              type="text"
              value={dayFocus}
              onChange={(e) => setDayFocus(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="label">Time Allocation (Minutes)</label>
            <input
              type="number"
              min={15}
              max={480}
              step={15}
              value={dayMinutes}
              onChange={(e) => setDayMinutes(parseInt(e.target.value, 10) || 60)}
              className="input"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingDay(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => editDayMutation.mutate()}
              disabled={editDayMutation.isPending}
              className="btn-primary text-xs"
            >
              {editDayMutation.isPending ? 'Saving...' : 'Save Plan'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}