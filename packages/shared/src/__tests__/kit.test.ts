import { describe, it, expect } from 'vitest';
import {
  KitSchema,
  SourceSchema,
  CompanyBriefSchema,
  RoleSchema,
  RequirementSchema,
  QuestionSchema,
  FlashcardSchema,
  DaySchema,
  ScheduleSchema,
  CoverageSchema,
  validateKit,
  validateKitReferences,
  validateBatchInput,
  PipelineInputSchema,
  BatchCaseSchema,
  BatchOutputSchema,
  type Requirement,
  type Question,
  type Kit,
} from '@interview-prep/shared/schema/kit';

describe('SourceSchema', () => {
  it('accepts valid source', () => {
    const valid = {
      company: 'Acme Corp',
      company_url: 'https://acme.com',
      role: 'Software Engineer',
      location: 'San Francisco, CA',
      jd_chars: 1500,
      researched_at: new Date().toISOString(),
      pages_used: ['https://acme.com/careers'],
    };
    const result = SourceSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects missing company', () => {
    const invalid = {
      company: '',
      company_url: 'https://acme.com',
      role: 'Software Engineer',
      location: 'San Francisco, CA',
      jd_chars: 1500,
      researched_at: new Date().toISOString(),
    };
    const result = SourceSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL', () => {
    const invalid = {
      company: 'Acme Corp',
      company_url: 'not-a-url',
      role: 'Software Engineer',
      location: 'San Francisco, CA',
      jd_chars: 1500,
      researched_at: new Date().toISOString(),
    };
    const result = SourceSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('defaults pages_used to empty array', () => {
    const input = {
      company: 'Acme Corp',
      company_url: 'https://acme.com',
      role: 'Software Engineer',
      location: 'San Francisco, CA',
      jd_chars: 1500,
      researched_at: new Date().toISOString(),
    };
    const result = SourceSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pages_used).toEqual([]);
    }
  });
});

