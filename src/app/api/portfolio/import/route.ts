export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { addPosition } from '@/data/portfolio';
import type { PortfolioImportResult, PortfolioPositionInput } from '@/types/portfolio';
import { inferAssetType } from '@/types/portfolio';
import { getDatabase } from '@/data/db';

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_ROWS = 500;

function parseCSV(content: string): string[][] {
  const lines = content.split(/\r?\n/);
  const rows: string[][] = [];
  
  for (const line of lines) {
    if (line.trim() === '') continue;
    
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    row.push(current.trim());
    rows.push(row);
  }
  
  return rows;
}

function validateAndParseRow(
  row: string[],
  headers: string[],
  lineNumber: number
): { position: PortfolioPositionInput; error: string | null } {
  const rowData: Record<string, string> = {};
  
  for (let i = 0; i < headers.length; i++) {
    rowData[headers[i]] = row[i] || '';
  }
  
  const errors: string[] = [];
  
  if (!rowData.symbol) {
    errors.push('symbol is required');
  }
  
  const quantity = parseFloat(rowData.quantity);
  if (Number.isNaN(quantity) || quantity <= 0) {
    errors.push('quantity must be a positive number');
  }
  
  const buyPrice = parseFloat(rowData.buy_price);
  if (Number.isNaN(buyPrice) || buyPrice < 0) {
    errors.push('buy_price must be a non-negative number');
  }
  
  if (!rowData.buy_date) {
    errors.push('buy_date is required');
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(rowData.buy_date)) {
      errors.push('buy_date must be in YYYY-MM-DD format');
    }
  }
  
  const currency = rowData.currency?.toUpperCase() || 'USD';
  const validCurrencies = ['USD', 'EUR', 'GBP', 'CHF', 'JPY'];
  if (!validCurrencies.includes(currency)) {
    errors.push(`currency must be one of: ${validCurrencies.join(', ')}`);
  }
  
  if (errors.length > 0) {
    return {
      position: null as unknown as PortfolioPositionInput,
      error: `Line ${lineNumber}: ${errors.join('; ')}`,
    };
  }
  
  let assetType = rowData.type?.toLowerCase() as 'equity' | 'commodity' | 'etf' | undefined;
  if (!assetType || !['equity', 'commodity', 'etf'].includes(assetType)) {
    assetType = inferAssetType(rowData.symbol);
  }
  
  const position: PortfolioPositionInput = {
    symbol: rowData.symbol.toUpperCase(),
    asset_type: assetType,
    quantity,
    quantity_unit: assetType === 'commodity' ? 'ounces' : 'shares',
    buy_price: buyPrice,
    buy_date: rowData.buy_date,
    currency: currency as 'USD' | 'EUR' | 'GBP' | 'CHF' | 'JPY',
    broker: rowData.broker || undefined,
    notes: rowData.notes || undefined,
  };
  
  return { position, error: null };
}

export async function POST(request: NextRequest) {
  try {
    getDatabase();
    
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file uploaded. Use multipart/form-data with a "file" field.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size: 1MB' },
        { status: 413 }
      );
    }
    
    const content = await file.text();
    const rows = parseCSV(content);
    
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'CSV file is empty' },
        { status: 400 }
      );
    }

    const dataRows = Math.max(0, rows.length - 1);
    if (dataRows > MAX_ROWS) {
      return NextResponse.json(
        { error: `Too many rows (${dataRows}). Maximum: ${MAX_ROWS}` },
        { status: 413 }
      );
    }
    
    const headers = rows[0].map(h => h.toLowerCase().trim());
    const requiredHeaders = ['symbol', 'quantity', 'buy_price', 'buy_date'];
    
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return NextResponse.json(
        { error: `Missing required columns: ${missingHeaders.join(', ')}` },
        { status: 400 }
      );
    }
    
    const result: PortfolioImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
      imported_positions: [],
    };
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const lineNumber = i + 1;
      
      if (row.every(cell => cell === '')) continue;
      
      const { position, error } = validateAndParseRow(row, headers, lineNumber);
      
      if (error) {
        result.errors.push(error);
        result.skipped++;
        continue;
      }
      
      try {
        const positionId = addPosition(position);
        result.imported++;
        result.imported_positions?.push({ id: positionId, symbol: position.symbol });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`Line ${lineNumber}: Failed to save position - ${errorMsg}`);
        result.skipped++;
      }
    }
    
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[API /portfolio/import] Error:', error);
    return NextResponse.json(
      { error: 'Failed to import portfolio', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
