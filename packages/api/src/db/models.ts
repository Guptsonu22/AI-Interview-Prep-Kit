import mongoose, { Document, Schema } from 'mongoose';
import { Kit, ContentStateMap } from '@interview-prep/shared';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model<IUser>('User', UserSchema);

export interface IKit extends Document {
  userId: mongoose.Types.ObjectId;
  jobDescription: string;
  companyUrl: string;
  prepDays: number;
  kitData: Kit;
  contentStates: ContentStateMap;
  status: 'draft' | 'generating' | 'ready' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

const KitSchema = new Schema<IKit>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jobDescription: { type: String, required: true },
  companyUrl: { type: String, required: true },
  prepDays: { type: Number, required: true, min: 1, max: 90 },
  kitData: { type: Schema.Types.Mixed, required: true },
  contentStates: { type: Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['draft', 'generating', 'ready', 'archived'], default: 'draft' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

KitSchema.index({ userId: 1, createdAt: -1 });

export const KitModel = mongoose.model<IKit>('Kit', KitSchema);

export interface IFlashcard extends Document {
  kitId: mongoose.Types.ObjectId;
  question: string;
  answer: string;
  tags: string[];
  category: 'technical' | 'behavioral' | 'system-design' | 'domain' | 'company-specific';
  difficulty: 'easy' | 'medium' | 'hard';
  sourceRequirementId: string | null;
  confidence: number;
  nextReview: Date;
  interval: number;
  easeFactor: number;
  createdAt: Date;
  updatedAt: Date;
}

const FlashcardSchema = new Schema<IFlashcard>({
  kitId: { type: Schema.Types.ObjectId, ref: 'Kit', required: true, index: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  tags: [{ type: String }],
  category: { type: String, enum: ['technical', 'behavioral', 'system-design', 'domain', 'company-specific'], required: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
  sourceRequirementId: { type: String, default: null },
  confidence: { type: Number, default: 0, min: 0, max: 5 },
  nextReview: { type: Date, required: true, index: true },
  interval: { type: Number, default: 1 },
  easeFactor: { type: Number, default: 2.5 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Flashcard = mongoose.model<IFlashcard>('Flashcard', FlashcardSchema);

export interface IPipelineJob extends Document {
  kitId: mongoose.Types.ObjectId;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep: string;
  logs: Array<{ step: string; message: string; timestamp: Date; level: 'info' | 'error' }>;
  resultKitId: mongoose.Types.ObjectId | null;
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