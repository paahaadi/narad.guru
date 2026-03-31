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
from narad.config import Settings
from narad.db.models import SourceRecord
from narad.db.session import Database


class AdapterRegistry:
    def __init__(self, settings: Settings) -> None:
        pib = PIBAdapter(settings)
        sebi = SebiAdapter(settings)
        bse = BseAdapter(settings)
        nse = NseAdapter(settings)
        egazette = EgazetteAdapter(settings)
        imd = ImdAdapter(settings)
        cwc = CwcAdapter(settings)
        india_code = IndiaCodeAdapter(settings)
        self._adapters: dict[str, BaseSourceAdapter] = {
            pib.definition.slug: pib,
            sebi.definition.slug: sebi,
            bse.definition.slug: bse,
            nse.definition.slug: nse,
            egazette.definition.slug: egazette,
            imd.definition.slug: imd,
            cwc.definition.slug: cwc,
            india_code.definition.slug: india_code,
        }

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
                    last_error
                    ,
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
