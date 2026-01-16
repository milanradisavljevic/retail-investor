"""Unit tests for scoring system."""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import unittest
from scoring.subscores import percentile_rank
from scoring.quality_gate import (
    passes_quality_gate,
    has_sufficient_data,
    should_score_symbol,
)
from scoring.subscores.value import calculate_value_score
from scoring.subscores.quality import calculate_quality_score
from scoring.subscores.risk import calculate_risk_score
from scoring.composite import calculate_composite_score, score_universe
from scoring.ranking import rank_universe


class TestPercentileRank(unittest.TestCase):
    """Test percentile rank calculation."""

    def test_basic_percentile(self):
        """Test basic percentile calculation."""
        values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        self.assertAlmostEqual(percentile_rank(1, values), 0.0)
        self.assertAlmostEqual(percentile_rank(10, values), 100.0)
        self.assertAlmostEqual(percentile_rank(5.5, values), 50.0, delta=1.0)

    def test_none_value(self):
        """Test that None returns neutral score."""
        values = [1, 2, 3, 4, 5]
        self.assertEqual(percentile_rank(None, values), 50.0)

    def test_none_in_universe(self):
        """Test that None values in universe are ignored."""
        values = [1, None, 2, None, 3, 4, 5]
        # Should only rank against [1, 2, 3, 4, 5]
        self.assertAlmostEqual(percentile_rank(3, values), 50.0)

    def test_single_value(self):
        """Test with single value universe."""
        self.assertEqual(percentile_rank(5, [5]), 50.0)

    def test_ties(self):
        """Test tie-breaking with average rank."""
        values = [1, 2, 2, 2, 5]
        # Value 2 should get middle rank of the tied values
        result = percentile_rank(2, values)
        self.assertGreater(result, 0)
        self.assertLess(result, 100)


class TestQualityGate(unittest.TestCase):
    """Test quality gate red flag checks."""

    def test_passes_all_checks(self):
        """Test stock that passes all checks."""
        metrics = {
            "roa": 0.15,
            "freeCashFlow": 1000000,
            "totalDebt": 500000,
            "totalEquity": 1000000,
        }
        passes, flags = passes_quality_gate(metrics)
        self.assertTrue(passes)
        self.assertEqual(len(flags), 0)

    def test_unprofitable(self):
        """Test unprofitable company detection."""
        metrics = {
            "roa": -0.05,
            "freeCashFlow": 1000000,
            "totalDebt": 500000,
            "totalEquity": 1000000,
        }
        passes, flags = passes_quality_gate(metrics)
        self.assertFalse(passes)
        self.assertIn("unprofitable", flags)

    def test_cash_burner(self):
        """Test cash burning company detection."""
        metrics = {
            "roa": 0.15,
            "freeCashFlow": -1000000,
            "totalDebt": 500000,
            "totalEquity": 1000000,
        }
        passes, flags = passes_quality_gate(metrics)
        self.assertFalse(passes)
        self.assertIn("cash_burner", flags)

    def test_overleveraged(self):
        """Test overleveraged company detection."""
        metrics = {
            "roa": 0.15,
            "freeCashFlow": 1000000,
            "totalDebt": 4000000,
            "totalEquity": 1000000,
        }
        passes, flags = passes_quality_gate(metrics)
        self.assertFalse(passes)
        self.assertIn("overleveraged", flags)

    def test_multiple_red_flags(self):
        """Test company with multiple red flags."""
        metrics = {
            "roa": -0.05,
            "freeCashFlow": -1000000,
            "totalDebt": 4000000,
            "totalEquity": 1000000,
        }
        passes, flags = passes_quality_gate(metrics)
        self.assertFalse(passes)
        self.assertEqual(len(flags), 3)


class TestDataSufficiency(unittest.TestCase):
    """Test data sufficiency checks."""

    def test_sufficient_data(self):
        """Test stock with sufficient data."""
        metrics = {
            "beta": 1.2,
            "roic": 0.15,
            "grossMargin": 0.40,
            "enterpriseValueOverEBITDA": 12.0,
            "freeCashFlow": 1000000,
            "priceBookMrq": 3.0,
            "marketCapitalization": 10000000,
            "totalDebt": 500000,
            "totalEquity": 1000000,
            "roa": 0.10,
        }
        sufficient, ratio = has_sufficient_data(metrics)
        self.assertTrue(sufficient)
        self.assertEqual(ratio, 0.0)

    def test_insufficient_data(self):
        """Test stock with insufficient data."""
        metrics = {
            "beta": 1.2,
            "roic": None,
            "grossMargin": None,
            "enterpriseValueOverEBITDA": None,
            "freeCashFlow": None,
            "priceBookMrq": None,
            "marketCapitalization": 10000000,
            "totalDebt": None,
            "totalEquity": None,
            "roa": None,
        }
        sufficient, ratio = has_sufficient_data(metrics)
        self.assertFalse(sufficient)
        self.assertGreater(ratio, 0.3)


