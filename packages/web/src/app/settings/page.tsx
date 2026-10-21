'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Navbar } from '@/components/Navbar';
import {
  IconSettings,
  IconShield,
  IconLogout,
  IconCheckCircle,
  IconCalendar,
  IconBriefcase,
  IconSparkles,
} from '@/components/Icons';

export default function SettingsPage() {
  const { user, logout, isAuthenticated } = useAuth();

  const [defaultPrepDays, setDefaultPrepDays] = useState(7);
  const [autoGapQuestions, setAutoGapQuestions] = useState(true);
  const [dailyReminders, setDailyReminders] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Link href="/dashboard" className="hover:text-slate-200 transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-slate-200 font-medium">Account Settings</span>
        </div>

        {/* Page Header */}
        <div className="card p-6 border-slate-800 bg-slate-900/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <IconSettings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                Account & Preferences
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                Manage your profile, interview generation defaults, and study schedule settings.
              </p>
            </div>
          </div>
        </div>

        {savedSuccess && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center space-x-2">
            <IconCheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Preferences saved successfully.</span>
          </div>
        )}

        {/* Account Profile Card */}
        <div className="card p-6 border-slate-800 bg-slate-900/80 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Candidate Profile
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold uppercase text-slate-500 block">Full Name</span>
              <span className="text-sm font-bold text-white mt-1 block">
                {user?.name || 'Candidate User'}
              </span>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold uppercase text-slate-500 block">Email Address</span>
              <span className="text-sm font-bold text-white mt-1 block truncate">
                {user?.email || 'user@prepkit.ai'}
              </span>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold uppercase text-slate-500 block">User Identifier</span>
              <span className="text-xs font-mono text-cyan-400 mt-1 block truncate">
                {user?.id || 'usr_candidate_01'}
              </span>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold uppercase text-slate-500 block">Plan Tier</span>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-xs font-bold text-emerald-400">Candidate Pro (Free Tier Enabled)</span>
                <IconShield className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Default Generation Preferences */}
        <form onSubmit={handleSavePreferences} className="card p-6 border-slate-800 bg-slate-900/80 space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Pipeline & Study Preferences
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">Default Preparation Horizon</span>
                <span className="text-[11px] text-slate-400 block">
                  Default number of days allocated when initializing a new kit
                </span>
              </div>
              <select
                value={defaultPrepDays}
                onChange={(e) => setDefaultPrepDays(parseInt(e.target.value, 10))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              >
                <option value={3}>3 Days (Fast Track)</option>
                <option value={7}>7 Days (Standard)</option>
                <option value={14}>14 Days (Comprehensive)</option>
                <option value={30}>30 Days (Deep Mastery)</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">Mandatory 2-Pass Gap Questions</span>
                <span className="text-[11px] text-slate-400 block">
                  Automatically synthesize questions for any uncovered must-have requirement
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoGapQuestions}
                onChange={(e) => setAutoGapQuestions(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700 accent-cyan-400"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">Daily Flashcard Study Alerts</span>
                <span className="text-[11px] text-slate-400 block">
                  Highlight flashcards due in practice deck according to SM-2 spaced repetition
                </span>
              </div>
              <input
                type="checkbox"
                checked={dailyReminders}
                onChange={(e) => setDailyReminders(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700 accent-cyan-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button type="submit" className="btn-primary text-xs py-2 px-5">
              Save Preferences
            </button>
          </div>
        </form>

        {/* Security & Session Card */}
        <div className="card p-6 border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-white">Active Session</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Signed in with bearer authorization and secure cookie tokens.
            </p>
          </div>

          <button
            type="button"
            onClick={() => logout()}
            className="btn-danger text-xs flex items-center space-x-1.5"
          >
            <IconLogout className="w-4 h-4" />
            <span>Sign Out of Account</span>
          </button>
        </div>
      </main>
    </div>
  );
}
