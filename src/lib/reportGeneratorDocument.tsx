import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';

type ScoreTone = 'good' | 'mid' | 'bad' | 'none';

export interface DailyReportDocumentData {
  generatedAt: string;
  reportDateLong: string;
  filenameDate: string;
  universeLabel: string;
  strategyLabel: string;
  regimeStatusLine: string;
  executiveSummary: string[];
  marketRows: Array<{
    name: string;
    value: string;
    d1: string;
    w1: string;
    m1: string;
    ytd: string;
  }>;
  macroRows: Array<{
    name: string;
    value: string;
    d1: string;
    w1: string;
    m1: string;
  }>;
  yieldSpreadValue: string;
  yieldSpreadHint: string;
  macroInterpretation: string;
  topPickRows: Array<{
    rank: number;
    symbol: string;
    name: string;
    total: number;
    totalLabel: string;
    valuation: number;
    quality: number;
    technical: number;
    risk: number;
    deltaLabel: string;
    totalTone: ScoreTone;
  }>;
  topPickInsights: string[];
  portfolio: {
    rows: Array<{
      symbol: string;
      type: string;
      quantity: string;
      buyPrice: string;
      current: string;
      value: string;
      gainLossPct: string;
      score: string;
      scoreTone: ScoreTone;
    }>;
    summary: {
      totalValue: string;
      gainLossPct: string;
      portfolioScore: string;
      split: string;
    };
    diversification: {
      score: string;
      sectors: string[];
    };
  } | null;
  earningsRows: Array<{
    date: string;
    symbol: string;
    name: string;
    score: number | null;
    scoreLabel: string;
    scoreTone: ScoreTone;
    epsEstimate: string;
    isPortfolioHolding: boolean;
  }>;
  hasPortfolioEarningsIn7d: boolean;
  dataQuality: {
    coverageLabel: string;
    providerLabel: string;
    updatedLabel: string;
  };
  sections: {
    market: boolean;
    picks: boolean;
    portfolio: boolean;
    earnings: boolean;
    quality: boolean;
  };
}

export interface StockReportDocumentData {
  symbol: string;
  companyName: string;
  generatedAt: string;
  reportDateLong: string;
  asOfDate: string;
  totalScoreLabel: string;
  breakdown: Array<{
    label: string;
    score: number;
    scoreLabel: string;
    tone: ScoreTone;
  }>;
  keyMetrics: Array<{ label: string; value: string }>;
  priceTarget: Array<{ label: string; value: string }>;
  peers: Array<{
    symbol: string;
    name: string;
    score: number;
    scoreLabel: string;
    industry: string;
  }>;
  filenameDate: string;
  missingReason?: string;
}

const NAVY = '#1a1f36';
const SCORE_GREEN = '#22c55e';
const SCORE_YELLOW = '#eab308';
const SCORE_RED = '#ef4444';
const LIGHT_ROW = '#f5f5f5';
const BORDER = '#d1d5db';
const TEXT = '#111827';
const MUTED = '#6b7280';

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 42,
    paddingHorizontal: 30,
    fontSize: 10,
    color: TEXT,
    fontFamily: 'Helvetica',
    lineHeight: 1.3,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: NAVY,
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 10,
    color: MUTED,
    marginBottom: 12,
  },
  block: {
    marginTop: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: 700,
    color: NAVY,
    marginBottom: 6,
  },
  subHeader: {
    fontSize: 10,
    fontWeight: 700,
    color: NAVY,
    marginBottom: 4,
  },
  text: {
    fontSize: 9.5,
    color: TEXT,
  },
  muted: {
    color: MUTED,
  },
  label: {
    fontSize: 9,
    color: MUTED,
  },
  value: {
    fontSize: 11,
    fontWeight: 700,
    color: TEXT,
  },
  pill: {
    borderWidth: 1,
    borderColor: NAVY,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 9,
    color: NAVY,
  },
  coverBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  summaryLine: {
    fontSize: 10,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  col: {
    flexDirection: 'column',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
  },
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  tableHead: {
    backgroundColor: NAVY,
    flexDirection: 'row',
  },
  tableHeadCell: {
    color: '#ffffff',
    fontSize: 8.5,
    fontWeight: 700,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: '#374151',
  },
  tableBodyRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  altRow: {
    backgroundColor: LIGHT_ROW,
  },
  tableCell: {
    fontSize: 8.7,
    paddingVertical: 4.5,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  tableCellSmall: {
    fontSize: 8,
  },
  scoreCellGood: {
    backgroundColor: '#ecfdf5',
    color: '#166534',
    fontWeight: 700,
  },
  scoreCellMid: {
    backgroundColor: '#fefce8',
    color: '#854d0e',
    fontWeight: 700,
  },
  scoreCellBad: {
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    fontWeight: 700,
  },
  toneGood: {
    color: SCORE_GREEN,
    fontWeight: 700,
  },
  toneMid: {
    color: SCORE_YELLOW,
    fontWeight: 700,
  },
  toneBad: {
    color: SCORE_RED,
    fontWeight: 700,
  },
  footLeft: {
    position: 'absolute',
    left: 30,
    bottom: 16,
    fontSize: 8,
    color: MUTED,
  },
  footRight: {
    position: 'absolute',
    right: 30,
    bottom: 16,
    fontSize: 8,
    color: MUTED,
    textAlign: 'right',
  },
  pageBreakSpacer: {
    height: 4,
  },
  badge: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginRight: 5,
    marginBottom: 5,
    fontSize: 9,
  },
});