describe('CompanyBriefSchema', () => {
  it('accepts valid company brief', () => {
    const valid = {
      summary: 'Acme Corp builds widgets.',
      what_they_do: 'Widget manufacturing and distribution.',
      sources: ['https://acme.com/about'],
    };
    const result = CompanyBriefSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('defaults empty strings and arrays', () => {
    const result = CompanyBriefSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe('');
      expect(result.data.what_they_do).toBe('');
      expect(result.data.sources).toEqual([]);
    }
  });
});

describe('RoleSchema', () => {
  it('accepts valid role', () => {
    const valid = {
      title: 'Senior Software Engineer',
      seniority: 'Senior',
      responsibilities: ['Design systems', 'Mentor juniors'],
      requirements: ['5+ years experience', 'TypeScript'],
    };
    const result = RoleSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('requires title', () => {
    const invalid = { seniority: 'Senior' };
    const result = RoleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('defaults optional fields', () => {
    const result = RoleSchema.safeParse({ title: 'Engineer' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seniority).toBe('');
      expect(result.data.responsibilities).toEqual([]);
      expect(result.data.requirements).toEqual([]);
    }
  });
});

describe('RequirementSchema', () => {
  it('accepts valid requirement', () => {
    const valid: Requirement = {
      id: 'req-1',
      text: 'Proficiency in TypeScript',
      kind: 'technical',
      priority: 'must',
    };
    const result = RequirementSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid kind', () => {
    const invalid = {
      id: 'req-1',
      text: 'Test',
      kind: 'invalid',
      priority: 'must',
    };
    const result = RequirementSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid priority', () => {
    const invalid = {
      id: 'req-1',
      text: 'Test',
      kind: 'technical',
      priority: 'high',
    };
    const result = RequirementSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('requires id and text', () => {
    const invalid = { kind: 'technical', priority: 'must' };
    const result = RequirementSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('QuestionSchema', () => {
  it('accepts valid question', () => {
    const valid: Question = {
      id: 'q-1',
      requirement_ids: ['req-1', 'req-2'],
      category: 'technical',
      prompt: 'Explain TypeScript generics',
      answer_outline: 'Use examples',
      difficulty: 2,
    };
    const result = QuestionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects difficulty out of range', () => {
    const invalid = {
      id: 'q-1',
      requirement_ids: ['req-1'],
      category: 'technical',
      prompt: 'Test',
      answer_outline: '',
      difficulty: 5,
    };
    const result = QuestionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects difficulty below 1', () => {
    const invalid = {
      id: 'q-1',
      requirement_ids: ['req-1'],
      category: 'technical',
      prompt: 'Test',
      answer_outline: '',
      difficulty: 0,
    };
    const result = QuestionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects non-integer difficulty', () => {
    const invalid = {
      id: 'q-1',
      requirement_ids: ['req-1'],
      category: 'technical',
      prompt: 'Test',
      answer_outline: '',
      difficulty: 2.5,
    };
    const result = QuestionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('defaults requirement_ids and answer_outline', () => {
    const result = QuestionSchema.safeParse({
      id: 'q-1',
      category: 'technical',
      prompt: 'Test',
      difficulty: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requirement_ids).toEqual([]);
      expect(result.data.answer_outline).toBe('');
    }
  });

  it('rejects invalid category', () => {
    const invalid = {
      id: 'q-1',
      requirement_ids: ['req-1'],
      category: 'invalid',
      prompt: 'Test',
      difficulty: 1,
    };
    const result = QuestionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('FlashcardSchema', () => {
  it('accepts valid flashcard', () => {
    const valid = {
      id: 'fc-1',
      front: 'What is TypeScript?',
      back: 'A typed superset of JavaScript',
      requirement_ids: ['req-1'],
    };
    const result = FlashcardSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('requires front and back', () => {
    const invalid = { id: 'fc-1', requirement_ids: ['req-1'] };
    const result = FlashcardSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('defaults requirement_ids', () => {
    const result = FlashcardSchema.safeParse({
      id: 'fc-1',
      front: 'Q',
      back: 'A',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requirement_ids).toEqual([]);
    }
  });
});

describe('DaySchema', () => {
  it('accepts valid day', () => {
    const valid = {
      day: 1,
      focus: 'Technical prep',
      question_ids: ['q-1', 'q-2'],
      minutes: 180,
    };
    const result = DaySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects non-positive day', () => {
    const invalid = { day: 0, focus: 'Test', minutes: 60 };
    const result = DaySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects non-positive minutes', () => {
    const invalid = { day: 1, focus: 'Test', minutes: 0 };
    const result = DaySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects non-integer minutes', () => {
    const invalid = { day: 1, focus: 'Test', minutes: 90.5 };
    const result = DaySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('defaults question_ids', () => {
    const result = DaySchema.safeParse({ day: 1, focus: 'Test', minutes: 60 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.question_ids).toEqual([]);
    }
  });
});

describe('ScheduleSchema', () => {
  it('accepts valid schedule', () => {
    const valid = {
      days_available: 14,
      days: [
        { day: 1, focus: 'Day 1', question_ids: ['q-1'], minutes: 180 },
        { day: 2, focus: 'Day 2', question_ids: ['q-2'], minutes: 180 },
      ],
    };
    const result = ScheduleSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects non-positive days_available', () => {
    const invalid = { days_available: 0, days: [] };
    const result = ScheduleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('defaults days to empty array', () => {
    const result = ScheduleSchema.safeParse({ days_available: 14 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.days).toEqual([]);
    }
  });
});

describe('CoverageSchema', () => {
  it('accepts valid coverage', () => {
    const valid = {
      uncovered_requirement_ids: ['req-3'],
      passes: 2,
    };
    const result = CoverageSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects negative passes', () => {
    const invalid = { uncovered_requirement_ids: [], passes: -1 };
    const result = CoverageSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('defaults fields', () => {
    const result = CoverageSchema.safeParse({ passes: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.uncovered_requirement_ids).toEqual([]);
      expect(result.data.passes).toBe(0);
    }
  });
});

describe('KitSchema', () => {
  const validKit: Kit = {
    source: {
      company: 'Acme Corp',
      company_url: 'https://acme.com',
      role: 'Software Engineer',
      location: 'San Francisco, CA',
      jd_chars: 1500,
      researched_at: new Date().toISOString(),
      pages_used: ['https://acme.com/careers'],
    },
    company_brief: {
      summary: 'Acme builds widgets.',
      what_they_do: 'Widget manufacturing.',
      sources: ['https://acme.com/about'],
    },
    role: {
      title: 'Software Engineer',
      seniority: 'Mid',
      responsibilities: ['Write code'],
      requirements: ['3+ years exp'],
    },
    requirements: [
      { id: 'req-1', text: 'TypeScript', kind: 'technical', priority: 'must' },
      { id: 'req-2', text: 'Communication', kind: 'behavioural', priority: 'must' },
    ],
    questions: [
      { id: 'q-1', requirement_ids: ['req-1'], category: 'technical', prompt: 'TS generics', answer_outline: '', difficulty: 2 },
      { id: 'q-2', requirement_ids: ['req-2'], category: 'behavioural', prompt: 'Conflict resolution', answer_outline: '', difficulty: 1 },
    ],
    flashcards: [
      { id: 'fc-1', front: 'TS?', back: 'Typed JS', requirement_ids: ['req-1'] },
    ],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: 'Tech', question_ids: ['q-1'], minutes: 180 },
        { day: 2, focus: 'Behavioural', question_ids: ['q-2'], minutes: 180 },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  };

  it('accepts valid kit', () => {
    const result = KitSchema.safeParse(validKit);
    expect(result.success).toBe(true);
  });

  it('rejects kit with invalid requirement kind', () => {
    const invalid = { ...validKit, requirements: [{ id: 'r1', text: 't', kind: 'bad', priority: 'must' }] };
    const result = KitSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects kit with invalid question difficulty', () => {
    const invalid = { ...validKit, questions: [{ id: 'q1', requirement_ids: [], category: 'technical', prompt: 'p', answer_outline: '', difficulty: 5 }] };
    const result = KitSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects kit with non-integer schedule minutes', () => {
    const invalid = { ...validKit, schedule: { days_available: 1, days: [{ day: 1, focus: 'f', minutes: 90.5 }] } };
    const result = KitSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('validateKit', () => {
  const validKit: Kit = {
    source: {
      company: 'Acme Corp',
      company_url: 'https://acme.com',
      role: 'Software Engineer',
      location: 'San Francisco, CA',
      jd_chars: 1500,
      researched_at: new Date().toISOString(),
      pages_used: [],
    },
    company_brief: { summary: '', what_they_do: '', sources: [] },
    role: { title: 'SE', seniority: '', responsibilities: [], requirements: [] },
    requirements: [{ id: 'req-1', text: 'TypeScript', kind: 'technical', priority: 'must' }],
    questions: [{ id: 'q-1', requirement_ids: ['req-1'], category: 'technical', prompt: 'Test', answer_outline: '', difficulty: 2 }],
    flashcards: [{ id: 'fc-1', front: 'Q', back: 'A', requirement_ids: ['req-1'] }],
    schedule: { days_available: 1, days: [{ day: 1, focus: 'Test', question_ids: ['q-1'], minutes: 60 }] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };

  it('returns success for valid kit', () => {
    const result = validateKit(validKit);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeDefined();
  });

  it('returns errors for invalid kit', () => {
    const invalid = { ...validKit, source: undefined };
    const result = validateKit(invalid);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors).toBeInstanceOf(Error);
  });
});

describe('validateKitReferences', () => {
  const baseKit: Kit = {
    source: {
      company: 'Acme Corp',
      company_url: 'https://acme.com',
      role: 'Software Engineer',
      location: 'San Francisco, CA',
      jd_chars: 1500,
      researched_at: new Date().toISOString(),
      pages_used: [],
    },
    company_brief: { summary: '', what_they_do: '', sources: [] },
    role: { title: 'SE', seniority: '', responsibilities: [], requirements: [] },
    requirements: [
      { id: 'req-1', text: 'TypeScript', kind: 'technical', priority: 'must' },
      { id: 'req-2', text: 'React', kind: 'technical', priority: 'must' },
    ],
    questions: [
      { id: 'q-1', requirement_ids: ['req-1'], category: 'technical', prompt: 'Test', answer_outline: '', difficulty: 2 },
      { id: 'q-2', requirement_ids: ['req-2'], category: 'technical', prompt: 'Test', answer_outline: '', difficulty: 2 },
    ],
    flashcards: [
      { id: 'fc-1', front: 'Q', back: 'A', requirement_ids: ['req-1'] },
    ],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: 'Day 1', question_ids: ['q-1'], minutes: 180 },
        { day: 2, focus: 'Day 2', question_ids: ['q-2'], minutes: 180 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };

  it('passes for valid references', () => {
    const result = validateKitReferences(baseKit);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when question references non-existent requirement', () => {
    const kit: Kit = { ...baseKit, questions: [{ ...baseKit.questions[0], requirement_ids: ['req-999'] } as Question] };
    const result = validateKitReferences(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('req-999'))).toBe(true);
  });

  it('fails when day references non-existent question', () => {
    const kit: Kit = { ...baseKit, schedule: { ...baseKit.schedule, days: [{ ...baseKit.schedule.days[0], question_ids: ['q-999'] } as { day: number; focus: string; question_ids: string[]; minutes: number }] } };
    const result = validateKitReferences(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('q-999'))).toBe(true);
  });

  it('fails when flashcard references non-existent requirement', () => {
    const kit: Kit = { ...baseKit, flashcards: [{ ...baseKit.flashcards[0], requirement_ids: ['req-999'] } as { id: string; requirement_ids: string[]; front: string; back: string }] };
    const result = validateKitReferences(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('req-999'))).toBe(true);
  });

  it('fails when question is not scheduled', () => {
    const kit: Kit = { ...baseKit, schedule: { ...baseKit.schedule, days: [{ ...baseKit.schedule.days[0], question_ids: [] } as { day: number; focus: string; question_ids: string[]; minutes: number }] } };
    const result = validateKitReferences(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not scheduled'))).toBe(true);
  });

  it('fails when schedule days count mismatches days_available', () => {
    const kit: Kit = { ...baseKit, schedule: { ...baseKit.schedule, days_available: 5 } };
    const result = validateKitReferences(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('days_available'))).toBe(true);
  });

  it('fails when schedule days are not consecutive from 1', () => {
    const kit: Kit = { ...baseKit, schedule: { ...baseKit.schedule, days: [{ day: 1, focus: 'f', minutes: 60, question_ids: [] }, { day: 3, focus: 'f', minutes: 60, question_ids: [] }] } };
    const result = validateKitReferences(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('consecutive'))).toBe(true);
  });
});

describe('validateBatchInput', () => {
  it('accepts valid batch input', () => {
    const valid = [
      { case_id: 'case-1', jobDescription: 'A'.repeat(100), companyUrl: 'https://acme.com', daysAvailable: 14 },
    ];
    const result = validateBatchInput(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid jobDescription', () => {
    const invalid = [{ case_id: 'case-1', jobDescription: 'short', companyUrl: 'https://acme.com', daysAvailable: 14 }];
    const result = validateBatchInput(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid companyUrl', () => {
    const invalid = [{ case_id: 'case-1', jobDescription: 'A'.repeat(100), companyUrl: 'not-url', daysAvailable: 14 }];
    const result = validateBatchInput(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid daysAvailable', () => {
    const invalid = [{ case_id: 'case-1', jobDescription: 'A'.repeat(100), companyUrl: 'https://acme.com', daysAvailable: 0 }];
    const result = validateBatchInput(invalid);
    expect(result.success).toBe(false);
  });
});

describe('PipelineInputSchema', () => {
  it('accepts valid pipeline input', () => {
    const valid = { jobDescription: 'A'.repeat(100), companyUrl: 'https://acme.com', daysAvailable: 14, userId: 'user-1' };
    const result = PipelineInputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects short jobDescription', () => {
    const invalid = { jobDescription: 'short', companyUrl: 'https://acme.com', daysAvailable: 14, userId: 'user-1' };
    const result = PipelineInputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('BatchCaseSchema', () => {
  it('accepts valid batch case', () => {
    const valid = { case_id: 'case-1', jobDescription: 'A'.repeat(100), companyUrl: 'https://acme.com', daysAvailable: 14 };
    const result = BatchCaseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe('BatchOutputSchema', () => {
  it('accepts ok output with kit', () => {
    const valid = {
      case_id: 'case-1',
      status: 'ok',
      kit: {
        source: { company: 'Acme', company_url: 'https://acme.com', role: 'SE', location: 'SF', jd_chars: 100, researched_at: new Date().toISOString(), pages_used: [] },
        company_brief: { summary: '', what_they_do: '', sources: [] },
        role: { title: 'SE', seniority: '', responsibilities: [], requirements: [] },
        requirements: [],
        questions: [],
        flashcards: [],
        schedule: { days_available: 1, days: [{ day: 1, focus: 'Test', question_ids: [], minutes: 60 }] },
        coverage: { uncovered_requirement_ids: [], passes: 0 },
      },
    };
    const result = BatchOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts error output without kit', () => {
    const valid = { case_id: 'case-1', status: 'error', error: 'Failed' };
    const result = BatchOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const invalid = { case_id: 'case-1', status: 'pending' };
    const result = BatchOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});