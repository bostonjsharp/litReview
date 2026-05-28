import OpenAI from 'openai';
import { OpenAIProvider } from './openai';
import type { LLMProvider } from './types';

let cached: LLMProvider | undefined;

export function getLLM(): LLMProvider {
  if (!cached) cached = new OpenAIProvider(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
  return cached;
}

export type { LLMProvider } from './types';
