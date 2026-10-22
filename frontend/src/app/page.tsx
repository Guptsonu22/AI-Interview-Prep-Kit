'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Navbar } from '@/components/Navbar';
import {
  IconSparkles,
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconCheckCircle,
  IconArrowRight,
  IconPlay,
  IconShield,
} from '@/components/Icons';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, loading, router]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white relative overflow-hidden">
      <Navbar />

      {/* Decorative ambient gradient spots */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-r from-cyan-500/15 via-blue-600/10 to-indigo-500/15 blur-[120px] pointer-events-none rounded-full" />

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center max-w-5xl mx-auto z-10">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold mb-8 animate-fade-in">
          <IconSparkles className="w-3.5 h-3.5" />
          <span>Next-Generation AI Interview Preparation System</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Master any interview with <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500">
            evidence-grounded AI intelligence
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl text-balance">
          Transform any pasted job description and company URL into a comprehensive, verified preparation kit: live company intelligence, requirement-mapped question banks, flashcards, and a day-by-day deterministic study schedule.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
          <Link
            href="/auth/register"
            className="w-full sm:w-auto btn-primary py-3 px-7 text-sm font-semibold flex items-center justify-center space-x-2 shadow-xl shadow-cyan-500/20"
          >
            <span>Start Prepping Free</span>
            <IconArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/auth/login"
            className="w-full sm:w-auto btn-secondary py-3 px-6 text-sm font-semibold flex items-center justify-center space-x-2"
          >
            <IconBriefcase className="w-4 h-4 text-slate-400" />
            <span>Sign In to Dashboard</span>
          </Link>
        </div>

        {/* Feature Grid Highlights */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-left w-full">
          <div className="card p-6 border-slate-800/80 bg-slate-900/60 backdrop-blur-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <IconBuilding className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Grounded Company Briefs</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Real crawler exploration of products, culture, engineering blogs, and public interview evidence — with verifiable source citations and zero hallucinated claims.
            </p>
          </div>

          <div className="card p-6 border-slate-800/80 bg-slate-900/60 backdrop-blur-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <IconCheckCircle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">100% Requirement Coverage</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Deterministic 2-pass coverage engine analyzes all must-have requirements from the posting, automatically filling gaps across technical, system design, and behavioural categories.
            </p>
          </div>

          <div className="card p-6 border-slate-800/80 bg-slate-900/60 backdrop-blur-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <IconCalendar className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Deterministic Study Schedule</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Application-level bin-packing algorithm schedules hard must-have requirements early, with SRS flashcards and targeted time budgets tailored to your days available.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        PrepKit.ai — Professional AI-Powered Interview Preparation Platform
      </footer>
    </div>
  );
}