import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Keep everything on-device: disable ChromaDB's anonymized usage telemetry before
# chromadb is imported anywhere. config.py is imported earliest across the app.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
os.environ.setdefault("CHROMA_TELEMETRY_IMPL", "none")


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
    # Local-only Nemotron LLM (vLLM, OpenAI-compatible). No hosted API, no API key.
    nim_local_url: str = "http://localhost:8080/v1"
    nim_model: str = "nemotron-3-nano-30b-a3b"
    nim_enabled: bool = True
    nim_timeout_seconds: float = 120.0
    # Local Nemotron RAG embedding server (OpenAI-compatible /embeddings).
    embedding_local_url: str = "http://localhost:8081/v1"
    rag_enabled: bool = True
    rag_embedding_model: str = "nvidia/llama-3.2-nv-embedqa-1b-v2"
    rag_vector_store_path: str = "data/vector_store"
    rag_land_laws_dir: str = "data/land_laws"
    # Vector search backend: "chroma" (CPU, default) or "cuvs" (NVIDIA GPU index
    # built from the Chroma store, with automatic Chroma fallback). ChromaDB is the
    # persistence layer either way. cuVS support lives in services/rag/cuvs_store.py.
    vector_backend: str = "chroma"
    rag_n_results: int = 3
    rag_chunk_size: int = 800
    rag_chunk_overlap: int = 100
    # Local NVIDIA reranker (vLLM `--task score`, OpenAI-compatible /rerank on :8082).
    # Over-fetch rag_candidate_k from the vector store, rerank, keep rag_n_results.
    # Degrades gracefully to vector-similarity order if the reranker is unreachable.
    rag_rerank_enabled: bool = True
    rerank_url: str = "http://localhost:8082/v1"
    rerank_model: str = "nvidia/llama-3.2-nv-rerankqa-1b-v2"
    rag_candidate_k: int = 12
    # Opt-in real-time web search (DuckDuckGo, no API key). Per-request toggle from
    # the chat UI; this flag gates the capability server-side. Only the query string
    # leaves the device — never the buyer's profile or financials.
    web_search_enabled: bool = True
    web_search_max_results: int = 4
    trca_flood_query_url: str = (
        "https://services6.arcgis.com/jr7MHa3BWLD2qqOB/arcgis/rest/services/"
        "Floodline_TRCA_Polygon/FeatureServer/0/query"
    )
    # DuckDB / Parquet pipeline
    duckdb_path: str = "data/meridian.duckdb"
    parquet_dir: str = "data/parquet"
    # GPU
    gpu_enabled: bool = True
    monte_carlo_n_sims: int = 10_000
    # LLM
    nemotron_model: str = "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-FP8"
    nemo_retriever_enabled: bool = False
    nemo_retriever_url: str = ""
    # On-device speech-to-text (NeMo Nemotron streaming ASR). Heavy deps (nemo/torch)
    # may be absent — the /transcribe route degrades to HTTP 503 and the UI hides its mic.
    asr_enabled: bool = True
    asr_model_path: str = (
        "/home/asus/Desktop/NVIDIA_SPARK_HACK/"
        "nvidia--nemotron-speech-streaming-en-0.6b/"
        "nemotron-speech-streaming-en-0.6b.nemo"
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
