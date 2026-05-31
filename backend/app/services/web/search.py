"""Opt-in web search wrapper for the chat assistant.

The local Nemotron model has no internet access. When the user enables the web
toggle, we run a real DuckDuckGo search (no API key) and feed the results back
into the conversation as grounded context. Only the query string leaves the
device — never the buyer's profile or financial details.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from app.core.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class WebResult:
    title: str
    url: str
    snippet: str

    def as_context(self) -> str:
        return f"{self.title} — {self.snippet} ({self.url})"


class WebSearchService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def search(self, query: str, max_results: int | None = None) -> list[WebResult]:
        n = max_results or self.settings.web_search_max_results
        try:
            return await asyncio.to_thread(self._search_sync, query, n)
        except Exception as exc:  # network down, rate limit, etc. — degrade gracefully
            logger.warning("Web search failed (%s) — continuing without web context", exc)
            return []

    def _search_sync(self, query: str, n: int) -> list[WebResult]:
        from ddgs import DDGS

        out: list[WebResult] = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=n):
                out.append(
                    WebResult(
                        title=r.get("title", ""),
                        url=r.get("href", ""),
                        snippet=r.get("body", ""),
                    )
                )
        return out
