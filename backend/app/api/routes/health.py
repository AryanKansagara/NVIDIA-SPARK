import httpx
from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter()


async def _probe(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{url}/models")
            return resp.status_code == 200
    except Exception:
        return False


@router.get("/health")
async def health() -> dict:
    settings = get_settings()
    llm_local = await _probe(settings.nim_local_url)
    embeddings_local = await _probe(settings.embedding_local_url)
    return {
        "status": "ok",
        "llm_local": llm_local,
        "embeddings_local": embeddings_local,
        "model": settings.nim_model,
        "vector_backend": settings.vector_backend,
    }
