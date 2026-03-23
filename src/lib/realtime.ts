import type { FastifyReply, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";

type MessagePayload = {
  event: string;
  data: unknown;
  at: string;
};

const sockets = new Set<WebSocket>();

export function registerSocket(connection: WebSocket): void {
  sockets.add(connection);
  connection.on("close", () => {
    sockets.delete(connection);
  });
}

export function broadcast(event: string, data: unknown): void {
  const payload: MessagePayload = {
    event,
    data,
    at: new Date().toISOString(),
  };
  const encoded = JSON.stringify(payload);
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      socket.send(encoded);
    }
  }
}

export function websocketRoute(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<never> | undefined {
  reply.code(426).send({ message: "请使用 WebSocket 协议连接此端点" });
  return undefined;
}
