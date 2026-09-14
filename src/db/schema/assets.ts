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
// SMART ASSETS & QR HANDOVER
// ============================================

export const smartAssets = sqliteTable('smart_assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  assetCode: text('asset_code').unique().notNull(),
  name: text('name').notNull(),
  category: text('category').default('laptop'), // 'laptop', 'smartphone', 'tablet', 'fuel_card', 'access_key', 'vehicle', 'specialized_tool'
  brandModel: text('brand_model').notNull(),
  serialNumber: text('serial_number').notNull(),
  purchaseDate: text('purchase_date'),
  purchaseValue: real('purchase_value').default(0),
  currentAssignedTo: integer('current_assigned_to').references(() => employees.id, { onDelete: 'set null' }),
  assignedDate: text('assigned_date'),
  handoverQrCode: text('handover_qr_code'),
  condition: text('condition').default('good'), // 'new', 'good', 'fair', 'needs_maintenance'
  status: text('status').default('assigned'), // 'assigned', 'in_stock', 'maintenance', 'scrapped'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  assetCodeIdx: uniqueIndex('smart_assets_code_idx').on(table.assetCode),
  assignedToIdx: index('smart_assets_assigned_to_idx').on(table.currentAssignedTo),
  serialNumberIdx: index('smart_assets_serial_idx').on(table.serialNumber),
  statusIdx: index('smart_assets_status_idx').on(table.status),
}));

// ============================================
// RELATIONS
// ============================================

export const smartAssetsRelations = relations(smartAssets, ({ one }) => ({
  assignedEmployee: one(employees, { fields: [smartAssets.currentAssignedTo], references: [employees.id] }),
}));