function scoreToneStyle(tone: ScoreTone) {
  if (tone === 'good') return styles.scoreCellGood;
  if (tone === 'mid') return styles.scoreCellMid;
  if (tone === 'bad') return styles.scoreCellBad;
  return {};
}

function inlineToneStyle(tone: ScoreTone) {
  if (tone === 'good') return styles.toneGood;
  if (tone === 'mid') return styles.toneMid;
  if (tone === 'bad') return styles.toneBad;
  return {};
}

function Footer({ generatedAt }: { generatedAt: string }) {
  return (
    <>
      <Text style={styles.footLeft} fixed>
        INTRINSIC - Quantitative Stock Analysis Platform
      </Text>
      <Text
        style={styles.footRight}
        fixed
        render={({ pageNumber, totalPages }) =>
          `Seite ${pageNumber} von ${totalPages} - Generiert am ${generatedAt}`
        }
      />
    </>
  );
}

function CoverPage({ data }: { data: DailyReportDocumentData }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={[styles.pageTitle, { fontSize: 24, marginBottom: 12 }]}>INTRINSIC</Text>
      <Text style={[styles.pageTitle, { marginBottom: 2 }]}>INTRINSIC Daily Report</Text>
      <Text style={styles.pageSubtitle}>{data.reportDateLong}</Text>

      <View style={styles.coverBox}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <View style={{ width: '49%' }}>
            <Text style={styles.label}>Universum</Text>
            <Text style={styles.value}>{data.universeLabel}</Text>
          </View>
          <View style={{ width: '49%' }}>
            <Text style={styles.label}>Strategie</Text>
            <Text style={styles.value}>{data.strategyLabel}</Text>
          </View>
        </View>
        <View style={{ marginTop: 8 }}>
          <Text style={styles.label}>Regime-Status</Text>
          <Text style={[styles.value, { color: NAVY }]}>{data.regimeStatusLine}</Text>
        </View>
      </View>

      <View style={[styles.coverBox, { marginTop: 12 }]}>
        <Text style={styles.sectionHeader}>Executive Summary</Text>
        {data.executiveSummary.map((line, index) => (
          <Text key={`${line}-${index}`} style={styles.summaryLine}>
            {`${index + 1}. ${line}`}
          </Text>
        ))}
      </View>

      <Footer generatedAt={data.generatedAt} />
    </Page>
  );
}

