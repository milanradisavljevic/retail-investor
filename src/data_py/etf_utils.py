#!/usr/bin/env python3
"""
ETF Utility Functions

Helper functions for ETF detection and metadata access.
"""

import json
from pathlib import Path
from typing import Optional

# Project root detection
_MODULE_DIR = Path(__file__).parent
PROJECT_ROOT = _MODULE_DIR.parent.parent
CONFIG_DIR = PROJECT_ROOT / "config" / "universes"
DATA_DIR = PROJECT_ROOT / "data" / "etf"

# Category label mapping (English -> German)
CATEGORY_LABELS = {
    "broad_market": "Breit gestreut",
    "sector": "Sektor",
    "factor": "Faktor/Smart Beta",
    "fixed_income": "Fixed Income",
    "commodity": "Rohstoffe",
    "regional": "Regional",
    "thematic": "Thematisch",
    "crypto": "Crypto-Adjacent",
}

# Cached data
_etf_universe: Optional[dict] = None
_etf_metadata: Optional[dict] = None
_etf_symbols_set: Optional[set] = None


def _load_universe() -> dict:
    """Load ETF universe from config (with caching)."""
    global _etf_universe
    if _etf_universe is None:
        universe_path = CONFIG_DIR / "etf_global.json"
        if universe_path.exists():
            with open(universe_path, "r", encoding="utf-8") as f:
                _etf_universe = json.load(f)
        else:
            _etf_universe = {"symbols": [], "categories": {}}
    return _etf_universe


def _load_metadata() -> dict:
    """Load ETF metadata from data file (with caching)."""
    global _etf_metadata
    if _etf_metadata is None:
        metadata_path = DATA_DIR / "metadata.json"
        if metadata_path.exists():
            with open(metadata_path, "r", encoding="utf-8") as f:
                _etf_metadata = json.load(f)
        else:
            _etf_metadata = {"etfs": {}}
    return _etf_metadata


def _get_etf_symbols_set() -> set:
    """Get set of ETF symbols (with caching)."""
    global _etf_symbols_set
    if _etf_symbols_set is None:
        universe = _load_universe()
        _etf_symbols_set = set(universe.get("symbols", []))
    return _etf_symbols_set


def is_etf(symbol: str) -> bool:
    """
    Prüft ob ein Symbol ein ETF ist.
    
    Args:
        symbol: Ticker-Symbol (z.B. "SPY", "EUNL.DE")
    
    Returns:
        True wenn Symbol im ETF-Universe enthalten ist
    """
    return symbol in _get_etf_symbols_set()


def get_etf_metadata(symbol: str) -> Optional[dict]:
    """
    Lädt Metadaten für einen ETF aus data/etf/metadata.json.
    
    Args:
        symbol: Ticker-Symbol des ETFs
    
    Returns:
        Metadaten-Dict oder None wenn nicht gefunden
    """
    metadata = _load_metadata()
    return metadata.get("etfs", {}).get(symbol)


def get_etf_category_label(category: str) -> str:
    """
    Übersetzt ETF-Kategorie ins Deutsche.
    
    Args:
        category: Kategorie-Key (z.B. "broad_market")
    
    Returns:
        Deutsche Bezeichnung oder Original wenn unbekannt
    """
    return CATEGORY_LABELS.get(category, category)


def get_etf_by_category(category: str) -> list[str]:
    """
    Gibt alle ETF-Symbole einer Kategorie zurück.
    
    Args:
        category: Kategorie-Key (z.B. "broad_market", "sector")
    
    Returns:
        Liste von Ticker-Symbolen
    """
    universe = _load_universe()
    categories = universe.get("categories", {})
    return categories.get(category, {}).get("symbols", [])


def get_all_etf_categories() -> list[str]:
    """
    Gibt alle verfügbaren Kategorie-Keys zurück.
    
    Returns:
        Liste von Kategorie-Keys
    """
    universe = _load_universe()
    return list(universe.get("categories", {}).keys())


def get_etf_summary() -> dict:
    """
    Gibt eine Zusammenfassung aller ETF-Metadaten zurück.
    
    Returns:
        Dict mit Summary-Informationen
    """
    metadata = _load_metadata()
    return metadata.get("summary", {})


def get_etf_count() -> int:
    """
    Gibt die Anzahl der ETFs im Universe zurück.
    
    Returns:
        Anzahl der ETF-Symbole
    """
    return len(_get_etf_symbols_set())


def get_metadata_count() -> int:
    """
    Gibt die Anzahl der erfolgreich gefetchten Metadaten zurück.
    
    Returns:
        Anzahl der ETFs mit Metadaten
    """
    metadata = _load_metadata()
    return len(metadata.get("etfs", {}))


def is_metadata_available() -> bool:
    """
    Prüft ob Metadaten bereits gefetcht wurden.
    
    Returns:
        True wenn metadata.json existiert und ETFs enthält
    """
    metadata_path = DATA_DIR / "metadata.json"
    if not metadata_path.exists():
        return False
    
    metadata = _load_metadata()
    return len(metadata.get("etfs", {})) > 0


def get_etf_by_asset_class(asset_class: str) -> list[str]:
    """
    Gibt alle ETFs einer Asset-Klasse zurück.
    
    Args:
        asset_class: Asset-Klasse ("equity", "fixed_income", "commodity", "crypto")
    
    Returns:
        Liste von Ticker-Symbolen
    """
    metadata = _load_metadata()
    result = []
    
    for symbol, etf_data in metadata.get("etfs", {}).items():
        if etf_data.get("asset_class") == asset_class:
            result.append(symbol)
    
    return result


def get_etf_by_management_style(style: str) -> list[str]:
    """
    Gibt alle ETFs eines Management-Stils zurück.
    
    Args:
        style: Management-Stil ("passive" oder "active")
    
    Returns:
        Liste von Ticker-Symbolen
    """
    metadata = _load_metadata()
    result = []
    
    for symbol, etf_data in metadata.get("etfs", {}).items():
        if etf_data.get("management_style") == style:
            result.append(symbol)
    
    return result


def get_etf_by_distribution_policy(policy: str) -> list[str]:
    """
    Gibt alle ETFs einer Ausschüttungspolitik zurück.
    
    Args:
        policy: Policy ("distributing" oder "accumulating")
    
    Returns:
        Liste von Ticker-Symbolen
    """
    metadata = _load_metadata()
    result = []
    
    for symbol, etf_data in metadata.get("etfs", {}).items():
        if etf_data.get("distribution_policy") == policy:
            result.append(symbol)
    
    return result


def refresh_cache():
    """
    Setzt alle Caches zurück.
    Nützlich nach Änderungen an den Quelldateien.
    """
    global _etf_universe, _etf_metadata, _etf_symbols_set
    _etf_universe = None
    _etf_metadata = None
    _etf_symbols_set = None


# Convenience function for quick checks
def quick_etf_check(symbol: str) -> dict:
    """
    Schnelle Prüfung eines ETF-Symbols.
    
    Args:
        symbol: Ticker-Symbol
    
    Returns:
        Dict mit Basisinformationen
    """
    is_etf_flag = is_etf(symbol)
    metadata = get_etf_metadata(symbol) if is_etf_flag else None
    
    return {
        "symbol": symbol,
        "is_etf": is_etf_flag,
        "name": metadata.get("name") if metadata else None,
        "category": metadata.get("etf_category") if metadata else None,
        "asset_class": metadata.get("asset_class") if metadata else None,
        "management_style": metadata.get("management_style") if metadata else None,
        "expense_ratio": metadata.get("expense_ratio") if metadata else None,
    }
