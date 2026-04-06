from __future__ import annotations

import json

from narad.adapters.base import BaseSourceAdapter
from narad.adapters.tier1.bse import BseAdapter
from narad.adapters.tier1.cwc import CwcAdapter
from narad.adapters.tier1.egazette import EgazetteAdapter
from narad.adapters.tier1.imd import ImdAdapter
from narad.adapters.tier1.india_code import IndiaCodeAdapter
from narad.adapters.tier1.nse import NseAdapter
from narad.adapters.tier1.pib import PIBAdapter
from narad.adapters.tier1.sebi import SebiAdapter
from narad.adapters.tier2.acled import AcledAdapter
from narad.adapters.tier2.firms import FirmsAdapter
from narad.adapters.tier2.gdelt import GdeltAdapter
from narad.adapters.tier2.google_news import GoogleNewsAdapter
from narad.adapters.tier2.news_api import NewsApiAdapter
from narad.adapters.tier2.opensky import OpenSkyAdapter
from narad.adapters.tier3.reddit import RedditAdapter
from narad.adapters.tier3.twitter import TwitterAdapter
from narad.config import Settings
from narad.db.models import SourceRecord
from narad.db.session import Database


class AdapterRegistry:
    def __init__(self, settings: Settings) -> None:
        self._adapters: dict[str, BaseSourceAdapter] = {}

        # --- Tier 1: always registered (government / official) ---
        for adapter in (
            PIBAdapter(settings),
            SebiAdapter(settings),
            BseAdapter(settings),
            NseAdapter(settings),
            EgazetteAdapter(settings),
            ImdAdapter(settings),
            CwcAdapter(settings),
            IndiaCodeAdapter(settings),
        ):
            self._adapters[adapter.definition.slug] = adapter

        # --- Tier 2: credential-gated ---
        if settings.acled_api_key and settings.acled_email:
            acled = AcledAdapter(settings)
            self._adapters[acled.definition.slug] = acled

        if settings.firms_map_key:
            firms = FirmsAdapter(settings)
            self._adapters[firms.definition.slug] = firms

        if settings.gdelt_enabled:
            gdelt = GdeltAdapter(settings)
            self._adapters[gdelt.definition.slug] = gdelt

        # Google News (always registered, no auth required)
        google_news = GoogleNewsAdapter(settings)
        self._adapters[google_news.definition.slug] = google_news

        # NewsAPI (credential-gated)
        if settings.newsapi_key:
            news_api = NewsApiAdapter(settings)
            self._adapters[news_api.definition.slug] = news_api

        # OpenSky supports unauthenticated mode — always register
        opensky = OpenSkyAdapter(settings)
        self._adapters[opensky.definition.slug] = opensky

        # --- Tier 3: SOCMINT (Twitter/Reddit) ---
        # Twitter requires bearer token
        if settings.twitter_bearer_token:
            twitter = TwitterAdapter(settings)
            self._adapters[twitter.definition.slug] = twitter

        # Reddit (registers as long as a user agent is present, or defaults)
        reddit = RedditAdapter(settings)
        self._adapters[reddit.definition.slug] = reddit

    def list(self) -> list[BaseSourceAdapter]:
        return list(self._adapters.values())

    def get(self, slug: str) -> BaseSourceAdapter:
        try:
            return self._adapters[slug]
        except KeyError as exc:
            raise KeyError(f"No adapter registered for slug '{slug}'") from exc

    async def ensure_sources(self, database: Database) -> list[SourceRecord]:
        tenant_id = await database.resolve_default_tenant_id()
        records: list[SourceRecord] = []
        for adapter in self.list():
            definition = adapter.definition
            row = await database.fetchrow(
                """
                INSERT INTO core.sources (
                    tenant_id,
                    name,
                    slug,
                    source_type,
                    trust_tier,
                    authority_level,
                    update_cadence_seconds,
                    base_url,
                    config,
                    governance_approved,
                    is_active
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
                ON CONFLICT (tenant_id, slug)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    source_type = EXCLUDED.source_type,
                    trust_tier = EXCLUDED.trust_tier,
                    authority_level = EXCLUDED.authority_level,
                    update_cadence_seconds = EXCLUDED.update_cadence_seconds,
                    base_url = EXCLUDED.base_url,
                    config = EXCLUDED.config,
                    governance_approved = EXCLUDED.governance_approved,
                    is_active = EXCLUDED.is_active
                RETURNING
                    id,
                    tenant_id,
                    name,
                    slug,
                    source_type,
                    trust_tier,
                    authority_level,
                    is_active,
                    governance_approved,
                    base_url,
                    update_cadence_seconds,
                    last_polled_at,
                    last_success_at,
                    last_successful_fetch,
                    last_error,
                    consecutive_failures,
                    status,
                    documents_fetched_total,
                    events_produced_total,
                    config
                """,
                tenant_id,
                definition.name,
                definition.slug,
                definition.source_type,
                definition.trust_tier,
                definition.authority_level,
                definition.update_cadence_seconds,
                definition.base_url,
                json.dumps(definition.config),
                definition.governance_approved,
                definition.is_active,
                tenant_id=tenant_id,
            )
            if row is not None:
                records.append(
                    SourceRecord.model_validate(
                        {
                            **dict(row),
                            "documents_ingested_24h": 0,
                            "circuit_breaker_state": "open" if row["status"] == "degraded" else "closed",
                        }
                    )
                )
        return records
