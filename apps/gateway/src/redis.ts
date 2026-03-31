import { createClient } from "redis";
import type { DeltaEnvelope } from "./contracts.js";
import { NARAD_DELTA_PATTERN } from "./channels.js";

type RedisClient = ReturnType<typeof createClient>;

export type RedisBridge = {
  publisher: RedisClient;
  subscriber: RedisClient;
  connect: () => Promise<void>;
  close: () => Promise<void>;
  subscribeToNaradDeltas: (onDelta: (envelope: DeltaEnvelope) => void) => Promise<() => Promise<void>>;
};

export function createRedisBridge(redisUrl: string): RedisBridge {
  const publisher = createClient({ url: redisUrl });
  const subscriber = publisher.duplicate();

  return {
    publisher,
    subscriber,
    async connect() {
      if (!publisher.isOpen) {
        await publisher.connect();
      }
      if (!subscriber.isOpen) {
        await subscriber.connect();
      }
    },
    async close() {
      if (subscriber.isOpen) {
        await subscriber.quit();
      }
      if (publisher.isOpen) {
        await publisher.quit();
      }
    },
    async subscribeToNaradDeltas(onDelta: (envelope: DeltaEnvelope) => void) {
      const handler = (rawMessage: string) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawMessage);
        } catch {
          return;
        }

        if (typeof parsed !== "object" || parsed === null) {
          return;
        }

        const candidate = parsed as Record<string, unknown>;
        if (
          typeof candidate.channel !== "string" ||
          typeof candidate.tenant_id !== "string" ||
          typeof candidate.entity_type !== "string" ||
          typeof candidate.entity_id !== "string" ||
          typeof candidate.timestamp !== "string" ||
          typeof candidate.changes !== "object" ||
          candidate.changes === null
        ) {
          return;
        }

        onDelta({
          channel: candidate.channel,
          tenant_id: candidate.tenant_id,
          entity_type: candidate.entity_type as DeltaEnvelope["entity_type"],
          entity_id: candidate.entity_id,
          changes: candidate.changes as Record<string, unknown>,
          timestamp: candidate.timestamp,
        });
      };

      await subscriber.pSubscribe(NARAD_DELTA_PATTERN, handler);

      return async () => {
        await subscriber.pUnsubscribe(NARAD_DELTA_PATTERN, handler);
      };
    },
  };
}
