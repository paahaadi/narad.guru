"""Verify Tier 2 adapters register when credentials are available."""
from __future__ import annotations

import pytest
from unittest.mock import patch

from narad.adapters.registry import AdapterRegistry


@pytest.fixture
def settings_with_tier2_keys():
    """Settings mock with all Tier 2 API credentials populated."""
    from narad.config import get_settings
    settings = get_settings()
    # Patch in test credentials
    with patch.object(settings, "acled_api_key", "test-acled-key"), \
         patch.object(settings, "acled_email", "test@example.com"), \
         patch.object(settings, "firms_map_key", "test-firms-key"), \
         patch.object(settings, "gdelt_enabled", True), \
         patch.object(settings, "opensky_username", ""), \
         patch.object(settings, "opensky_password", ""):
        yield settings


@pytest.fixture
def settings_without_tier2_keys():
    """Settings mock with no Tier 2 API credentials."""
    from narad.config import get_settings
    settings = get_settings()
    with patch.object(settings, "acled_api_key", ""), \
         patch.object(settings, "acled_email", ""), \
         patch.object(settings, "firms_map_key", ""), \
         patch.object(settings, "gdelt_enabled", False), \
         patch.object(settings, "opensky_username", ""), \
         patch.object(settings, "opensky_password", ""):
        yield settings


def test_tier2_adapters_registered_when_keys_present(settings_with_tier2_keys):
    registry = AdapterRegistry(settings_with_tier2_keys)
    slugs = [a.definition.slug for a in registry.list()]
    assert "acled" in slugs
    assert "firms" in slugs
    assert "gdelt" in slugs


def test_tier2_adapters_skipped_when_keys_missing(settings_without_tier2_keys):
    registry = AdapterRegistry(settings_without_tier2_keys)
    slugs = [a.definition.slug for a in registry.list()]
    assert "acled" not in slugs
    assert "firms" not in slugs
    assert "gdelt" not in slugs


def test_opensky_always_registered(settings_with_tier2_keys):
    """OpenSky has an unauthenticated mode — always register."""
    registry = AdapterRegistry(settings_with_tier2_keys)
    slugs = [a.definition.slug for a in registry.list()]
    assert "opensky" in slugs


def test_tier1_adapters_still_present(settings_with_tier2_keys):
    registry = AdapterRegistry(settings_with_tier2_keys)
    slugs = [a.definition.slug for a in registry.list()]
    for slug in ["pib_rss", "sebi_rss", "bse_rss", "nse_rss", "egazette", "imd", "cwc", "india_code"]:
        assert slug in slugs
