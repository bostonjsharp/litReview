import { describe, it, expect } from 'vitest';
import { buildSuggestionPrompt, parseSuggestion } from '@/lib/themes/suggest';

describe('buildSuggestionPrompt', () => {
  it('includes each annotation id and its text, and asks for strict JSON', () => {
    const prompt = buildSuggestionPrompt([{ annotationId: 'a1', quote: 'q', comment: 'c' }]);
    expect(prompt).toContain('a1');
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('assignments');
  });
});

describe('parseSuggestion', () => {
  it('parses valid suggestion JSON', () => {
    const raw = JSON.stringify({ themes: ['Method', 'Result'], assignments: [{ annotationId: 'a1', themes: ['Method'] }] });
    expect(parseSuggestion(raw)).toEqual({ themes: ['Method', 'Result'], assignments: [{ annotationId: 'a1', themes: ['Method'] }] });
  });
  it('drops assignment themes not in the proposed set', () => {
    const raw = JSON.stringify({ themes: ['Method'], assignments: [{ annotationId: 'a1', themes: ['Method', 'Bogus'] }] });
    expect(parseSuggestion(raw).assignments[0].themes).toEqual(['Method']);
  });
  it('throws on malformed JSON', () => {
    expect(() => parseSuggestion('not json')).toThrow();
  });
  it('throws when the shape is wrong', () => {
    expect(() => parseSuggestion(JSON.stringify({ foo: 1 }))).toThrow();
  });
});
