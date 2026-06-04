export type ParentType = 'paper' | 'review' | 'annotation';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChunkSource {
  parentType: ParentType;
  parentId: string;
  title: string;
  page: number | null;
  charStart: number;
  paperId: string | null;
}

export interface RetrievedChunk {
  id: string;
  text: string;
  source: ChunkSource;
}

export interface Citation {
  parentType: ParentType;
  parentId: string;
  title: string;
  page: number | null;
  charStart: number;
  paperId: string | null;
}

export interface ChatResult {
  answer: string;
  citations: Citation[];
}

export interface LLMProvider {
  embed(texts: string[]): Promise<number[][]>;
  chat(messages: ChatMessage[], context: RetrievedChunk[]): Promise<ChatResult>;
  complete(prompt: string): Promise<string>;
}
