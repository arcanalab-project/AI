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
    text_channel_enabled: bool = False,
    previous_text_model: str | None = None,
    previous_text_dimensions: int | None = None,
    next_text_model: str | None = None,
    next_text_dimensions: int | None = None,
) -> bool:
    if previous_model is None:
        return False
    shared_changed = not (
        previous_model == next_model
        and previous_dimensions == next_dimensions
        and previous_pipeline_version == next_pipeline_version
    )
    if shared_changed:
        return True
    if not text_channel_enabled:
        return False
    return not (
        previous_text_model == next_text_model
        and previous_text_dimensions == next_text_dimensions
    )
