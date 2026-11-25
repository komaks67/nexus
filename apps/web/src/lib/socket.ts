import type { ClientToServerEvents, ServerToClientEvents } from "@nexus/shared";
import { io, type Socket } from "socket.io-client";
import { API_BASE } from "./config";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

export function connectSocket(token: string): AppSocket {
  disconnectSocket();
  socket = io(API_BASE || undefined, {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
    reconnectionDelay: 500,
    reconnectionDelayMax: 8000,
  }) as AppSocket;
  // オンライン状態の有効期限を延ばすための定期通知
  heartbeat = setInterval(() => socket?.emit("presence:heartbeat"), 30_000);
  return socket;
}

export function getSocket(): AppSocket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}
