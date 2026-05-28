import { extractText, getDocumentProxy } from 'unpdf';
import type { ExtractedDoc } from '../llm/types-shared';

export async function extractPdf(bytes: Uint8Array): Promise<ExtractedDoc> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages: string[] = Array.isArray(text) ? text : [text];
  const pageOffsets: number[] = [];
  let combined = '';
  for (const page of pages) {
    pageOffsets.push(combined.length);
    combined += (page ?? '') + '\n';
  }
  if (combined.trim().length === 0) {
    throw new Error('No extractable text (PDF may be scanned or encrypted)');
  }
  return { text: combined, pageOffsets };
}