function MarketPage({ data }: { data: DailyReportDocumentData }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>Market Context + Macro</Text>
      <Text style={styles.pageSubtitle}>Index-Performance und Makro-Pulse</Text>

      <View style={styles.block}>
        <Text style={styles.sectionHeader}>Index Performance</Text>
        <View style={styles.table}>
          <View style={styles.tableHead}>
            {[
              { w: '34%', label: 'Index' },
              { w: '14%', label: 'Last' },
              { w: '13%', label: '1D' },
              { w: '13%', label: '1W' },
              { w: '13%', label: '1M' },
              { w: '13%', label: 'YTD' },
            ].map((cell, index) => (
              <Text
                key={cell.label}
                style={[styles.tableHeadCell, { width: cell.w, borderRightWidth: index === 5 ? 0 : 1 }]}
              >
                {cell.label}
              </Text>
            ))}
          </View>

          {data.marketRows.map((row, index) => (
            <View
              key={row.name}
              style={index % 2 === 1 ? [styles.tableBodyRow, styles.altRow] : styles.tableBodyRow}
            >
              <Text style={[styles.tableCell, { width: '34%' }]}>{row.name}</Text>
              <Text style={[styles.tableCell, { width: '14%' }]}>{row.value}</Text>
              <Text style={[styles.tableCell, { width: '13%' }]}>{row.d1}</Text>
              <Text style={[styles.tableCell, { width: '13%' }]}>{row.w1}</Text>
              <Text style={[styles.tableCell, { width: '13%' }]}>{row.m1}</Text>
              <Text style={[styles.tableCell, { width: '13%', borderRightWidth: 0 }]}>{row.ytd}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.sectionHeader}>Commodities & Rates</Text>
        <View style={styles.table}>
          <View style={styles.tableHead}>
            {[
              { w: '38%', label: 'Asset' },
              { w: '18%', label: 'Last' },
              { w: '14%', label: '1D' },
              { w: '14%', label: '1W' },
              { w: '16%', label: '1M' },
            ].map((cell, index) => (
              <Text
                key={cell.label}
                style={[styles.tableHeadCell, { width: cell.w, borderRightWidth: index === 4 ? 0 : 1 }]}
              >
                {cell.label}
              </Text>
            ))}
          </View>

          {data.macroRows.map((row, index) => (
            <View
              key={row.name}
              style={index % 2 === 1 ? [styles.tableBodyRow, styles.altRow] : styles.tableBodyRow}
            >
              <Text style={[styles.tableCell, { width: '38%' }]}>{row.name}</Text>
              <Text style={[styles.tableCell, { width: '18%' }]}>{row.value}</Text>
              <Text style={[styles.tableCell, { width: '14%' }]}>{row.d1}</Text>
              <Text style={[styles.tableCell, { width: '14%' }]}>{row.w1}</Text>
              <Text style={[styles.tableCell, { width: '16%', borderRightWidth: 0 }]}>{row.m1}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.coverBox, { marginTop: 12 }]}>
        <Text style={styles.sectionHeader}>Yield Spread (30Y - 10Y)</Text>
        <Text style={[styles.value, { marginBottom: 4 }]}>{data.yieldSpreadValue}</Text>
        <Text style={styles.text}>{data.yieldSpreadHint}</Text>
        <Text style={[styles.text, { marginTop: 3 }]}>{data.macroInterpretation}</Text>
      </View>

      <Footer generatedAt={data.generatedAt} />
    </Page>
  );
}

function TopPicksPage({
  data,
  rows,
  showInsights,
  title,
}: {
  data: DailyReportDocumentData;
  rows: DailyReportDocumentData['topPickRows'];
  showInsights: boolean;
  title: string;
}) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageSubtitle}>Top Picks aus dem neuesten Run</Text>

      <View style={styles.table}>
        <View style={styles.tableHead}>
          {[
            { w: '5%', label: '#' },
            { w: '10%', label: 'Symbol' },
            { w: '20%', label: 'Name' },
            { w: '9%', label: 'Total' },
            { w: '9%', label: 'Val' },
            { w: '9%', label: 'Qual' },
            { w: '9%', label: 'Tech' },
            { w: '9%', label: 'Risk' },
            { w: '8%', label: 'Delta' },
          ].map((cell, index) => (
            <Text
              key={cell.label}
              style={[styles.tableHeadCell, { width: cell.w, borderRightWidth: index === 8 ? 0 : 1 }]}
            >
              {cell.label}
            </Text>
          ))}
        </View>

        {rows.map((row, index) => (
          <View
            key={`${row.rank}-${row.symbol}`}
            style={index % 2 === 1 ? [styles.tableBodyRow, styles.altRow] : styles.tableBodyRow}
          >
            <Text style={[styles.tableCell, { width: '5%' }]}>{row.rank.toString()}</Text>
            <Text style={[styles.tableCell, { width: '10%' }]}>{row.symbol}</Text>
            <Text style={[styles.tableCell, styles.tableCellSmall, { width: '20%' }]}>{row.name}</Text>
            <Text style={[styles.tableCell, { width: '9%' }, scoreToneStyle(row.totalTone)]}>{row.totalLabel}</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}>{row.valuation.toFixed(0)}</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}>{row.quality.toFixed(0)}</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}>{row.technical.toFixed(0)}</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}>{row.risk.toFixed(0)}</Text>
            <Text style={[styles.tableCell, { width: '8%', borderRightWidth: 0 }]}>{row.deltaLabel}</Text>
          </View>
        ))}
      </View>

      {showInsights && data.topPickInsights.length > 0 && (
        <View style={[styles.coverBox, { marginTop: 10 }]}>
          <Text style={styles.sectionHeader}>Top-5 Hinweise</Text>
          {data.topPickInsights.map((line, index) => (
            <Text key={`${line}-${index}`} style={[styles.text, { marginBottom: 2 }]}>
              {`${index + 1}. ${line}`}
            </Text>
          ))}
        </View>
      )}

      <Footer generatedAt={data.generatedAt} />
    </Page>
  );
}

