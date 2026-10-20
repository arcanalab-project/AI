"""Atlas Search clause builders. Filters match the metadata filter used by browse and vector search."""

from __future__ import annotations

from datetime import datetime
from typing import Any


LANGUAGE_MULTI = {
    "en": "searchText.english",
    "fr": "searchText.french",
    "de": "searchText.german",
    "es": "searchText.spanish",
    "it": "searchText.italian",
}

TEXT_PATHS = [
    "title",
    "description",
    "userDescription",
    "modelDescription",
    "transcript",
    "ocrText",
    "tags",
    "searchText",
]


def to_search_filter_clauses(match: dict[str, Any]) -> list[dict[str, Any]]:
    if "$and" in match:
        clauses: list[dict[str, Any]] = []
        for part in match["$and"]:
            clauses.extend(to_search_filter_clauses(part))
        return clauses
    if "$or" in match:
        return [
            {
                "compound": {
                    "should": [
                        {"compound": {"filter": to_search_filter_clauses(part)}} for part in match["$or"]
                    ],
                    "minimumShouldMatch": 1,
                }
            }
        ]
    clauses = []
    for field, value in match.items():
        clauses.extend(_one_clause(field, value))
    return clauses


def text_should_clauses(query: str, query_language: str | None) -> list[dict[str, Any]]:
    clauses = [{"text": {"query": query, "path": TEXT_PATHS}}]
    if query_language:
        path = LANGUAGE_MULTI.get(query_language.lower().split("-")[0])
        if path:
            clauses.append({"text": {"query": query, "path": path}})
        return clauses
    for path in LANGUAGE_MULTI.values():
        clauses.append({"text": {"query": query, "path": path}})
    return clauses


def _one_clause(field: str, value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict) and "$in" in value:
        values = list(value["$in"])
        if not values:
            return []
        return [{"in": {"path": field, "value": values}}]
    if isinstance(value, dict) and set(value) <= {"$gte", "$lte", "$gt", "$lt"}:
        clause: dict[str, Any] = {"path": field}
        for source, target in (("$gte", "gte"), ("$lte", "lte"), ("$gt", "gt"), ("$lt", "lt")):
            if source in value:
                clause[target] = value[source]
        return [{"range": clause}]
    if isinstance(value, datetime):
        return [{"equals": {"path": field, "value": value}}]
    return [{"equals": {"path": field, "value": value}}]
