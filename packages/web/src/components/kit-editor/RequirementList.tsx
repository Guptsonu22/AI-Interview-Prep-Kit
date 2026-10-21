'use client';

import React, { useState } from 'react';
import { Badge } from '../ui/Badge';
import { IconCheckCircle, IconAlertTriangle, IconSearch } from '../Icons';

export interface RequirementItem {
  id: string;
  text: string;
  category: string;
  priority: 'must' | 'nice';
  coveredBy?: string[];
}

interface RequirementListProps {
  requirements: RequirementItem[];
  questions?: Array<{ id: string; requirement_ids?: string[] }>;
}

export function RequirementList({ requirements, questions = [] }: RequirementListProps) {
  const [filterPriority, setFilterPriority] = useState<'all' | 'must' | 'nice'>('all');
  const [search, setSearch] = useState('');

  // Map which questions cover which requirements
  const reqCoverageMap = new Map<string, string[]>();
  for (const q of questions) {
    for (const rid of q.requirement_ids || []) {
      const existing = reqCoverageMap.get(rid) || [];
      existing.push(q.id);
      reqCoverageMap.set(rid, existing);
    }
  }

  const filtered = requirements.filter((r) => {
    if (filterPriority !== 'all' && r.priority !== filterPriority) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.text.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
    }
    return true;
  });

  const mustCount = requirements.filter((r) => r.priority === 'must').length;
  const niceCount = requirements.filter((r) => r.priority === 'nice').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white">Extracted Job Requirements ({requirements.length})</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Classified from the job posting into Must-Have ({mustCount}) and Nice-to-Have ({niceCount}).
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            {(['all', 'must', 'nice'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-colors ${
                  filterPriority === p
                    ? 'bg-slate-800 text-cyan-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="relative">
            <IconSearch className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter requirements..."
              className="input pl-8 !py-1 text-xs w-44"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((req) => {
          const isMust = req.priority === 'must';
          const coveredQuestions = reqCoverageMap.get(req.id) || req.coveredBy || [];
          const isCovered = coveredQuestions.length > 0;

          return (
            <div
              key={req.id}
              className={`card p-4 border transition-all ${
                isMust
                  ? 'border-rose-900/30 bg-slate-900/80'
                  : 'border-slate-800 bg-slate-900/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
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

              {/* Coverage footer */}
              <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-500">Coverage Status:</span>
                {isCovered ? (
                  <div className="flex items-center space-x-1 text-emerald-400 text-[11px] font-medium">
                    <IconCheckCircle className="w-3.5 h-3.5" />
                    <span>Covered by {coveredQuestions.join(', ')}</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1 text-amber-400 text-[11px] font-medium">
                    <IconAlertTriangle className="w-3.5 h-3.5" />
                    <span>Uncovered</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