function PortfolioPage({ data }: { data: DailyReportDocumentData }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>Portfolio-Uebersicht</Text>
      <Text style={styles.pageSubtitle}>Holdings, Summary und Diversifikation</Text>

      {!data.portfolio ? (
        <View style={[styles.coverBox, { marginTop: 8 }]}>
          <Text style={styles.text}>
            Kein Portfolio konfiguriert. Erstelle dein Portfolio unter /portfolio.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.table}>
            <View style={styles.tableHead}>
              {[
                { w: '10%', label: 'Symbol' },
                { w: '10%', label: 'Typ' },
                { w: '13%', label: 'Menge' },
                { w: '14%', label: 'Kauf' },
                { w: '14%', label: 'Aktuell' },
                { w: '14%', label: 'Wert' },
                { w: '13%', label: 'G/V%' },
                { w: '12%', label: 'Score' },
              ].map((cell, index) => (
                <Text
                  key={cell.label}
                  style={[styles.tableHeadCell, { width: cell.w, borderRightWidth: index === 7 ? 0 : 1 }]}
                >
                  {cell.label}
                </Text>
              ))}
            </View>

            {data.portfolio.rows.map((row, index) => (
              <View
                key={`${row.symbol}-${index}`}
                style={index % 2 === 1 ? [styles.tableBodyRow, styles.altRow] : styles.tableBodyRow}
              >
                <Text style={[styles.tableCell, { width: '10%' }]}>{row.symbol}</Text>
                <Text style={[styles.tableCell, { width: '10%' }]}>{row.type}</Text>
                <Text style={[styles.tableCell, { width: '13%' }]}>{row.quantity}</Text>
                <Text style={[styles.tableCell, { width: '14%' }]}>{row.buyPrice}</Text>
                <Text style={[styles.tableCell, { width: '14%' }]}>{row.current}</Text>
                <Text style={[styles.tableCell, { width: '14%' }]}>{row.value}</Text>
                <Text style={[styles.tableCell, { width: '13%' }]}>{row.gainLossPct}</Text>
                <Text style={[styles.tableCell, { width: '12%', borderRightWidth: 0 }, scoreToneStyle(row.scoreTone)]}>
                  {row.score}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.row, { marginTop: 10, gap: 8 }]}>
            <View style={[styles.coverBox, { width: '49%' }]}>
              <Text style={styles.sectionHeader}>Summary</Text>
              <Text style={[styles.text, { marginBottom: 2 }]}>Gesamtwert: {data.portfolio.summary.totalValue}</Text>
              <Text style={[styles.text, { marginBottom: 2 }]}>G/V: {data.portfolio.summary.gainLossPct}</Text>
              <Text style={[styles.text, { marginBottom: 2 }]}>Portfolio-Score: {data.portfolio.summary.portfolioScore}</Text>
              <Text style={styles.text}>{data.portfolio.summary.split}</Text>
            </View>
            <View style={[styles.coverBox, { width: '49%' }]}>
              <Text style={styles.sectionHeader}>Diversifikation</Text>
              <Text style={[styles.text, { marginBottom: 2 }]}>Diversifikations-Score: {data.portfolio.diversification.score}</Text>
              <Text style={styles.text}>Top-3 Sektoren:</Text>
              {data.portfolio.diversification.sectors.map((sector, index) => (
                <Text key={`${sector}-${index}`} style={styles.text}>
                  {`${index + 1}. ${sector}`}
                </Text>
              ))}
            </View>
          </View>
        </>
      )}

      <Footer generatedAt={data.generatedAt} />
    </Page>
  );
}

