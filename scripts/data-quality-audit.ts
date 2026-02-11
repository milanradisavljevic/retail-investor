import fs from 'fs';
import path from 'path';
import { YFinanceProvider } from '../src/providers/yfinance_provider';
import type { FundamentalsData } from '../src/data/repositories/fundamentals_repo';

interface DataQualityReport {
  symbol: string;
  marketCap: number;
  hasValuation: boolean;
  hasQuality: boolean;
  hasTechnical: boolean;
  missingFields: string[];
  completeness: number; // 0-100%
}

async function auditDataQuality(symbols: string[]): Promise<void> {
  console.log(`Auditing data quality for ${symbols.length} symbols...\n`);
  
  const reports: DataQualityReport[] = [];
  const provider = new YFinanceProvider();

  try {
    for (const symbol of symbols) {
      try {
        // Fetch both fundamentals and technicals to cover all fields
        const [fund, tech] = await Promise.all([
            provider.getFundamentals(symbol).catch(() => null),
            provider.getTechnicalMetrics(symbol).catch(() => null)
        ]);
        
        const missingFields: string[] = [];
        const marketCap = fund?.marketCap || 0;
        
        // Check Valuation
        if (!fund?.peRatio || fund.peRatio === 0) missingFields.push('P/E');
        if (!fund?.pbRatio || fund.pbRatio === 0) missingFields.push('P/B');
        if (!fund?.psRatio || fund.psRatio === 0) missingFields.push('P/S');
        
        // Check Quality
        if (!fund?.roe || fund.roe === 0) missingFields.push('ROE');
        // roic is optional in interface but checked in plan. It is present in FundamentalsData as optional.
        if (!fund?.roic || fund.roic === 0) missingFields.push('ROIC');
        if (!fund?.grossMargin || fund.grossMargin === 0) missingFields.push('Gross Margin');
        
        // Check Technical
        if (!fund?.beta || fund.beta === 0) missingFields.push('Beta');
        if (!tech?.volatility3Month || tech.volatility3Month === 0) missingFields.push('Volatility');
        
        const totalFields = 8;
        const missingCount = missingFields.length;
        const completeness = ((totalFields - missingCount) / totalFields) * 100;
        
        reports.push({
          symbol,
          marketCap,
          hasValuation: missingFields.filter(f => ['P/E', 'P/B', 'P/S'].includes(f)).length === 0,
          hasQuality: missingFields.filter(f => ['ROE', 'ROIC', 'Gross Margin'].includes(f)).length === 0,
          hasTechnical: missingFields.filter(f => ['Beta', 'Volatility'].includes(f)).length === 0,
          missingFields,
          completeness: Math.round(completeness)
        });
        
        process.stdout.write('.'); // Progress indicator
      } catch (error) {
        // console.error(`Error fetching ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
        reports.push({
          symbol,
          marketCap: 0,
          hasValuation: false,
          hasQuality: false,
          hasTechnical: false,
          missingFields: ['ALL (Fetch Error)'],
          completeness: 0
        });
        process.stdout.write('x');
      }
    }
  } finally {
      provider.close();
  }
  
  console.log('\n');

  // Sort by completeness
  reports.sort((a, b) => b.completeness - a.completeness);
  
  // Generate summary
  const summary = {
    totalSymbols: reports.length,
    completeData: reports.filter(r => r.completeness === 100).length,
    partialData: reports.filter(r => r.completeness > 0 && r.completeness < 100).length,
    noData: reports.filter(r => r.completeness === 0).length,
    avgCompleteness: Math.round(reports.reduce((sum, r) => sum + r.completeness, 0) / reports.length),
    byMarketCap: {
      large: reports.filter(r => r.marketCap > 10e9).length,
      mid: reports.filter(r => r.marketCap > 1e9 && r.marketCap <= 10e9).length,
      small: reports.filter(r => r.marketCap > 200e6 && r.marketCap <= 1e9).length,
      micro: reports.filter(r => r.marketCap <= 200e6).length
    }
  };
  
  // Print summary
  console.log('\n📊 DATA QUALITY SUMMARY\n');
  console.log('═══════════════════════════════════════\n');
  console.log(`Total Symbols: ${summary.totalSymbols}`);
  console.log(`Complete Data (100%): ${summary.completeData} (${(summary.completeData/summary.totalSymbols*100).toFixed(1)}%)`);
  console.log(`Partial Data: ${summary.partialData} (${(summary.partialData/summary.totalSymbols*100).toFixed(1)}%)`);
  console.log(`No Data: ${summary.noData} (${(summary.noData/summary.totalSymbols*100).toFixed(1)}%)`);
  console.log(`\nAverage Completeness: ${summary.avgCompleteness}%\n`);
  
  console.log('By Market Cap:');
  console.log(`  Large-Cap (>$10B): ${summary.byMarketCap.large}`);
  console.log(`  Mid-Cap ($1B-$10B): ${summary.byMarketCap.mid}`);
  console.log(`  Small-Cap ($200M-$1B): ${summary.byMarketCap.small}`);
  console.log(`  Micro-Cap (<$200M): ${summary.byMarketCap.micro}\n`);
  
  // Top 10 worst data quality
  console.log('🔴 WORST DATA QUALITY (Bottom 10):\n');
  reports.slice(-10).reverse().forEach((r, i) => {
    console.log(`${i+1}. ${r.symbol}: ${r.completeness}% complete`);
    console.log(`   Missing: ${r.missingFields.join(', ')}`);
    console.log(`   Market Cap: $${(r.marketCap/1e6).toFixed(0)}M\n`);
  });
  
  // Save full report
  const fullReport = {
    date: new Date().toISOString(),
    summary,
    details: reports
  };
  
  fs.writeFileSync(
    'data/data-quality-report.json',
    JSON.stringify(fullReport, null, 2)
  );
  
  console.log('Full report saved: data/data-quality-report.json\n');
}

// Run
const universePath = 'config/universes/russell2000_full.json';
if (fs.existsSync(universePath)) {
    const universeConfig = JSON.parse(
      fs.readFileSync(universePath, 'utf8')
    );
    const symbols = universeConfig.symbols || [];
    // Use a smaller sample for the test run as suggested in the plan (slice 0, 100)
    // The plan said "Test with first 100".
    auditDataQuality(symbols.slice(0, 100)).catch(console.error);
} else {
    console.error(`Universe file not found: ${universePath}`);
    // Fallback to a small list if file missing
    auditDataQuality(['AAPL', 'MSFT', 'IWM', 'AMC', 'GME']).catch(console.error);
}
