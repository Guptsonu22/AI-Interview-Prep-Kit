import { z } from 'zod';
export declare const ContentStateSchema: z.ZodEnum<["generated", "edited", "pinned"]>;
export type ContentState = z.infer<typeof ContentStateSchema>;
export declare const CompanyProfileSchema: z.ZodObject<{
    name: z.ZodString;
    website: z.ZodString;
    industry: z.ZodString;
    size: z.ZodString;
    mission: z.ZodOptional<z.ZodString>;
    values: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    techStack: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    hiringPageUrl: z.ZodOptional<z.ZodString>;
    cultureSignals: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    recentNews: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    website: string;
    industry: string;
    size: string;
    values?: string[] | undefined;
    mission?: string | undefined;
    techStack?: string[] | undefined;
    hiringPageUrl?: string | undefined;
    cultureSignals?: string[] | undefined;
    recentNews?: string[] | undefined;
}, {
    name: string;
    website: string;
    industry: string;
    size: string;
    values?: string[] | undefined;
    mission?: string | undefined;
    techStack?: string[] | undefined;
    hiringPageUrl?: string | undefined;
    cultureSignals?: string[] | undefined;
    recentNews?: string[] | undefined;
}>;
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;
export declare const JobRequirementSchema: z.ZodObject<{
    id: z.ZodString;
    category: z.ZodEnum<["technical", "behavioral", "domain", "soft-skill", "experience"]>;
    description: z.ZodString;
    priority: z.ZodEnum<["critical", "high", "medium", "low"]>;
    source: z.ZodEnum<["job-description", "company-research", "interview-reports"]>;
    evidence: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    category: "technical" | "behavioral" | "domain" | "soft-skill" | "experience";
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    source: "job-description" | "company-research" | "interview-reports";
    evidence?: string | undefined;
}, {
    id: string;
    category: "technical" | "behavioral" | "domain" | "soft-skill" | "experience";
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    source: "job-description" | "company-research" | "interview-reports";
    evidence?: string | undefined;
}>;
export type JobRequirement = z.infer<typeof JobRequirementSchema>;
export declare const InterviewFormatSchema: z.ZodObject<{
    type: z.ZodEnum<["phone-screen", "technical-phone", "onsite", "virtual-onsite", "take-home", "system-design", "behavioral", "values-fit"]>;
    durationMinutes: z.ZodNumber;
    description: z.ZodString;
    typicalQuestions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    evaluationCriteria: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "behavioral" | "phone-screen" | "technical-phone" | "onsite" | "virtual-onsite" | "take-home" | "system-design" | "values-fit";
    description: string;
    durationMinutes: number;
    typicalQuestions?: string[] | undefined;
    evaluationCriteria?: string[] | undefined;
}, {
    type: "behavioral" | "phone-screen" | "technical-phone" | "onsite" | "virtual-onsite" | "take-home" | "system-design" | "values-fit";
    description: string;
    durationMinutes: number;
    typicalQuestions?: string[] | undefined;
    evaluationCriteria?: string[] | undefined;
}>;
export type InterviewFormat = z.infer<typeof InterviewFormatSchema>;
export declare const InterviewExperienceSchema: z.ZodObject<{
    source: z.ZodString;
    role: z.ZodString;
    date: z.ZodOptional<z.ZodString>;
    format: z.ZodArray<z.ZodString, "many">;
    questions: z.ZodArray<z.ZodString, "many">;
    difficulty: z.ZodOptional<z.ZodEnum<["easy", "medium", "hard"]>>;
    outcome: z.ZodOptional<z.ZodEnum<["offer", "rejected", "withdrawn", "pending"]>>;
    tips: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    source: string;
    role: string;
    format: string[];
    questions: string[];
    date?: string | undefined;
    difficulty?: "medium" | "easy" | "hard" | undefined;
    outcome?: "offer" | "rejected" | "withdrawn" | "pending" | undefined;
    tips?: string[] | undefined;
}, {
    source: string;
    role: string;
    format: string[];
    questions: string[];
    date?: string | undefined;
    difficulty?: "medium" | "easy" | "hard" | undefined;
    outcome?: "offer" | "rejected" | "withdrawn" | "pending" | undefined;
    tips?: string[] | undefined;
}>;
export type InterviewExperience = z.infer<typeof InterviewExperienceSchema>;
export declare const StudyTopicSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    category: z.ZodEnum<["technical", "behavioral", "system-design", "domain", "company-specific"]>;
    estimatedHours: z.ZodNumber;
    priority: z.ZodEnum<["critical", "high", "medium", "low"]>;
    resources: z.ZodOptional<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        url: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["article", "video", "course", "documentation", "practice"]>;
    }, "strip", z.ZodTypeAny, {
        type: "article" | "video" | "course" | "documentation" | "practice";
        title: string;
        url?: string | undefined;
    }, {
        type: "article" | "video" | "course" | "documentation" | "practice";
        title: string;
        url?: string | undefined;
    }>, "many">>;
    requirementsCovered: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    title: string;
    estimatedHours: number;
    resources?: {
        type: "article" | "video" | "course" | "documentation" | "practice";
        title: string;
        url?: string | undefined;
    }[] | undefined;
    requirementsCovered?: string[] | undefined;
}, {
    id: string;
    category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    title: string;
    estimatedHours: number;
    resources?: {
        type: "article" | "video" | "course" | "documentation" | "practice";
        title: string;
        url?: string | undefined;
    }[] | undefined;
    requirementsCovered?: string[] | undefined;
}>;
export type StudyTopic = z.infer<typeof StudyTopicSchema>;
export declare const DailyScheduleItemSchema: z.ZodObject<{
    day: z.ZodNumber;
    date: z.ZodString;
    topics: z.ZodArray<z.ZodString, "many">;
    hoursAllocated: z.ZodNumber;
    focus: z.ZodString;
    deliverable: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    date: string;
    day: number;
    topics: string[];
    hoursAllocated: number;
    focus: string;
    deliverable?: string | undefined;
}, {
    date: string;
    day: number;
    topics: string[];
    hoursAllocated: number;
    focus: string;
    deliverable?: string | undefined;
}>;
export type DailyScheduleItem = z.infer<typeof DailyScheduleItemSchema>;
export declare const FlashcardSchema: z.ZodObject<{
    id: z.ZodString;
    question: z.ZodString;
    answer: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    category: z.ZodEnum<["technical", "behavioral", "system-design", "domain", "company-specific"]>;
    difficulty: z.ZodEnum<["easy", "medium", "hard"]>;
    sourceRequirementId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
    difficulty: "medium" | "easy" | "hard";
    question: string;
    answer: string;
    tags: string[];
    sourceRequirementId?: string | undefined;
}, {
    id: string;
    category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
    difficulty: "medium" | "easy" | "hard";
    question: string;
    answer: string;
    tags: string[];
    sourceRequirementId?: string | undefined;
}>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export declare const KitMetadataSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    pipelineVersion: z.ZodString;
    jobDescriptionHash: z.ZodString;
    companyUrl: z.ZodString;
    prepDaysRequested: z.ZodNumber;
    totalEstimatedHours: z.ZodNumber;
    requirementsCount: z.ZodNumber;
    coverageScore: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    generatedAt: string;
    pipelineVersion: string;
    jobDescriptionHash: string;
    companyUrl: string;
    prepDaysRequested: number;
    totalEstimatedHours: number;
    requirementsCount: number;
    coverageScore: number;
}, {
    generatedAt: string;
    pipelineVersion: string;
    jobDescriptionHash: string;
    companyUrl: string;
    prepDaysRequested: number;
    totalEstimatedHours: number;
    requirementsCount: number;
    coverageScore: number;
}>;
export type KitMetadata = z.infer<typeof KitMetadataSchema>;
export declare const KitSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    jobDescription: z.ZodString;
    companyUrl: z.ZodString;
    prepDays: z.ZodNumber;
    companyProfile: z.ZodObject<{
        name: z.ZodString;
        website: z.ZodString;
        industry: z.ZodString;
        size: z.ZodString;
        mission: z.ZodOptional<z.ZodString>;
        values: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        techStack: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        hiringPageUrl: z.ZodOptional<z.ZodString>;
        cultureSignals: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        recentNews: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        website: string;
        industry: string;
        size: string;
        values?: string[] | undefined;
        mission?: string | undefined;
        techStack?: string[] | undefined;
        hiringPageUrl?: string | undefined;
        cultureSignals?: string[] | undefined;
        recentNews?: string[] | undefined;
    }, {
        name: string;
        website: string;
        industry: string;
        size: string;
        values?: string[] | undefined;
        mission?: string | undefined;
        techStack?: string[] | undefined;
        hiringPageUrl?: string | undefined;
        cultureSignals?: string[] | undefined;
        recentNews?: string[] | undefined;
    }>;
    requirements: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        category: z.ZodEnum<["technical", "behavioral", "domain", "soft-skill", "experience"]>;
        description: z.ZodString;
        priority: z.ZodEnum<["critical", "high", "medium", "low"]>;
        source: z.ZodEnum<["job-description", "company-research", "interview-reports"]>;
        evidence: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        category: "technical" | "behavioral" | "domain" | "soft-skill" | "experience";
        description: string;
        priority: "critical" | "high" | "medium" | "low";
        source: "job-description" | "company-research" | "interview-reports";
        evidence?: string | undefined;
    }, {
        id: string;
        category: "technical" | "behavioral" | "domain" | "soft-skill" | "experience";
        description: string;
        priority: "critical" | "high" | "medium" | "low";
        source: "job-description" | "company-research" | "interview-reports";
        evidence?: string | undefined;
    }>, "many">;
    interviewFormats: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["phone-screen", "technical-phone", "onsite", "virtual-onsite", "take-home", "system-design", "behavioral", "values-fit"]>;
        durationMinutes: z.ZodNumber;
        description: z.ZodString;
        typicalQuestions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        evaluationCriteria: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "behavioral" | "phone-screen" | "technical-phone" | "onsite" | "virtual-onsite" | "take-home" | "system-design" | "values-fit";
        description: string;
        durationMinutes: number;
        typicalQuestions?: string[] | undefined;
        evaluationCriteria?: string[] | undefined;
    }, {
        type: "behavioral" | "phone-screen" | "technical-phone" | "onsite" | "virtual-onsite" | "take-home" | "system-design" | "values-fit";
        description: string;
        durationMinutes: number;
        typicalQuestions?: string[] | undefined;
        evaluationCriteria?: string[] | undefined;
    }>, "many">;
    interviewExperiences: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        role: z.ZodString;
        date: z.ZodOptional<z.ZodString>;
        format: z.ZodArray<z.ZodString, "many">;
        questions: z.ZodArray<z.ZodString, "many">;
        difficulty: z.ZodOptional<z.ZodEnum<["easy", "medium", "hard"]>>;
        outcome: z.ZodOptional<z.ZodEnum<["offer", "rejected", "withdrawn", "pending"]>>;
        tips: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        source: string;
        role: string;
        format: string[];
        questions: string[];
        date?: string | undefined;
        difficulty?: "medium" | "easy" | "hard" | undefined;
        outcome?: "offer" | "rejected" | "withdrawn" | "pending" | undefined;
        tips?: string[] | undefined;
    }, {
        source: string;
        role: string;
        format: string[];
        questions: string[];
        date?: string | undefined;
        difficulty?: "medium" | "easy" | "hard" | undefined;
        outcome?: "offer" | "rejected" | "withdrawn" | "pending" | undefined;
        tips?: string[] | undefined;
    }>, "many">;
    studyTopics: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        category: z.ZodEnum<["technical", "behavioral", "system-design", "domain", "company-specific"]>;
        estimatedHours: z.ZodNumber;
        priority: z.ZodEnum<["critical", "high", "medium", "low"]>;
        resources: z.ZodOptional<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            url: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<["article", "video", "course", "documentation", "practice"]>;
        }, "strip", z.ZodTypeAny, {
            type: "article" | "video" | "course" | "documentation" | "practice";
            title: string;
            url?: string | undefined;
        }, {
            type: "article" | "video" | "course" | "documentation" | "practice";
            title: string;
            url?: string | undefined;
        }>, "many">>;
        requirementsCovered: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
        description: string;
        priority: "critical" | "high" | "medium" | "low";
        title: string;
        estimatedHours: number;
        resources?: {
            type: "article" | "video" | "course" | "documentation" | "practice";
            title: string;
            url?: string | undefined;
        }[] | undefined;
        requirementsCovered?: string[] | undefined;
    }, {
        id: string;
        category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
        description: string;
        priority: "critical" | "high" | "medium" | "low";
        title: string;
        estimatedHours: number;
        resources?: {
            type: "article" | "video" | "course" | "documentation" | "practice";
            title: string;
            url?: string | undefined;
        }[] | undefined;
        requirementsCovered?: string[] | undefined;
    }>, "many">;
    dailySchedule: z.ZodArray<z.ZodObject<{
        day: z.ZodNumber;
        date: z.ZodString;
        topics: z.ZodArray<z.ZodString, "many">;
        hoursAllocated: z.ZodNumber;
        focus: z.ZodString;
        deliverable: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        date: string;
        day: number;
        topics: string[];
        hoursAllocated: number;
        focus: string;
        deliverable?: string | undefined;
    }, {
        date: string;
        day: number;
        topics: string[];
        hoursAllocated: number;
        focus: string;
        deliverable?: string | undefined;
    }>, "many">;
    flashcards: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        question: z.ZodString;
        answer: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
        category: z.ZodEnum<["technical", "behavioral", "system-design", "domain", "company-specific"]>;
        difficulty: z.ZodEnum<["easy", "medium", "hard"]>;
        sourceRequirementId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
        difficulty: "medium" | "easy" | "hard";
        question: string;
        answer: string;
        tags: string[];
        sourceRequirementId?: string | undefined;
    }, {
        id: string;
        category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
        difficulty: "medium" | "easy" | "hard";
        question: string;
        answer: string;
        tags: string[];
        sourceRequirementId?: string | undefined;
    }>, "many">;
    metadata: z.ZodObject<{
        generatedAt: z.ZodString;
        pipelineVersion: z.ZodString;
        jobDescriptionHash: z.ZodString;
        companyUrl: z.ZodString;
        prepDaysRequested: z.ZodNumber;
        totalEstimatedHours: z.ZodNumber;
        requirementsCount: z.ZodNumber;
        coverageScore: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        generatedAt: string;
        pipelineVersion: string;
        jobDescriptionHash: string;
        companyUrl: string;
        prepDaysRequested: number;
        totalEstimatedHours: number;
        requirementsCount: number;
        coverageScore: number;
    }, {
        generatedAt: string;
        pipelineVersion: string;
        jobDescriptionHash: string;
        companyUrl: string;
        prepDaysRequested: number;
        totalEstimatedHours: number;
        requirementsCount: number;
        coverageScore: number;
    }>;
    contentStates: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodEnum<["generated", "edited", "pinned"]>>>;
    status: z.ZodEnum<["draft", "generating", "ready", "archived"]>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "draft" | "generating" | "ready" | "archived";
    companyUrl: string;
    userId: string;
    jobDescription: string;
    prepDays: number;
    companyProfile: {
        name: string;
        website: string;
        industry: string;
        size: string;
        values?: string[] | undefined;
        mission?: string | undefined;
        techStack?: string[] | undefined;
        hiringPageUrl?: string | undefined;
        cultureSignals?: string[] | undefined;
        recentNews?: string[] | undefined;
    };
    requirements: {
        id: string;
        category: "technical" | "behavioral" | "domain" | "soft-skill" | "experience";
        description: string;
        priority: "critical" | "high" | "medium" | "low";
        source: "job-description" | "company-research" | "interview-reports";
        evidence?: string | undefined;
    }[];
    interviewFormats: {
        type: "behavioral" | "phone-screen" | "technical-phone" | "onsite" | "virtual-onsite" | "take-home" | "system-design" | "values-fit";
        description: string;
        durationMinutes: number;
        typicalQuestions?: string[] | undefined;
        evaluationCriteria?: string[] | undefined;
    }[];
    interviewExperiences: {
        source: string;
        role: string;
        format: string[];
        questions: string[];
        date?: string | undefined;
        difficulty?: "medium" | "easy" | "hard" | undefined;
        outcome?: "offer" | "rejected" | "withdrawn" | "pending" | undefined;
        tips?: string[] | undefined;
    }[];
    studyTopics: {
        id: string;
        category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
        description: string;
        priority: "critical" | "high" | "medium" | "low";
        title: string;
        estimatedHours: number;
        resources?: {
            type: "article" | "video" | "course" | "documentation" | "practice";
            title: string;
            url?: string | undefined;
        }[] | undefined;
        requirementsCovered?: string[] | undefined;
    }[];
    dailySchedule: {
        date: string;
        day: number;
        topics: string[];
        hoursAllocated: number;
        focus: string;
        deliverable?: string | undefined;
    }[];
    flashcards: {
        id: string;
        category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
        difficulty: "medium" | "easy" | "hard";
        question: string;
        answer: string;
        tags: string[];
        sourceRequirementId?: string | undefined;
    }[];
    metadata: {
        generatedAt: string;
        pipelineVersion: string;
        jobDescriptionHash: string;
        companyUrl: string;
        prepDaysRequested: number;
        totalEstimatedHours: number;
        requirementsCount: number;
        coverageScore: number;
    };
    createdAt: string;
    updatedAt: string;
    contentStates?: Record<string, "generated" | "edited" | "pinned"> | undefined;
}, {
    id: string;
    status: "draft" | "generating" | "ready" | "archived";
    companyUrl: string;
    userId: string;
    jobDescription: string;
    prepDays: number;
    companyProfile: {
        name: string;
        website: string;
        industry: string;
        size: string;
        values?: string[] | undefined;
        mission?: string | undefined;
        techStack?: string[] | undefined;
        hiringPageUrl?: string | undefined;
        cultureSignals?: string[] | undefined;
        recentNews?: string[] | undefined;
    };
    requirements: {
        id: string;
        category: "technical" | "behavioral" | "domain" | "soft-skill" | "experience";
        description: string;
        priority: "critical" | "high" | "medium" | "low";
        source: "job-description" | "company-research" | "interview-reports";
        evidence?: string | undefined;
    }[];
    interviewFormats: {
        type: "behavioral" | "phone-screen" | "technical-phone" | "onsite" | "virtual-onsite" | "take-home" | "system-design" | "values-fit";
        description: string;
        durationMinutes: number;
        typicalQuestions?: string[] | undefined;
        evaluationCriteria?: string[] | undefined;
    }[];
    interviewExperiences: {
        source: string;
        role: string;
        format: string[];
        questions: string[];
        date?: string | undefined;
        difficulty?: "medium" | "easy" | "hard" | undefined;
        outcome?: "offer" | "rejected" | "withdrawn" | "pending" | undefined;
        tips?: string[] | undefined;
    }[];
    studyTopics: {
        id: string;
        category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
        description: string;
        priority: "critical" | "high" | "medium" | "low";
        title: string;
        estimatedHours: number;
        resources?: {
            type: "article" | "video" | "course" | "documentation" | "practice";
            title: string;
            url?: string | undefined;
        }[] | undefined;
        requirementsCovered?: string[] | undefined;
    }[];
    dailySchedule: {
        date: string;
        day: number;
        topics: string[];
        hoursAllocated: number;
        focus: string;
        deliverable?: string | undefined;
    }[];
    flashcards: {
        id: string;
        category: "technical" | "behavioral" | "domain" | "system-design" | "company-specific";
        difficulty: "medium" | "easy" | "hard";
        question: string;
        answer: string;
        tags: string[];
        sourceRequirementId?: string | undefined;
    }[];
    metadata: {
        generatedAt: string;
        pipelineVersion: string;
        jobDescriptionHash: string;
        companyUrl: string;
        prepDaysRequested: number;
        totalEstimatedHours: number;
        requirementsCount: number;
        coverageScore: number;
    };
    createdAt: string;
    updatedAt: string;
    contentStates?: Record<string, "generated" | "edited" | "pinned"> | undefined;
}>;
export type Kit = z.infer<typeof KitSchema>;
export declare const PipelineInputSchema: z.ZodObject<{
    jobDescription: z.ZodString;
    companyUrl: z.ZodString;
    prepDays: z.ZodNumber;
    userId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyUrl: string;
    userId: string;
    jobDescription: string;
    prepDays: number;
}, {
    companyUrl: string;
    userId: string;
    jobDescription: string;
    prepDays: number;
}>;
export type PipelineInput = z.infer<typeof PipelineInputSchema>;
export declare const PipelineStepResultSchema: z.ZodObject<{
    step: z.ZodString;
    success: z.ZodBoolean;
    data: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodString>;
    durationMs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    step: string;
    success: boolean;
    durationMs: number;
    error?: string | undefined;
    data?: unknown;
}, {
    step: string;
    success: boolean;
    durationMs: number;
    error?: string | undefined;
    data?: unknown;
}>;
export type PipelineStepResult = z.infer<typeof PipelineStepResultSchema>;
export declare const ContentStateMapSchema: z.ZodRecord<z.ZodString, z.ZodEnum<["generated", "edited", "pinned"]>>;
export type ContentStateMap = z.infer<typeof ContentStateMapSchema>;
export declare function validateKit(kit: unknown): {
    success: true;
    data: Kit;
} | {
    success: false;
    errors: z.ZodError;
};
export declare function checkCoverage(kit: Kit): {
    covered: string[];
    missing: string[];
};
export declare function createEmptyContentStates(kit: Kit): ContentStateMap;
export declare function applyContentEdit(kit: Kit, fieldPath: string, newValue: unknown): {
    kit: Kit;
    contentStates: ContentStateMap;
};
export declare function pinContent(kit: Kit, fieldPath: string): {
    kit: Kit;
    contentStates: ContentStateMap;
};
//# sourceMappingURL=kit.d.ts.map