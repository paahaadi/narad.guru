from __future__ import annotations

import json

from pydantic import BaseModel
from redis.asyncio import Redis


class EventPublisher:
    def __init__(self, redis_client: Redis) -> None:
        self._redis = redis_client

    async def publish(self, channel: str, payload: BaseModel | dict[str, object]) -> int:
        message = json.dumps(payload.model_dump(mode="json")) if isinstance(payload, BaseModel) else json.dumps(payload)
        return await self._redis.publish(channel, message)
