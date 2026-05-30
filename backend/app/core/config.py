from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Meridian Backend"
    geocoder_base_url: str = "https://nominatim.openstreetmap.org/search"
    geocoder_user_agent: str = "meridian-hackathon/0.1"
    geocoder_country_codes: str = "ca"
    geocoder_city_bias: str = "Toronto, Ontario, Canada"
    request_timeout_seconds: float = Field(default=12.0, gt=0)
    property_tax_rate: float = 0.00767311
    property_tax_growth_rate: float = 0.035
    transit_dividend_downtown: int = 87000
    transit_dividend_default: int = 28000
    flood_risk_internal_loading: int = 2500   # internal cost estimate only — never surface in output
    trca_flood_fallback_geojson: str = "data/trca_floodplain_toronto.geojson"
    nim_base_url: str = "http://localhost:8080/v1"
    nim_model: str = "meta/llama-3.1-8b-instruct"
    nim_enabled: bool = True
    nim_timeout_seconds: float = 45.0
    rag_enabled: bool = True
    rag_embedding_model: str = "nvidia/llama-3.2-nv-embedqa-1b-v2"
    rag_vector_store_path: str = "data/vector_store"
    rag_land_laws_dir: str = "data/land_laws"
    rag_n_results: int = 3
    rag_chunk_size: int = 800
    rag_chunk_overlap: int = 100
    trca_flood_query_url: str = (
        "https://services1.arcgis.com/pMeXFF5bmbv34Alm/arcgis/rest/services/"
        "Floodline_TRCA_Polygon/FeatureServer/0/query"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
