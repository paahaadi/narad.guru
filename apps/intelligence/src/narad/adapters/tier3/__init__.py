"""
Tier 3 — Controlled Ingestion Adapters
=======================================
Track 4C: Tier 3 adapters for restricted/licensed data feeds.

These adapters are STUBS that define the governance contract.
They will only produce documents once real licensed credentials are
configured in the environment. Until then they return empty lists
and log a governance warning.

Governance rules hard-wired into every Tier 3 adapter:
  - trust_tier = 3
  - governance_approved = False (must be explicitly flipped by admin)
  - is_active = False (must be explicitly enabled after license validation)
  - source_class = 'source-of-record' | 'weak-signal' depending on feed
  - sensitivity_class = 'restricted' | 'licensed' | 'socmint'
  - review_required = True (all Tier 3 documents enter the review queue)
  - volatility_flag = True (content may be subject to takedown)
  - publication_eligible = False until governance gate is passed
"""
from narad.adapters.tier3.ais_commercial import CommercialAisAdapter
from narad.adapters.tier3.socmint_public import SocmintPublicAdapter

__all__ = [
    "CommercialAisAdapter",
    "SocmintPublicAdapter",
]
