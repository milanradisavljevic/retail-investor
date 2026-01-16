"""
Advanced valuation formulas based on academic literature.

This package contains production-ready implementations of:
- Two-Stage FCFE DCF (Damodaran, Investment Valuation 4th ed.)
- WACC (Damodaran, Illustration 2.1)
- Monte Carlo VaR (Hilpisch, Python for Finance)
- EV/EBITDA Regression (Damodaran, Relative Valuation)

⚠️ IMPORTANT: These formulas were carefully developed based on academic
literature. Do NOT modify the mathematical logic without consulting the
original sources.
"""

from .dcf_two_stage import calculate_two_stage_dcf, test_calculate_two_stage_dcf
from .wacc import calculate_wacc, test_calculate_wacc
from .var_monte_carlo import calculate_monte_carlo_var, test_calculate_monte_carlo_var

__all__ = [
    "calculate_two_stage_dcf",
    "calculate_wacc",
    "calculate_monte_carlo_var",
    "test_calculate_two_stage_dcf",
    "test_calculate_wacc",
    "test_calculate_monte_carlo_var",
]
