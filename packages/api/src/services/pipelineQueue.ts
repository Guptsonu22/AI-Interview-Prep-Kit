import { PipelineJob } from '../db/models';
import pino from 'pino';

const logger = pino({ name: 'pipeline-queue' });

interface QueueJob {
  id: string;
  kitId: string;
  userId: string;
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep: string;
  logs: Array<{ step: string; message: string; timestamp: Date; level: 'info' | 'error' }>;
  resultKitId: string | null;
  error: string | null;
  createdAt: Date;
}

const jobMap = new Map<string, QueueJob>();

export const pipelineQueue = {
  async add(input: {
    kitId: string;
    userId: string;
    jobDescription: string;
    companyUrl: string;
    daysAvailable: number;
  }): Promise<{ id: string }> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const job: QueueJob = {
      id: jobId,
      kitId: input.kitId,
      userId: input.userId,
      jobDescription: input.jobDescription,
      companyUrl: input.companyUrl,
      daysAvailable: input.daysAvailable,
      status: 'pending',
      currentStep: 'queued',
      logs: [{ step: 'queue', message: 'Job queued', timestamp: new Date(), level: 'info' }],
      resultKitId: null,
      error: null,
      createdAt: new Date(),
    };
    jobMap.set(jobId, job);

    setImmediate(() => this.process(jobId));
    return { id: jobId };
  },

  async getJob(id: string): Promise<QueueJob | null> {
    return jobMap.get(id) || null;
  },

  async process(jobId: string): Promise<void> {
    const job = jobMap.get(jobId);
    if (!job) return;

    job.status = 'running';
    job.currentStep = 'starting';
    job.logs.push({ step: 'start', message: 'Pipeline started', timestamp: new Date(), level: 'info' });

    try {
      await this.runStep(job, 'extract-source', async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { source: {} };
      });

      await this.runStep(job, 'extract-company-brief', async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { company_brief: {} };
      });

      await this.runStep(job, 'extract-role', async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { role: {} };
      });

      await this.runStep(job, 'extract-requirements', async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { requirements: [] };
      });

      await this.runStep(job, 'generate-questions', async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { questions: [] };
      });

      await this.runStep(job, 'generate-flashcards', async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { flashcards: [] };
      });

      await this.runStep(job, 'generate-schedule', async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { schedule: {} };
      });

      await this.runStep(job, 'compute-coverage', async () => {
        await new Promise((r) => setTimeout(r, 300));
        return { coverage: {} };
      });

      job.status = 'completed';
      job.currentStep = 'completed';
      job.logs.push({ step: 'complete', message: 'Pipeline completed successfully', timestamp: new Date(), level: 'info' });

      await this.persistJob(job);
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.logs.push({ step: 'error', message: job.error, timestamp: new Date(), level: 'error' });
      await this.persistJob(job);
      logger.error({ jobId, err: error }, 'Pipeline job failed');
    }
  },

  async runStep(job: QueueJob, stepName: string, fn: () => Promise<unknown>): Promise<void> {
    job.currentStep = stepName;
    job.logs.push({ step: stepName, message: `Starting ${stepName}`, timestamp: new Date(), level: 'info' });
    await fn();
    job.logs.push({ step: stepName, message: `Completed ${stepName}`, timestamp: new Date(), level: 'info' });
    await this.persistJob(job);
  },

  async persistJob(job: QueueJob): Promise<void> {
    await PipelineJob.findOneAndUpdate(
      { _id: job.id },
      {
        kitId: job.kitId,
        status: job.status,
        currentStep: job.currentStep,
        logs: job.logs,
        resultKitId: job.resultKitId,
        error: job.error,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );
  },
};