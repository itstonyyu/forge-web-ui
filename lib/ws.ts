'use client';

type WSEvent = {
  type: string;
  data?: unknown;
  [key: string]: unknown;
};

type Handler = (event: WSEvent) => void;

class ForgeWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<Handler> = new Set();
  private workspaceId: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldReconnect = false;

  connect(workspaceId: string) {
    if (this.ws && this.workspaceId === workspaceId && this.ws.readyState === WebSocket.OPEN) return;
    this.workspaceId = workspaceId;
    this.shouldReconnect = true;
    this.open();
  }

  private open() {
    if (!this.workspaceId) return;
    try {
      this.ws = new WebSocket(
        `wss://forge-server-production-059b.up.railway.app/ws?workspace=${this.workspaceId}`
      );
      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          this.handlers.forEach((h) => h(data));
        } catch {}
      };
      this.ws.onclose = () => {
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => this.open(), 3000);
        }
      };
      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {}
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  subscribe(handler: Handler) {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new ForgeWebSocket();