function EarningsPage({ data }: { data: DailyReportDocumentData }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>Anstehende Earnings</Text>
      <Text style={styles.pageSubtitle}>Naechste 14 Tage</Text>

      {data.earningsRows.length === 0 ? (
        <View style={styles.coverBox}>
          <Text style={styles.text}>
            Keine Earnings deiner Holdings in den naechsten 14 Tagen.
          </Text>
        </View>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHead}>
            {[
              { w: '16%', label: 'Datum' },
              { w: '12%', label: 'Symbol' },
              { w: '34%', label: 'Name' },
              { w: '12%', label: 'Score' },
              { w: '14%', label: 'EPS Est.' },
              { w: '12%', label: 'Holding' },
            ].map((cell, index) => (
              <Text
                key={cell.label}
                style={[styles.tableHeadCell, { width: cell.w, borderRightWidth: index === 5 ? 0 : 1 }]}
              >
                {cell.label}
              </Text>
            ))}
          </View>

          {data.earningsRows.slice(0, 28).map((row, index) => (
            <View
              key={`${row.symbol}-${row.date}-${index}`}
              style={index % 2 === 1 ? [styles.tableBodyRow, styles.altRow] : styles.tableBodyRow}
            >
              <Text style={[styles.tableCell, { width: '16%' }]}>{row.date}</Text>
              <Text style={[styles.tableCell, { width: '12%' }]}>{row.symbol}</Text>
              <Text style={[styles.tableCell, styles.tableCellSmall, { width: '34%' }]}>{row.name}</Text>
              <Text style={[styles.tableCell, { width: '12%' }, scoreToneStyle(row.scoreTone)]}>{row.scoreLabel}</Text>
              <Text style={[styles.tableCell, { width: '14%' }]}>{row.epsEstimate}</Text>
              <Text style={[styles.tableCell, { width: '12%', borderRightWidth: 0 }]}>
                {row.isPortfolioHolding ? 'Ja' : '-'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {!data.hasPortfolioEarningsIn7d && (
        <View style={[styles.coverBox, { marginTop: 10 }]}>
          <Text style={styles.text}>Keine Earnings deiner Holdings in den naechsten 7 Tagen.</Text>
        </View>
      )}

      <Footer generatedAt={data.generatedAt} />
    </Page>
  );
}

function QualityPage({ data }: { data: DailyReportDocumentData }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>Datenqualitaet + Disclaimer</Text>
      <Text style={styles.pageSubtitle}>Transparenz und Hinweise</Text>

      <View style={[styles.coverBox, { marginBottom: 12 }]}>
        <Text style={styles.sectionHeader}>Datenqualitaet</Text>
        <View style={[styles.row, { flexWrap: 'wrap', marginTop: 4 }]}>
          <Text style={styles.badge}>{data.dataQuality.coverageLabel}</Text>
          <Text style={styles.badge}>{data.dataQuality.providerLabel}</Text>
          <Text style={styles.badge}>{data.dataQuality.updatedLabel}</Text>
        </View>
      </View>

      <View style={styles.coverBox}>
        <Text style={[styles.sectionHeader, { marginBottom: 8 }]}>HAFTUNGSAUSSCHLUSS</Text>
        <Text style={[styles.text, { marginBottom: 3 }]}>
          Diese Anwendung dient nur zu Informationszwecken und stellt keine Anlageberatung dar.
        </Text>
        <Text style={[styles.text, { marginBottom: 3 }]}>
          Vergangene Performance ist keine Garantie fuer zukuenftige Ergebnisse.
        </Text>
        <Text style={[styles.text, { marginBottom: 8 }]}>
          Fuehren Sie stets eigene Recherchen durch.
        </Text>

        <Text style={[styles.sectionHeader, { marginBottom: 8 }]}>DISCLAIMER</Text>
        <Text style={[styles.text, { marginBottom: 3 }]}>
          This application is for informational purposes only and does not constitute investment advice.
        </Text>
        <Text style={[styles.text, { marginBottom: 3 }]}>
          Past performance is not a guarantee of future results.
        </Text>
        <Text style={styles.text}>Always do your own research.</Text>
      </View>

      <Footer generatedAt={data.generatedAt} />
    </Page>
  );
}

export function DailyReportDocument({ data }: { data: DailyReportDocumentData }) {
  const top10 = data.topPickRows.slice(0, 10);
  const next10 = data.topPickRows.slice(10, 20);

  return (
    <Document title="INTRINSIC Daily Report" author="INTRINSIC">
      <CoverPage data={data} />
      {data.sections.market && <MarketPage data={data} />}
      {data.sections.picks && (
        <TopPicksPage
          data={data}
          rows={top10}
          showInsights
          title="Top 20 Picks (1-10)"
        />
      )}
      {data.sections.picks && (
        <TopPicksPage
          data={data}
          rows={next10}
          showInsights={false}
          title="Top 20 Picks (11-20)"
        />
      )}
      {data.sections.portfolio && <PortfolioPage data={data} />}
      {data.sections.earnings && <EarningsPage data={data} />}
      {data.sections.quality && <QualityPage data={data} />}
    </Document>
  );
}

function StockReportPage({ data }: { data: StockReportDocumentData }) {
  const hasMissing = Boolean(data.missingReason);
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>INTRINSIC Stock Report</Text>
      <Text style={styles.pageSubtitle}>
        {data.companyName} ({data.symbol}) - {data.reportDateLong} - As of {data.asOfDate}
      </Text>

      {hasMissing ? (
        <View style={styles.coverBox}>
          <Text style={styles.text}>{data.missingReason}</Text>
        </View>
      ) : (
        <>
          <View style={[styles.row, { gap: 8 }]}>
            <View style={[styles.coverBox, { width: '32%' }]}>
              <Text style={styles.label}>Total Score</Text>
              <Text style={[styles.value, { fontSize: 22 }]}>{data.totalScoreLabel}</Text>
            </View>
            <View style={[styles.coverBox, { width: '66%' }]}>
              <Text style={styles.sectionHeader}>Score Breakdown</Text>
              <View style={styles.row}>
                {data.breakdown.map((item) => (
                  <View key={item.label} style={{ width: '25%', paddingRight: 4 }}>
                    <Text style={[styles.label, { marginBottom: 1 }]}>{item.label}</Text>
                    <Text style={[styles.value, inlineToneStyle(item.tone)]}>{item.scoreLabel}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={[styles.row, { marginTop: 10, gap: 8 }]}>
            <View style={[styles.coverBox, { width: '50%' }]}>
              <Text style={styles.sectionHeader}>Price Target</Text>
              {data.priceTarget.map((row) => (
                <View key={row.label} style={[styles.row, { justifyContent: 'space-between', marginBottom: 2 }]}>
                  <Text style={styles.label}>{row.label}</Text>
                  <Text style={styles.text}>{row.value}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.coverBox, { width: '50%' }]}>
              <Text style={styles.sectionHeader}>Key Metrics</Text>
              {data.keyMetrics.map((row) => (
                <View key={row.label} style={[styles.row, { justifyContent: 'space-between', marginBottom: 2 }]}>
                  <Text style={styles.label}>{row.label}</Text>
                  <Text style={styles.text}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.block, { marginTop: 10 }]}>
            <Text style={styles.sectionHeader}>Peer Comparison</Text>
            <View style={styles.table}>
              <View style={styles.tableHead}>
                {[
                  { w: '14%', label: 'Symbol' },
                  { w: '40%', label: 'Name' },
                  { w: '14%', label: 'Score' },
                  { w: '32%', label: 'Industry' },
                ].map((cell, index) => (
                  <Text
                    key={cell.label}
                    style={[styles.tableHeadCell, { width: cell.w, borderRightWidth: index === 3 ? 0 : 1 }]}
                  >
                    {cell.label}
                  </Text>
                ))}
              </View>
              {data.peers.slice(0, 8).map((peer, index) => (
                <View
                  key={`${peer.symbol}-${index}`}
                  style={index % 2 === 1 ? [styles.tableBodyRow, styles.altRow] : styles.tableBodyRow}
                >
                  <Text style={[styles.tableCell, { width: '14%' }]}>{peer.symbol}</Text>
                  <Text style={[styles.tableCell, styles.tableCellSmall, { width: '40%' }]}>{peer.name}</Text>
                  <Text style={[styles.tableCell, { width: '14%' }]}>{peer.scoreLabel}</Text>
                  <Text style={[styles.tableCell, styles.tableCellSmall, { width: '32%', borderRightWidth: 0 }]}>{peer.industry}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      <Footer generatedAt={data.generatedAt} />
    </Page>
  );
}

export function StockReportDocument({ data }: { data: StockReportDocumentData }) {
  return (
    <Document title={`INTRINSIC Stock Report - ${data.symbol}`} author="INTRINSIC">
      <StockReportPage data={data} />
    </Document>
  );
}
