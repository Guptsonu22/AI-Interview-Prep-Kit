import mongoose, { Document, Schema, Types } from 'mongoose';
import { Kit, Requirement, Question, Flashcard, Day, Schedule, Coverage } from '@interview-prep/shared';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

UserSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model<IUser>('User', UserSchema);

export interface IKitSectionState {
  requirements: {
    items: Requirement[];
    edited: boolean;
    pinned: boolean;
    version: number;
  };
  questions: {
    items: Question[];
    edited: boolean;
    pinned: boolean;
    version: number;
    order: string[];
  };
  flashcards: {
    items: Flashcard[];
    edited: boolean;
    pinned: boolean;
    version: number;
  };
  schedule: {
    items: Day[];
    edited: boolean;
    pinned: boolean;
    version: number;
  };
  coverage: {
    items: Coverage;
    version: number;
  };
}

export interface IKit extends Document {
  userId: Types.ObjectId;
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  kitData: Kit;
  sections: IKitSectionState;
  status: 'draft' | 'generating' | 'ready' | 'archived';
  generationError: string | null;
  version: number;
  lastRegeneratedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SectionStateSchema = new Schema({
  requirements: {
    items: { type: [Schema.Types.Mixed], default: [] },
    edited: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
    version: { type: Number, default: 0 },
  },
  questions: {
    items: { type: [Schema.Types.Mixed], default: [] },
    edited: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
    version: { type: Number, default: 0 },
    order: { type: [String], default: [] },
  },
  flashcards: {
    items: { type: [Schema.Types.Mixed], default: [] },
    edited: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
    version: { type: Number, default: 0 },
  },
  schedule: {
    items: { type: [Schema.Types.Mixed], default: [] },
    edited: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
    version: { type: Number, default: 0 },
  },
  coverage: {
    items: { type: Schema.Types.Mixed, default: {} },
    version: { type: Number, default: 0 },
  },
}, { _id: false });

const KitSchema = new Schema<IKit>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jobDescription: { type: String, required: true },
  companyUrl: { type: String, required: true },
  daysAvailable: { type: Number, required: true, min: 1, max: 90 },
  kitData: { type: Schema.Types.Mixed, required: true },
  sections: { type: SectionStateSchema, required: true, default: {} },
  status: { type: String, enum: ['draft', 'generating', 'ready', 'archived'], default: 'draft', index: true },
  generationError: { type: String, default: null },
  version: { type: Number, default: 1 },
  lastRegeneratedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

KitSchema.index({ userId: 1, createdAt: -1 });
KitSchema.index({ userId: 1, status: 1 });

KitSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.version += 1;
  next();
});

export const KitModel = mongoose.model<IKit>('Kit', KitSchema);

export interface IPracticeRecord extends Document {
  userId: Types.ObjectId;
  kitId: Types.ObjectId;
  flashcardId: string;
  confidence: 0 | 1 | 2 | 3 | 4 | 5;
  reviewedAt: Date;
  nextReviewAt: Date;
  interval: number;
  easeFactor: number;
  repetitions: number;
  createdAt: Date;
  updatedAt: Date;
}

const PracticeRecordSchema = new Schema<IPracticeRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kitId: { type: Schema.Types.ObjectId, ref: 'Kit', required: true, index: true },
  flashcardId: { type: String, required: true, index: true },
  confidence: { type: Number, required: true, min: 0, max: 5 },
  reviewedAt: { type: Date, required: true, default: Date.now },
  nextReviewAt: { type: Date, required: true, index: true },
  interval: { type: Number, required: true, default: 0 },
  easeFactor: { type: Number, required: true, default: 2.5 },
  repetitions: { type: Number, required: true, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

PracticeRecordSchema.index({ userId: 1, kitId: 1, flashcardId: 1 }, { unique: true });
PracticeRecordSchema.index({ userId: 1, nextReviewAt: 1 });

export const PracticeRecord = mongoose.model<IPracticeRecord>('PracticeRecord', PracticeRecordSchema);

export interface IPipelineJob extends Document {
  kitId: Types.ObjectId;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep: string;
  logs: Array<{ step: string; message: string; timestamp: Date; level: 'info' | 'error' }>;
  resultKitId: Types.ObjectId | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const PipelineJobSchema = new Schema<IPipelineJob>({
  kitId: { type: Schema.Types.ObjectId, ref: 'Kit', required: true, index: true },
  status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
  currentStep: { type: String, default: '' },
  logs: [{
    step: String,
    message: String,
    timestamp: { type: Date, default: Date.now },
    level: { type: String, enum: ['info', 'error'], default: 'info' },
  }],
  resultKitId: { type: Schema.Types.ObjectId, ref: 'Kit', default: null },
  error: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const PipelineJob = mongoose.model<IPipelineJob>('PipelineJob', PipelineJobSchema);

export interface ISession extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

const SessionSchema = new Schema<ISession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  userAgent: { type: String, default: null },
  ip: { type: String, default: null },
  expiresAt: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null },
});

SessionSchema.index({ userId: 1, expiresAt: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model<ISession>('Session', SessionSchema);