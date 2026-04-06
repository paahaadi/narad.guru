"""Runtime configuration for the intelligence plane."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Pydantic settings backed by environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "narad-intelligence"
    app_version: str = "0.1.0"
    environment: str = "development"
    intelligence_port: int = Field(default=8000, alias="INTELLIGENCE_PORT")

    database_url: str = Field(
        default="postgresql://narad_worker:change_me_worker_password@localhost:6432/narad_v2",
        alias="DATABASE_URL",
    )
    database_direct_url: str = Field(
        default="postgresql://postgres:change_me_strong_password@localhost:5433/narad_v2",
        alias="DATABASE_DIRECT_URL",
    )
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    celery_broker_url: str = Field(default="redis://localhost:6379/3", alias="CELERY_BROKER_URL")
    celery_result_backend: str = Field(default="redis://localhost:6379/4", alias="CELERY_RESULT_BACKEND")

    database_pool_size: int = Field(default=20, alias="DATABASE_POOL_SIZE")
    database_pool_min_size: int = Field(default=5, alias="DATABASE_POOL_MIN_SIZE")
    celery_worker_concurrency: int = Field(default=4, alias="CELERY_WORKER_CONCURRENCY")
    celery_worker_prefetch_multiplier: int = Field(default=2, alias="CELERY_WORKER_PREFETCH_MULTIPLIER")
    celery_task_soft_time_limit: int = Field(default=300, alias="CELERY_TASK_SOFT_TIME_LIMIT")
    celery_task_time_limit: int = Field(default=600, alias="CELERY_TASK_TIME_LIMIT")
    broker_queue_names: tuple[str, ...] = ("default", "ingest", "enrichment", "projection", "maintenance")

    ingest_poll_interval_ms: int = Field(default=60_000, alias="INGEST_POLL_INTERVAL_MS")
    ingest_batch_size: int = Field(default=25, alias="INGEST_BATCH_SIZE")
    ingest_max_concurrent_sources: int = Field(default=8, alias="INGEST_MAX_CONCURRENT_SOURCES")
    default_source_poll_limit: int = Field(default=25, alias="DEFAULT_SOURCE_POLL_LIMIT")
    embed_batch_size: int = Field(default=50, alias="EMBED_BATCH_SIZE")
    embed_batch_window_ms: int = Field(default=30_000, alias="EMBED_BATCH_WINDOW_MS")
    feed_projection_batch_ms: int = Field(default=500, alias="FEED_PROJECTION_BATCH_MS")
    pulseboard_max_summary_chars: int = Field(default=320, alias="PULSEBOARD_MAX_SUMMARY_CHARS")

    default_event_type: str = Field(default="regulatory", alias="DEFAULT_EVENT_TYPE")
    default_event_severity: str = Field(default="medium", alias="DEFAULT_EVENT_SEVERITY")
    default_event_confidence: float = Field(default=0.65, alias="DEFAULT_EVENT_CONFIDENCE")

    llm_provider: str = Field(default="gemini", alias="LLM_PROVIDER")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    gemini_model_mid: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL_MID")
    gemini_model_large: str = Field(default="gemini-2.5-pro", alias="GEMINI_MODEL_LARGE")
    gemini_embedding_model: str = Field(default="text-embedding-004", alias="GEMINI_EMBEDDING_MODEL")
    gemini_max_rpm: int = Field(default=60, alias="GEMINI_MAX_RPM")
    gemini_timeout_seconds: int = Field(default=10, alias="GEMINI_TIMEOUT_SECONDS")

    embedding_provider: str = Field(default="gemini", alias="EMBEDDING_PROVIDER")
    embedding_model: str = Field(default="text-embedding-004", alias="EMBEDDING_MODEL")
    embedding_dimensions: int = Field(default=768, alias="EMBEDDING_DIMENSIONS")

    entity_trgm_threshold: float = Field(default=0.70, alias="ENTITY_TRGM_THRESHOLD")
    entity_auto_merge_threshold: float = Field(default=0.85, alias="ENTITY_AUTO_MERGE_THRESHOLD")
    entity_review_threshold: float = Field(default=0.60, alias="ENTITY_REVIEW_THRESHOLD")

    event_temporal_window_hours: int = Field(default=24, alias="EVENT_TEMPORAL_WINDOW_HOURS")
    event_spatial_proximity_km: int = Field(default=50, alias="EVENT_SPATIAL_PROXIMITY_KM")
    event_title_similarity_threshold: float = Field(default=0.70, alias="EVENT_TITLE_SIMILARITY_THRESHOLD")

    source_circuit_breaker_threshold: int = Field(default=5, alias="SOURCE_CIRCUIT_BREAKER_THRESHOLD")
    source_circuit_breaker_timeout: int = Field(default=1800, alias="SOURCE_CIRCUIT_BREAKER_TIMEOUT")
    source_max_backoff_seconds: int = Field(default=1800, alias="SOURCE_MAX_BACKOFF_SECONDS")

    bhashini_api_key: str = Field(default="", alias="BHASHINI_API_KEY")
    bhashini_user_id: str = Field(default="", alias="BHASHINI_USER_ID")
    bhashini_pipeline_id: str = Field(default="", alias="BHASHINI_PIPELINE_ID")
    bhashini_base_url: str = Field(default="https://dhruva-api.bhashini.gov.in", alias="BHASHINI_BASE_URL")
    bhashini_max_rpm: int = Field(default=30, alias="BHASHINI_MAX_RPM")
    bhashini_target_language: str = Field(default="en", alias="BHASHINI_TARGET_LANGUAGE")
    bhashini_timeout_seconds: int = Field(default=20, alias="BHASHINI_TIMEOUT_SECONDS")

    entity_narrative_ttl_hours: int = Field(default=24, alias="ENTITY_NARRATIVE_TTL_HOURS")
    rag_query_cache_ttl_hours: int = Field(default=6, alias="RAG_QUERY_CACHE_TTL_HOURS")
    rag_query_semantic_threshold: float = Field(default=0.15, alias="RAG_QUERY_SEMANTIC_THRESHOLD")
    sector_forecast_window_days: int = Field(default=90, alias="SECTOR_FORECAST_WINDOW_DAYS")

    pib_rss_url: str = Field(
        default="https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3",
        alias="PIB_RSS_URL",
    )
    default_tenant_id: str | None = Field(default=None, alias="DEFAULT_TENANT_ID")

    acled_api_key: str = Field(default="", alias="ACLED_API_KEY")
    acled_email: str = Field(default="", alias="ACLED_EMAIL")
    firms_map_key: str = Field(default="", alias="FIRMS_MAP_KEY")
    opensky_username: str = Field(default="", alias="OPENSKY_USERNAME")
    opensky_password: str = Field(default="", alias="OPENSKY_PASSWORD")
    gdelt_enabled: bool = Field(default=True, alias="GDELT_ENABLED")

    # Track 4D — AI Intelligence Assistant internal auth
    internal_api_key: str = Field(default="", alias="INTERNAL_API_KEY")

    # Track 4C — Tier 3 licensed source credentials
    ais_commercial_api_key: str = Field(default="", alias="AIS_COMMERCIAL_API_KEY")
    ais_commercial_base_url: str = Field(default="", alias="AIS_COMMERCIAL_BASE_URL")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached settings instance."""

    return Settings()
