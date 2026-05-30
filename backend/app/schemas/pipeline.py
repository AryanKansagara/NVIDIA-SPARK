from datetime import datetime

from pydantic import BaseModel


class PipelineRefreshRequest(BaseModel):
    force: bool = False


class PipelineRefreshResponse(BaseModel):
    status: str
    heritage_rows: int
    development_rows: int
    duration_seconds: float
    refreshed_at: datetime
    parquet_paths: dict[str, str]
    warnings: list[str]
