'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();
  const [jobDescription, setJobDescription] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [prepDays, setPrepDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/kits', { jobDescription, companyUrl, prepDays });
      router.push(`/kits/${res.data.kit.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create kit';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">AI Interview Prep Kit</h1>
          <p className="mt-3 text-lg text-slate-600">
            Turn a job description into a personalized, day-by-day interview preparation plan
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-8 space-y-6">
          <div>
            <label htmlFor="jobDescription" className="label">
              Job Description
            </label>
            <textarea
              id="jobDescription"
              className="input min-h-[200px] resize-y"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here..."
              required
            />
            <p className="mt-1 text-sm text-slate-500">Minimum 100 characters</p>
          </div>

          <div>
            <label htmlFor="companyUrl" className="label">Company Website</label>
            <input
              id="companyUrl"
              type="url"
              className="input"
              value={companyUrl}
              onChange={(e) => setCompanyUrl(e.target.value)}
              placeholder="https://company.com"
              required
            />
          </div>

          <div>
            <label htmlFor="prepDays" className="label">
              Preparation Days ({prepDays})
            </label>
            <input
              id="prepDays"
              type="range"
              min="1"
              max="90"
              value={prepDays}
              onChange={(e) => setPrepDays(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none accent-primary-600"
            />
            <p className="mt-1 text-sm text-slate-500 text-right">{prepDays} days</p>
          </div>

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || jobDescription.length < 100 || !companyUrl}
            className="btn-primary w-full py-3 text-lg"
          >
            {loading ? 'Generating Kit...' : 'Generate Interview Kit'}
          </button>
        </form>
      </div>
    </main>
  );
}