import type { Metadata } from 'next';
import { MacroPageClient } from './MacroPageClient';
import type { MacroTickerData, MacroCategory, MacroApiResponse } from '@/types/macro';

export const metadata: Metadata = {
  title: 'Macro Context | Intrinsic',
  description: 'Rohstoffe, Zinsen & Währungen - Makro-Kontext für Investment-Entscheidungen',
};

async function getMacroData(): Promise<MacroApiResponse | null> {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/macro`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function MacroPage() {
  const macroData = await getMacroData();
  return <MacroPageClient initialData={macroData} />;
}