class TestValueScore(unittest.TestCase):
    """Test value score calculation."""

    def test_value_score_calculation(self):
        """Test value score with sample data."""
        universe = [
            {
                "enterpriseValueOverEBITDA": 10,
                "freeCashFlow": 100,
                "marketCapitalization": 1000,
                "priceBookMrq": 2.0,
            },
            {
                "enterpriseValueOverEBITDA": 15,
                "freeCashFlow": 150,
                "marketCapitalization": 1500,
                "priceBookMrq": 3.0,
            },
            {
                "enterpriseValueOverEBITDA": 20,
                "freeCashFlow": 200,
                "marketCapitalization": 2000,
                "priceBookMrq": 4.0,
            },
        ]

        # First stock should score highest (lowest valuations)
        score = calculate_value_score(universe[0], universe)
        self.assertGreater(score, 50)

        # Last stock should score lowest (highest valuations)
        score = calculate_value_score(universe[2], universe)
        self.assertLess(score, 50)


class TestCompositeScore(unittest.TestCase):
    """Test composite score calculation."""

    def test_pure_value_profile(self):
        """Test composite score with pure value profile."""
        subscores = {
            "value": 80.0,
            "quality": 60.0,
            "risk": 70.0,
            "momentum": 50.0,
        }
        composite = calculate_composite_score(subscores, "pure_value")
        # Should be weighted toward value
        self.assertGreater(composite, 65)
        self.assertLess(composite, 75)

    def test_balanced_profile(self):
        """Test composite score with balanced profile."""
        subscores = {
            "value": 80.0,
            "quality": 60.0,
            "risk": 70.0,
            "momentum": 50.0,
        }
        composite = calculate_composite_score(subscores, "balanced")
        self.assertGreater(composite, 60)
        self.assertLess(composite, 75)


class TestRanking(unittest.TestCase):
    """Test ranking functionality."""

    def test_basic_ranking(self):
        """Test basic ranking functionality."""
        scored = [
            {"symbol": "AAPL", "composite_score": 85.0, "subscores": {}},
            {"symbol": "MSFT", "composite_score": 90.0, "subscores": {}},
            {"symbol": "GOOGL", "composite_score": 80.0, "subscores": {}},
        ]

        ranking = rank_universe(scored)

        self.assertEqual(len(ranking["top_5"]), 3)
        self.assertEqual(ranking["top_5"][0]["symbol"], "MSFT")
        self.assertEqual(ranking["pick_of_day"]["symbol"], "MSFT")

    def test_deterministic_ranking(self):
        """Test that ranking is deterministic with same seed."""
        scored = [
            {"symbol": "AAPL", "composite_score": 85.0, "subscores": {}},
            {"symbol": "MSFT", "composite_score": 90.0, "subscores": {}},
            {"symbol": "GOOGL", "composite_score": 87.0, "subscores": {}},
        ]

        ranking1 = rank_universe(scored, seed=42)
        ranking2 = rank_universe(scored, seed=42)

        self.assertEqual(
            ranking1["pick_of_day"]["symbol"],
            ranking2["pick_of_day"]["symbol"],
        )

    def test_tie_breaking(self):
        """Test alphabetical tie-breaking."""
        scored = [
            {"symbol": "ZZZZZ", "composite_score": 85.0, "subscores": {}},
            {"symbol": "AAAAA", "composite_score": 85.0, "subscores": {}},
            {"symbol": "MMMMM", "composite_score": 85.0, "subscores": {}},
        ]

        ranking = rank_universe(scored)

        # Should be sorted alphabetically when scores are equal
        self.assertEqual(ranking["full_ranking"][0]["symbol"], "AAAAA")
        self.assertEqual(ranking["full_ranking"][1]["symbol"], "MMMMM")
        self.assertEqual(ranking["full_ranking"][2]["symbol"], "ZZZZZ")


if __name__ == "__main__":
    unittest.main()
