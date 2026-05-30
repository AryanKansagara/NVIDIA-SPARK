"""
app.rag — Meridian legislative knowledge base (RAG layer).

Public surface:
    from app.rag import rag_startup, retrieve, build_rag_context, ReportSignals, build_query_from_report
"""

from app.rag.service import startup as rag_startup, retrieve, is_ready
from app.rag.prompt import build_rag_context, ReportSignals, build_query_from_report

__all__ = [
    "rag_startup",
    "retrieve",
    "is_ready",
    "build_rag_context",
    "ReportSignals",
    "build_query_from_report",
]
