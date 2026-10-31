import { describe, expect, it } from 'vitest';
import { moveAnswer, notationQuestions } from './learningQuiz';
describe('notation assessments', () => {
  it('checks all six faces and all three turn kinds without duplicate answers', () => {
    const questions = notationQuestions();
    expect(new Set(questions.map(q => q.move[0])).size).toBe(6);
    expect(questions.some(q => q.move.endsWith("'"))).toBe(true);
    expect(questions.some(q => q.move.endsWith('2'))).toBe(true);
    for (const q of questions) {
      expect(q.options).toContain(q.answer);
      expect(q.answer).toBe(moveAnswer(q.move));
      expect(new Set(q.options).size).toBe(4);
    }
  });
  it('teaches M direction by L rather than R', () => {
    expect(moveAnswer('M')).toBe('middle slice (L direction) · clockwise (90°)');
    expect(moveAnswer("M'")).toContain('counterclockwise');
    expect(notationQuestions(true).map(q => q.move).sort()).toEqual(['M',"M'",'M2','U',"U'",'U2'].sort());
  });
});
