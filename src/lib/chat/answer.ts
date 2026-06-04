import { retrieve, type RetrieveScope } from '../search/retrieve';
import type { LLMProvider, ChatResult, ChatMessage } from '../llm/types';
import { rewriteSearchQuery } from './rewrite';

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
  const history = opts.history ?? [];
  // Retrieve on a rewritten, history-aware query; answer the user's original wording.
  const searchQuery = await rewriteSearchQuery(query, history, llm);
  const context = await retrieve(searchQuery, llm, db, { scope: opts.scope, k: opts.k, schema: opts.schema });
  if (context.length === 0) {
    return { answer: 'I could not find this in the corpus.', citations: [] };
  }
  return llm.chat([...history, { role: 'user', content: query }], context);
}
