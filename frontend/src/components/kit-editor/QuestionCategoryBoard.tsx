'use client';

import React, { useState } from 'react';
import { QuestionCard, QuestionCardItem } from './QuestionCard';
import { RegenerationModal, RegenerationTarget } from './RegenerationModal';
import { Modal } from '../ui/Modal';
import {
  IconPlus,
  IconRotateCw,
  IconSearch,
  IconTrash,
  IconAlertTriangle,
} from '../Icons';

type CategoryType = 'technical' | 'behavioural' | 'system-design' | 'company-fit';

interface QuestionCategoryBoardProps {
  questions: QuestionCardItem[];
  kitVersion?: number;
  onUpdateQuestion: (id: string, updates: Partial<QuestionCardItem>) => Promise<void> | void;
  onAddQuestion: (newQuestion: {
    prompt: string;
    category: CategoryType;
    difficulty: number;
    answer_outline: string;
    requirement_ids: string[];
  }) => Promise<void> | void;
  onDeleteQuestion: (id: string) => Promise<void> | void;
  onReorderQuestions: (newOrder: string[]) => Promise<void> | void;
  onRegenerateCategory: (category: CategoryType) => Promise<void> | void;
  isRegenerating?: boolean;
  regenerationError?: string | null;
}

const CATEGORIES: { id: CategoryType; label: string; description: string }[] = [
  { id: 'technical', label: 'Technical', description: 'Core domain knowledge, algorithms, language idioms, and syntax' },
  { id: 'behavioural', label: 'Behavioural', description: 'STAR leadership, team collaboration, conflicts, and past delivery' },
  { id: 'system-design', label: 'System Design', description: 'Distributed systems, architecture trade-offs, caching, and scalability' },
  { id: 'company-fit', label: 'Company Fit', description: 'Culture, product alignment, motivation, and employer-specific questions' },
];

