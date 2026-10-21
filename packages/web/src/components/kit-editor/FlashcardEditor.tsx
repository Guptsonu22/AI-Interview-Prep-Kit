'use client';

import React, { useState } from 'react';
import { ProvenanceBadge } from './ProvenanceBadge';
import { Modal } from '../ui/Modal';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconPin,
  IconLayers,
  IconPlay,
  IconCheck,
} from '../Icons';

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  requirement_ids?: string[];
  pinned?: boolean;
  edited?: boolean;
  provenance?: 'generated' | 'edited' | 'pinned';
}

interface FlashcardEditorProps {
  flashcards: FlashcardItem[];
  onAddCard: (card: { front: string; back: string; requirement_ids: string[] }) => Promise<void> | void;
  onUpdateCard: (id: string, updates: Partial<FlashcardItem>) => Promise<void> | void;
  onDeleteCard: (id: string) => Promise<void> | void;
  isSaving?: boolean;
}

export function FlashcardEditor({
  flashcards,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  isSaving = false,
}: FlashcardEditorProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<FlashcardItem | null>(null);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);

  // Form fields
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [reqIds, setReqIds] = useState('');

  const handleStartAdd = () => {
    setFront('');
    setBack('');
    setReqIds('');
    setIsAddOpen(true);
  };

  const handleStartEdit = (card: FlashcardItem) => {
    setEditingCard(card);
    setFront(card.front);
    setBack(card.back);
    setReqIds((card.requirement_ids || []).join(', '));
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;

    const parsedReqs = reqIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await onAddCard({
      front: front.trim(),
      back: back.trim(),
      requirement_ids: parsedReqs,
    });
    setIsAddOpen(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCard || !front.trim() || !back.trim()) return;

    const parsedReqs = reqIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await onUpdateCard(editingCard.id, {
      front: front.trim(),
      back: back.trim(),
      requirement_ids: parsedReqs,
      edited: true,
    });
    setEditingCard(null);
  };

  const handleTogglePin = (card: FlashcardItem) => {
    onUpdateCard(card.id, { pinned: !card.pinned });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <IconLayers className="w-5 h-5 text-cyan-400" />
            <span>Spaced Repetition Flashcards ({flashcards.length})</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Key concepts and recall items connected to job requirements.
          </p>
        </div>

        <button
          type="button"
          onClick={handleStartAdd}
          className="btn-primary text-xs flex items-center space-x-1.5"
        >
          <IconPlus className="w-3.5 h-3.5" />
          <span>Add Flashcard</span>
        </button>
      </div>

      {flashcards.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-slate-800 space-y-3">
          <p className="text-xs text-slate-400">No flashcards created yet.</p>
          <button type="button" onClick={handleStartAdd} className="btn-secondary text-xs">
            Add Your First Flashcard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {flashcards.map((card) => {
            const isPinned = !!card.pinned;
            return (
              <div
                key={card.id}
                className={`card p-5 border flex flex-col justify-between transition-all ${
                  isPinned
                    ? 'border-cyan-500/40 bg-slate-900/90'
                    : 'border-slate-800 bg-slate-900/75 hover:border-slate-700/80'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                        {card.id}
                      </span>
                      <ProvenanceBadge
                        pinned={card.pinned}
                        edited={card.edited}
                        state={card.provenance}
                      />
                    </div>

                    <div className="flex items-center space-x-1">
                      {/* Pin Toggle */}
                      <button
                        type="button"
                        onClick={() => handleTogglePin(card)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isPinned
                            ? 'text-cyan-400 bg-cyan-500/10'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                        title={isPinned ? 'Unpin card' : 'Pin card (protect against regeneration)'}
                      >
                        <IconPin className="w-3.5 h-3.5" />
                      </button>

                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={() => handleStartEdit(card)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200"
                        title="Edit flashcard"
                      >
                        <IconEdit className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => setCardToDelete(card.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400"
                        title="Delete flashcard"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Front Prompt */}
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                      Front (Prompt / Query)
                    </span>
                    <p className="text-xs font-semibold text-white leading-relaxed">{card.front}</p>
                  </div>

                  {/* Back Key */}
                  <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400 block">
                      Back (Answer / Takeaway)
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                      {card.back}
                    </p>
                  </div>
                </div>

                {/* Requirement References */}
                {(card.requirement_ids || []).length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center space-x-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-500">Requirements:</span>
                    {card.requirement_ids?.map((rid) => (
                      <span
                        key={rid}
                        className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800"
                      >
                        {rid}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Flashcard Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add Spaced Repetition Flashcard"
      >
        <form onSubmit={handleSaveAdd} className="space-y-4 text-xs">
          <div>
            <label className="label">Front (Question or Concept)</label>
            <input
              type="text"
              required
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="e.g. Difference between optimistic and pessimistic locking?"
              className="input"
            />
          </div>

          <div>
            <label className="label">Back (Key Recall Takeaway)</label>
            <textarea
              rows={4}
              required
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder="e.g. Optimistic checks version before commit; pessimistic holds lock until transaction ends."
              className="input text-xs"
            />
          </div>

          <div>
            <label className="label">Requirement IDs (Optional, comma-separated)</label>
            <input
              type="text"
              value={reqIds}
              onChange={(e) => setReqIds(e.target.value)}
              placeholder="e.g. req-01, req-03"
              className="input font-mono text-xs"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !front.trim() || !back.trim()}
              className="btn-primary text-xs"
            >
              Save Card
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Flashcard Modal */}
      <Modal
        isOpen={!!editingCard}
        onClose={() => setEditingCard(null)}
        title="Edit Flashcard"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
          <div>
            <label className="label">Front</label>
            <input
              type="text"
              required
              value={front}
              onChange={(e) => setFront(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="label">Back</label>
            <textarea
              rows={4}
              required
              value={back}
              onChange={(e) => setBack(e.target.value)}
              className="input text-xs"
            />
          </div>

          <div>
            <label className="label">Requirement IDs</label>
            <input
              type="text"
              value={reqIds}
              onChange={(e) => setReqIds(e.target.value)}
              className="input font-mono text-xs"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setEditingCard(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !front.trim() || !back.trim()}
              className="btn-primary text-xs"
            >
              Update Card
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!cardToDelete}
        onClose={() => setCardToDelete(null)}
        title="Delete Flashcard"
        description="Are you sure you want to remove this flashcard from your deck?"
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setCardToDelete(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (cardToDelete) {
                  await onDeleteCard(cardToDelete);
                  setCardToDelete(null);
                }
              }}
              className="btn-danger text-xs flex items-center space-x-1"
            >
              <IconTrash className="w-3.5 h-3.5" />
              <span>Confirm Delete</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
