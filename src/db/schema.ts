import { pgTable, uuid, text, integer, timestamp, jsonb, vector, index, primaryKey } from 'drizzle-orm/pg-core';

export const statusValues = ['pending', 'processing', 'ready', 'failed', 'metadata_only', 'published'] as const;

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
  workspaceId: uuid('workspace_id'),
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
  pageOffsets: jsonb('page_offsets'),
  workspaceId: uuid('workspace_id'),
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
  workspaceId: uuid('workspace_id'),
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
    parentType: text('parent_type', { enum: ['paper', 'review', 'annotation'] }).notNull(),
    parentId: uuid('parent_id').notNull(),
    collectionId: uuid('collection_id'),
    workspaceId: uuid('workspace_id'),
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

export const annotations = pgTable('annotations', {
  id: uuid('id').defaultRandom().primaryKey(),
  paperId: uuid('paper_id').notNull().references(() => papers.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => users.id),
  charStart: integer('char_start').notNull(),
  charEnd: integer('char_end').notNull(),
  page: integer('page'),
  quote: text('quote').notNull().default(''),
  comment: text('comment').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const reviewEntries = pgTable('review_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  reviewId: uuid('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  kind: text('kind', { enum: ['prose', 'annotation'] }).notNull(),
  prose: text('prose'),
  annotationId: uuid('annotation_id').references(() => annotations.id, { onDelete: 'cascade' }),
});

export const themes = pgTable('themes', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const annotationThemes = pgTable(
  'annotation_themes',
  {
    annotationId: uuid('annotation_id').notNull().references(() => annotations.id, { onDelete: 'cascade' }),
    themeId: uuid('theme_id').notNull().references(() => themes.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.annotationId, t.themeId] }) }),
);

export const paperCollections = pgTable(
  'paper_collections',
  {
    paperId: uuid('paper_id').notNull().references(() => papers.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.paperId, t.collectionId] }) }),
);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id').references(() => users.id),
  inviteCode: text('invite_code').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.workspaceId, t.userId] }) }),
);

export const chats = pgTable('chats', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  scopeKind: text('scope_kind', { enum: ['workspace', 'collection', 'paper'] }).notNull().default('workspace'),
  scopeId: uuid('scope_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  citations: jsonb('citations'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
