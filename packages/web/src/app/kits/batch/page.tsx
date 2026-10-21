'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Navbar } from '@/components/Navbar';
import {
  IconUpload,
  IconPlus,
  IconTrash,
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconAlertTriangle,
  IconCheckCircle,
  IconArrowRight,
  IconRotateCw,
} from '@/components/Icons';

interface BatchRow {
  id: string;
  roleName?: string;
  jd: string;
  company_url: string;
  days: number;
  status?: 'pending' | 'creating' | 'success' | 'failed';
  error?: string;
  kitId?: string;
}

const DEFAULT_SAMPLE_JSON = [
  {
    id: "case-01",
    roleName: "Senior Backend Engineer",
    jd: "Acme Corp is seeking a Senior Backend Engineer with 5+ years of distributed systems experience in Go and PostgreSQL. Must have: strong system design skills, microservices architecture, and SQL query tuning. Responsibilities include building real-time telemetry APIs and maintaining 99.99% uptime.",
    company_url: "https://stripe.com",
    days: 5
  },
  {
    id: "case-02",
    roleName: "Staff Frontend Engineer",
    jd: "Join our core UI platform team. Must have: expert knowledge of Next.js, React 18 concurrency, Tailwind CSS, TypeScript, and web performance optimization. Experience architecting design systems and mentoring senior developers required.",
    company_url: "https://vercel.com",
    days: 7
  }
];

