'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Navbar } from '@/components/Navbar';
import {
  IconSparkles,
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconAlertTriangle,
  IconArrowRight,
  IconInfo,
  IconUpload,
} from '@/components/Icons';

const SAMPLE_JD = `Senior Full-Stack Engineer — Acme Corp

About the Role:
We are looking for a Senior Full-Stack Engineer with 5+ years of experience in distributed systems and modern web technologies. You will architect and build real-time collaborative web applications, scale microservices to handle millions of requests, and mentor junior engineers.

Responsibilities:
- Architect and develop high-throughput microservices using Node.js, TypeScript, and Go.
- Build reactive and accessible frontend web interfaces using Next.js, React, and Tailwind CSS.
- Design resilient distributed data pipelines with PostgreSQL, Redis, and Kafka.
- Implement robust CI/CD pipelines and Kubernetes-based deployment strategies.
- Participate in architectural reviews and foster rigorous code quality standards.

Qualifications:
- Must have: Strong proficiency in TypeScript, Node.js, React, and relational database design.
- Must have: Deep understanding of distributed systems architecture, caching strategies, and REST/GraphQL API design.
- Must have: Experience with containerization (Docker) and cloud infrastructure (AWS or GCP).
- Nice to have: Familiarity with Go or Rust for high-performance services.
- Nice to have: Experience with event streaming architectures (Kafka / RabbitMQ).`;

