import http from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { createRedisBridge } from "./redis.js";
import {
  type DeltaEnvelope,
  type GatewayMessage,
  type SubscriptionRequest,
  type ViewportBounds,
  type ViewportMessage,
} from "./contracts.js";
import {
  isWithinViewport,
  matchesRequestedChannels,
  normalizeRequestedChannels,
  shouldDeliverEnvelope,
} from "./channels.js";
import {
  resolveGatewayAccessToken,
  verifyGatewayJwt,
  type GatewayAuthConfig,
  type VerifiedGatewayPrincipal,
} from "./auth.js";

export type GatewayConfig = {
  port: number;
  redisUrl: string;
  jwtIssuer: string;
  jwtPublicKeyPem?: string;
  jwtPublicKeyUrl?: string;
};

type GatewayClientState = {
  principal: VerifiedGatewayPrincipal;
  subscriptions: Set<string>;
  lastDeliveredAt: Map<string, number>;
  viewport: ViewportBounds | null;
};

type WiredSocket = WebSocket & {
  state?: GatewayClientState;
};

async function authenticateConnection(
  request: http.IncomingMessage,
  config: GatewayAuthConfig,
): Promise<VerifiedGatewayPrincipal> {
  const token = resolveGatewayAccessToken({
    authorization: request.headers.authorization,
    tokenQueryParam: new URL(request.url ?? "/", "http://localhost").searchParams.get("token") ?? undefined,
    secWebSocketProtocol: request.headers["sec-websocket-protocol"],
  });
  return verifyGatewayJwt(token, config);
}

function parseClientMessage(raw: string): SubscriptionRequest | ViewportMessage {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.type === "viewport") {
    const bounds = parsed.bounds as ViewportBounds | undefined;
    if (
      !bounds ||
      typeof bounds.west !== "number" ||
      typeof bounds.south !== "number" ||
      typeof bounds.east !== "number" ||
      typeof bounds.north !== "number"
    ) {
      throw new Error("viewport message requires bounds with west, south, east, north");
    }
    return { type: "viewport", bounds } as ViewportMessage;
  }
  const sub = parsed as SubscriptionRequest;
  if (sub.channels && !Array.isArray(sub.channels)) {
    throw new Error("channels must be an array");
  }
  return sub;
}

function sendJson(socket: WiredSocket, message: GatewayMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function buildChannelPredicate(state: GatewayClientState, envelope: DeltaEnvelope): boolean {
  if (envelope.tenant_id !== state.principal.claims.tenant_id) {
    return false;
  }
  if (!matchesRequestedChannels(state.subscriptions, envelope.channel)) {
    return false;
  }
  if (envelope.channel.startsWith("narad:geostrat:") && !isWithinViewport(state.viewport, envelope)) {
    return false;
  }

  return shouldDeliverEnvelope(state, envelope);
}

export async function startGateway(config: GatewayConfig) {
  const httpServer = http.createServer((_, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "narad-gateway" }));
  });

  const wsServer = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      for (const protocol of protocols) {
        const candidate = protocol.trim();
        if (!candidate) {
          continue;
        }
        if (
          candidate.startsWith("Bearer ") ||
          candidate.startsWith("token.") ||
          candidate.split(".").length === 3
        ) {
          return candidate;
        }
      }

      return protocols.values().next().value ?? false;
    },
  });
  const redisBridge = createRedisBridge(config.redisUrl);
  await redisBridge.connect();
  const sockets = new Set<WiredSocket>();

  const unsubscribe = await redisBridge.subscribeToNaradDeltas((envelope) => {
    for (const socket of sockets) {
      const state = socket.state;
      if (!state) {
        continue;
      }

      if (!buildChannelPredicate(state, envelope)) {
        continue;
      }

      sendJson(socket, {
        type: "delta",
        payload: envelope,
      });
    }
  });

  wsServer.on("connection", (socket: WiredSocket, request) => {
    void (async () => {
      try {
        const principal = await authenticateConnection(request, {
          issuer: config.jwtIssuer,
          publicKeyPem: config.jwtPublicKeyPem,
          publicKeyUrl: config.jwtPublicKeyUrl,
        });
        socket.state = {
          principal,
          subscriptions: new Set<string>(),
          lastDeliveredAt: new Map<string, number>(),
          viewport: null,
        };
        sockets.add(socket);

        sendJson(socket, {
          type: "hello",
          payload: {
            tenant_id: principal.claims.tenant_id,
            sub: principal.claims.sub,
            role: principal.claims.role,
            clearance_level: principal.claims.clearance_level,
          },
        });

        socket.on("message", (raw) => {
          if (!socket.state) {
            return;
          }

          try {
            const message = parseClientMessage(raw.toString());
            if ("type" in message && message.type === "viewport") {
              socket.state.viewport = message.bounds;
            } else {
              const sub = message as SubscriptionRequest;
              socket.state.subscriptions = normalizeRequestedChannels(sub.channels);
            }
          } catch (error) {
            sendJson(socket, {
              type: "error",
              payload: {
                code: "invalid_message",
                message: error instanceof Error ? error.message : "Invalid message",
              },
            });
          }
        });

        socket.on("close", () => {
          sockets.delete(socket);
        });
      } catch (error) {
        sendJson(socket, {
          type: "error",
          payload: {
            code: "unauthorized",
            message: error instanceof Error ? error.message : "Unauthorized",
          },
        });
        socket.close(1008, "Unauthorized");
      }
    })();
  });

  httpServer.on("upgrade", (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit("connection", ws, request);
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(config.port, () => resolve());
  });

  return {
    close: async () => {
      await unsubscribe();
      wsServer.close();
      await redisBridge.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function main() {
  const port = Number(process.env.GATEWAY_PORT ?? "8080");
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379/0";
  const jwtIssuer = process.env.JWT_ISSUER ?? "narad.guru";
  const jwtPublicKeyPem = process.env.JWT_PUBLIC_KEY_PEM;
  const jwtPublicKeyUrl = process.env.JWT_PUBLIC_KEY_URL;

  const server = await startGateway({
    port,
    redisUrl,
    jwtIssuer,
    jwtPublicKeyPem,
    jwtPublicKeyUrl,
  });

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  process.stdout.write(`narad gateway listening on ${port}\n`);
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