export default function BatchKitPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<BatchRow[]>([
    {
      id: 'case-01',
      roleName: 'Senior Backend Engineer',
      jd: DEFAULT_SAMPLE_JSON[0].jd,
      company_url: DEFAULT_SAMPLE_JSON[0].company_url,
      days: 5,
      status: 'pending',
    },
    {
      id: 'case-02',
      roleName: 'Staff Frontend Engineer',
      jd: DEFAULT_SAMPLE_JSON[1].jd,
      company_url: DEFAULT_SAMPLE_JSON[1].company_url,
      days: 7,
      status: 'pending',
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionCompleted, setSubmissionCompleted] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Add row
  const handleAddRow = () => {
    const newId = `case-${String(rows.length + 1).padStart(2, '0')}`;
    setRows([
      ...rows,
      {
        id: newId,
        roleName: '',
        jd: '',
        company_url: '',
        days: 7,
        status: 'pending',
      },
    ]);
  };

  // Remove row
  const handleRemoveRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  // Update row
  const handleUpdateRow = (index: number, field: keyof BatchRow, val: any) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: val } : r))
    );
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new Error('JSON file must be an array of cases [ { jd, company_url, days, ... } ]');
        }

        const formattedRows: BatchRow[] = parsed.map((item, idx) => ({
          id: item.id || `case-${String(idx + 1).padStart(2, '0')}`,
          roleName: item.roleName || item.role || `Role #${idx + 1}`,
          jd: item.jd || item.jobDescription || '',
          company_url: item.company_url || item.companyUrl || '',
          days: typeof item.days === 'number' ? item.days : 7,
          status: 'pending',
        }));

        setRows(formattedRows);
        setGlobalError(null);
      } catch (err: any) {
        setGlobalError(`Failed to parse JSON file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // Process batch submission
  const handleSubmitBatch = async () => {
    // Validation
    const invalidRow = rows.find(
      (r) => !r.jd || r.jd.trim().length < 50 || !r.company_url
    );
    if (invalidRow) {
      setGlobalError(
        `Case "${invalidRow.id}" is incomplete. Ensure Job Description is provided and Company URL is valid.`
      );
      return;
    }

    setGlobalError(null);
    setIsSubmitting(true);
    setSubmissionCompleted(false);

    const updatedRows = [...rows];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      row.status = 'creating';
      setRows([...updatedRows]);

      try {
        const normalizedUrl = row.company_url.startsWith('http')
          ? row.company_url
          : `https://${row.company_url}`;

        const res = await api.post('/kits', {
          jobDescription: row.jd.trim(),
          companyUrl: normalizedUrl,
          daysAvailable: row.days,
          generateNow: true,
        });

        row.status = 'success';
        row.kitId = res.data.kit?.id || res.data.kit?._id;
      } catch (err: any) {
        row.status = 'failed';
        row.error =
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Failed';
      }
      setRows([...updatedRows]);
    }

    setIsSubmitting(false);
    setSubmissionCompleted(true);
  };

  const successCount = rows.filter((r) => r.status === 'success').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Link href="/dashboard" className="hover:text-slate-200 transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-slate-200 font-medium">Multi-Role Batch Evaluation</span>
        </div>

        {/* Page Banner */}
        <div className="card p-6 border-slate-800 bg-slate-900/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center space-x-2">
              <IconUpload className="w-6 h-6 text-cyan-400" />
              <span>Multi-Role Batch Upload & Evaluation</span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Prepare for multiple concurrent opportunities. Upload a JSON file of target postings or edit rows in the table below.
            </p>
          </div>

          <div className="flex items-center space-x-2.5">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".json"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary text-xs flex items-center space-x-1.5"
            >
              <IconUpload className="w-3.5 h-3.5 text-slate-400" />
              <span>Upload JSON</span>
            </button>
            <button
              type="button"
              onClick={handleAddRow}
              className="btn-secondary text-xs flex items-center space-x-1.5 border-cyan-500/30 text-cyan-400"
            >
              <IconPlus className="w-3.5 h-3.5" />
              <span>Add Position</span>
            </button>
          </div>
        </div>

        {globalError && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
            <IconAlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Batch Validation Warning:</span>
              <span>{globalError}</span>
            </div>
          </div>
        )}

        {submissionCompleted && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <IconCheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              <span>
                Batch complete: Successfully initialized {successCount} of {rows.length} interview kits!
              </span>
            </div>
            <Link href="/dashboard" className="btn-primary !py-1 !px-3 text-xs flex items-center space-x-1">
              <span>View In Dashboard</span>
              <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Interactive Batch Table */}
        <div className="card border-slate-800 bg-slate-900/90 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/80 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4 w-28">Case ID</th>
                  <th className="py-3.5 px-4 min-w-[200px]">Company Website</th>
                  <th className="py-3.5 px-4 min-w-[320px]">Job Description</th>
                  <th className="py-3.5 px-4 w-24 text-center">Days</th>
                  <th className="py-3.5 px-4 w-32 text-center">Status</th>
                  <th className="py-3.5 px-4 w-16 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {rows.map((row, idx) => (
                  <tr key={row.id + idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-300">
                      <input
                        type="text"
                        value={row.id}
                        onChange={(e) => handleUpdateRow(idx, 'id', e.target.value)}
                        className="bg-transparent border border-slate-800 rounded px-2 py-1 text-xs w-full text-slate-300 focus:border-cyan-500 outline-none"
                        disabled={isSubmitting}
                      />
                    </td>

                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={row.company_url}
                          onChange={(e) => handleUpdateRow(idx, 'company_url', e.target.value)}
                          placeholder="https://company.com"
                          className="input !py-1.5 text-xs"
                          disabled={isSubmitting}
                        />
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <textarea
                        rows={2}
                        value={row.jd}
                        onChange={(e) => handleUpdateRow(idx, 'jd', e.target.value)}
                        placeholder="Paste job posting text..."
                        className="input !py-1 text-xs font-mono resize-y"
                        disabled={isSubmitting}
                      />
                    </td>

                    <td className="py-3 px-4 text-center">
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={row.days}
                        onChange={(e) =>
                          handleUpdateRow(idx, 'days', parseInt(e.target.value, 10) || 7)
                        }
                        className="w-16 input !py-1.5 text-center text-xs"
                        disabled={isSubmitting}
                      />
                    </td>

                    <td className="py-3 px-4 text-center">
                      {row.status === 'creating' && (
                        <span className="inline-flex items-center text-cyan-400 space-x-1 animate-pulse font-medium text-[11px]">
                          <IconRotateCw className="w-3 h-3 animate-spin" />
                          <span>Creating...</span>
                        </span>
                      )}
                      {row.status === 'success' && (
                        <div className="flex flex-col items-center space-y-1">
                          <span className="text-emerald-400 font-semibold text-[11px]">Ready</span>
                          {row.kitId && (
                            <Link
                              href={`/kits/${row.kitId}`}
                              className="text-[10px] text-cyan-400 underline hover:text-cyan-300"
                            >
                              Open Kit
                            </Link>
                          )}
                        </div>
                      )}
                      {row.status === 'failed' && (
                        <span className="text-rose-400 font-semibold text-[11px]" title={row.error}>
                          Failed
                        </span>
                      )}
                      {row.status === 'pending' && (
                        <span className="text-slate-500 font-medium text-[11px]">Pending</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        disabled={isSubmitting || rows.length <= 1}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 disabled:opacity-30"
                        title="Remove row"
                      >
                        <IconTrash className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              {rows.length} total position{rows.length > 1 ? 's' : ''} queued in batch
            </span>

            <div className="flex items-center space-x-3">
              <Link href="/dashboard" className="btn-secondary text-xs">
                Back to Dashboard
              </Link>
              <button
                type="button"
                onClick={handleSubmitBatch}
                disabled={isSubmitting || rows.length === 0}
                className="btn-primary text-xs py-2 px-5 flex items-center space-x-2 shadow-lg shadow-cyan-500/20"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing Batch...</span>
                  </>
                ) : (
                  <>
                    <IconUpload className="w-4 h-4" />
                    <span>Run Batch Generation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
