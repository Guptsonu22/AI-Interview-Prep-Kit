import { PipelineJob, KitModel } from '../db/models';
import { orchestrator, PipelineProgressEvent } from '../pipeline';
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
    const memJob = jobMap.get(id);
    if (memJob) return memJob;

    try {
      const dbJob = await PipelineJob.findById(id).lean();
      if (!dbJob) return null;
      return {
        id: dbJob._id.toString(),
        kitId: dbJob.kitId.toString(),
        userId: '',
        jobDescription: '',
        companyUrl: '',
        daysAvailable: 7,
        status: dbJob.status,
        currentStep: dbJob.currentStep,
        logs: (dbJob.logs || []) as QueueJob['logs'],
        resultKitId: dbJob.resultKitId ? dbJob.resultKitId.toString() : null,
        error: dbJob.error,
        createdAt: dbJob.createdAt,
      };
    } catch {
      return null;
    }
  },

  async process(jobId: string): Promise<void> {
    const job = jobMap.get(jobId);
    if (!job) return;

    job.status = 'running';
    job.currentStep = 'starting';
    job.logs.push({ step: 'start', message: 'Pipeline started', timestamp: new Date(), level: 'info' });
    await this.persistJob(job);

    try {
      const result = await orchestrator.execute(
        {
          jobDescription: job.jobDescription,
          companyUrl: job.companyUrl,
          daysAvailable: job.daysAvailable,
          userId: job.userId,
        },
        {
          onProgress: async (event: PipelineProgressEvent) => {
            job.currentStep = event.stepName;
            job.logs.push({
              step: event.stepName,
              message: event.message,
              timestamp: event.timestamp,
              level: 'info',
            });
            await this.persistJob(job);
          },
        }
      );

      // Save complete kit only when the pipeline successfully finishes
      // Rule: Never overwrite an edited or pinned section with a stale generation response
      try {
        const kitDoc = await KitModel.findById(job.kitId);
        if (kitDoc) {
          const currentSections = kitDoc.sections || {} as any;

          // Requirements: preserve if edited or pinned
          if (!currentSections.requirements?.edited && !currentSections.requirements?.pinned) {
            kitDoc.kitData.requirements = result.kit.requirements;
            kitDoc.sections.requirements = {
              items: result.kit.requirements,
              edited: false,
              pinned: false,
              version: (currentSections.requirements?.version || 0) + 1,
            };
          }

          // Questions: preserve if edited or pinned
          if (!currentSections.questions?.edited && !currentSections.questions?.pinned) {
            kitDoc.kitData.questions = result.kit.questions;
            kitDoc.sections.questions = {
              items: result.kit.questions,
              edited: false,
              pinned: false,
              version: (currentSections.questions?.version || 0) + 1,
              order: result.kit.questions.map((q) => q.id),
            };
          }

          // Flashcards: preserve if edited or pinned
          if (!currentSections.flashcards?.edited && !currentSections.flashcards?.pinned) {
            kitDoc.kitData.flashcards = result.kit.flashcards;
            kitDoc.sections.flashcards = {
              items: result.kit.flashcards,
              edited: false,
              pinned: false,
              version: (currentSections.flashcards?.version || 0) + 1,
            };
          }

          // Schedule: preserve if edited or pinned
          if (!currentSections.schedule?.edited && !currentSections.schedule?.pinned) {
            kitDoc.kitData.schedule = result.kit.schedule;
            kitDoc.sections.schedule = {
              items: result.kit.schedule.days,
              edited: false,
              pinned: false,
              version: (currentSections.schedule?.version || 0) + 1,
            };
          }

          // Metadata & coverage always update
          kitDoc.kitData.source = result.kit.source;
          kitDoc.kitData.company_brief = result.kit.company_brief;
          kitDoc.kitData.role = result.kit.role;
          kitDoc.kitData.coverage = result.kit.coverage;
          kitDoc.sections.coverage = {
            items: result.kit.coverage,
            version: (currentSections.coverage?.version || 0) + 1,
          };

          kitDoc.status = 'ready';
          kitDoc.generationError = null;
          kitDoc.lastRegeneratedAt = new Date();
          await kitDoc.save();
          logger.info({ kitId: job.kitId }, 'Kit successfully persisted upon pipeline completion (preserving edited sections)');
        }
      } catch (saveErr) {
        logger.error({ err: saveErr, kitId: job.kitId }, 'Failed to persist completed kit to database');
      }

      job.status = 'completed';
      job.currentStep = 'completed';
      job.resultKitId = job.kitId;
      job.logs.push({
        step: 'complete',
        message: `Pipeline completed successfully (${result.passes} passes, ${result.kit.questions.length} questions)`,
        timestamp: new Date(),
        level: 'info',
      });

      await this.persistJob(job);
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.logs.push({ step: 'error', message: job.error, timestamp: new Date(), level: 'error' });

      try {
        const kitDoc = await KitModel.findById(job.kitId);
        if (kitDoc && kitDoc.status === 'generating') {
          kitDoc.status = 'draft';
          kitDoc.generationError = job.error;
          await kitDoc.save();
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to update kit status to failed');
      }

      await this.persistJob(job);
      logger.error({ jobId, err: error }, 'Pipeline job failed');
    }
  },

  async persistJob(job: QueueJob): Promise<void> {
    try {
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
    } catch (err) {
      // In tests or offline environments without MongoDB, log error without crashing
      logger.debug({ err, jobId: job.id }, 'Could not persist job to MongoDB (expected in offline test mode)');
    }
  },
};