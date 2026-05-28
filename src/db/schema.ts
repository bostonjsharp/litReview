import { pgTable, uuid, text, integer, timestamp, jsonb, vector, index, primaryKey } from 'drizzle-orm/pg-core';

export const statusValues = ['pending', 'processing', 'ready', 'failed'] as const;

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const collections = pgTable('collections', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  researchQuestion: text('research_question'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const papers = pgTable('papers', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').references(() => collections.id),
  title: text('title'),
  authors: text('authors').array(),
  year: integer('year'),
  doi: text('doi'),
  journal: text('journal'),
  abstract: text('abstract'),
  pdfUrl: text('pdf_url'),
  fullText: text('full_text'),
  metadata: jsonb('metadata'),
  status: text('status', { enum: statusValues }).notNull().default('pending'),
  errorReason: text('error_reason'),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').references(() => collections.id),
  title: text('title'),
  bodyText: text('body_text'),
  pdfUrl: text('pdf_url'),
  status: text('status', { enum: statusValues }).notNull().default('pending'),
  errorReason: text('error_reason'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const reviewPaperLinks = pgTable(
  'review_paper_links',
  {
    reviewId: uuid('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
    paperId: uuid('paper_id').notNull().references(() => papers.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.reviewId, t.paperId] }) }),
);

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentType: text('parent_type', { enum: ['paper', 'review'] }).notNull(),
    parentId: uuid('parent_id').notNull(),
    collectionId: uuid('collection_id'),
    chunkIndex: integer('chunk_index').notNull(),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    page: integer('page'),
    charStart: integer('char_start').notNull(),
    charEnd: integer('char_end').notNull(),
  },
  (t) => ({
    embIdx: index('chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  }),
);
