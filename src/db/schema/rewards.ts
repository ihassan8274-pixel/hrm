import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { employees } from './organization';

// ============================================
// REWARDS & RECOGNITION
// ============================================

export const peerKudos = sqliteTable('peer_kudos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  senderId: integer('sender_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  senderName: text('sender_name').notNull(),
  recipientId: integer('recipient_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  recipientName: text('recipient_name').notNull(),
  recipientJob: text('recipient_job'),
  coreValue: text('core_value').default('teamwork'), // 'teamwork', 'innovation', 'customer_delight', 'safety_first', 'leadership', 'excellence'
  message: text('message').notNull(),
  pointsAwarded: integer('points_awarded').default(50),
  likesCount: integer('likes_count').default(0),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  senderIdIdx: index('peer_kudos_sender_id_idx').on(table.senderId),
  recipientIdIdx: index('peer_kudos_recipient_id_idx').on(table.recipientId),
  createdAtIdx: index('peer_kudos_created_at_idx').on(table.createdAt),
}));

export const rewardCatalog = sqliteTable('reward_catalog', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').default('gift_card'), // 'gift_card', 'extra_leave', 'fuel_card', 'wellness', 'tech'
  pointsRequired: integer('points_required').default(500),
  stockQuantity: integer('stock_quantity').default(50),
  iconName: text('icon_name').default('Gift'),
  imageUrl: text('image_url'),
}, (table) => ({
  categoryIdx: index('reward_catalog_category_idx').on(table.category),
}));

export const rewardRedemptions = sqliteTable('reward_redemptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  employeeName: text('employee_name').notNull(),
  rewardId: integer('reward_id').notNull().references(() => rewardCatalog.id, { onDelete: 'cascade' }),
  rewardTitle: text('reward_title').notNull(),
  pointsSpent: integer('points_spent').notNull(),
  redemptionCode: text('redemption_code').unique().notNull(),
  status: text('status').default('approved'), // 'approved', 'delivered', 'pending'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('reward_redemptions_employee_id_idx').on(table.employeeId),
  rewardIdIdx: index('reward_redemptions_reward_id_idx').on(table.rewardId),
  redemptionCodeIdx: uniqueIndex('reward_redemptions_code_idx').on(table.redemptionCode),
  statusIdx: index('reward_redemptions_status_idx').on(table.status),
}));

export const pulseSurveyResults = sqliteTable('pulse_survey_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(),
  scorePercentage: real('score_percentage').default(85),
  respondentsCount: integer('respondents_count').default(45),
  sentiment: text('sentiment').default('positive'), // 'positive', 'neutral', 'negative'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  categoryIdx: index('pulse_survey_category_idx').on(table.category),
}));

// ============================================
// RELATIONS
// ============================================

export const peerKudosRelations = relations(peerKudos, ({ one }) => ({
  sender: one(employees, { fields: [peerKudos.senderId], references: [employees.id], relationName: 'sender' }),
  recipient: one(employees, { fields: [peerKudos.recipientId], references: [employees.id], relationName: 'recipient' }),
}));

export const rewardCatalogRelations = relations(rewardCatalog, ({ many }) => ({
  redemptions: many(rewardRedemptions),
}));

export const rewardRedemptionsRelations = relations(rewardRedemptions, ({ one }) => ({
  employee: one(employees, { fields: [rewardRedemptions.employeeId], references: [employees.id] }),
  reward: one(rewardCatalog, { fields: [rewardRedemptions.rewardId], references: [rewardCatalog.id] }),
}));