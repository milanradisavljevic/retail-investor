import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PiotroskiCard } from '@/app/components/scoring/PiotroskiCard';
import type { PiotroskiResult } from '@/scoring/formulas/piotroski';

function makePiotroski(overrides: Partial<PiotroskiResult> = {}): PiotroskiResult {
  return {
    score: 9,
    maxScore: 9,
    checks: {
      f1_roa: { passed: true, label: 'Profitability: ROA > 0' },
      f2_cfo: { passed: true, label: 'Profitability: Operating CF > 0' },
      f3_delta_roa: { passed: true, label: 'Profitability: ROA improved YoY' },
      f4_accrual: { passed: true, label: 'Profitability: CFO > Net Income' },
      f5_delta_lever: { passed: true, label: 'Leverage: LT Debt/Assets decreased YoY' },
      f6_delta_liquid: { passed: true, label: 'Liquidity: Current Ratio improved YoY' },
      f7_eq_offer: { passed: true, label: 'Leverage: No new shares issued' },
      f8_delta_margin: { passed: true, label: 'Efficiency: Gross Margin improved YoY' },
      f9_delta_turn: { passed: true, label: 'Efficiency: Asset Turnover improved YoY' },
    },
    fiscalYearCurrent: '2024',
    fiscalYearPrior: '2023',
    ...overrides,
  };
}

describe('PiotroskiCard', () => {
  it('renders full 9/9 state', () => {
    const html = renderToStaticMarkup(
      React.createElement(PiotroskiCard, { piotroski: makePiotroski() })
    );

    expect(html).toContain('Piotroski F-Score');
    expect(html).toContain('9 / 9');
    expect(html).toContain('Excellent');
    expect(html).toContain('FY 2024 vs FY 2023');
    expect(html).toContain('Based on 9/9 calculable checks');
  });

  it('renders partial state with null checks and note', () => {
    const partial = makePiotroski({
      score: 4,
      maxScore: 6,
      checks: {
        ...makePiotroski().checks,
        f3_delta_roa: { passed: null, label: 'Profitability: ROA improved YoY' },
        f8_delta_margin: { passed: null, label: 'Efficiency: Gross Margin improved YoY' },
        f9_delta_turn: { passed: null, label: 'Efficiency: Asset Turnover improved YoY' },
      },
    });

    const html = renderToStaticMarkup(
      React.createElement(PiotroskiCard, { piotroski: partial })
    );

    expect(html).toContain('4 / 6');
    expect(html).toContain('Average');
    expect(html).toContain('Based on 6/9 calculable checks');
    expect(html).toContain('Insufficient data');
  });

  it('renders placeholder when piotroski is null', () => {
    const html = renderToStaticMarkup(
      React.createElement(PiotroskiCard, { piotroski: null })
    );

    expect(html).toContain('Piotroski F-Score');
    expect(html).toContain('No SEC data available');
  });
});
