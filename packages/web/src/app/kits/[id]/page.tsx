'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Kit } from '@interview-prep/shared';
import { format } from 'date-fns';

interface KitView extends Kit {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export default function KitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const kitId = params.id as string;
  const [kit, setKit] = useState<KitView | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'pending' | 'running' | 'completed' | 'failed' | null>(null);

  useEffect(() => {
    fetchKit();
  }, [kitId]);

  const fetchKit = async () => {
    try {
      const res = await api.get(`/kits/${kitId}`);
      setKit(res.data.kit);
    } catch {
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!kit) return;
    setGenerating(true);
    try {
      const res = await api.post(`/kits/${kitId}/generate`);
      setJobId(res.data.jobId);
      setJobStatus('running');
      pollJobStatus(res.data.jobId);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const pollJobStatus = async (id: string) => {
    try {
      const res = await api.get(`/kits/${kitId}/status`, { params: { jobId: id } });
      const status = res.data.job.status;
      setJobStatus(status);
      if (status === 'completed') {
        fetchKit();
      } else if (status === 'running') {
        setTimeout(() => pollJobStatus(id), 2000);
      }
    } catch {
      setJobStatus('failed');
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!kit) return null;

  const statusColors = {
    draft: 'bg-slate-100 text-slate-700',
    generating: 'bg-yellow-100 text-yellow-700',
    ready: 'bg-green-100 text-green-700',
    archived: 'bg-slate-100 text-slate-700',
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-slate-900">Interview Prep Kit</h1>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[kit.status]}`}>
                {kit.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {kit.status !== 'generating' && kit.status !== 'ready' && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="btn-primary"
                >
                  {generating ? 'Starting...' : 'Generate Kit'}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {jobStatus && (
          <div className="mb-6 p-4 bg-primary-50 border border-primary-200 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-primary-800">
                Pipeline: {jobStatus} - {jobStatus === 'running' ? kitId : 'Complete'}
              </span>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <section className="card p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Job Description</h2>
              <p className="text-slate-600 whitespace-pre-wrap">{kit.jobDescription}</p>
            </section>

            <section className="card p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Company Profile</h2>
              <div className="space-y-3 text-sm">
                <p><strong>Name:</strong> {kit.companyProfile?.name || '—'}</p>
                <p><strong>Industry:</strong> {kit.companyProfile?.industry || '—'}</p>
                <p><strong>Size:</strong> {kit.companyProfile?.size || '—'}</p>
                <p><strong>Tech Stack:</strong> {kit.companyProfile?.techStack?.join(', ') || '—'}</p>
              </div>
            </section>

            <section className="card p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Requirements ({kit.requirements?.length || 0})</h2>
              <ul className="space-y-2">
                {kit.requirements?.map((req) => (
                  <li key={req.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-start gap-3">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
                        {req.category}
                      </span>
                      <div>
                        <p className="font-medium text-slate-900">{req.description}</p>
                        <p className="text-xs text-slate-500">Priority: {req.priority} • Source: {req.source}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="space-y-6">
            <section className="card p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Study Schedule ({kit.prepDays} days)</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {kit.dailySchedule?.map((day) => (
                  <div key={day.day} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="font-medium text-slate-900">Day {day.day}</p>
                    <p className="text-sm text-slate-600">{day.focus}</p>
                    <p className="text-xs text-slate-500">{day.hoursAllocated}h • {day.topics.length} topics</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Flashcards ({kit.flashcards?.length || 0})</h2>
              <a href={`/kits/${kitId}/flashcards`} className="btn-secondary w-full">
                Practice Flashcards
              </a>
            </section>

            <section className="card p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Metadata</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Created</dt>
                  <dd className="font-medium">{format(new Date(kit.createdAt), 'PPp')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Updated</dt>
                  <dd className="font-medium">{format(new Date(kit.updatedAt), 'PPp')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Coverage Score</dt>
                  <dd className="font-medium">{(kit.metadata?.coverageScore * 100 || 0).toFixed(0)}%</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}