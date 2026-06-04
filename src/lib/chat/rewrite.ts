import type { ChatMessage, LLMProvider } from '../llm/types';

// Rewrites the user's latest question into a single standalone, lightly-expanded search
// query — resolving references using the conversation so chat follow-ups retrieve well.
// Never throws: any failure (no/failed `complete`, bad JSON, empty query) falls back to
// the original question so retrieval is never blocked or degraded.
export async function rewriteSearchQuery(
  question: string,
  history: ChatMessage[],
  llm: LLMProvider,
): Promise<string> {
  try {
    const convo = history.map((m) => `${m.role}: ${m.content}`).join('\n');
    const prompt =
      "You rewrite a user's latest question into ONE standalone search query for retrieving " +
      'passages from a corpus of academic papers. Resolve references (pronouns like "it"/"that") ' +
      'using the conversation, and lightly expand with closely-related terms or synonyms. ' +
      'Do NOT answer the question. ' +
      (convo ? `Conversation so far:\n${convo}\n\n` : '') +
      `Latest question: ${question}\n\n` +
      'Respond as strict JSON: {"query": string}.';
    const raw = await llm.complete(prompt);
    const parsed = JSON.parse(raw) as { query?: string };
    const q = (parsed.query ?? '').trim();
    return q.length > 0 ? q : question;
  } catch {
    return question;
  }
}
