import os
from functools import lru_cache

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.config import get_settings
from app.services.speech.asr_service import ASRService, ASRUnavailable

router = APIRouter()


@lru_cache
def _asr() -> ASRService:
    return ASRService(get_settings())


class TranscribeResponse(BaseModel):
    text: str


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(audio: UploadFile = File(...)) -> TranscribeResponse:
    service = _asr()
    if not service.is_configured():
        raise HTTPException(status_code=503, detail="Speech-to-text is not available on this device.")

    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio upload.")

    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    try:
        text = await service.transcribe(data, suffix=suffix)
    except ASRUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return TranscribeResponse(text=text)
