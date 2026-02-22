import json
import unittest
from pathlib import Path

from scripts.etl.sec_edgar_bulk_audit import (
    extract_from_companyfacts,
    format_cik_file_name,
    merge_sec_payload,
)
from scripts.etl.sec_edgar_poc import RawAccountingData, calculate_derived_metrics


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sec_companyfacts_bulk_trimmed.json"


class TestSecEdgarBulkAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    def test_cik_file_name_is_zero_padded(self) -> None:
        self.assertEqual(format_cik_file_name("0000001750"), "CIK0000001750.json")

    def test_extractor_returns_expected_raw_fields(self) -> None:
        raw, payload = extract_from_companyfacts("TEST", "0000001750", self.fixture)

        self.assertEqual(raw.net_income, 100)
        self.assertEqual(raw.total_assets, 1000)
        self.assertEqual(raw.stockholders_equity, 500)
        self.assertEqual(raw.total_debt, 200)
        self.assertEqual(raw.revenue, 600)
        self.assertEqual(raw.gross_profit, 300)
        self.assertEqual(raw.operating_cash_flow, 150)
        self.assertEqual(raw.capex, -40)
        self.assertEqual(raw.current_assets, 300)
        self.assertEqual(raw.current_liabilities, 150)
        self.assertEqual(raw.shares_outstanding, 100)
        self.assertEqual(payload["_source"], "sec_edgar_bulk")
        self.assertEqual(payload["_method"], "bulk_json")
        self.assertEqual(payload.get("roa"), 10.0)
        self.assertEqual(payload.get("grossMargin"), 50.0)
        self.assertEqual(payload.get("currentRatio"), 2.0)
        self.assertEqual(payload.get("operatingCashFlow"), 150)
        self.assertEqual(payload.get("revenue"), 600)
        self.assertEqual(payload.get("netIncome"), 100)
        self.assertEqual(payload.get("secEdgar", {}).get("net_income_py"), 80)
        self.assertEqual(payload.get("secEdgar", {}).get("total_assets_py"), 900)
        self.assertEqual(
            payload.get("_sources", {}).get("operatingCashFlow"), "sec_edgar_bulk"
        )

    def test_merge_preserves_existing_non_sec_fields(self) -> None:
        existing = {
            "_source": "fmp",
            "peRatio": 15.0,
            "pbRatio": 2.0,
            "rawFmp": {"provider": "fmp"},
            "_sources": {"peRatio": "fmp", "pbRatio": "fmp"},
        }
        sec_payload = {
            "_source": "sec_edgar_bulk",
            "roa": 8.2,
            "grossMargin": 33.1,
            "fcf": 1200000.0,
            "currentRatio": 1.7,
            "operatingCashFlow": 2500000.0,
            "revenue": 9000000.0,
            "netIncome": 800000.0,
            "secEdgar": {"netIncome_py": 700000.0},
        }

        merged = merge_sec_payload(existing, sec_payload)

        self.assertEqual(merged.get("peRatio"), 15.0)
        self.assertEqual(merged.get("pbRatio"), 2.0)
        self.assertEqual(merged.get("roa"), 8.2)
        self.assertEqual(merged.get("grossMargin"), 33.1)
        self.assertEqual(merged.get("secEdgar", {}).get("netIncome_py"), 700000.0)
        self.assertEqual(merged.get("_sources", {}).get("peRatio"), "fmp")
        self.assertEqual(merged.get("_sources", {}).get("roa"), "sec_edgar_bulk")

    def test_derived_metrics_math_including_capex_sign(self) -> None:
        raw_negative = RawAccountingData(
            symbol="TEST",
            cik="0000001750",
            net_income=100,
            total_assets=1000,
            stockholders_equity=500,
            total_debt=200,
            revenue=600,
            gross_profit=300,
            operating_cash_flow=150,
            capex=-40,
            current_assets=300,
            current_liabilities=150,
            method="bulk_json",
        )
        raw_positive = RawAccountingData(
            symbol="TEST",
            cik="0000001750",
            operating_cash_flow=150,
            capex=40,
            method="bulk_json",
        )

        derived_negative = calculate_derived_metrics(raw_negative)
        derived_positive = calculate_derived_metrics(raw_positive)

        self.assertAlmostEqual(derived_negative.roe, 20.0)
        self.assertAlmostEqual(derived_negative.roa, 10.0)
        self.assertAlmostEqual(derived_negative.debt_to_equity, 0.4)
        self.assertAlmostEqual(derived_negative.gross_margin, 50.0)
        self.assertAlmostEqual(derived_negative.current_ratio, 2.0)
        self.assertAlmostEqual(derived_negative.fcf, 110.0)
        self.assertAlmostEqual(derived_positive.fcf, 110.0)


if __name__ == "__main__":
    unittest.main()
