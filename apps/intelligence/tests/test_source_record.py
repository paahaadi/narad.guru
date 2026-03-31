from __future__ import annotations

from uuid import uuid4

from narad.db.models import SourceRecord


def test_source_record_parses_json_config_strings() -> None:
    record = SourceRecord.model_validate(
        {
            "id": uuid4(),
            "tenant_id": uuid4(),
            "name": "PIB RSS",
            "slug": "pib_rss",
            "source_type": "rss",
            "trust_tier": 1,
            "authority_level": "primary",
            "governance_approved": True,
            "is_active": True,
            "config": '{"rss_url": "https://example.com/feed.xml"}',
        }
    )

    assert record.config == {"rss_url": "https://example.com/feed.xml"}
