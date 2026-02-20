import json
import unittest
from pathlib import Path

from scripts.etl.sec_edgar_poc import (
    RawAccountingData,
    _find_facts,
    _get_instant_value,
    calculate_derived_metrics,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sec_companyfacts_trimmed.json"


class TestSecEdgarPoc(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.company_facts = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    def test_find_facts_uses_alias_fallback_and_sorts_desc(self) -> None:
        aliases = [
            "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
            "us-gaap:Revenues",
        ]

        facts = _find_facts(self.company_facts, aliases)

        self.assertEqual(len(facts), 2)
        self.assertEqual(facts[0]["end"], "2025-03-31")
        self.assertEqual(facts[1]["end"], "2024-12-31")

    def test_get_instant_value_prefers_latest_filing_regardless_of_form(self) -> None:
        aliases = ["us-gaap:Assets"]
        facts = _find_facts(self.company_facts, aliases)

        value, method = _get_instant_value(facts)

        self.assertEqual(value, 1200000000)
        self.assertIn("10-Q as of 2025-03-31", method)

    def test_capex_normalization_handles_negative_and_positive_signs(self) -> None:
        raw_negative = RawAccountingData(symbol="TEST", cik="0000000001", operating_cash_flow=100.0, capex=-20.0)
        raw_positive = RawAccountingData(symbol="TEST", cik="0000000001", operating_cash_flow=100.0, capex=20.0)

        metrics_negative = calculate_derived_metrics(raw_negative)
        metrics_positive = calculate_derived_metrics(raw_positive)

        self.assertEqual(metrics_negative.fcf, 80.0)
        self.assertEqual(metrics_positive.fcf, 80.0)


if __name__ == "__main__":
    unittest.main()
