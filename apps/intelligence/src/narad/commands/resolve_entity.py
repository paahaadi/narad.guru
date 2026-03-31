from __future__ import annotations

from narad.services.entity_resolver import EntityResolver


async def resolve_entity_name(entity_resolver: EntityResolver, name: str) -> None:
    return await entity_resolver.resolve(name)
