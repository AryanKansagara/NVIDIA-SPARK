from dataclasses import dataclass


@dataclass
class HeritageEvidence:
    status: str
    reason: str
    source: str


@dataclass
class FloodEvidence:
    in_flood_zone: bool
    annual_risk_loading: int
    source: str
    polygon_geojson: dict | None = None


@dataclass
class DevelopmentEvidence:
    application_count_500m: int
    intensity: str
    source: str
