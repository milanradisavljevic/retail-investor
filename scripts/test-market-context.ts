#!/usr/bin/env tsx
/**
 * Test script to debug market context API
 * Claude Code created this file to diagnose Yahoo Finance API issues
 */

async function testYahooQuotes() {
  console.log('Testing Yahoo Finance Quote API...\n');

  const symbols = ['^GSPC', '^RUT', '^IXIC', '^VIX'].join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;

  console.log(`URL: ${url}\n`);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log(`Headers:`, Object.fromEntries(res.headers.entries()));
    console.log();

    const text = await res.text();
    console.log(`Response length: ${text.length} bytes`);

    if (text.length < 500) {
      console.log(`Full response: ${text}`);
    } else {
      console.log(`First 500 chars: ${text.substring(0, 500)}...`);
    }

    if (res.ok) {
      const data = JSON.parse(text);
      console.log('\nParsed data structure:');
      console.log(`- quoteResponse exists: ${!!data.quoteResponse}`);
      console.log(`- result count: ${data.quoteResponse?.result?.length ?? 0}`);

      if (data.quoteResponse?.result?.[0]) {
        const sample = data.quoteResponse.result[0];
        console.log(`\nSample quote (${sample.symbol}):`);
        console.log(`- regularMarketPrice: ${sample.regularMarketPrice}`);
        console.log(`- regularMarketChangePercent: ${sample.regularMarketChangePercent}`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

async function testYahooChart() {
  console.log('\n\n=== Testing Yahoo Finance Chart API ===\n');

  const symbol = '^GSPC';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=60d&interval=1d`;

  console.log(`URL: ${url}\n`);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
    });

    console.log(`Status: ${res.status} ${res.statusText}`);

    const text = await res.text();
    console.log(`Response length: ${text.length} bytes`);

    if (text.length < 500) {
      console.log(`Full response: ${text}`);
    }

    if (res.ok) {
      const data = JSON.parse(text);
      console.log('\nParsed data structure:');
      console.log(`- chart exists: ${!!data.chart}`);
      console.log(`- result count: ${data.chart?.result?.length ?? 0}`);

      const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if (closes) {
        const validCloses = closes.filter((v: any) => typeof v === 'number');
        console.log(`- close prices: ${validCloses.length} valid values`);
        console.log(`- sample: [${validCloses.slice(0, 5).join(', ')}...]`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

async function main() {
  await testYahooQuotes();
  await testYahooChart();
}

main();
