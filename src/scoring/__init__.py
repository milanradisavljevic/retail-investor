"""Stock scoring system for retail investors."""

from .config import WEIGHT_PROFILES, WeightProfile
from .quality_gate import should_score_symbol, passes_quality_gate
from .ranking import rank_universe, format_ranking_summary

# Legacy compatibility: older modules expect composite helpers at package level.
# This repository no longer ships ``scoring/composite.py`` consistently, so we
# expose these names only when the module is present.
try:
    from .composite import score_symbol, score_universe, calculate_composite_score
except ImportError:  # pragma: no cover - optional legacy module
    score_symbol = None
    score_universe = None
    calculate_composite_score = None

__all__ = [
    "WEIGHT_PROFILES",
    "WeightProfile",
    "should_score_symbol",
    "passes_quality_gate",
    "rank_universe",
    "format_ranking_summary",
]

if score_symbol is not None:
    __all__.extend(
        [
            "score_symbol",
            "score_universe",
            "calculate_composite_score",
        ]
    )
