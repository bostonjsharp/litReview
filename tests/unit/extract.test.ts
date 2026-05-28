import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractPdf } from '@/lib/ingest/extract';

describe('extractPdf', () => {
  it('extracts text and page offsets from a 2-page PDF', async () => {
    const bytes = new Uint8Array(readFileSync('tests/fixtures/sample.pdf'));
    const doc = await extractPdf(bytes);
    expect(doc.text.toLowerCase()).toContain('neural networks');
    expect(doc.text.toLowerCase()).toContain('transformers');
    expect(doc.pageOffsets.length).toBe(2);
    expect(doc.pageOffsets[0]).toBe(0);
    expect(doc.pageOffsets[1]).toBeGreaterThan(0);
  });
});
