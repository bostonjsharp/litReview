import type OpenAI from 'openai';
import type { LLMProvider, ChatMessage, RetrievedChunk, ChatResult } from './types';

const EMBED_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'gpt-4o-mini';

export class OpenAIProvider implements LLMProvider {
  constructor(private client: OpenAI) {}

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.client.embeddings.create({ model: EMBED_MODEL, input: texts });
    return res.data.map((d: { embedding: number[] }) => d.embedding);
  }

  async chat(messages: ChatMessage[], context: RetrievedChunk[]): Promise<ChatResult> {
    const numbered = context
      .map((c, i) => `[${i + 1}] (${c.source.title}, p.${c.source.page ?? '?'})\n${c.text}`)
      .join('\n\n');
    const system: ChatMessage = {
      role: 'system',
      content:
        'You answer questions about a corpus of academic papers and literature reviews, using ' +
        'ONLY the numbered context passages. Synthesize and reason across the passages — connect ' +
        'related points, compare findings, and infer what they collectively support — to give a ' +
        'thorough, genuinely helpful answer. Do not use outside knowledge. Cite the passages you ' +
        'rely on by their bracket number. Only if the passages genuinely do not address the ' +
        'question, answer exactly "I could not find this in the corpus." ' +
        'Respond as strict JSON: {"answer": string, "citationIndexes": number[]}. ' +
        'citationIndexes lists the 1-based context passages you actually used.',
    };
    const userWithContext: ChatMessage = {
      role: 'user',
      content: `Context passages:\n\n${numbered}\n\nQuestion: ${messages[messages.length - 1].content}`,
    };
    const res = await this.client.chat.completions.create({
      model: CHAT_MODEL,
      response_format: { type: 'json_object' },
      messages: [system, ...messages.slice(0, -1), userWithContext],
    });
    const raw = res.choices[0].message.content ?? '{"answer":"","citationIndexes":[]}';
    let parsed: { answer: string; citationIndexes: number[] };
    try {
      parsed = JSON.parse(raw) as { answer: string; citationIndexes: number[] };
    } catch {
      return { answer: 'I could not find this in the corpus.', citations: [] };
    }
    const citations = (parsed.citationIndexes ?? [])
      .map((n) => context[n - 1])
      .filter(Boolean)
      .map((c) => ({
        parentType: c.source.parentType,
        parentId: c.source.parentId,
        title: c.source.title,
        page: c.source.page,
        charStart: c.source.charStart,
        paperId: c.source.paperId,
      }));
    return { answer: parsed.answer, citations };
  }

  async complete(prompt: string): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: CHAT_MODEL,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    return res.choices[0].message.content ?? '';
  }
}