export default function NewKitPage() {
  const router = useRouter();
  const [jobDescription, setJobDescription] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [daysAvailable, setDaysAvailable] = useState<number>(7);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ jd?: string; url?: string; general?: string }>({});

  const validate = () => {
    const errors: { jd?: string; url?: string } = {};

    if (!jobDescription || jobDescription.trim().length < 100) {
      errors.jd = `Job description must be at least 100 characters (currently ${jobDescription.trim().length}).`;
    }

    if (!companyUrl) {
      errors.url = 'Company website URL is required.';
    } else {
      try {
        const parsed = new URL(companyUrl.startsWith('http') ? companyUrl : `https://${companyUrl}`);
        if (!parsed.hostname.includes('.')) {
          errors.url = 'Please enter a valid company website domain (e.g. https://stripe.com).';
        }
      } catch {
        errors.url = 'Invalid URL format. Include http:// or https://';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setFieldErrors({});

    try {
      const normalizedUrl = companyUrl.startsWith('http') ? companyUrl : `https://${companyUrl}`;
      const res = await api.post('/kits', {
        jobDescription: jobDescription.trim(),
        companyUrl: normalizedUrl,
        daysAvailable,
        generateNow: true,
      });

      const kitId = res.data.kit?.id || res.data.kit?._id;
      // Navigate to the live generation progress page
      router.push(`/kits/${kitId}/progress`);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Failed to initialize kit.';
      setFieldErrors({ general: msg });
      setLoading(false);
    }
  };

  const handleLoadSample = () => {
    setJobDescription(SAMPLE_JD);
    setCompanyUrl('https://stripe.com');
    setDaysAvailable(7);
    setFieldErrors({});
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <Link href="/dashboard" className="hover:text-slate-200 transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-slate-200 font-medium">New Interview Kit</span>
          </div>

          <Link
            href="/kits/batch"
            className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center space-x-1"
          >
            <IconUpload className="w-3.5 h-3.5" />
            <span>Have multiple roles? Use Multi-Role Batch</span>
          </Link>
        </div>

        {/* Page Title & Intro */}
        <div className="card p-6 border-slate-800 bg-slate-900/70">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center space-x-2">
                <span>Create Personalized Interview Kit</span>
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-400">
                Provide the job description and company domain. Our pipeline will extract requirements, crawl official company evidence, and generate a customized study plan.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLoadSample}
              className="btn-secondary !py-1.5 !px-3 text-xs self-start sm:self-auto flex items-center space-x-1.5 border-cyan-500/30 text-cyan-300 hover:bg-slate-800"
            >
              <IconSparkles className="w-3.5 h-3.5" />
              <span>Load Sample Post</span>
            </button>
          </div>
        </div>

        {fieldErrors.general && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
            <IconAlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Submission Error:</span>
              <span>{fieldErrors.general}</span>
            </div>
          </div>
        )}

        {/* Creation Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card 1: Job Description */}
          <div className="card p-6 border-slate-800 bg-slate-900/80 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="jobDescription" className="label flex items-center space-x-1.5 !mb-0">
                <IconBriefcase className="w-4 h-4 text-cyan-400" />
                <span>Job Description Text</span>
                <span className="text-rose-400">*</span>
              </label>
              <span className="text-[11px] text-slate-500">
                {jobDescription.length} chars (min. 100)
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Paste the entire job posting text. The system parses this locally to extract must-have & nice-to-have requirements, domain responsibilities, and seniority.
            </p>

            <textarea
              id="jobDescription"
              rows={9}
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste full job description including responsibilities, requirements, and qualifications..."
              className={`input font-mono text-xs leading-relaxed resize-y ${
                fieldErrors.jd ? 'border-rose-500 ring-1 ring-rose-500' : ''
              }`}
              required
            />

            {fieldErrors.jd && (
              <p className="text-xs text-rose-400 flex items-center space-x-1">
                <IconAlertTriangle className="w-3.5 h-3.5" />
                <span>{fieldErrors.jd}</span>
              </p>
            )}
          </div>

          {/* Card 2: Company Domain */}
          <div className="card p-6 border-slate-800 bg-slate-900/80 space-y-3">
            <label htmlFor="companyUrl" className="label flex items-center space-x-1.5 !mb-0">
              <IconBuilding className="w-4 h-4 text-cyan-400" />
              <span>Company Website URL</span>
              <span className="text-rose-400">*</span>
            </label>

            <p className="text-xs text-slate-400">
              Enter the main website of the employer. Our crawler explores official pages (About, Products, Engineering Blogs) to ground interview questions in real evidence.
            </p>

            <div className="relative">
              <input
                id="companyUrl"
                type="text"
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                placeholder="https://company.com"
                className={`input ${
                  fieldErrors.url ? 'border-rose-500 ring-1 ring-rose-500' : ''
                }`}
                required
              />
            </div>

            {fieldErrors.url && (
              <p className="text-xs text-rose-400 flex items-center space-x-1">
                <IconAlertTriangle className="w-3.5 h-3.5" />
                <span>{fieldErrors.url}</span>
              </p>
            )}

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 flex items-start space-x-2 text-[11px] text-slate-400">
              <IconInfo className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Distinction:</strong> The job description above is analyzed for candidate criteria; this URL is crawled independently to research the company culture, tech stack, and public interview evidence.
              </span>
            </div>
          </div>

          {/* Card 3: Preparation Schedule Horizon */}
          <div className="card p-6 border-slate-800 bg-slate-900/80 space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="daysAvailable" className="label flex items-center space-x-1.5 !mb-0">
                <IconCalendar className="w-4 h-4 text-cyan-400" />
                <span>Preparation Schedule Horizon</span>
              </label>
              <span className="px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-300 font-bold text-xs border border-cyan-500/30">
                {daysAvailable} Day{daysAvailable > 1 ? 's' : ''} Plan
              </span>
            </div>

            <p className="text-xs text-slate-400">
              How many days do you have before the interview? The deterministic scheduler will allocate questions and flashcard sessions evenly, putting high-priority must-haves first.
            </p>

            <div className="space-y-3 pt-2">
              <input
                id="daysAvailable"
                type="range"
                min={1}
                max={90}
                value={daysAvailable}
                onChange={(e) => setDaysAvailable(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />

              {/* Quick Preset Buttons */}
              <div className="flex items-center space-x-2">
                {[1, 3, 7, 14, 30].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDaysAvailable(preset)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      daysAvailable === preset
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
                    }`}
                  >
                    {preset} {preset === 1 ? 'Day (Crash Course)' : 'Days'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2">
            <Link href="/dashboard" className="btn-secondary text-xs">
              Cancel
            </Link>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary py-3 px-6 text-sm font-semibold flex items-center space-x-2 shadow-xl shadow-cyan-500/20"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Submitting & Launching Pipeline...</span>
                </>
              ) : (
                <>
                  <IconSparkles className="w-4 h-4" />
                  <span>Generate Preparation Kit</span>
                  <IconArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
