import { describe, it, expect, vi } from 'vitest';
import { rewriteSearchQuery } from '@/lib/chat/rewrite';
import type { ChatMessage } from '@/lib/llm/types';

function llmReturning(out: string) {
  return { complete: vi.fn(async () => out), embed: vi.fn(), chat: vi.fn() } as any;
}

describe('rewriteSearchQuery', () => {
  it('returns the rewritten query from the LLM', async () => {
    const llm = llmReturning(JSON.stringify({ query: 'limitations of Transformer models' }));
    const history: ChatMessage[] = [{ role: 'user', content: 'Tell me about Transformers' }];
    const out = await rewriteSearchQuery('what about its limitations?', history, llm);
    expect(out).toBe('limitations of Transformer models');
  });

  it('passes the conversation history into the prompt', async () => {
    const llm = llmReturning(JSON.stringify({ query: 'x' }));
    await rewriteSearchQuery('follow up', [{ role: 'assistant', content: 'BERT is a model' }], llm);
    const prompt = (llm.complete as any).mock.calls[0][0] as string;
    expect(prompt).toContain('BERT is a model');
    expect(prompt).toContain('follow up');
  });

  it('falls back to the original question when complete throws', async () => {
    const llm = { complete: vi.fn(async () => { throw new Error('down'); }), embed: vi.fn(), chat: vi.fn() } as any;
    expect(await rewriteSearchQuery('raw q', [], llm)).toBe('raw q');
  });

  it('falls back when output is not valid JSON or the query is empty', async () => {
    expect(await rewriteSearchQuery('raw a', [], llmReturning('not json'))).toBe('raw a');
    expect(await rewriteSearchQuery('raw b', [], llmReturning(JSON.stringify({ query: '   ' })))).toBe('raw b');
  });
});
