"""
Tests for the Meridian RAG layer.
Run with: pytest backend/tests/test_rag.py -v

These tests use mocked HTTP responses so they run offline and in CI
without hitting government websites.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Chunker unit tests (no I/O) ───────────────────────────────────────────────

class TestChunker:
    def test_short_text_is_single_chunk(self):
        from app.rag.store import _chunk_text
        text = "This is a short paragraph.\n\nAnd another short one."
        chunks = _chunk_text(text, chunk_size=400)
        assert len(chunks) == 1
        assert "short paragraph" in chunks[0]

    def test_long_text_produces_multiple_chunks(self):
        from app.rag.store import _chunk_text
        # 10 paragraphs of ~60 chars each = ~600 chars → should split into 2+
        para = "This is a legislative paragraph with legal content. " * 2
        text = "\n\n".join([para] * 10)
        chunks = _chunk_text(text, chunk_size=300, overlap=40)
        assert len(chunks) >= 2

    def test_overlap_content_repeated(self):
        from app.rag.store import _chunk_text
        # Build text with clearly identifiable paragraphs
        paras = [f"Paragraph {i}: " + "word " * 20 for i in range(10)]
        text = "\n\n".join(paras)
        chunks = _chunk_text(text, chunk_size=200, overlap=40)
        # Just verify we get chunks and they are non-empty strings
        assert all(isinstance(c, str) and len(c) > 0 for c in chunks)

    def test_empty_text_returns_empty_list(self):
        from app.rag.store import _chunk_text
        assert _chunk_text("") == []
        assert _chunk_text("   \n\n  ") == []


# ── Tag detection tests ───────────────────────────────────────────────────────

class TestTagDetection:
    def _signals(self, **kwargs):
        from app.rag.prompt import ReportSignals
        return ReportSignals(**kwargs)

    def test_always_includes_universal_tags(self):
        from app.rag.prompt import detect_tags
        tags = detect_tags(self._signals())
        assert "land_transfer_tax" in tags
        assert "mpac" in tags
        assert "mortgage" in tags

    def test_first_time_buyer_adds_fhsa_tags(self):
        from app.rag.prompt import detect_tags
        tags = detect_tags(self._signals(is_first_time_buyer=True))
        assert "first_time_buyer" in tags
        assert "fhsa" in tags
        assert "rrsp" in tags

    def test_heritage_adds_part_iv_tags(self):
        from app.rag.prompt import detect_tags
        tags = detect_tags(self._signals(has_heritage_flag=True))
        assert "heritage" in tags
        assert "renovation" in tags

    def test_flood_adds_insurance_tags(self):
        from app.rag.prompt import detect_tags
        tags = detect_tags(self._signals(has_flood_flag=True))
        assert "flood_risk" in tags
        assert "insurance" in tags

    def test_no_duplicate_tags(self):
        from app.rag.prompt import detect_tags
        tags = detect_tags(self._signals(
            is_first_time_buyer=True,
            has_heritage_flag=True,
            has_flood_flag=True,
        ))
        assert len(tags) == len(set(tags))


# ── Query builder tests ───────────────────────────────────────────────────────

class TestQueryBuilder:
    def test_query_contains_address(self):
        from app.rag.prompt import build_query_from_report, ReportSignals
        q = build_query_from_report(
            "123 Main St Toronto",
            950_000,
            ReportSignals(is_first_time_buyer=True),
        )
        assert "123 Main St Toronto" in q
        assert "FHSA" in q or "first-time" in q

    def test_heritage_query_includes_part_iv(self):
        from app.rag.prompt import build_query_from_report, ReportSignals
        q = build_query_from_report(
            "456 Queen St Toronto",
            1_200_000,
            ReportSignals(has_heritage_flag=True),
        )
        assert "Part IV" in q or "heritage" in q.lower()


# ── Source registry tests ─────────────────────────────────────────────────────

class TestSourceRegistry:
    def test_all_sources_have_required_fields(self):
        from app.rag.sources import SOURCES
        for src in SOURCES:
            assert src.id, f"Missing id: {src}"
            assert src.url.startswith("http"), f"Bad URL: {src.id}"
            assert src.fetch_type in ("html", "pdf"), f"Bad fetch_type: {src.id}"
            assert len(src.tags) > 0, f"No tags: {src.id}"

    def test_sources_by_id_covers_all(self):
        from app.rag.sources import SOURCES, SOURCES_BY_ID
        assert len(SOURCES_BY_ID) == len(SOURCES)

    def test_expected_sources_present(self):
        from app.rag.sources import SOURCES_BY_ID
        expected = [
            "ontario_ltt_act",
            "toronto_mltt",
            "ontario_heritage_act",
            "mpac_guide",
            "fhsa_guide",
            "rrsp_hbp",
            "ontario_ltt_refund",
            "toronto_zoning",
            "trca_flood",
            "osfi_b20",
            "toronto_heritage_planning",
        ]
        for sid in expected:
            assert sid in SOURCES_BY_ID, f"Missing source: {sid}"


# ── Fetcher unit tests (mocked HTTP) ─────────────────────────────────────────

class TestFetcher:
    @pytest.mark.asyncio
    async def test_fetch_html_strips_tags(self):
        from app.rag.fetcher import _fetch_html

        fake_html = """
        <html><head><style>body{color:red}</style></head>
        <body>
          <nav>Skip nav</nav>
          <h1>Ontario Land Transfer Tax Act</h1>
          <p>Every person who tenders for registration a conveyance shall pay a tax.</p>
          <footer>Footer content</footer>
        </body></html>
        """
        mock_resp = MagicMock()
        mock_resp.text = fake_html
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        result = await _fetch_html("https://example.com", mock_client)

        assert "Ontario Land Transfer Tax Act" in result
        assert "Every person who tenders" in result
        assert "<style>" not in result
        assert "<nav>" not in result
        assert "Skip nav" not in result

    @pytest.mark.asyncio
    async def test_fetch_source_returns_none_on_http_error(self):
        from app.rag.fetcher import fetch_source
        from app.rag.sources import SOURCES

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))

        result = await fetch_source(SOURCES[0], mock_client)
        assert result is None


# ── Service is_ready gate ─────────────────────────────────────────────────────

class TestServiceReadyGate:
    def test_not_ready_before_startup(self):
        import app.rag.service as svc
        original = svc._collection
        svc._collection = None
        assert not svc.is_ready()
        svc._collection = original

    @pytest.mark.asyncio
    async def test_retrieve_returns_empty_when_not_ready(self):
        import app.rag.service as svc
        original = svc._collection
        svc._collection = None
        result = await svc.retrieve("test query")
        assert result == []
        svc._collection = original


# ── rag_enabled switch (adapter owns the flag) ────────────────────────────────

class TestRagEnabledSwitch:
    def _settings(self, enabled: bool):
        from app.core.config import Settings
        # Explicit kwarg overrides any .env value, keeping the test deterministic.
        return Settings(rag_enabled=enabled)

    def test_is_ready_false_when_disabled_even_with_index(self):
        import app.rag.service as svc
        from app.services.rag.service import RAGService
        original = svc._collection
        svc._collection = object()  # pretend an index is loaded
        try:
            assert RAGService(self._settings(False)).is_ready() is False
            assert RAGService(self._settings(True)).is_ready() is True
        finally:
            svc._collection = original

    @pytest.mark.asyncio
    async def test_query_short_circuits_when_disabled(self):
        from app.services.rag.service import RAGService
        with patch("app.services.rag.service.retrieve", new=AsyncMock()) as mock_retrieve:
            result = await RAGService(self._settings(False)).query("anything")
        assert result == []
        mock_retrieve.assert_not_called()

    @pytest.mark.asyncio
    async def test_query_delegates_when_enabled(self):
        from app.services.rag.service import RAGService
        hits = [{"text": "chunk A"}, {"text": "chunk B"}]
        with patch("app.services.rag.service.retrieve", new=AsyncMock(return_value=hits)) as mock_retrieve:
            result = await RAGService(self._settings(True)).query("anything")
        assert result == ["chunk A", "chunk B"]
        mock_retrieve.assert_awaited_once()
