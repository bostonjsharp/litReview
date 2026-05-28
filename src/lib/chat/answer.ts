import { retrieve, type RetrieveScope } from '../search/retrieve';
import type { LLMProvider, ChatResult } from '../llm/types';

export interface AnswerOpts {
  scope?: RetrieveScope;
  k?: number;
  schema: any;
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
  return llm.chat([{ role: 'user', content: query }], context);
}
