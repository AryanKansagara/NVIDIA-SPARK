"""
Meridian RAG — async document fetcher.

Uses httpx (already a Meridian dependency) for all HTTP work.
Uses pypdf (already a Meridian dependency) for PDF text extraction.
Falls back gracefully so a single unavailable source doesn't abort indexing.
"""

from __future__ import annotations

import io
import logging
import re

import httpx
from pypdf import PdfReader

from app.rag.sources import RagSource

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; Meridian-RAG/1.0; "
        "+https://github.com/AryanKansagara/NVIDIA-SPARK)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/pdf",
}

# Timeout slightly generous — Ontario law pages can be slow
_TIMEOUT = httpx.Timeout(45.0, connect=10.0)


async def fetch_source(source: RagSource, client: httpx.AsyncClient) -> str | None:
    """
    Fetch and extract plain text from a RagSource.
    Returns None on any failure (caller decides whether to abort or skip).
    """
    try:
        if source.fetch_type == "pdf":
            return await _fetch_pdf(source.url, client)
        return await _fetch_html(source.url, client)
    except Exception as exc:
        logger.warning("RAG fetch failed for %s: %s", source.id, exc)
        return None


async def _fetch_html(url: str, client: httpx.AsyncClient) -> str:
    resp = await client.get(url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
    resp.raise_for_status()

    html = resp.text

    # Lightweight HTML → text without an external parser dependency.
    # Remove <script>, <style>, <nav>, <footer>, <header> blocks entirely.
    for tag in ("script", "style", "nav", "footer", "header", "noscript"):
        html = re.sub(
            rf"<{tag}[^>]*>.*?</{tag}>",
            " ",
            html,
            flags=re.DOTALL | re.IGNORECASE,
        )

    # Strip remaining tags
    text = re.sub(r"<[^>]+>", " ", html)

    # Collapse whitespace
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


async def _fetch_pdf(url: str, client: httpx.AsyncClient) -> str:
    resp = await client.get(url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
    resp.raise_for_status()

    reader = PdfReader(io.BytesIO(resp.content))
    pages: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        pages.append(page_text)

    return "\n\n".join(pages).strip()
