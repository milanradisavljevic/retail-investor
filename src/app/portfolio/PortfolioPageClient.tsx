'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  Plus, Search, Upload, Edit2, Trash2, X, Check, ChevronDown, ChevronUp,
  Briefcase, TrendingUp, TrendingDown, AlertCircle, Loader2, FileText
} from 'lucide-react';
import type { 
  PortfolioPosition, 
  PortfolioSummary, 
  PortfolioApiResponse,
  PortfolioImportResult,
  PortfolioPositionInput,
  Currency,
  QuantityUnit,
  AssetType,
} from '@/types/portfolio';
import { 
  PHYSICAL_METALS, 
  SUPPORTED_CURRENCIES, 
  VALID_QUANTITY_UNITS,
  isPhysicalMetal,
  inferAssetType,
} from '@/types/portfolio';
import GlossaryTooltip from '@/app/components/GlossaryTooltip';
import { PortfolioScoreBreakdown } from '@/app/components/PortfolioScoreBreakdown';
import { PortfolioPerformance } from '@/app/components/PortfolioPerformance';
import PortfolioDiversificationDashboard from '@/app/components/PortfolioDiversificationDashboard';
import PortfolioUpcomingEarnings from '@/app/components/PortfolioUpcomingEarnings';

interface SearchResult {
  symbol: string;
  name: string;
  type: 'equity' | 'etf' | 'commodity';
}

type SortField = 'symbol' | 'current_value_usd' | 'gain_loss_pct' | 'total_score' | 'buy_date';
type SortDirection = 'asc' | 'desc';

interface EditingState {
  id: number | null;
  field: string | null;
  value: string | number | null;
}

const formatCurrency = (value: number | null | undefined, currency: string = 'USD'): string => {
  if (value === null || value === undefined) return '--';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
};

const formatDate = (date: string): string => {
  try {
    return new Date(date).toLocaleDateString('de-DE');
  } catch {
    return date;
  }
};

const getScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return 'text-text-muted';
  if (score >= 70) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
};

const getGainLossColor = (pct: number | null | undefined): string => {
  if (pct === null || pct === undefined) return 'text-text-muted';
  return pct >= 0 ? 'text-emerald-400' : 'text-red-400';
};

