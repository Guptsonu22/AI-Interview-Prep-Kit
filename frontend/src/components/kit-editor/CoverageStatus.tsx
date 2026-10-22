'use client';

import React from 'react';
import {
  IconCheckCircle,
  IconAlertTriangle,
  IconSparkles,
  IconShield,
} from '../Icons';

export interface CoverageData {
  coverage_percentage?: number;
  must_have_coverage_percentage?: number;
  total_requirements?: number;
  covered_requirements?: number;
  uncovered_must_haves?: Array<{ id: string; text: string }>;
}

interface CoverageStatusProps {
  coverage: CoverageData;
  onGenerateGapQuestions?: () => void;
  isGeneratingGaps?: boolean;
}

export function CoverageStatus({
  coverage,
  onGenerateGapQuestions,
  isGeneratingGaps = false,
}: CoverageStatusProps) {
  const totalPct = coverage.coverage_percentage ?? 100;
  const mustPct = coverage.must_have_coverage_percentage ?? (coverage.uncovered_must_haves?.length ? 80 : 100);
  const uncoveredMusts = coverage.uncovered_must_haves || [];

  return (
    <div className="space-y-6">
      {/* Meters Card */}
      <div className="card p-6 border-slate-800 bg-slate-900/80 space-y-6">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <IconShield className="w-5 h-5 text-cyan-400" />
            <span>2-Pass Deterministic Coverage Audit</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Evaluates requirement completeness across Technical, Behavioural, System Design, and Company Fit categories.
          </p>
        </div>

        {/* Meters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Must-Have Requirements Coverage</span>
              <span
                className={`font-bold font-mono ${
                  mustPct === 100 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {mustPct}%
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  mustPct === 100 ? 'bg-emerald-400' : 'bg-rose-500'
                }`}
                style={{ width: `${mustPct}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              {mustPct === 100
                ? 'Every mandatory requirement is tested.'
                : `${uncoveredMusts.length} mandatory requirement(s) need questions.`}
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Overall Coverage (Must + Nice)</span>
              <span className="font-bold font-mono text-cyan-400">{totalPct}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-cyan-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${totalPct}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              {coverage.covered_requirements ?? 0} of {coverage.total_requirements ?? 0} criteria addressed.
            </p>
          </div>
        </div>

        {/* Uncovered Alert or Clean Bill */}
        {uncoveredMusts.length === 0 ? (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center space-x-2.5">
            <IconCheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <span className="font-semibold block">Full Must-Have Coverage Guaranteed</span>
              <span className="text-emerald-200/80">
                The kit satisfies the 100% must-have coverage mandate. No gaps detected.
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start space-x-2">
                <IconAlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">
                    Uncovered Must-Have Criteria Detected ({uncoveredMusts.length})
                  </span>
                  <p className="text-[11px] text-rose-200/90 mt-0.5">
                    The following posting criteria are not currently covered by any interview question:
                  </p>
                </div>
              </div>

              {onGenerateGapQuestions && (
                <button
                  type="button"
                  onClick={onGenerateGapQuestions}
                  disabled={isGeneratingGaps}
                  className="btn-primary !py-1 !px-3 text-xs flex items-center space-x-1.5 flex-shrink-0"
                >
                  <IconSparkles className="w-3.5 h-3.5" />
                  <span>{isGeneratingGaps ? 'Synthesizing Gaps...' : 'Auto-Fill Gap Questions'}</span>
                </button>
              )}
            </div>

            <ul className="space-y-1.5 pl-6 list-disc text-slate-300">
              {uncoveredMusts.map((un, i) => (
                <li key={i} className="text-xs">
                  <span className="font-mono text-rose-400 font-semibold">[{un.id}]</span>{' '}
                  <span>{un.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
