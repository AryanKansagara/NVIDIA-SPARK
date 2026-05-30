from pydantic import BaseModel


class GeocodeResponse(BaseModel):
    address: str
    normalized_address: str
    latitude: float
    longitude: float
    source: str
    raw_display_name: str | None = None


class HeritageDebugResponse(BaseModel):
    address: str
    normalized_address: str
    latitude: float
    longitude: float
    status: str
    reason: str
    source: str


class FloodDebugResponse(BaseModel):
    address: str
    normalized_address: str
    latitude: float
    longitude: float
    status: str
    in_flood_zone: bool
    source: str


class DevelopmentDebugResponse(BaseModel):
    address: str
    normalized_address: str
    latitude: float
    longitude: float
    application_count_500m: int
    intensity: str
    source: str
