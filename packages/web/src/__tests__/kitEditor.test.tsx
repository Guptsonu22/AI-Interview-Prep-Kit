import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuestionCard, QuestionCardItem } from '../components/kit-editor/QuestionCard';
import { QuestionCategoryBoard } from '../components/kit-editor/QuestionCategoryBoard';
import { FlashcardEditor, FlashcardItem } from '../components/kit-editor/FlashcardEditor';
import { CompanyBriefEditor } from '../components/kit-editor/CompanyBriefEditor';
import { RegenerationModal } from '../components/kit-editor/RegenerationModal';

describe('Kit Editor UI Subsystem', () => {
  const sampleQuestion: QuestionCardItem = {
    id: 'q-01',
    prompt: 'Explain the difference between TCP and UDP.',
    category: 'technical',
    difficulty: 2,
    answer_outline: 'TCP is connection-oriented with guaranteed delivery; UDP is connectionless and low-latency.',
    requirement_ids: ['req-01'],
    pinned: false,
    edited: false,
  };

  describe('QuestionCard Component', () => {
    it('renders prompt, category, difficulty, and provenance status', () => {
      render(
        <QuestionCard
          question={sampleQuestion}
          index={0}
          totalInList={1}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByText('Explain the difference between TCP and UDP.')).toBeInTheDocument();
      expect(screen.getByText('technical')).toBeInTheDocument();
      expect(screen.getByText('Diff: Mid')).toBeInTheDocument();
      expect(screen.getByText('AI Generated')).toBeInTheDocument();
    });

    it('allows inline editing of the prompt and calls onUpdate', async () => {
      const onUpdate = vi.fn();
      render(
        <QuestionCard
          question={sampleQuestion}
          index={0}
          totalInList={1}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );

      // Click on prompt text to start inline editing
      fireEvent.click(screen.getByText('Explain the difference between TCP and UDP.'));

      const textarea = screen.getByDisplayValue('Explain the difference between TCP and UDP.');
      expect(textarea).toBeInTheDocument();

      fireEvent.change(textarea, { target: { value: 'Explain TCP handshake and teardown.' } });
      fireEvent.click(screen.getByText('Save'));

      expect(onUpdate).toHaveBeenCalledWith('q-01', {
        prompt: 'Explain TCP handshake and teardown.',
        edited: true,
      });
    });

    it('allows editing answer outline inline', async () => {
      const onUpdate = vi.fn();
      render(
        <QuestionCard
          question={sampleQuestion}
          index={0}
          totalInList={1}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );

      // Click edit answer outline button
      const editOutlineBtn = screen.getByTitle('Edit answer outline');
      fireEvent.click(editOutlineBtn);

      const outlineTextarea = screen.getByPlaceholderText(/Key concepts, trade-offs/i);
      fireEvent.change(outlineTextarea, {
        target: { value: 'Mention SYN, SYN-ACK, ACK and 4-way FIN handshake.' },
      });

      fireEvent.click(screen.getByTitle('Save outline'));

      expect(onUpdate).toHaveBeenCalledWith('q-01', {
        answer_outline: 'Mention SYN, SYN-ACK, ACK and 4-way FIN handshake.',
        edited: true,
      });
    });

    it('toggles pin state correctly', () => {
      const onUpdate = vi.fn();
      render(
        <QuestionCard
          question={sampleQuestion}
          index={0}
          totalInList={1}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );

      const pinButton = screen.getByTitle('Pin question (protects from regeneration)');
      fireEvent.click(pinButton);

      expect(onUpdate).toHaveBeenCalledWith('q-01', { pinned: true });
    });
  });

  describe('QuestionCategoryBoard Reordering & Category Move', () => {
    const questions: QuestionCardItem[] = [
      { id: 'q-01', prompt: 'Prompt 1', category: 'technical', difficulty: 2 },
      { id: 'q-02', prompt: 'Prompt 2', category: 'technical', difficulty: 3 },
    ];

    it('supports moving questions down and up using accessible controls', () => {
      const onReorder = vi.fn();
      render(
        <QuestionCategoryBoard
          questions={questions}
          onUpdateQuestion={vi.fn()}
          onAddQuestion={vi.fn()}
          onDeleteQuestion={vi.fn()}
          onReorderQuestions={onReorder}
          onRegenerateCategory={vi.fn()}
        />
      );

      // Click move down button on first item
      const moveDownBtns = screen.getAllByTitle('Move question down');
      fireEvent.click(moveDownBtns[0]);

      expect(onReorder).toHaveBeenCalledWith(['q-02', 'q-01']);
    });

    it('opens delete confirmation modal and confirms deletion', async () => {
      const onDelete = vi.fn();
      render(
        <QuestionCategoryBoard
          questions={questions}
          onUpdateQuestion={vi.fn()}
          onAddQuestion={vi.fn()}
          onDeleteQuestion={onDelete}
          onReorderQuestions={vi.fn()}
          onRegenerateCategory={vi.fn()}
        />
      );

      const deleteBtns = screen.getAllByTitle('Delete question');
      fireEvent.click(deleteBtns[0]);

      expect(screen.getByText('Delete Question')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Confirm Delete'));
      expect(onDelete).toHaveBeenCalledWith('q-01');
    });

    it('opens add question modal and submits new manual question', async () => {
      const onAdd = vi.fn();
      render(
        <QuestionCategoryBoard
          questions={questions}
          onUpdateQuestion={vi.fn()}
          onAddQuestion={onAdd}
          onDeleteQuestion={vi.fn()}
          onReorderQuestions={vi.fn()}
          onRegenerateCategory={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText('Add Question'));

      expect(screen.getByText('Add Question to Bank')).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText(/garbage collection/i), {
        target: { value: 'How does indexing work in Postgres?' },
      });

      fireEvent.click(screen.getByText('Add to Question Bank'));

      expect(onAdd).toHaveBeenCalledWith({
        prompt: 'How does indexing work in Postgres?',
        category: 'technical',
        difficulty: 2,
        answer_outline: '',
        requirement_ids: [],
      });
    });
  });

  describe('FlashcardEditor Component', () => {
    const flashcards: FlashcardItem[] = [
      { id: 'fc-01', front: 'What is B-Tree?', back: 'Self-balancing tree data structure.', requirement_ids: ['req-01'] },
    ];

    it('renders flashcard front, back, and requirement tags', () => {
      render(
        <FlashcardEditor
          flashcards={flashcards}
          onAddCard={vi.fn()}
          onUpdateCard={vi.fn()}
          onDeleteCard={vi.fn()}
        />
      );

      expect(screen.getByText('What is B-Tree?')).toBeInTheDocument();
      expect(screen.getByText('Self-balancing tree data structure.')).toBeInTheDocument();
      expect(screen.getByText('req-01')).toBeInTheDocument();
    });

    it('adds a new flashcard with front and back', () => {
      const onAdd = vi.fn();
      render(
        <FlashcardEditor
          flashcards={flashcards}
          onAddCard={onAdd}
          onUpdateCard={vi.fn()}
          onDeleteCard={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText('Add Flashcard'));

      fireEvent.change(screen.getByPlaceholderText(/CAP theorem/i), {
        target: { value: 'What is ACID in databases?' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Optimistic checks version/i), {
        target: { value: 'Atomicity, Consistency, Isolation, Durability.' },
      });

      fireEvent.click(screen.getByText('Save Card'));

      expect(onAdd).toHaveBeenCalledWith({
        front: 'What is ACID in databases?',
        back: 'Atomicity, Consistency, Isolation, Durability.',
        requirement_ids: [],
      });
    });
  });

  describe('CompanyBriefEditor and Regeneration State', () => {
    const brief = {
      name: 'Acme Technologies',
      summary: 'Building developer tools.',
      what_they_do: 'Cloud computing platforms.',
      sources: ['https://acme.com'],
      pinned: false,
      edited: false,
    };

    it('renders company brief and supports editing summary', async () => {
      const onSave = vi.fn();
      render(
        <CompanyBriefEditor
          brief={brief}
          companyUrl="https://acme.com"
          onSaveBrief={onSave}
          onRegenerateBrief={vi.fn()}
        />
      );

      expect(screen.getByText('Building developer tools.')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Edit Brief'));

      const textarea = screen.getByDisplayValue('Building developer tools.');
      fireEvent.change(textarea, { target: { value: 'Leading cloud observability company.' } });

      fireEvent.click(screen.getByText('Save Changes'));

      expect(onSave).toHaveBeenCalledWith({
        summary: 'Leading cloud observability company.',
        what_they_do: 'Cloud computing platforms.',
        edited: true,
      });
    });

    it('displays error banner cleanly on failed saves or conflicts', () => {
      render(
        <CompanyBriefEditor
          brief={brief}
          companyUrl="https://acme.com"
          onSaveBrief={vi.fn()}
          onRegenerateBrief={vi.fn()}
          error="Conflict: Stale kit version. Provided 1, current is 2"
        />
      );

      expect(screen.getByText(/Conflict: Stale kit version/i)).toBeInTheDocument();
    });
  });

  describe('RegenerationModal Concurrency and Progress Feedback', () => {
    it('displays server version check and preservation guarantees', () => {
      render(
        <RegenerationModal
          isOpen={true}
          onClose={vi.fn()}
          target={{ type: 'company-brief', title: 'Company Intelligence Brief' }}
          onConfirm={vi.fn()}
          isPending={false}
          currentVersion={3}
        />
      );

      expect(screen.getByText(/Regenerate Company Intelligence Brief/i)).toBeInTheDocument();
      expect(screen.getByText(/v3/i)).toBeInTheDocument();
      expect(screen.getByText(/State Preservation Rules Active/i)).toBeInTheDocument();
    });

    it('shows loading state when regeneration is in-flight', () => {
      render(
        <RegenerationModal
          isOpen={true}
          onClose={vi.fn()}
          target={{ type: 'company-brief', title: 'Company Intelligence Brief' }}
          onConfirm={vi.fn()}
          isPending={true}
        />
      );

      expect(screen.getByText('Synthesizing...')).toBeInTheDocument();
    });

    it('reports conflict error when version mismatch occurs', () => {
      render(
        <RegenerationModal
          isOpen={true}
          onClose={vi.fn()}
          target={{ type: 'company-brief', title: 'Company Intelligence Brief' }}
          onConfirm={vi.fn()}
          isPending={false}
          error="Conflict: Stale kit version"
        />
      );

      expect(screen.getByText('Regeneration Failed')).toBeInTheDocument();
      expect(screen.getByText(/Version Conflict: The kit was modified elsewhere/i)).toBeInTheDocument();
    });
  });
});
