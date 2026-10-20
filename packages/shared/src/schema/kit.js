"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentStateMapSchema = exports.PipelineStepResultSchema = exports.PipelineInputSchema = exports.KitSchema = exports.KitMetadataSchema = exports.FlashcardSchema = exports.DailyScheduleItemSchema = exports.StudyTopicSchema = exports.InterviewExperienceSchema = exports.InterviewFormatSchema = exports.JobRequirementSchema = exports.CompanyProfileSchema = exports.ContentStateSchema = void 0;
exports.validateKit = validateKit;
exports.checkCoverage = checkCoverage;
exports.createEmptyContentStates = createEmptyContentStates;
exports.applyContentEdit = applyContentEdit;
exports.pinContent = pinContent;
const zod_1 = require("zod");
exports.ContentStateSchema = zod_1.z.enum(['generated', 'edited', 'pinned']);
exports.CompanyProfileSchema = zod_1.z.object({
    name: zod_1.z.string(),
    website: zod_1.z.string().url(),
    industry: zod_1.z.string(),
    size: zod_1.z.string(),
    mission: zod_1.z.string().optional(),
    values: zod_1.z.array(zod_1.z.string()).optional(),
    techStack: zod_1.z.array(zod_1.z.string()).optional(),
    hiringPageUrl: zod_1.z.string().url().optional(),
    cultureSignals: zod_1.z.array(zod_1.z.string()).optional(),
    recentNews: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.JobRequirementSchema = zod_1.z.object({
    id: zod_1.z.string(),
    category: zod_1.z.enum(['technical', 'behavioral', 'domain', 'soft-skill', 'experience']),
    description: zod_1.z.string(),
    priority: zod_1.z.enum(['critical', 'high', 'medium', 'low']),
    source: zod_1.z.enum(['job-description', 'company-research', 'interview-reports']),
    evidence: zod_1.z.string().optional(),
});
exports.InterviewFormatSchema = zod_1.z.object({
    type: zod_1.z.enum(['phone-screen', 'technical-phone', 'onsite', 'virtual-onsite', 'take-home', 'system-design', 'behavioral', 'values-fit']),
    durationMinutes: zod_1.z.number().int().positive(),
    description: zod_1.z.string(),
    typicalQuestions: zod_1.z.array(zod_1.z.string()).optional(),
    evaluationCriteria: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.InterviewExperienceSchema = zod_1.z.object({
    source: zod_1.z.string(),
    role: zod_1.z.string(),
    date: zod_1.z.string().optional(),
    format: zod_1.z.array(zod_1.z.string()),
    questions: zod_1.z.array(zod_1.z.string()),
    difficulty: zod_1.z.enum(['easy', 'medium', 'hard']).optional(),
    outcome: zod_1.z.enum(['offer', 'rejected', 'withdrawn', 'pending']).optional(),
    tips: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.StudyTopicSchema = zod_1.z.object({
    id: zod_1.z.string(),
    title: zod_1.z.string(),
    description: zod_1.z.string(),
    category: zod_1.z.enum(['technical', 'behavioral', 'system-design', 'domain', 'company-specific']),
    estimatedHours: zod_1.z.number().positive(),
    priority: zod_1.z.enum(['critical', 'high', 'medium', 'low']),
    resources: zod_1.z.array(zod_1.z.object({
        title: zod_1.z.string(),
        url: zod_1.z.string().url().optional(),
        type: zod_1.z.enum(['article', 'video', 'course', 'documentation', 'practice']),
    })).optional(),
    requirementsCovered: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.DailyScheduleItemSchema = zod_1.z.object({
    day: zod_1.z.number().int().positive(),
    date: zod_1.z.string(),
    topics: zod_1.z.array(zod_1.z.string()),
    hoursAllocated: zod_1.z.number().positive(),
    focus: zod_1.z.string(),
    deliverable: zod_1.z.string().optional(),
});
exports.FlashcardSchema = zod_1.z.object({
    id: zod_1.z.string(),
    question: zod_1.z.string(),
    answer: zod_1.z.string(),
    tags: zod_1.z.array(zod_1.z.string()),
    category: zod_1.z.enum(['technical', 'behavioral', 'system-design', 'domain', 'company-specific']),
    difficulty: zod_1.z.enum(['easy', 'medium', 'hard']),
    sourceRequirementId: zod_1.z.string().optional(),
});
exports.KitMetadataSchema = zod_1.z.object({
    generatedAt: zod_1.z.string().datetime(),
    pipelineVersion: zod_1.z.string(),
    jobDescriptionHash: zod_1.z.string(),
    companyUrl: zod_1.z.string().url(),
    prepDaysRequested: zod_1.z.number().int().positive(),
    totalEstimatedHours: zod_1.z.number().positive(),
    requirementsCount: zod_1.z.number().int().nonnegative(),
    coverageScore: zod_1.z.number().min(0).max(1),
});
exports.KitSchema = zod_1.z.object({
    id: zod_1.z.string(),
    userId: zod_1.z.string(),
    jobDescription: zod_1.z.string(),
    companyUrl: zod_1.z.string().url(),
    prepDays: zod_1.z.number().int().positive(),
    companyProfile: exports.CompanyProfileSchema,
    requirements: zod_1.z.array(exports.JobRequirementSchema),
    interviewFormats: zod_1.z.array(exports.InterviewFormatSchema),
    interviewExperiences: zod_1.z.array(exports.InterviewExperienceSchema),
    studyTopics: zod_1.z.array(exports.StudyTopicSchema),
    dailySchedule: zod_1.z.array(exports.DailyScheduleItemSchema),
    flashcards: zod_1.z.array(exports.FlashcardSchema),
    metadata: exports.KitMetadataSchema,
    contentStates: zod_1.z.record(exports.ContentStateSchema).optional(),
    status: zod_1.z.enum(['draft', 'generating', 'ready', 'archived']),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
exports.PipelineInputSchema = zod_1.z.object({
    jobDescription: zod_1.z.string().min(100),
    companyUrl: zod_1.z.string().url(),
    prepDays: zod_1.z.number().int().positive().max(90),
    userId: zod_1.z.string(),
});
exports.PipelineStepResultSchema = zod_1.z.object({
    step: zod_1.z.string(),
    success: zod_1.z.boolean(),
    data: zod_1.z.unknown().optional(),
    error: zod_1.z.string().optional(),
    durationMs: zod_1.z.number().int().nonnegative(),
});
exports.ContentStateMapSchema = zod_1.z.record(exports.ContentStateSchema);
function validateKit(kit) {
    const result = exports.KitSchema.safeParse(kit);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, errors: result.error };
}
function checkCoverage(kit) {
    const requiredFields = [
        'companyProfile',
        'requirements',
        'interviewFormats',
        'interviewExperiences',
        'studyTopics',
        'dailySchedule',
        'flashcards',
        'metadata',
    ];
    const covered = [];
    const missing = [];
    for (const field of requiredFields) {
        const value = kit[field];
        if (Array.isArray(value) && value.length === 0) {
            missing.push(field);
        }
        else if (value === undefined || value === null || (typeof value === 'object' && Object.keys(value).length === 0)) {
            missing.push(field);
        }
        else {
            covered.push(field);
        }
    }
    return { covered, missing };
}
function createEmptyContentStates(kit) {
    const states = {};
    const fields = [
        'companyProfile',
        'requirements',
        'interviewFormats',
        'interviewExperiences',
        'studyTopics',
        'dailySchedule',
        'flashcards',
    ];
    for (const field of fields) {
        states[field] = 'generated';
    }
    return states;
}
function applyContentEdit(kit, fieldPath, newValue) {
    const updatedKit = JSON.parse(JSON.stringify(kit));
    const contentStates = { ...(kit.contentStates || createEmptyContentStates(kit)) };
    const keys = fieldPath.split('.');
    let current = updatedKit;
    for (let i = 0; i < keys.length - 1; i++) {
        if (current && keys[i] in current) {
            const next = current[keys[i]];
            if (next && typeof next === 'object' && !Array.isArray(next)) {
                current = next;
            }
            else {
                current = undefined;
                break;
            }
        }
        else {
            current = undefined;
            break;
        }
    }
    if (current) {
        current[keys[keys.length - 1]] = newValue;
    }
    contentStates[fieldPath] = 'edited';
    updatedKit.contentStates = contentStates;
    updatedKit.updatedAt = new Date().toISOString();
    return { kit: updatedKit, contentStates };
}
function pinContent(kit, fieldPath) {
    const contentStates = { ...(kit.contentStates || createEmptyContentStates(kit)) };
    if (fieldPath in contentStates) {
        contentStates[fieldPath] = 'pinned';
    }
    const updatedKit = { ...kit, contentStates, updatedAt: new Date().toISOString() };
    return { kit: updatedKit, contentStates };
}
