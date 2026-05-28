import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '@/lib/llm/openai';

function fakeClient() {
  return {
    embeddings: { create: vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] }) },
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({ answer: 'Yes, per [1].', citationIndexes: [1] }) } }],
        }),
      },
    },
  } as any;
}

describe('OpenAIProvider', () => {
  it('embed returns one vector per input', async () => {
    const client = fakeClient();
    client.embeddings.create.mockResolvedValue({ data: [{ embedding: [1, 2] }, { embedding: [3, 4] }] });
    const p = new OpenAIProvider(client);
    const out = await p.embed(['a', 'b']);
    expect(out).toEqual([[1, 2], [3, 4]]);
  });

  it('chat maps cited indexes back to RetrievedChunk sources', async () => {
    const p = new OpenAIProvider(fakeClient());
    const ctx = [{ id: 'c1', text: 'hello', source: { parentType: 'paper' as const, parentId: 'p1', title: 'Smith 2020', page: 3 } }];
    const res = await p.chat([{ role: 'user', content: 'q?' }], ctx);
    expect(res.answer).toContain('Yes');
    expect(res.citations).toEqual([{ parentType: 'paper', parentId: 'p1', title: 'Smith 2020', page: 3 }]);
  });
});
