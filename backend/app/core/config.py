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
    assessed_value_factor: float = 0.60
    property_tax_growth_rate: float = 0.03
    transit_dividend_downtown: int = 87000
    transit_dividend_default: int = 28000
    flood_risk_annual_loading: int = 3500

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
