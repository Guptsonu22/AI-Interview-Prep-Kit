import { Types } from 'mongoose';
import { PipelineJob, KitModel } from '../db/models';
import { orchestrator, PipelineProgressEvent } from '../pipeline';
import type { Question, Flashcard } from '@interview-prep/shared';
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
    const jobId = new Types.ObjectId().toString();
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

    await this.persistJob(job);
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

          // Questions: preserve if section is pinned or individual questions are edited/pinned/user-created
          if (!currentSections.questions?.pinned) {
            const existingQuestions = (kitDoc.kitData?.questions || []) as Question[];
            const protectedQuestions = existingQuestions.filter(
              (q) => q.provenance === 'user_created' || q.edited === true || q.pinned === true
            );

            if (protectedQuestions.length > 0 || currentSections.questions?.edited) {
              // Merge protected questions with newly generated questions
              const existingPromptKeys = new Set(protectedQuestions.map((q) => q.prompt.trim().toLowerCase()));
              const newQuestions = (result.kit.questions || []).filter(
                (q) => !existingPromptKeys.has(q.prompt.trim().toLowerCase())
              );
              const mergedQuestions = [...protectedQuestions, ...newQuestions];
              kitDoc.kitData.questions = mergedQuestions;
              kitDoc.sections.questions = {
                items: mergedQuestions,
                edited: currentSections.questions?.edited || false,
                pinned: false,
                version: (currentSections.questions?.version || 0) + 1,
                order: mergedQuestions.map((q) => q.id),
              };
            } else {
              kitDoc.kitData.questions = result.kit.questions;
              kitDoc.sections.questions = {
                items: result.kit.questions,
                edited: false,
                pinned: false,
                version: (currentSections.questions?.version || 0) + 1,
                order: result.kit.questions.map((q) => q.id),
              };
            }
          }

          // Flashcards: preserve if section is pinned or individual cards are edited/pinned/user-created
          if (!currentSections.flashcards?.pinned) {
            const existingCards = (kitDoc.kitData?.flashcards || []) as Flashcard[];
            const protectedCards = existingCards.filter(
              (f) => f.provenance === 'user_created' || f.edited === true || f.pinned === true
            );

            if (protectedCards.length > 0 || currentSections.flashcards?.edited) {
              const existingFrontKeys = new Set(protectedCards.map((f) => f.front.trim().toLowerCase()));
              const newCards = (result.kit.flashcards || []).filter(
                (f) => !existingFrontKeys.has(f.front.trim().toLowerCase())
              );
              const mergedCards = [...protectedCards, ...newCards];
              kitDoc.kitData.flashcards = mergedCards;
              kitDoc.sections.flashcards = {
                items: mergedCards,
                edited: currentSections.flashcards?.edited || false,
                pinned: false,
                version: (currentSections.flashcards?.version || 0) + 1,
              };
            } else {
              kitDoc.kitData.flashcards = result.kit.flashcards;
              kitDoc.sections.flashcards = {
                items: result.kit.flashcards,
                edited: false,
                pinned: false,
                version: (currentSections.flashcards?.version || 0) + 1,
              };
            }
          }

          // Company brief: preserve if edited or pinned
          if (!currentSections.company_brief?.edited && !currentSections.company_brief?.pinned) {
            kitDoc.kitData.company_brief = result.kit.company_brief;
            kitDoc.sections.company_brief = {
              items: [result.kit.company_brief],
              edited: false,
              pinned: false,
              version: (currentSections.company_brief?.version || 0) + 1,
            } as any;
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
      const jobObjectId = Types.ObjectId.isValid(job.id) ? new Types.ObjectId(job.id) : undefined;
      const kitObjectId = Types.ObjectId.isValid(job.kitId) ? new Types.ObjectId(job.kitId) : undefined;
      const resultKitObjectId = job.resultKitId && Types.ObjectId.isValid(job.resultKitId) ? new Types.ObjectId(job.resultKitId) : null;

      const query = jobObjectId ? { _id: jobObjectId } : { kitId: kitObjectId };

      await PipelineJob.findOneAndUpdate(
        query,
        {
          kitId: kitObjectId,
          status: job.status,
          currentStep: job.currentStep,
          logs: job.logs,
          resultKitId: resultKitObjectId,
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