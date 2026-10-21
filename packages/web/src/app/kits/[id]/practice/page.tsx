'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Navbar } from '@/components/Navbar';
import {
  IconArrowLeft,
  IconArrowRight,
  IconRotateCw,
  IconCheckCircle,
  IconSparkles,
  IconLayers,
  IconPlay,
} from '@/components/Icons';

interface Flashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids?: string[];
  pinned?: boolean;
}

interface PracticeData {
  flashcards: Flashcard[];
  totalCards: number;
  dueCount: number;
  completedCount: number;
  masteryRate: number;
}

export default function PracticeModePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const kitId = params['id'] as string;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedSessionCount, setReviewedSessionCount] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  // Fetch practice deck
  const { data, isLoading, error, refetch } = useQuery<PracticeData>({
    queryKey: ['kit-practice', kitId],
    queryFn: async () => {
      const res = await api.get(`/kits/${kitId}/practice`);
      return res.data;
    },
  });

  // Record answer mutation
  const recordMutation = useMutation({
    mutationFn: async ({ flashcardId, confidence }: { flashcardId: string; confidence: number }) => {
      await api.post(`/kits/${kitId}/practice/records`, { flashcardId, confidence });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-practice', kitId] });
    },
  });

  const cards = data?.flashcards || [];
  const currentCard = cards[currentIndex];

  // Handle rating submission
  const handleRate = async (confidence: number) => {
    if (!currentCard) return;

    recordMutation.mutate({ flashcardId: currentCard.id, confidence });
    setReviewedSessionCount((prev) => prev + 1);

    if (currentIndex + 1 < cards.length) {
      setIsFlipped(false);
      setCurrentIndex((prev) => prev + 1);
    } else {
      setSessionCompleted(true);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space flips card
      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      }
      // If flipped, 0-5 triggers rating
      if (isFlipped && ['0', '1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        handleRate(parseInt(e.key, 10));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, currentCard, currentIndex, cards.length]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col justify-between">
        {/* Top Controls & Progress Strip */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Link
              href={`/kits/${kitId}`}
              className="text-xs text-slate-400 hover:text-white flex items-center space-x-1.5 transition-colors"
            >
              <IconArrowLeft className="w-4 h-4" />
              <span>Back to Kit Workspace</span>
            </Link>

            <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
              <span className="text-cyan-400 font-bold">
                {cards.length > 0 ? currentIndex + 1 : 0}
              </span>
              <span>/</span>
              <span>{cards.length} Due</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300"
              style={{
                width: `${cards.length > 0 ? ((currentIndex + (sessionCompleted ? 1 : 0)) / cards.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Loading flashcards and spaced repetition schedules...</p>
          </div>
        ) : cards.length === 0 || sessionCompleted ? (
          /* Session Completed or Empty State */
          <div className="card p-10 border-slate-800 bg-slate-900/90 text-center space-y-5 my-auto max-w-lg mx-auto shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
              <IconCheckCircle className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-white">
                {sessionCompleted ? 'Deck Review Complete!' : 'All Caught Up!'}
              </h2>
              <p className="mt-1 text-xs text-slate-400 max-w-xs mx-auto">
                {sessionCompleted
                  ? `You reviewed ${reviewedSessionCount} card${reviewedSessionCount > 1 ? 's' : ''} in this practice drill. The SM-2 algorithm has updated your review intervals.`
                  : 'No flashcards are currently due for review right now. Come back later or reset your review history.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 text-left">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-500 block">Total Deck</span>
                <span className="text-lg font-bold text-white">{data?.totalCards || 0} cards</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-500 block">Mastery Rate</span>
                <span className="text-lg font-bold text-emerald-400">
                  {Math.round((data?.masteryRate || 0) * 100)}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setCurrentIndex(0);
                  setIsFlipped(false);
                  setSessionCompleted(false);
                  refetch();
                }}
                className="btn-secondary text-xs flex items-center space-x-1.5"
              >
                <IconRotateCw className="w-3.5 h-3.5" />
                <span>Drill Again</span>
              </button>

              <Link
                href={`/kits/${kitId}`}
                className="btn-primary text-xs flex items-center space-x-1.5"
              >
                <span>Return to Workspace</span>
                <IconArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          /* Active Flashcard Card */
          <div className="my-auto py-6 space-y-6">
            {/* 3D Flip Card Container */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="relative w-full min-h-[300px] cursor-pointer group perspective select-none"
              role="button"
              tabIndex={0}
              aria-label="Flashcard. Press space to flip."
            >
              <div
                className={`w-full h-full min-h-[300px] card p-8 border-slate-800 flex flex-col justify-between transition-all duration-300 relative shadow-2xl ${
                  isFlipped
                    ? 'bg-slate-900 border-cyan-500/40 ring-1 ring-cyan-500/20'
                    : 'bg-slate-900/90 hover:border-slate-700'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                    {currentCard.id}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400 flex items-center space-x-1">
                    <IconLayers className="w-3.5 h-3.5" />
                    <span>{isFlipped ? 'Answer Key' : 'Question / Concept'}</span>
                  </span>
                </div>

                {/* Card Main Body */}
                <div className="py-6 text-center">
                  {isFlipped ? (
                    <div className="space-y-3">
                      <p className="text-base sm:text-lg font-medium text-slate-200 leading-relaxed whitespace-pre-line">
                        {currentCard.back}
                      </p>
                    </div>
                  ) : (
                    <h2 className="text-lg sm:text-2xl font-bold text-white leading-snug">
                      {currentCard.front}
                    </h2>
                  )}
                </div>

                {/* Card Footer Hint */}
                <div className="text-center text-[11px] text-slate-500 border-t border-slate-800/80 pt-3">
                  {isFlipped ? (
                    <span className="text-cyan-400/90 font-medium">
                      Rate your confidence below (or press 0-5)
                    </span>
                  ) : (
                    <span>Click anywhere or press Spacebar to reveal answer</span>
                  )}
                </div>
              </div>
            </div>

            {/* Rating Controls (Shown when card is flipped) */}
            {isFlipped && (
              <div className="card p-4 border-slate-800 bg-slate-900/80 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>How well did you know this concept?</span>
                  <span className="text-[10px] text-slate-500 font-mono">Keys 0-5</span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { score: 0, label: 'Blackout', color: 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/30' },
                    { score: 1, label: 'Wrong', color: 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border-orange-500/30' },
                    { score: 2, label: 'Hard', color: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/30' },
                    { score: 3, label: 'Acceptable', color: 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border-sky-500/30' },
                    { score: 4, label: 'Easy', color: 'bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 border-teal-500/30' },
                    { score: 5, label: 'Perfect', color: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30' },
                  ].map((btn) => (
                    <button
                      key={btn.score}
                      type="button"
                      onClick={() => handleRate(btn.score)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center transition-all ${btn.color}`}
                    >
                      <span className="font-mono text-sm">{btn.score}</span>
                      <span className="text-[10px] mt-0.5">{btn.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Keyboard navigation hints */}
        <div className="text-center text-[11px] text-slate-500 py-2">
          <span>Space: Flip card</span> • <span>0-5: Rate recall</span> • <span>Esc: Exit</span>
        </div>
      </main>
    </div>
  );
}
