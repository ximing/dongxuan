import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import type { PromptDocument } from '@dongxuan/dto';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  displayName: varchar('display_name', { length: 64 }),
  sessionVersion: integer('session_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const oidcIdentities = pgTable(
  'oidc_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuer: varchar('issuer', { length: 512 }).notNull(),
    sub: varchar('sub', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('oidc_identities_issuer_sub_uidx').on(table.issuer, table.sub),
    uniqueIndex('oidc_identities_user_issuer_uidx').on(table.userId, table.issuer),
  ],
);

export const charts = pgTable(
  'charts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 64 }).notNull(),
    relation: varchar('relation', { length: 32 }),
    remark: text('remark'),
    system: varchar('system', { length: 16 }).notNull().default('ziwei'),
    sourceChartId: uuid('source_chart_id'),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    revision: integer('revision').notNull().default(1),
    migrationStatus: varchar('migration_status', { length: 16 }).notNull().default('pending'),
    migrationError: text('migration_error'),
    calendar: varchar('calendar', { length: 8 }).$type<'solar' | 'lunar'>().notNull(),
    dateStr: varchar('date_str', { length: 16 }).notNull(),
    timeIndex: integer('time_index').notNull(),
    gender: varchar('gender', { length: 8 }).$type<'男' | '女'>().notNull(),
    isLeapMonth: boolean('is_leap_month').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('charts_user_created_idx').on(table.userId, table.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type ChartRow = typeof charts.$inferSelect;

// Versioned SQL migration is authoritative for composite ownership FKs, checks,
// the partial base-snapshot index and the legacy-writer barrier.
export const chartSnapshots = pgTable('chart_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  chartId: uuid('chart_id').notNull(), userId: uuid('user_id').notNull(),
  kind: varchar('kind', {length: 8}).notNull(), baseSnapshotId: uuid('base_snapshot_id'),
  input: jsonb('input').notNull(), rules: jsonb('rules').notNull(), engineMeta: jsonb('engine_meta').notNull(),
  schemaVersion: integer('schema_version').notNull().default(2), query: jsonb('query'),
  result: jsonb('result').notNull(), text: text('text').notNull(), summary: jsonb('summary').notNull(),
  provenance: text('provenance').notNull(), viewTitle: varchar('view_title', {length: 80}),
  createdAt: timestamp('created_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
});
export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull(),
  chartId: uuid('chart_id'), snapshotId: uuid('snapshot_id'), body: text('body').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: timestamp('created_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
});
export const promptTemplates = pgTable('prompt_templates', {
  id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull(),
  system: varchar('system', {length:16}).notNull(), title: varchar('title', {length:80}).notNull(), body: jsonb('body').$type<PromptDocument>().notNull(),
  inputsSchema: jsonb('inputs_schema').notNull().default([]), dataRequirements: jsonb('data_requirements').notNull().default([]),
  missingPolicy: text('missing_policy'), revision: integer('revision').notNull().default(1),
  variableSchemaVersion: integer('variable_schema_version').notNull().default(2), seedKey: varchar('seed_key', {length:64}),
  createdAt: timestamp('created_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
});
export const meihuaDrafts = pgTable('meihua_drafts', {
  id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull(), question: text('question').notNull(),
  numberA: bigint('number_a', {mode:'number'}).notNull(), numberB: bigint('number_b', {mode:'number'}).notNull(), chartId: uuid('chart_id'),
  status: varchar('status', {length:8}).notNull().default('raw'), revision: integer('revision').notNull().default(1),
  createdAt: timestamp('created_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
});
