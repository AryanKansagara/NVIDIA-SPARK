from dataclasses import dataclass

import httpx

from app.core.config import Settings


class GeocodingError(RuntimeError):
    pass


@dataclass
class GeocodeResult:
    address: str
    normalized_address: str
    latitude: float
    longitude: float
    source: str
    raw_display_name: str | None = None


class GeocodingService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def geocode(self, address: str) -> GeocodeResult:
        query = f"{address}, {self.settings.geocoder_city_bias}"
        params = {
            "q": query,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": self.settings.geocoder_country_codes,
        }
        headers = {"User-Agent": self.settings.geocoder_user_agent}

        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            response = await client.get(
                self.settings.geocoder_base_url,
                params=params,
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json()

        if not payload:
            raise GeocodingError(f"No geocoding result found for address: {address}")

        top = payload[0]
        return GeocodeResult(
            address=address,
            normalized_address=self._normalize(address),
            latitude=float(top["lat"]),
            longitude=float(top["lon"]),
            source="nominatim",
            raw_display_name=top.get("display_name"),
        )

    async def suggest(self, query_str: str) -> list[dict]:
        if not query_str or len(query_str.strip()) < 3:
            return []

        query = f"{query_str}, {self.settings.geocoder_city_bias}"
        params = {
            "q": query,
            "format": "jsonv2",
            "limit": 5,
            "countrycodes": self.settings.geocoder_country_codes,
        }
        headers = {"User-Agent": self.settings.geocoder_user_agent}

        try:
            async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                response = await client.get(
                    self.settings.geocoder_base_url,
                    params=params,
                    headers=headers,
                )
                response.raise_for_status()
                payload = response.json()

            results = []
            for item in payload:
                display_name = item.get("display_name", "")
                results.append({
                    "address": display_name,
                    "display_name": display_name,
                    "latitude": float(item["lat"]) if "lat" in item else None,
                    "longitude": float(item["lon"]) if "lon" in item else None,
                })
            return results
        except Exception:
            return []

    def _normalize(self, address: str) -> str:
        return " ".join(address.upper().split())
