import { retrieve, type RetrieveScope } from '../search/retrieve';
import type { LLMProvider, ChatResult, ChatMessage } from '../llm/types';

export interface AnswerOpts {
  scope?: RetrieveScope;
  k?: number;
  schema: any;
  history?: ChatMessage[]; // prior turns, oldest → newest; caller bounds the length
}

export async function answerQuestion(
  query: string,
  llm: LLMProvider,
  db: any,
  opts: AnswerOpts,
): Promise<ChatResult> {
  const context = await retrieve(query, llm, db, { scope: opts.scope, k: opts.k ?? 8, schema: opts.schema });
  if (context.length === 0) {
    return { answer: 'I could not find this in the corpus.', citations: [] };
  }
  return llm.chat([...(opts.history ?? []), { role: 'user', content: query }], context);
}
