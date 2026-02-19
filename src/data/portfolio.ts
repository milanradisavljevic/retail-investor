import Database from 'better-sqlite3';
import { getDatabase } from './db';
import type {
  PortfolioPosition,
  PortfolioPositionInput,
  AssetType,
  Currency,
  QuantityUnit,
  SUPPORTED_CURRENCIES,
  VALID_ASSET_TYPES,
  VALID_QUANTITY_UNITS,
} from '@/types/portfolio';
import { inferAssetType, SUPPORTED_CURRENCIES as currencies, VALID_ASSET_TYPES as assetTypes, VALID_QUANTITY_UNITS as quantityUnits } from '@/types/portfolio';

function validateSymbol(symbol: string): void {
  if (!symbol || symbol.trim() === '') {
    throw new Error('symbol is required and cannot be empty');
  }
}

function validateQuantity(quantity: number): void {
  if (typeof quantity !== 'number' || quantity <= 0) {
    throw new Error('quantity must be a positive number');
  }
}

function validateBuyPrice(buyPrice: number): void {
  if (typeof buyPrice !== 'number' || buyPrice < 0) {
    throw new Error('buy_price must be a non-negative number');
  }
}

function validateBuyDate(buyDate: string): void {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateRegex.test(buyDate)) {
    throw new Error('buy_date must be in ISO format (YYYY-MM-DD)');
  }
  const date = new Date(buyDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error('buy_date must be a valid date');
  }
}

function validateCurrency(currency: Currency): void {
  if (!currencies.includes(currency)) {
    throw new Error(`currency must be one of: ${currencies.join(', ')}`);
  }
}

function validateAssetType(assetType: AssetType): void {
  if (!assetTypes.includes(assetType)) {
    throw new Error(`asset_type must be one of: ${assetTypes.join(', ')}`);
  }
}

function validateQuantityUnit(quantityUnit: QuantityUnit): void {
  if (!quantityUnits.includes(quantityUnit)) {
    throw new Error(`quantity_unit must be one of: ${quantityUnits.join(', ')}`);
  }
}

function validatePositionInput(input: PortfolioPositionInput): void {
  validateSymbol(input.symbol);
  validateQuantity(input.quantity);
  validateBuyPrice(input.buy_price);
  validateBuyDate(input.buy_date);
  
  const currency = input.currency || 'USD';
  validateCurrency(currency);
  
  const assetType = input.asset_type || inferAssetType(input.symbol);
  validateAssetType(assetType);
  
  if (input.quantity_unit) {
    validateQuantityUnit(input.quantity_unit);
  }
}

export function getPositions(userId: string): PortfolioPosition[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM portfolio_positions 
    WHERE user_id = ? 
    ORDER BY buy_date DESC
  `);
  return stmt.all(userId) as PortfolioPosition[];
}

export function getPositionById(id: number, userId: string): PortfolioPosition | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM portfolio_positions 
    WHERE id = ? AND user_id = ?
  `);
  const row = stmt.get(id, userId) as PortfolioPosition | undefined;
  return row || null;
}

export function getPositionsByType(assetType: AssetType, userId: string): PortfolioPosition[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM portfolio_positions 
    WHERE user_id = ? AND asset_type = ? 
    ORDER BY buy_date DESC
  `);
  return stmt.all(userId, assetType) as PortfolioPosition[];
}

export function addPosition(input: PortfolioPositionInput, userId: string): number {
  validatePositionInput(input);
  
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const assetType = input.asset_type || inferAssetType(input.symbol);
  const currency = input.currency || 'USD';
  const quantityUnit = input.quantity_unit || (assetType === 'commodity' ? 'ounces' : 'shares');
  
  const stmt = db.prepare(`
    INSERT INTO portfolio_positions (
      user_id, symbol, asset_type, quantity, quantity_unit,
      buy_price, buy_date, currency, broker, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    userId,
    input.symbol.toUpperCase(),
    assetType,
    input.quantity,
    quantityUnit,
    input.buy_price,
    input.buy_date,
    currency,
    input.broker || null,
    input.notes || null,
    now,
    now
  );
  
  return result.lastInsertRowid as number;
}

export function updatePosition(id: number, updates: Partial<PortfolioPositionInput>, userId: string): boolean {
  const allowedFields = ['symbol', 'asset_type', 'quantity', 'quantity_unit', 'buy_price', 'buy_date', 'currency', 'broker', 'notes'];
  
  const updateFields: string[] = [];
  const values: (string | number | null)[] = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      updateFields.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }
  
  if (updateFields.length === 0) {
    return false;
  }
  
  if (updates.symbol !== undefined) validateSymbol(updates.symbol);
  if (updates.quantity !== undefined) validateQuantity(updates.quantity);
  if (updates.buy_price !== undefined) validateBuyPrice(updates.buy_price);
  if (updates.buy_date !== undefined) validateBuyDate(updates.buy_date);
  if (updates.currency !== undefined) validateCurrency(updates.currency);
  if (updates.asset_type !== undefined) validateAssetType(updates.asset_type);
  if (updates.quantity_unit !== undefined) validateQuantityUnit(updates.quantity_unit);
  
  const now = new Date().toISOString();
  updateFields.push('updated_at = ?');
  values.push(now);
  
  values.push(id, userId);
  
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE portfolio_positions 
    SET ${updateFields.join(', ')} 
    WHERE id = ? AND user_id = ?
  `);
  
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function deletePosition(id: number, userId: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare(`
    DELETE FROM portfolio_positions 
    WHERE id = ? AND user_id = ?
  `);
  const result = stmt.run(id, userId);
  return result.changes > 0;
}

export function getPositionCount(userId: string): { equity: number; commodity: number } {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT asset_type, COUNT(*) as count 
    FROM portfolio_positions 
    WHERE user_id = ? 
    GROUP BY asset_type
  `);
  const rows = stmt.all(userId) as Array<{ asset_type: string; count: number }>;
  
  const counts = { equity: 0, commodity: 0 };
  for (const row of rows) {
    if (row.asset_type === 'equity') counts.equity = row.count;
    if (row.asset_type === 'commodity') counts.commodity = row.count;
  }
  
  return counts;
}
