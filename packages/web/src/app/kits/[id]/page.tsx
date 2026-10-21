'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/ui/Badge';
import { WorkspaceSkeleton } from '@/components/ui/Skeleton';
import { CompanyBriefEditor, CompanyBriefData } from '@/components/kit-editor/CompanyBriefEditor';
import { QuestionCategoryBoard } from '@/components/kit-editor/QuestionCategoryBoard';
import { QuestionCardItem } from '@/components/kit-editor/QuestionCard';
import { FlashcardEditor, FlashcardItem } from '@/components/kit-editor/FlashcardEditor';
import { ScheduleEditor, ScheduleDayItem } from '@/components/kit-editor/ScheduleEditor';
import { RequirementList } from '@/components/kit-editor/RequirementList';
import { CoverageStatus } from '@/components/kit-editor/CoverageStatus';
import {
  IconBuilding,
  IconCalendar,
  IconPlay,
  IconExternalLink,
  IconAlertTriangle,
  IconCheckCircle,
} from '@/components/Icons';

type TabType = 'overview' | 'requirements' | 'questions' | 'flashcards' | 'schedule' | 'coverage';

export default function KitWorkspacePage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const kitId = params['id'] as string;

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  // Fetch Kit Details
  const { data: kit, isLoading, error, refetch } = useQuery({
    queryKey: ['kit', kitId],
    queryFn: async () => {
      const res = await api.get(`/kits/${kitId}`);
      return res.data.kit;
    },
  });

  // ─────────────────────────────────────────────────────────
  // Mutations with Optimistic Updates & Server Version Checks
  // ─────────────────────────────────────────────────────────

  // Update Company Brief
  const updateBriefMutation = useMutation({
    mutationFn: async (updates: Partial<CompanyBriefData>) => {
      const res = await api.patch(`/kits/${kitId}/company-brief`, {
        ...updates,
        version: kit?.version,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          version: data.kit?.version ?? (old.version + 1),
          kitData: {
            ...old.kitData,
            company_brief: data.company_brief,
          },
        };
      });
      showToast('Company Brief saved successfully.');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
  });

  // Regenerate Company Brief
  const regenBriefMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/kits/${kitId}/regenerate/company-brief`, {
        version: kit?.version,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          version: data.kit?.version ?? (old.version + 1),
          kitData: {
            ...old.kitData,
            company_brief: data.company_brief,
          },
        };
      });
      showToast('Company Brief regenerated with fresh evidence.');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
  });

  // Update Question (prompt, answer outline, category, pinned)
  const updateQuestionMutation = useMutation({
    mutationFn: async ({ qId, updates }: { qId: string; updates: Partial<QuestionCardItem> }) => {
      // If updating pin state specifically:
      if (updates.pinned !== undefined) {
        const res = await api.patch(`/kits/${kitId}/questions/${qId}/pin`, {
          pinned: updates.pinned,
          version: kit?.version,
        });
        return res.data;
      }
      // If updating category specifically:
      if (updates.category && Object.keys(updates).length === 1) {
        const res = await api.patch(`/kits/${kitId}/questions/${qId}/category`, {
          category: updates.category,
          version: kit?.version,
        });
        return res.data;
      }
      // General question update:
      const res = await api.patch(`/kits/${kitId}/questions/${qId}`, {
        ...updates,
        version: kit?.version,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        const currentQuestions = old.kitData?.questions || [];
        const updatedQuestions = currentQuestions.map((q: any) =>
          q.id === data.question?.id ? { ...q, ...data.question } : q
        );
        return {
          ...old,
          version: data.kit?.version ?? old.version,
          kitData: {
            ...old.kitData,
            questions: updatedQuestions,
          },
        };
      });
      showToast('Question updated.');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
  });

  // Add Question
  const addQuestionMutation = useMutation({
    mutationFn: async (newQ: any) => {
      const res = await api.post(`/kits/${kitId}/questions`, {
        ...newQ,
        version: kit?.version,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          version: data.kit?.version ?? old.version,
          kitData: {
            ...old.kitData,
            questions: [...(old.kitData?.questions || []), data.question],
          },
        };
      });
      showToast('Question added to your bank.');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
  });

  // Delete Question
  const deleteQuestionMutation = useMutation({
    mutationFn: async (qId: string) => {
      await api.delete(`/kits/${kitId}/questions/${qId}`);
      return qId;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          kitData: {
            ...old.kitData,
            questions: (old.kitData?.questions || []).filter((q: any) => q.id !== deletedId),
          },
        };
      });
      showToast('Question deleted.');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
  });

  // Reorder Questions
  const reorderQuestionsMutation = useMutation({
    mutationFn: async (order: string[]) => {
      const res = await api.post(`/kits/${kitId}/questions/reorder`, {
        order,
        version: kit?.version,
      });
      return { order, resData: res.data };
    },
    onSuccess: ({ order, resData }) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        const currentQuestions = old.kitData?.questions || [];
        const questionMap = new Map(currentQuestions.map((q: any) => [q.id, q]));
        const sortedQuestions = order
          .map((id) => questionMap.get(id))
          .filter(Boolean);
        return {
          ...old,
          version: resData.kit?.version ?? old.version,
          kitData: {
            ...old.kitData,
            questions: sortedQuestions,
          },
        };
      });
      showToast('Questions reordered.');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
  });

  // Regenerate Questions for a Category
  const regenCategoryMutation = useMutation({
    mutationFn: async (cat: string) => {
      const res = await api.post(`/kits/${kitId}/regenerate/questions/${cat}`, {
        version: kit?.version,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          version: data.kit?.version ?? old.version,
          kitData: {
            ...old.kitData,
            questions: data.questions || old.kitData?.questions,
          },
        };
      });
      showToast('Category questions regenerated (pinned & user-edited items preserved).');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
  });

  // Flashcards CRUD
  const addFlashcardMutation = useMutation({
    mutationFn: async (card: any) => {
      const res = await api.post(`/kits/${kitId}/flashcards`, {
        ...card,
        version: kit?.version,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          version: data.kit?.version ?? old.version,
          kitData: {
            ...old.kitData,
            flashcards: [...(old.kitData?.flashcards || []), data.flashcard],
          },
        };
      });
      showToast('Flashcard added.');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
  });

  const updateFlashcardMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<FlashcardItem> }) => {
      if (updates.pinned !== undefined) {
        const res = await api.patch(`/kits/${kitId}/flashcards/${id}/pin`, {
          pinned: updates.pinned,
          version: kit?.version,
        });
        return res.data;
      }
      const res = await api.patch(`/kits/${kitId}/flashcards/${id}`, {
        ...updates,
        version: kit?.version,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        const currentCards = old.kitData?.flashcards || [];
        return {
          ...old,
          version: data.kit?.version ?? old.version,
          kitData: {
            ...old.kitData,
            flashcards: currentCards.map((c: any) =>
              c.id === data.flashcard?.id ? { ...c, ...data.flashcard } : c
            ),
          },
        };
      });
      showToast('Flashcard updated.');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
  });

  const deleteFlashcardMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/kits/${kitId}/flashcards/${id}`);
      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          kitData: {
            ...old.kitData,
            flashcards: (old.kitData?.flashcards || []).filter((c: any) => c.id !== deletedId),
          },
        };
      });
      showToast('Flashcard deleted.');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
  });

  // Schedule mutations
  const updateDayMutation = useMutation({
    mutationFn: async ({ dayNum, updates }: { dayNum: number; updates: any }) => {
      const res = await api.patch(`/kits/${kitId}/schedule/days/${dayNum}`, {
        ...updates,
        version: kit?.version,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          version: data.kit?.version ?? old.version,
          kitData: {
            ...old.kitData,
            schedule: data.schedule,
          },
        };
      });
      showToast('Day schedule updated.');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
  });

  const regenScheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/kits/${kitId}/regenerate/schedule`, {
        version: kit?.version,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['kit', kitId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          version: data.kit?.version ?? old.version,
          kitData: {
            ...old.kitData,
            schedule: data.schedule,
          },
        };
      });
      showToast('Schedule re-optimized with deterministic bin-packing.');
    },
    onError: (err: any) => {
      showError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    },
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
  const questions: QuestionCardItem[] = kitData.questions || [];
  const flashcards: FlashcardItem[] = kitData.flashcards || [];
  const scheduleDays: ScheduleDayItem[] = kitData.schedule?.days || [];
  const coverage = kitData.coverage || { coverage_percentage: 100, uncovered_must_haves: [] };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      {/* Floating Notifications */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-500/95 text-white rounded-xl shadow-2xl backdrop-blur-md text-xs font-semibold flex items-center space-x-2 animate-bounce">
          <IconCheckCircle className="w-4 h-4 text-emerald-200" />
          <span>{toastMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-rose-600/95 text-white rounded-xl shadow-2xl backdrop-blur-md text-xs font-semibold flex items-center space-x-2">
          <IconAlertTriangle className="w-4 h-4 text-rose-200" />
          <span>{errorMessage}</span>
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
                <span className="font-mono text-[10px] text-slate-500 px-1.5 py-0.2 rounded bg-slate-950">
                  v{kit.version || 1}
                </span>
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

          {/* Navigation Tabs */}
          <div className="flex space-x-1 overflow-x-auto pt-2 border-t border-slate-800/80">
            {[
              { id: 'overview', label: 'Company Brief', count: companyBrief.sources?.length ? `${companyBrief.sources.length} sources` : null },
              { id: 'requirements', label: 'Job Requirements', count: requirements.length },
              { id: 'questions', label: 'Question Bank', count: questions.length },
              { id: 'flashcards', label: 'Flashcards (SRS)', count: flashcards.length },
              { id: 'schedule', label: 'Day-by-Day Schedule', count: `${scheduleDays.length}d` },
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

      {/* Main Tab Panels */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <CompanyBriefEditor
            brief={companyBrief}
            companyUrl={kit.companyUrl}
            kitVersion={kit.version}
            onSaveBrief={(updates) => updateBriefMutation.mutateAsync(updates)}
            onRegenerateBrief={() => regenBriefMutation.mutateAsync()}
            isSaving={updateBriefMutation.isPending}
            isRegenerating={regenBriefMutation.isPending}
            error={errorMessage}
          />
        )}

        {activeTab === 'requirements' && (
          <RequirementList requirements={requirements} questions={questions} />
        )}

        {activeTab === 'questions' && (
          <QuestionCategoryBoard
            questions={questions}
            kitVersion={kit.version}
            onUpdateQuestion={(id, updates) =>
              updateQuestionMutation.mutateAsync({ qId: id, updates })
            }
            onAddQuestion={(newQ) => addQuestionMutation.mutateAsync(newQ)}
            onDeleteQuestion={(id) => deleteQuestionMutation.mutateAsync(id)}
            onReorderQuestions={(order) => reorderQuestionsMutation.mutateAsync(order)}
            onRegenerateCategory={(cat) => regenCategoryMutation.mutateAsync(cat)}
            isRegenerating={regenCategoryMutation.isPending}
            regenerationError={errorMessage}
          />
        )}

        {activeTab === 'flashcards' && (
          <FlashcardEditor
            flashcards={flashcards}
            onAddCard={(card) => addFlashcardMutation.mutateAsync(card)}
            onUpdateCard={(id, updates) =>
              updateFlashcardMutation.mutateAsync({ id, updates })
            }
            onDeleteCard={(id) => deleteFlashcardMutation.mutateAsync(id)}
            isSaving={updateFlashcardMutation.isPending || addFlashcardMutation.isPending}
          />
        )}

        {activeTab === 'schedule' && (
          <ScheduleEditor
            days={scheduleDays}
            daysAvailable={kit.daysAvailable}
            kitVersion={kit.version}
            onUpdateDay={(dayNum, updates) =>
              updateDayMutation.mutateAsync({ dayNum, updates })
            }
            onRegenerateSchedule={() => regenScheduleMutation.mutateAsync()}
            isRegenerating={regenScheduleMutation.isPending}
            regenerationError={errorMessage}
          />
        )}

        {activeTab === 'coverage' && (
          <CoverageStatus
            coverage={coverage}
            onGenerateGapQuestions={() => regenCategoryMutation.mutate('technical')}
            isGeneratingGaps={regenCategoryMutation.isPending}
          />
        )}
      </main>
    </div>
  );
}