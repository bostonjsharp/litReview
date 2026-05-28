import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '@/lib/llm/openai';

describe('OpenAIProvider.complete', () => {
  it('returns the raw message content from a chat completion', async () => {
    const client = {
      embeddings: { create: vi.fn() },
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"themes":[]}' } }] }) } },
    } as any;
    const p = new OpenAIProvider(client);
    const out = await p.complete('do the thing');
    expect(out).toBe('{"themes":[]}');
    expect(client.chat.completions.create).toHaveBeenCalled();
  });
});