export function PortfolioPageClient() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<SearchResult | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  const [newPosition, setNewPosition] = useState<PortfolioPositionInput>({
    symbol: '',
    quantity: 0,
    buy_price: 0,
    buy_date: new Date().toISOString().split('T')[0],
    currency: 'USD',
    broker: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  
  const [sortField, setSortField] = useState<SortField>('current_value_usd');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [editing, setEditing] = useState<EditingState>({ id: null, field: null, value: null });
  const [deleting, setDeleting] = useState<number | null>(null);
  
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<PortfolioImportResult | null>(null);

  const fetchPortfolio = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/portfolio');
      if (!response.ok) throw new Error('Failed to fetch portfolio');
      const data: PortfolioApiResponse = await response.json();
      setPositions(data.positions);
      setSummary(data.summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    
    if (searchQuery.length >= 1) {
      searchDebounceRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
          const data = await response.json();
          setSearchResults(data.results || []);
          setShowSearchDropdown(true);
        } catch {
          setSearchResults([]);
        } finally {
          setSearching(false);
        }
      }, 300);
    } else {
      setSearchResults([]);
      setShowSearchDropdown(false);
    }
    
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery]);

  const handleSymbolSelect = (result: SearchResult) => {
    setSelectedSymbol(result);
    setSearchQuery(result.name);
    setShowSearchDropdown(false);
    
    const assetType = result.type === 'commodity' ? 'commodity' : 'equity';
    const quantityUnit = assetType === 'commodity' ? 'ounces' : 'shares';
    
    setNewPosition(prev => ({
      ...prev,
      symbol: result.symbol,
      asset_type: assetType,
      quantity_unit: quantityUnit,
    }));
  };

  const handleAddPosition = async () => {
    if (!newPosition.symbol || !newPosition.quantity || !newPosition.buy_price || !newPosition.buy_date) {
      setError('Bitte alle Pflichtfelder ausfüllen');
      return;
    }
    
    try {
      setSaving(true);
      const response = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPosition),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add position');
      }
      
      setSelectedSymbol(null);
      setSearchQuery('');
      setNewPosition({
        symbol: '',
        quantity: 0,
        buy_price: 0,
        buy_date: new Date().toISOString().split('T')[0],
        currency: 'USD',
        broker: '',
        notes: '',
      });
      
      await fetchPortfolio();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePosition = async (id: number, updates: Partial<PortfolioPositionInput>) => {
    try {
      const response = await fetch(`/api/portfolio/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) throw new Error('Failed to update position');
      
      setEditing({ id: null, field: null, value: null });
      await fetchPortfolio();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleDeletePosition = async (id: number) => {
    if (!confirm('Position wirklich löschen?')) return;
    
    try {
      setDeleting(id);
      const response = await fetch(`/api/portfolio/${id}`, { method: 'DELETE' });
      
      if (!response.ok) throw new Error('Failed to delete position');
      
      await fetchPortfolio();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDeleting(null);
    }
  };

  const handleCsvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').slice(0, 4);
      const preview = lines.map(line => line.split(',').map(cell => cell.trim()));
      setCsvPreview(preview);
    };
    reader.readAsText(file);
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;
    
    try {
      setImporting(true);
      const formData = new FormData();
      formData.append('file', csvFile);
      
      const response = await fetch('/api/portfolio/import', {
        method: 'POST',
        body: formData,
      });
      
      const result: PortfolioImportResult = await response.json();
      setImportResult(result);
      
      if (result.imported > 0) {
        await fetchPortfolio();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const resetCsvImport = () => {
    setCsvFile(null);
    setCsvPreview([]);
    setImportResult(null);
  };

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      
      switch (sortField) {
        case 'symbol':
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case 'current_value_usd':
          aVal = a.current_value_usd ?? 0;
          bVal = b.current_value_usd ?? 0;
          break;
        case 'gain_loss_pct':
          aVal = a.gain_loss_pct ?? 0;
          bVal = b.gain_loss_pct ?? 0;
          break;
        case 'total_score':
          aVal = a.total_score ?? 0;
          bVal = b.total_score ?? 0;
          break;
        case 'buy_date':
          aVal = a.buy_date;
          bVal = b.buy_date;
          break;
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      return sortDirection === 'asc' 
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [positions, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="w-4 h-4 text-text-muted opacity-30" />;
    return sortDirection === 'asc' 
      ? <ChevronUp className="w-4 h-4 text-accent-blue" />
      : <ChevronDown className="w-4 h-4 text-accent-blue" />;
  };

  const equityPct = summary?.equity_pct ?? 0;
  const commodityPct = summary?.commodity_pct ?? 0;

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-navy-700 rounded" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-navy-700 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-navy-700 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="text-red-400" />
          <span className="text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">
            Portfolio
          </div>
          <h1 className="text-2xl font-bold text-text-primary">
            Dein Portfolio
          </h1>
        </div>
        
        {summary && (
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-3">
              <div className="text-xs text-text-muted mb-1">Gesamtwert</div>
              <div className="text-xl font-bold text-text-primary">
                {formatCurrency(summary.total_value_usd)}
              </div>
            </div>
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-3">
              <div className="text-xs text-text-muted mb-1">Gewinn/Verlust</div>
              <div className={`text-xl font-bold ${getGainLossColor(summary.total_gain_loss_pct)}`}>
                {formatPercent(summary.total_gain_loss_pct)}
              </div>
            </div>
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-3">
              <div className="text-xs text-text-muted mb-1">Portfolio-Score</div>
              <div className={`text-xl font-bold ${getScoreColor(summary.portfolio_score ?? null)}`}>
                {summary.portfolio_score !== null ? summary.portfolio_score.toFixed(0) : '—'}
              </div>
            </div>
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-3">
              <div className="text-xs text-text-muted mb-1">Positionen</div>
              <div className="text-sm font-semibold text-text-primary">
                <span className="text-emerald-400">{summary.equity_count}</span>
                <span className="text-text-muted mx-1">Equity</span>
                <span className="text-text-muted">·</span>
                <span className="text-amber-400 ml-1">{summary.commodity_count}</span>
                <span className="text-text-muted mx-1">Edelmetall</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {summary && summary.position_count > 0 && (
        <div className="bg-navy-800/50 border border-navy-700 rounded-lg p-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-navy-700 rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-emerald-500/60 transition-all" 
                style={{ width: `${equityPct * 100}%` }}
              />
              <div 
                className="h-full bg-amber-500/60 transition-all" 
                style={{ width: `${commodityPct * 100}%` }}
              />
            </div>
            <div className="text-xs text-text-muted whitespace-nowrap">
              <span className="text-emerald-400">{(equityPct * 100).toFixed(0)}%</span>
              <span className="mx-1">Aktien</span>
              <span className="text-text-muted">·</span>
              <span className="text-amber-400 ml-1">{(commodityPct * 100).toFixed(0)}%</span>
              <span className="mx-1">Edelmetalle</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-4">Position hinzufügen</h2>
        
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Aktie oder Edelmetall suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-navy-700 border border-navy-600 rounded-lg pl-10 pr-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted animate-spin" />
              )}
            </div>
            
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-navy-800 border border-navy-600 rounded-lg shadow-xl z-50 max-h-80 overflow-auto">
                {searchResults.map((result, idx) => (
                  <div key={`${result.symbol}-${idx}`}>
                    {idx > 0 && searchResults[idx - 1].type !== 'commodity' && result.type === 'commodity' && (
                      <div className="px-3 py-2 text-xs text-text-muted border-t border-navy-600">
                        ── Physische Edelmetalle ──
                      </div>
                    )}
                    <button
                      onClick={() => handleSymbolSelect(result)}
                      className="w-full px-3 py-2.5 text-left hover:bg-navy-700 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <span className="font-medium text-text-primary">{result.symbol}</span>
                        <span className="text-text-muted mx-2">|</span>
                        <span className="text-text-secondary">{result.name}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        result.type === 'commodity' 
                          ? 'bg-amber-500/10 text-amber-400' 
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {result.type === 'commodity' ? 'Edelmetall' : 'Aktie'}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <label className="flex items-center gap-2 px-4 py-2.5 bg-navy-700 border border-navy-600 rounded-lg cursor-pointer hover:bg-navy-600 transition-colors">
            <Upload className="w-4 h-4 text-text-muted" />
            <span className="text-sm text-text-secondary">CSV Import</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvSelect}
              className="hidden"
            />
          </label>
        </div>

        {csvFile && (
          <div className="bg-navy-700/50 border border-navy-600 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent-blue" />
                <span className="text-sm text-text-primary">{csvFile.name}</span>
              </div>
              <button onClick={resetCsvImport} className="text-text-muted hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {csvPreview.length > 0 && (
              <div className="text-xs font-mono bg-navy-800 rounded p-2 mb-3 overflow-x-auto">
                <table className="w-full">
                  <tbody>
                    {csvPreview.map((row, i) => (
                      <tr key={i} className={i === 0 ? 'text-accent-blue' : 'text-text-muted'}>
                        {row.slice(0, 5).map((cell, j) => (
                          <td key={j} className="px-2 py-1">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {importResult ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-emerald-400">{importResult.imported}</span>
                  <span className="text-text-muted"> importiert, </span>
                  <span className="text-amber-400">{importResult.skipped}</span>
                  <span className="text-text-muted"> übersprungen</span>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="text-xs text-red-400">
                    {importResult.errors.slice(0, 3).map((e, i) => (
                      <div key={i}>{e}</div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleCsvImport}
                  disabled={importing}
                  className="px-4 py-2 bg-accent-blue text-white rounded-lg text-sm hover:bg-accent-blue/80 disabled:opacity-50 flex items-center gap-2"
                >
                  {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                  Importieren
                </button>
                <button
                  onClick={resetCsvImport}
                  className="px-4 py-2 bg-navy-600 text-text-secondary rounded-lg text-sm hover:bg-navy-500"
                >
                  Abbrechen
                </button>
              </div>
            )}
          </div>
        )}

        {selectedSymbol && (
          <div className="bg-navy-700/50 border border-navy-600 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedSymbol.type === 'commodity' ? 'bg-amber-500/10' : 'bg-emerald-500/10'
                }`}>
                  <Briefcase className={`w-5 h-5 ${
                    selectedSymbol.type === 'commodity' ? 'text-amber-400' : 'text-emerald-400'
                  }`} />
                </div>
                <div>
                  <div className="font-medium text-text-primary">{selectedSymbol.symbol}</div>
                  <div className="text-sm text-text-muted">{selectedSymbol.name}</div>
                </div>
              </div>
              <button onClick={() => {
                setSelectedSymbol(null);
                setSearchQuery('');
              }} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  {selectedSymbol.type === 'commodity' ? 'Menge' : 'Stückzahl'}
                </label>
                <input
                  type="number"
                  step="any"
                  value={newPosition.quantity || ''}
                  onChange={(e) => setNewPosition(p => ({ ...p, quantity: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
              
              {selectedSymbol.type === 'commodity' && (
                <div>
                  <label className="block text-xs text-text-muted mb-1">Einheit</label>
                  <select
                    value={newPosition.quantity_unit || 'ounces'}
                    onChange={(e) => setNewPosition(p => ({ ...p, quantity_unit: e.target.value as QuantityUnit }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
                  >
                    {VALID_QUANTITY_UNITS.map(u => (
                      <option key={u} value={u}>{u === 'ounces' ? 'Unzen' : u === 'grams' ? 'Gramm' : 'Stück'}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div>
                <label className="block text-xs text-text-muted mb-1">Kaufpreis</label>
                <input
                  type="number"
                  step="any"
                  value={newPosition.buy_price || ''}
                  onChange={(e) => setNewPosition(p => ({ ...p, buy_price: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
              
              <div>
                <label className="block text-xs text-text-muted mb-1">Kaufdatum</label>
                <input
                  type="date"
                  value={newPosition.buy_date}
                  onChange={(e) => setNewPosition(p => ({ ...p, buy_date: e.target.value }))}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
              
              <div>
                <label className="block text-xs text-text-muted mb-1">Währung</label>
                <select
                  value={newPosition.currency}
                  onChange={(e) => setNewPosition(p => ({ ...p, currency: e.target.value as Currency }))}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs text-text-muted mb-1">Broker (optional)</label>
                <input
                  type="text"
                  value={newPosition.broker || ''}
                  onChange={(e) => setNewPosition(p => ({ ...p, broker: e.target.value }))}
                  placeholder="z.B. Trade Republic"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
                />
              </div>
              
              <div className="col-span-2">
                <label className="block text-xs text-text-muted mb-1">Notizen (optional)</label>
                <input
                  type="text"
                  value={newPosition.notes || ''}
                  onChange={(e) => setNewPosition(p => ({ ...p, notes: e.target.value }))}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
                />
              </div>
            </div>
            
            <button
              onClick={handleAddPosition}
              disabled={saving || !newPosition.quantity || !newPosition.buy_price}
              className="px-6 py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:bg-accent-blue/80 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Speichere...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Position hinzufügen
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {positions.length > 0 && (
        <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-navy-700">
            <h2 className="text-sm font-semibold text-text-primary">Holdings</h2>
          </div>
          
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-navy-700 text-left">
                  <th 
                    className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                    onClick={() => handleSort('symbol')}
                  >
                    <div className="flex items-center gap-1">Symbol <SortIcon field="symbol" /></div>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Typ</th>
                  <th className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Menge</th>
                  <th className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Kaufpreis</th>
                  <th className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Aktuell</th>
                  <th 
                    className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                    onClick={() => handleSort('current_value_usd')}
                  >
                    <div className="flex items-center gap-1">Wert <SortIcon field="current_value_usd" /></div>
                  </th>
                  <th 
                    className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                    onClick={() => handleSort('gain_loss_pct')}
                  >
                    <div className="flex items-center gap-1">G/V % <SortIcon field="gain_loss_pct" /></div>
                  </th>
                  <th 
                    className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                    onClick={() => handleSort('total_score')}
                  >
                    <div className="flex items-center gap-1">Score <SortIcon field="total_score" /></div>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700">
                {sortedPositions.map((pos) => (
                  <tr 
                    key={pos.id} 
                    className={`hover:bg-navy-700/50 ${
                      pos.asset_type === 'commodity' ? 'border-l-2 border-amber-500/30' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-text-primary">{pos.symbol}</span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-sm max-w-[150px] truncate">
                      {pos.display_name || pos.symbol}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        pos.asset_type === 'commodity' 
                          ? 'bg-amber-500/10 text-amber-400' 
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {pos.asset_type === 'commodity' ? 'Edelmetall' : 'Aktie'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-primary text-sm">
                      {pos.quantity} {pos.quantity_unit === 'ounces' ? 'oz' : pos.quantity_unit === 'grams' ? 'g' : 'Stk.'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-sm">
                      {formatCurrency(pos.buy_price, pos.currency)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-sm">
                      {pos.current_price !== null && pos.current_price !== undefined 
                        ? formatCurrency(pos.current_price, pos.currency)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-text-primary font-medium">
                      {pos.current_value_usd !== null && pos.current_value_usd !== undefined 
                        ? formatCurrency(pos.current_value_usd)
                        : '—'}
                    </td>
                    <td className={`px-4 py-3 font-medium ${getGainLossColor(pos.gain_loss_pct)}`}>
                      {formatPercent(pos.gain_loss_pct)}
                    </td>
                    <td className="px-4 py-3">
                      {pos.total_score !== null && pos.total_score !== undefined ? (
                        <span className={`font-medium ${getScoreColor(pos.total_score)}`}>
                          {pos.total_score.toFixed(0)}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            const newQty = prompt('Neue Menge:', String(pos.quantity));
                            if (newQty) handleUpdatePosition(pos.id, { quantity: parseFloat(newQty) });
                          }}
                          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-navy-600 rounded"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePosition(pos.id)}
                          disabled={deleting === pos.id}
                          className="p-1.5 text-text-muted hover:text-red-400 hover:bg-navy-600 rounded disabled:opacity-50"
                        >
                          {deleting === pos.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-navy-600 bg-navy-700/30">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-sm font-medium text-text-primary">
                    Gesamt
                  </td>
                  <td className="px-4 py-3 font-bold text-text-primary">
                    {summary ? formatCurrency(summary.total_value_usd) : '—'}
                  </td>
                  <td className={`px-4 py-3 font-bold ${getGainLossColor(summary?.total_gain_loss_pct)}`}>
                    {summary ? formatPercent(summary.total_gain_loss_pct) : '—'}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="md:hidden divide-y divide-navy-700">
            {sortedPositions.map((pos) => (
              <div 
                key={pos.id} 
                className={`p-4 ${pos.asset_type === 'commodity' ? 'border-l-2 border-amber-500/30' : ''}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium text-text-primary">{pos.symbol}</div>
                    <div className="text-xs text-text-muted">{pos.display_name || pos.symbol}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    pos.asset_type === 'commodity' 
                      ? 'bg-amber-500/10 text-amber-400' 
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {pos.asset_type === 'commodity' ? 'Edelmetall' : 'Aktie'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-text-muted">Menge: </span>
                    <span className="text-text-primary">{pos.quantity}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Wert: </span>
                    <span className="text-text-primary font-medium">
                      {pos.current_value_usd !== null ? formatCurrency(pos.current_value_usd) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted">G/V: </span>
                    <span className={getGainLossColor(pos.gain_loss_pct)}>
                      {formatPercent(pos.gain_loss_pct)}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted">Score: </span>
                    <span className={getScoreColor(pos.total_score ?? null)}>
                      {pos.total_score !== null && pos.total_score !== undefined ? pos.total_score.toFixed(0) : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => {
                      const newQty = prompt('Neue Menge:', String(pos.quantity));
                      if (newQty) handleUpdatePosition(pos.id, { quantity: parseFloat(newQty) });
                    }}
                    className="p-2 text-text-muted hover:text-text-primary bg-navy-700 rounded-lg"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePosition(pos.id)}
                    className="p-2 text-text-muted hover:text-red-400 bg-navy-700 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {positions.length > 0 && <PortfolioUpcomingEarnings />}

      {positions.length > 0 && (
        <PortfolioPerformance />
      )}

      {positions.length > 0 && summary && (
        <PortfolioDiversificationDashboard
          positions={positions}
          totalValueUsd={summary.total_value_usd}
        />
      )}

      {positions.length === 0 && !loading && (
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-12 text-center">
          <Briefcase className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">Keine Positionen</h3>
          <p className="text-text-muted mb-4">
            Füge deine erste Position hinzu, um dein Portfolio zu tracken.
          </p>
        </div>
      )}

      {summary && summary.equity_count > 0 && (
        <PortfolioScoreBreakdown
          positions={positions}
          totalValueUsd={summary.total_value_usd}
          equityCount={summary.equity_count}
          commodityCount={summary.commodity_count}
        />
      )}
    </div>
  );
}
