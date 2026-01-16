"""Subscores utilities and common functions."""

from typing import Optional


def percentile_rank(
    value: Optional[float], universe_values: list[Optional[float]]
) -> float:
    """
    Calculates percentile rank (0-100) for a value in the universe.

    None values are ignored. For missing values, returns 50.0 (neutral score).
    Tie-breaker: average rank method.

    Args:
        value: The value to rank
        universe_values: All values in the universe to compare against

    Returns:
        Percentile rank from 0 to 100

    Examples:
        >>> percentile_rank(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        44.44...
        >>> percentile_rank(None, [1, 2, 3])
        50.0
        >>> percentile_rank(10, [1, 2, 3, None, None])
        100.0
    """
    if value is None:
        return 50.0  # Neutral score for missing data

    valid_values = [v for v in universe_values if v is not None]
    if not valid_values:
        return 50.0

    # Count values below and equal to the target value
    below = sum(1 for v in valid_values if v < value)
    equal = sum(1 for v in valid_values if v == value)

    # Average rank for ties
    rank = below + (equal - 1) / 2

    # Convert to percentile (0-100)
    if len(valid_values) > 1:
        return (rank / (len(valid_values) - 1)) * 100
    else:
        return 50.0
