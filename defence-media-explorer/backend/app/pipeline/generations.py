"""Decide how a new pipeline generation replaces the previous one.

Same embedding model, dimensions, and pipeline version may overlap briefly while
the new rows are inserted. A model or version change deletes the previous
generation first so incompatible vectors are never searched together.
"""

from __future__ import annotations


def swap_deletes_previous_first(
    *,
    previous_model: str | None,
    previous_dimensions: int | None,
    previous_pipeline_version: str | None,
    next_model: str,
    next_dimensions: int,
    next_pipeline_version: str,
) -> bool:
    if previous_model is None:
        return False
    return not (
        previous_model == next_model
        and previous_dimensions == next_dimensions
        and previous_pipeline_version == next_pipeline_version
    )
