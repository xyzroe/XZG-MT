// TCP bridge over WebSocket
// You need a local TCP bridge server that accepts a target host:port param and pipes bytes over the WS.
// Example: ws://127.0.0.1:8765/connect?host=192.168.1.100&port=6638
export class TcpClient {
  private ws: WebSocket | null = null;
  private onDataCbs: Array<(data: Uint8Array) => void> = [];
  private onTxCb: ((data: Uint8Array) => void) | null = null;
  private wsBase: string;

  constructor(wsBase?: string) {
    this.wsBase =
      wsBase ||
      `ws://${localStorage.getItem("bridgeHost") || "127.0.0.1"}:${
        Number(localStorage.getItem("bridgePort") || 8765) || 8765
      }`;
  }

  async connect(host: string, port: number): Promise<void> {
    // Bridge URL; can be made configurable via settings
    const url = `${this.wsBase}/connect?host=${encodeURIComponent(host)}&port=${port}`;
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => reject(new Error("WebSocket error"));
      ws.onmessage = (ev) => {
        const data = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : new Uint8Array();
        if (data.length === 0) return;
        for (const cb of this.onDataCbs) {
          try {
            cb(data);
          } catch {
            // ignore
          }
        }
      };
      ws.onclose = (ev) => {
        if (this.ws === null) {
          // Closed before open => connection failed
          reject(new Error(`WebSocket closed (${ev.code})`));
        }
      };
    });
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("tcp not connected");
    try {
      this.onTxCb?.(data);
    } catch {
      // ignore
    }
    if (data.length === 0) return;
    this.ws.send(data);
  }

  onData(cb: (data: Uint8Array) => void) {
    this.onDataCbs.push(cb);
  }

  onTx(cb: (data: Uint8Array) => void) {
    this.onTxCb = cb;
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
    this.onDataCbs = [];
    this.onTxCb = null;
  }
}
