'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  IconAlertTriangle,
  IconShield,
} from '@/components/Icons';

interface Flashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids?: string[];
  confidence?: number | null;
  reviewedAt?: string | null;
  isUnreviewed?: boolean;
}

interface PracticeData {
  flashcards: Flashcard[];
  totalCards: number;
  reviewedCount: number;
  unreviewedCount: number;
  overallCoverage: number;
  masteryCount: number;
  masteryRate: number;
  lastReviewedCardId: string | null;
}

export default function PracticeModePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const kitId = params['id'] as string;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionReviewedCount, setSessionReviewedCount] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [sessionRatings, setSessionRatings] = useState<Record<string, number>>({});

  // Local storage resume key
  const resumeStorageKey = `prepkit_practice_index_${kitId}`;

  // Fetch practice deck with deterministic queue
  const { data, isLoading, error, refetch } = useQuery<PracticeData>({
    queryKey: ['kit-practice', kitId],
    queryFn: async () => {
      const res = await api.get(`/kits/${kitId}/practice`);
      return res.data;
    },
  });

  const cards = data?.flashcards || [];
  const currentCard = cards[currentIndex];

  // Try to restore saved index on initial load
  useEffect(() => {
    if (cards.length > 0) {
      const savedIndex = localStorage.getItem(resumeStorageKey);
      if (savedIndex) {
        const parsed = parseInt(savedIndex, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed < cards.length) {
          setCurrentIndex(parsed);
        }
      }
    }
  }, [cards.length, resumeStorageKey]);

  // Record confidence rating mutation
  const { mutate: saveRating } = useMutation({
    mutationFn: async ({ flashcardId, confidence }: { flashcardId: string; confidence: number }) => {
      await api.post(`/kits/${kitId}/practice/records`, { flashcardId, confidence });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-practice', kitId] });
      queryClient.invalidateQueries({ queryKey: ['kit-weak-spots', kitId] });
    },
  });

  // Handle rating submission
  const handleRate = useCallback((confidence: number) => {
    if (!currentCard) return;

    saveRating({ flashcardId: currentCard.id, confidence });

    setSessionRatings((prev) => ({ ...prev, [currentCard.id]: confidence }));
    setSessionReviewedCount((prev) => prev + 1);

    if (currentIndex + 1 < cards.length) {
      const nextIdx = currentIndex + 1;
      setIsFlipped(false);
      setCurrentIndex(nextIdx);
      localStorage.setItem(resumeStorageKey, String(nextIdx));
    } else {
      localStorage.removeItem(resumeStorageKey);
      setSessionCompleted(true);
    }
  }, [cards.length, currentCard, currentIndex, resumeStorageKey, saveRating]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space or Enter flips card
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      }
      // If flipped, 1-4 triggers confidence ratings:
      // 1: Again (confidence 1)
      // 2: Hard  (confidence 2)
      // 3: Good  (confidence 3)
      // 4: Easy  (confidence 5)
      if (isFlipped) {
        if (e.key === '1') {
          e.preventDefault();
          handleRate(1);
        } else if (e.key === '2') {
          e.preventDefault();
          handleRate(2);
        } else if (e.key === '3') {
          e.preventDefault();
          handleRate(3);
        } else if (e.key === '4') {
          e.preventDefault();
          handleRate(5);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, handleRate]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col justify-between">
        {/* Top Header & Coverage Metrics */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Link
              href={`/kits/${kitId}`}
              className="text-xs text-slate-400 hover:text-white flex items-center space-x-1.5 transition-colors"
            >
              <IconArrowLeft className="w-4 h-4" />
              <span>Back to Kit Workspace</span>
            </Link>

            <div className="flex items-center space-x-4 text-xs">
              <span className="text-slate-400">
                Deck Coverage: <strong className="text-cyan-400">{data?.overallCoverage || 0}%</strong>
              </span>
              <div className="flex items-center space-x-1 font-mono text-slate-400">
                <span className="text-cyan-400 font-bold">
                  {cards.length > 0 ? currentIndex + 1 : 0}
                </span>
                <span>/</span>
                <span>{cards.length} Cards</span>
              </div>
            </div>
          </div>

          {/* Session Progress Bar */}
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
            <p className="text-xs text-slate-400">Loading confidence-weighted review queue...</p>
          </div>
        ) : cards.length === 0 ? (
          /* Graceful Empty Deck State */
          <div className="card p-10 border-slate-800 bg-slate-900/90 text-center space-y-5 my-auto max-w-lg mx-auto shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mx-auto">
              <IconLayers className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">No Flashcards In Deck</h2>
              <p className="mt-1 text-xs text-slate-400 max-w-xs mx-auto">
                This kit currently has no flashcards. Generate or create flashcards in the Kit Workspace to start practicing.
              </p>
            </div>
            <Link href={`/kits/${kitId}`} className="btn-primary text-xs inline-flex items-center space-x-1.5">
              <span>Open Kit Workspace</span>
              <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : sessionCompleted ? (
          /* Session Completed Summary */
          <div className="card p-10 border-slate-800 bg-slate-900/90 text-center space-y-5 my-auto max-w-lg mx-auto shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
              <IconCheckCircle className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-white">Practice Session Completed</h2>
              <p className="mt-1 text-xs text-slate-400 max-w-xs mx-auto">
                You reviewed {sessionReviewedCount} card{sessionReviewedCount === 1 ? '' : 's'} in this run. Your ratings have been saved and schedule intervals updated.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 text-left">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-500 block">Deck Size</span>
                <span className="text-base font-bold text-white">{data?.totalCards || 0}</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-500 block">Reviewed</span>
                <span className="text-base font-bold text-cyan-400">{data?.reviewedCount || 0}</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-500 block">Mastery</span>
                <span className="text-base font-bold text-emerald-400">{data?.masteryRate || 0}%</span>
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
                <span>Review Deck Again</span>
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
          /* Active Flashcard Screen */
          <div className="my-auto py-6 space-y-6">
            {/* 3D Flip Card Container */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="relative w-full min-h-[300px] cursor-pointer group perspective select-none"
              role="button"
              tabIndex={0}
              aria-label="Flashcard. Press space or click to reveal answer."
            >
              <div
                className={`w-full h-full min-h-[300px] card p-8 border-slate-800 flex flex-col justify-between transition-all duration-300 relative shadow-2xl ${
                  isFlipped
                    ? 'bg-slate-900 border-cyan-500/40 ring-1 ring-cyan-500/20'
                    : 'bg-slate-900/90 hover:border-slate-700'
                }`}
              >
                {/* Card Top Info */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                      {currentCard.id}
                    </span>
                    {currentCard.isUnreviewed && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                        New Card
                      </span>
                    )}
                  </div>

                  <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400 flex items-center space-x-1">
                    <IconLayers className="w-3.5 h-3.5" />
                    <span>{isFlipped ? 'Answer Key' : 'Prompt / Concept'}</span>
                  </span>
                </div>

                {/* Card Main Body */}
                <div className="py-6 text-center">
                  {isFlipped ? (
                    <div className="space-y-3 animate-fade-in">
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

                {/* Card Bottom Hint */}
                <div className="text-center text-[11px] text-slate-500 border-t border-slate-800/80 pt-3">
                  {isFlipped ? (
                    <span className="text-cyan-400/90 font-medium">
                      Select your recall confidence rating below (or press 1-4)
                    </span>
                  ) : (
                    <span>Click card or press Spacebar to reveal answer</span>
                  )}
                </div>
              </div>
            </div>

            {/* Confidence Rating Controls (Again, Hard, Good, Easy) */}
            {isFlipped && (
              <div className="card p-4 border-slate-800 bg-slate-900/80 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>How easily did you recall this answer?</span>
                  <span className="text-[10px] text-slate-500 font-mono">Keys 1 - 4</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleRate(1)}
                    className="p-3 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center transition-all bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/30 hover:scale-[1.02]"
                  >
                    <span className="font-bold text-sm">Again</span>
                    <span className="text-[10px] mt-0.5 text-rose-300/80">Restart (Key 1)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRate(2)}
                    className="p-3 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center transition-all bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/30 hover:scale-[1.02]"
                  >
                    <span className="font-bold text-sm">Hard</span>
                    <span className="text-[10px] mt-0.5 text-amber-300/80">Difficult (Key 2)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRate(3)}
                    className="p-3 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center transition-all bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border-sky-500/30 hover:scale-[1.02]"
                  >
                    <span className="font-bold text-sm">Good</span>
                    <span className="text-[10px] mt-0.5 text-sky-300/80">Recalled (Key 3)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRate(5)}
                    className="p-3 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center transition-all bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30 hover:scale-[1.02]"
                  >
                    <span className="font-bold text-sm">Easy</span>
                    <span className="text-[10px] mt-0.5 text-emerald-300/80">Flawless (Key 4)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Keyboard hints footer */}
        <div className="text-center text-[11px] text-slate-500 py-2">
          <span>Space: Flip</span> • <span>1: Again</span> • <span>2: Hard</span> • <span>3: Good</span> • <span>4: Easy</span>
        </div>
      </main>
    </div>
  );
}