export function QuestionCategoryBoard({
  questions,
  kitVersion,
  onUpdateQuestion,
  onAddQuestion,
  onDeleteQuestion,
  onReorderQuestions,
  onRegenerateCategory,
  isRegenerating = false,
  regenerationError,
}: QuestionCategoryBoardProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'tabs' | 'columns'>('tabs');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
  const [regenTarget, setRegenTarget] = useState<RegenerationTarget | null>(null);

  // New Question form state
  const [newPrompt, setNewPrompt] = useState('');
  const [newCategory, setNewCategory] = useState<CategoryType>('technical');
  const [newDifficulty, setNewDifficulty] = useState<number>(2);
  const [newOutline, setNewOutline] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Drag-and-drop state
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrompt.trim()) return;

    setIsAdding(true);
    try {
      await onAddQuestion({
        prompt: newPrompt.trim(),
        category: newCategory,
        difficulty: newDifficulty,
        answer_outline: newOutline.trim(),
        requirement_ids: [],
      });
      setIsAddModalOpen(false);
      setNewPrompt('');
      setNewOutline('');
    } finally {
      setIsAdding(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!questionToDelete) return;
    await onDeleteQuestion(questionToDelete);
    setQuestionToDelete(null);
  };

  // Move up/down within current filtered list
  const handleMove = (currentIndexInList: number, direction: 'up' | 'down', list: QuestionCardItem[]) => {
    const targetIndex = direction === 'up' ? currentIndexInList - 1 : currentIndexInList + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const reorderedList = [...list];
    const temp = reorderedList[currentIndexInList];
    reorderedList[currentIndexInList] = reorderedList[targetIndex];
    reorderedList[targetIndex] = temp;

    // Create complete ordered list of all question IDs
    const otherQuestions = questions.filter((q) => !list.some((item) => item.id === q.id));
    const fullOrder = [...reorderedList.map((q) => q.id), ...otherQuestions.map((q) => q.id)];
    onReorderQuestions(fullOrder);
  };

  // Drag and Drop handlers
  const handleDragStart = (id: string) => {
    setDraggedQuestionId(id);
  };

  const handleDropOnItem = (targetId: string, currentCategoryList: QuestionCardItem[]) => {
    if (!draggedQuestionId || draggedQuestionId === targetId) return;

    const fromIndex = currentCategoryList.findIndex((q) => q.id === draggedQuestionId);
    const toIndex = currentCategoryList.findIndex((q) => q.id === targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    const updated = [...currentCategoryList];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    const otherQuestions = questions.filter((q) => !currentCategoryList.some((item) => item.id === q.id));
    const fullOrder = [...updated.map((q) => q.id), ...otherQuestions.map((q) => q.id)];
    onReorderQuestions(fullOrder);
    setDraggedQuestionId(null);
  };

  // Filter questions
  const filterList = (list: QuestionCardItem[]) => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (item) =>
        item.prompt.toLowerCase().includes(q) ||
        (item.answer_outline && item.answer_outline.toLowerCase().includes(q))
    );
  };

  const currentQuestions = filterList(
    activeCategory === 'all'
      ? questions
      : questions.filter((q) => q.category === activeCategory)
  );

  return (
    <div className="space-y-6">
      {/* Category Navigation Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Category Filter Pills */}
        <div className="flex items-center space-x-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              activeCategory === 'all'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>All Categories</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950 font-mono text-slate-400">
              {questions.length}
            </span>
          </button>

          {CATEGORIES.map((cat) => {
            const count = questions.filter((q) => q.category === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
                  activeCategory === cat.id
                    ? 'bg-slate-800 text-cyan-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{cat.label}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950 font-mono text-slate-400">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center space-x-2.5">
          <div className="relative">
            <IconSearch className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts..."
              className="input pl-8 !py-1.5 text-xs w-48 sm:w-56"
            />
          </div>

          {/* Regenerate Selected Category Control */}
          {activeCategory !== 'all' && (
            <button
              type="button"
              onClick={() =>
                setRegenTarget({
                  type: 'questions',
                  category: activeCategory,
                  title: `${CATEGORIES.find((c) => c.id === activeCategory)?.label} Questions`,
                })
              }
              className="btn-secondary text-xs flex items-center space-x-1.5 border-cyan-500/30 text-cyan-300 hover:bg-slate-800"
              title="Regenerate only this category while preserving user edits and pinned questions"
            >
              <IconRotateCw className="w-3.5 h-3.5" />
              <span>Regen Category</span>
            </button>
          )}

          {/* Add Question Button */}
          <button
            type="button"
            onClick={() => {
              setNewCategory(activeCategory !== 'all' ? activeCategory : 'technical');
              setIsAddModalOpen(true);
            }}
            className="btn-primary text-xs flex items-center space-x-1.5"
          >
            <IconPlus className="w-3.5 h-3.5" />
            <span>Add Question</span>
          </button>
        </div>
      </div>

      {/* Main Question List */}
      {currentQuestions.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-slate-800 space-y-3">
          <p className="text-xs text-slate-400">
            {searchQuery
              ? 'No questions matched your search query.'
              : `No questions found in ${activeCategory === 'all' ? 'this bank' : activeCategory}.`}
          </p>
          <button
            type="button"
            onClick={() => {
              setNewCategory(activeCategory !== 'all' ? activeCategory : 'technical');
              setIsAddModalOpen(true);
            }}
            className="btn-secondary text-xs"
          >
            Add First Question
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {currentQuestions.map((question, idx) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={idx}
              totalInList={currentQuestions.length}
              onUpdate={onUpdateQuestion}
              onDelete={(id) => setQuestionToDelete(id)}
              onMoveUp={() => handleMove(idx, 'up', currentQuestions)}
              onMoveDown={() => handleMove(idx, 'down', currentQuestions)}
              onDragStart={() => handleDragStart(question.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropOnItem(question.id, currentQuestions)}
            />
          ))}
        </div>
      )}

      {/* Add Question Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Question to Bank"
        description="Create a manual interview question. Manually created items are automatically preserved during future regenerations."
      >
        <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
          <div>
            <label className="label">Question Prompt</label>
            <input
              type="text"
              required
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="e.g. How does garbage collection work in V8 and Go?"
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="input"
              >
                <option value="technical">Technical</option>
                <option value="behavioural">Behavioural</option>
                <option value="system-design">System Design</option>
                <option value="company-fit">Company Fit</option>
              </select>
            </div>

            <div>
              <label className="label">Target Seniority / Difficulty</label>
              <select
                value={newDifficulty}
                onChange={(e) => setNewDifficulty(parseInt(e.target.value, 10))}
                className="input"
              >
                <option value={1}>1 - Entry / Fundamental</option>
                <option value={2}>2 - Mid / Intermediate</option>
                <option value={3}>3 - Senior / Advanced</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Model Answer Outline</label>
            <textarea
              rows={4}
              value={newOutline}
              onChange={(e) => setNewOutline(e.target.value)}
              placeholder="Key concepts, talking points, and verification criteria..."
              className="input font-mono text-xs"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAdding || !newPrompt.trim()}
              className="btn-primary text-xs"
            >
              {isAdding ? 'Saving...' : 'Add to Question Bank'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!questionToDelete}
        onClose={() => setQuestionToDelete(null)}
        title="Delete Question"
        description="Are you sure you want to remove this question from your kit? If this question covers a must-have requirement, that requirement may become uncovered."
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setQuestionToDelete(null)}
              className="btn-secondary text-xs"
            >
              Keep Question
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="btn-danger text-xs flex items-center space-x-1"
            >
              <IconTrash className="w-3.5 h-3.5" />
              <span>Confirm Delete</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Regeneration Modal */}
      <RegenerationModal
        isOpen={!!regenTarget}
        onClose={() => setRegenTarget(null)}
        target={regenTarget}
        onConfirm={async () => {
          if (regenTarget?.type === 'questions') {
            await onRegenerateCategory(regenTarget.category);
            setRegenTarget(null);
          }
        }}
        isPending={isRegenerating}
        error={regenerationError}
        currentVersion={kitVersion}
      />
    </div>
  );
}
