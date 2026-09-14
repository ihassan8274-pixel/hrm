import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ============================================
// CORE TABLES
// ============================================

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id'),
  details: text('details'),
  createdBy: text('created_by').default('User'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').default('info'),
  isRead: integer('is_read').default(0),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  isReadIdx: index('notifications_is_read_idx').on(table.isRead),
  createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),
}));

export const entities = sqliteTable('entities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en'),
  countryCode: text('country_code').notNull(),
  currency: text('currency').notNull(),
  taxRate: real('tax_rate').default(0),
  insuranceEmpRate: real('insurance_emp_rate').default(0),
  insuranceCompRate: real('insurance_comp_rate').default(0),
  settingsJson: text('settings_json'),
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(),
  entityId: integer('entity_id').references(() => entities.id),
  status: text('status').default('active'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').unique().notNull(),
  expiresAt: text('expires_at').notNull(),
  ipAddress: text('ip_address'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  tokenIdx: uniqueIndex('sessions_token_idx').on(table.token),
  userIdIdx: index('sessions_user_id_idx').on(table.userId),
  expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
}));

export const permissions = sqliteTable('permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  role: text('role').notNull(),
  routePattern: text('route_pattern').notNull(),
  method: text('method').notNull(),
  allowed: integer('allowed').default(1),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  roleRouteIdx: index('permissions_role_route_idx').on(table.role, table.routePattern),
}));

// ============================================
// RELATIONS
// ============================================

export const entitiesRelations = relations(entities, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  entity: one(entities, { fields: [users.entityId], references: [entities.id] }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));