export interface ExtractedDoc {
  text: string;
  pageOffsets: number[]; // pageOffsets[i] = char index where page (i+1) begins
}

export interface Chunk {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
  page: number | null;
}

export interface PaperMetadata {
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  journal?: string;
  abstract?: string;
}
