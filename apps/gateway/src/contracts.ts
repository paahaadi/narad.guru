export type JwtClaims = {
  sub: string;
  tenant_id: string;
  role: string;
  clearance_level: string;
  iss: string;
  exp: number;
  [key: string]: unknown;
};

export type EntityType = "event" | "watchlist" | "entity" | "regulatory_digest";

export type DeltaEnvelope = {
  channel: string;
  tenant_id: string;
  entity_type: EntityType;
  entity_id: string;
  changes: Record<string, unknown>;
  timestamp: string;
};

export type GatewayMessage =
  | {
      type: "delta";
      payload: DeltaEnvelope;
    }
  | {
      type: "hello";
      payload: {
        tenant_id: string;
        sub: string;
        role: string;
        clearance_level: string;
      };
    }
  | {
      type: "error";
      payload: {
        code: string;
        message: string;
      };
    };

export type ViewportBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type SubscriptionRequest = {
  channels?: string[];
};

export type ViewportMessage = {
  type: "viewport";
  bounds: ViewportBounds;
};

export type ClientMessage = SubscriptionRequest | ViewportMessage;
