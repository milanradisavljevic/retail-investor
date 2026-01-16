import { YFinanceProvider } from './src/providers/yfinance_provider';

async function testProvider() {
  const provider = new YFinanceProvider();

  try {
    console.log('Testing getFundamentals (AAPL)...');
    const fundamentals = await provider.getFundamentals('AAPL');
    console.log('✅ P/E:', fundamentals?.peRatio, 'P/B:', fundamentals?.pbRatio);

    console.log('\nTesting getTechnicalMetrics (AAPL)...');
    const technical = await provider.getTechnicalMetrics('AAPL');
    console.log(
      '✅ Price:',
      technical?.currentPrice,
      '52W High:',
      technical?.high52Week,
      '52W Low:',
      technical?.low52Week
    );

    console.log('\n✅ All bridge calls succeeded');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    provider.close();
  }
}

testProvider();
