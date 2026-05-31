"""Memory orchestration for the chatbot.

Short-term: rolling conversation buffer (DuckDB chat_turns).
Long-term structured: the user_profile row (economic situation).
Long-term episodic: ChromaDB user_memories, embedded locally.

All reasoning/extraction uses the single local Nemotron LLM on :8080 — no API.
"""
from __future__ import annotations

import json
import logging

import httpx

from app.core.config import Settings
from app.services.memory.episodic_store import EpisodicStore
from app.services.storage.app_store import get_app_store

logger = logging.getLogger(__name__)

_EXTRACT_PROMPT = """\
You extract durable facts about a home buyer from a single chat message. Return a JSON array \
of short fact strings worth remembering long-term (budget ceilings, cash on hand, risk tolerance, \
preferred or must-avoid neighborhoods, income, life situation). If nothing durable is stated, \
return []. Output ONLY the JSON array."""

_CHAT_SYSTEM = """\
You are Meridian's assistant — you help a Toronto home buyer reason about the true cost of \
ownership. You are given the user's profile, relevant remembered facts, and recent conversation. \
Be direct and concrete; use the buyer's economic situation. Never invent specific dollar figures \
that were not provided. Keep replies concise."""


class MemoryService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.episodic = EpisodicStore(settings)

    def _store(self):
        return get_app_store(self.settings.duckdb_path)

    async def _llm(self, messages: list[dict], max_tokens: int = 400, temperature: float = 0.3) -> str:
        payload = {
            "model": self.settings.nim_model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
            # Reasoning model — keep `content` to the direct reply / JSON, no chain-of-thought.
            "chat_template_kwargs": {"enable_thinking": False},
        }
        async with httpx.AsyncClient(timeout=self.settings.nim_timeout_seconds) as client:
            resp = await client.post(f"{self.settings.nim_local_url}/chat/completions", json=payload)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()

    async def recall(self, session_id: str, query: str) -> dict:
        store = self._store()
        return {
            "profile": store.get_profile() or {},
            "episodic": await self.episodic.recall(query),
            "recent_turns": store.recent_turns(session_id),
        }

    async def remember(self, message: str) -> None:
        """Extract durable facts from a user message and write them to episodic memory."""
        try:
            raw = await self._llm(
                [
                    {"role": "system", "content": _EXTRACT_PROMPT},
                    {"role": "user", "content": message},
                ],
                max_tokens=200,
            )
            facts = json.loads(raw)
        except Exception as exc:
            logger.warning("Memory extraction failed: %s", exc)
            return
        if isinstance(facts, list):
            for fact in facts:
                if isinstance(fact, str) and fact.strip():
                    await self.episodic.add(fact.strip())

    async def chat(
        self,
        session_id: str,
        message: str,
        law_context: list[str] | None = None,
        web_context: list[str] | None = None,
        report_context: str | None = None,
    ) -> str:
        store = self._store()
        store.add_turn(session_id, "user", message)
        context = await self.recall(session_id, message)

        system = _CHAT_SYSTEM
        ctx_parts: list[str] = []
        if report_context:
            ctx_parts.append(
                "The user is currently viewing this Meridian property report. Answer "
                "their questions about it using these exact figures:\n" + report_context
            )
        if context["profile"]:
            ctx_parts.append(f"User profile: {json.dumps(context['profile'])}")
        if context["episodic"]:
            ctx_parts.append("Remembered facts:\n- " + "\n- ".join(context["episodic"]))
        if law_context:
            ctx_parts.append("Relevant Toronto land-law context:\n- " + "\n- ".join(law_context))
        if web_context:
            ctx_parts.append(
                "Real-time web search results (cite these for current facts):\n- "
                + "\n- ".join(web_context)
            )
        if ctx_parts:
            system = system + "\n\n" + "\n\n".join(ctx_parts)

        messages = [{"role": "system", "content": system}]
        messages.extend(context["recent_turns"])  # already includes the just-added user turn
        reply = await self._llm(messages, max_tokens=500)

        store.add_turn(session_id, "assistant", reply)
        return reply
