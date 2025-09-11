"use strict";
(() => {
  // src/utils/control.ts
  var DEFAULT_CONTROL = {
    remote: true,
    bslPath: "",
    rstPath: "",
    baudPath: ""
  };
  var CONTROL_PRESETS = [
    {
      name: "ZigStar/UZG HTTP",
      test: (m) => /^(zigstar_gw|zig_star_gw|uzg-01|xzg)$/i.test(m.type || ""),
      config: {
        remote: true,
        bslPath: "http://{HOST}/cmdZigBSL",
        rstPath: "http://{HOST}/cmdZigRST",
        baudPath: ""
      }
    },
    {
      name: "TubesZB HTTP (ESPHome)",
      test: (m) => /^(tubeszb|tubes_zb)$/i.test(m.type || ""),
      config: {
        remote: false,
        bslPath: "http://{HOST}/switch/zBSL/{SET}",
        rstPath: "http://{HOST}/switch/zRST_gpio/{SET}",
        baudPath: ""
      }
    },
    {
      name: "Local USB via Bridge",
      test: (m) => (m.type || "").toLowerCase() === "local" && (m.protocol || "").toLowerCase() === "usb",
      config: {
        remote: false,
        bslPath: "http://{BRIDGE}/sc?port={PORT}&rts={SET}",
        rstPath: "http://{BRIDGE}/sc?port={PORT}&dtr={SET}",
        baudPath: "http://{BRIDGE}/sc?port={PORT}&baud={SET}"
      }
    },
    {
      name: "Local Serial via Bridge",
      test: (m) => (m.type || "").toLowerCase() === "local" && (m.protocol || "").toLowerCase() === "serial",
      config: {
        remote: false,
        bslPath: "",
        rstPath: "",
        baudPath: "http://{BRIDGE}/sc?port={PORT}&baud={SET}"
      }
    }
  ];
  function deriveControlConfig(meta) {
    for (const p of CONTROL_PRESETS) {
      try {
        if (p.test(meta)) return p.config;
      } catch {
      }
    }
    return DEFAULT_CONTROL;
  }
  function computeDtrRts(rstLow, bslLow, assumeSwap) {
    let dtr, rts;
    if (!assumeSwap) {
      dtr = !rstLow;
      rts = !bslLow;
    } else {
      dtr = !bslLow;
      rts = !rstLow;
    }
    return { dtr, rts };
  }

  // src/transport/serial.ts
  var SerialPort = class {
    constructor(bitrate) {
      this.port = null;
      this.reader = null;
      this.writer = null;
      this.onDataCbs = [];
      this.onTxCb = null;
      this.bitrate = bitrate;
    }
    static isSupported() {
      return typeof navigator !== "undefined" && !!navigator.serial;
    }
    startIO() {
      const readable = this.port.readable;
      if (readable) {
        this.reader = readable.getReader();
        (async () => {
          try {
            while (true) {
              const r = this.reader;
              if (!r) break;
              const { value, done } = await r.read();
              if (done) break;
              if (value) {
                for (const cb of this.onDataCbs) {
                  try {
                    cb(value);
                  } catch {
                  }
                }
              }
            }
          } catch (_e) {
          }
        })();
      }
      const writable = this.port.writable;
      if (writable) this.writer = writable.getWriter();
    }
    async requestAndOpen() {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: this.bitrate });
      this.port = port;
      this.startIO();
    }
    async openGranted() {
      const ports = await navigator.serial.getPorts?.();
      if (!ports || ports.length === 0) throw new Error("No previously granted serial ports");
      const port = ports[0];
      await port.open({ baudRate: this.bitrate });
      this.port = port;
      this.startIO();
    }
    useExistingPortAndStart(port) {
      this.port = port;
      this.startIO();
    }
    // async reopenWithBaudrate(baud: number): Promise<void> {
    //     const p: any = this.port as any;
    //     if (!p) throw new Error("serial not open");
    //     // Tear down current IO and re-open at new baudrate
    //     try { await this.reader?.cancel(); } catch {}
    //     try { await this.writer?.close(); } catch {}
    //     try { await p.close?.(); } catch {}
    //     await p.open?.({ baudRate: baud });
    //     this.startIO();
    // }
    async reopenWithBaudrate(baud) {
      const p = this.port;
      if (!p) throw new Error("serial not open");
      try {
        if (this.reader) {
          try {
            await this.reader.cancel();
          } catch {
          }
          try {
            this.reader.releaseLock?.();
          } catch {
          }
          this.reader = null;
        }
        if (this.writer) {
          try {
            await this.writer.close();
          } catch {
          }
          try {
            this.writer.releaseLock?.();
          } catch {
          }
          this.writer = null;
        }
        try {
          await p.close?.();
        } catch {
        }
        await p.open?.({ baudRate: baud });
        this.startIO();
      } catch (err) {
        this.reader = null;
        this.writer = null;
        throw err;
      }
    }
    async openByPath(_path) {
      await this.requestAndOpen();
    }
    async write(data) {
      if (!this.writer) throw new Error("serial not open");
      try {
        this.onTxCb?.(data);
      } catch {
      }
      await this.writer.write(data);
    }
    async setSignals(signals) {
      const p = this.port;
      if (!p || !p.setSignals) return;
      await p.setSignals(signals);
    }
    onData(cb) {
      this.onDataCbs.push(cb);
    }
    onTx(cb) {
      this.onTxCb = cb;
    }
    async close() {
      try {
        await this.reader?.cancel();
      } catch {
      }
      try {
        await this.writer?.close();
      } catch {
      }
      try {
        await this.port?.close?.();
      } catch {
      }
      this.reader = null;
      this.writer = null;
      this.port = null;
      this.onDataCbs = [];
      this.onTxCb = null;
    }
  };

  // src/transport/tcp.ts
  var TcpClient = class {
    constructor(wsBase) {
      this.ws = null;
      this.onDataCbs = [];
      this.onTxCb = null;
      this.wsBase = wsBase || `ws://${localStorage.getItem("bridgeHost") || "127.0.0.1"}:${Number(localStorage.getItem("bridgePort") || 8765) || 8765}`;
    }
    async connect(host, port) {
      const url = `${this.wsBase}/connect?host=${encodeURIComponent(host)}&port=${port}`;
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        ws.onopen = () => {
          this.ws = ws;
          resolve();
        };
        ws.onerror = (ev) => reject(new Error("WebSocket error"));
        ws.onmessage = (ev) => {
          const data = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : new Uint8Array();
          if (data.length === 0) return;
          for (const cb of this.onDataCbs) {
            try {
              cb(data);
            } catch {
            }
          }
        };
        ws.onclose = (ev) => {
          if (this.ws === null) {
            reject(new Error(`WebSocket closed (${ev.code})`));
          }
        };
      });
    }
    async write(data) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("tcp not connected");
      try {
        this.onTxCb?.(data);
      } catch {
      }
      if (data.length === 0) return;
      this.ws.send(data);
    }
    onData(cb) {
      this.onDataCbs.push(cb);
    }
    onTx(cb) {
      this.onTxCb = cb;
    }
    close() {
      try {
        this.ws?.close();
      } catch {
      }
      this.ws = null;
      this.onDataCbs = [];
      this.onTxCb = null;
    }
  };

  // src/utils/index.ts
  var sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  function toHex(v, w = 2) {
    return "0x" + v.toString(16).toUpperCase().padStart(w, "0");
  }
  function bufToHex(buf) {
    return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join(" ");
  }

  // src/cctools.ts
  var CCToolsClient = class {
    constructor(link) {
      this.rxBuf = [];
      this.link = link;
      link.onData((d) => this.rxBuf.push(...d));
    }
    // cc2538-bsl wire protocol: sync with 0x55 0x55 then expect ACK
    async sync() {
      this.rxBuf = [];
      await this.link.write(new Uint8Array([85, 85]));
      const ok = await this.waitForAck(1e3);
      if (!ok) throw new Error("CCTOOLS: no ACK on sync");
      await sleep(20);
    }
    // --- low level helpers ---
    async waitForAck(timeoutMs = 1200) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        for (let i = 0; i < this.rxBuf.length; i++) {
          const b = this.rxBuf[i];
          if (b === 204) {
            this.rxBuf.splice(0, i + 1);
            return true;
          }
          if (b === 51) {
            this.rxBuf.splice(0, i + 1);
            return false;
          }
          if (i + 1 < this.rxBuf.length && b === 0) {
            const n = this.rxBuf[i + 1];
            if (n === 204 || n === 51) {
              this.rxBuf.splice(0, i + 2);
              return n === 204;
            }
          }
        }
        await sleep(5);
      }
      throw new Error("CCTOOLS: timeout waiting for ACK/NACK");
    }
    async receivePacket(timeoutMs = 1500) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (this.rxBuf.length >= 2) {
          const size = this.rxBuf[0];
          if (this.rxBuf.length >= size) {
            const chks = this.rxBuf[1];
            const data = this.rxBuf.slice(2, size);
            const sum = data.reduce((s, b) => s + b & 255, 0);
            this.rxBuf.splice(0, size);
            if (sum !== chks) throw new Error("CCTOOLS: packet checksum error");
            await this.link.write(new Uint8Array([0, 204]));
            return new Uint8Array(data);
          }
        }
        await sleep(5);
      }
      throw new Error("CCTOOLS: timeout receiving packet");
    }
    encodeAddr(addr) {
      const byte3 = addr >> 0 & 255;
      const byte2 = addr >> 8 & 255;
      const byte1 = addr >> 16 & 255;
      const byte0 = addr >> 24 & 255;
      return new Uint8Array([byte0, byte1, byte2, byte3]);
    }
    async sendCommandRaw(content, expectPacket = false, ackTimeout = 1e3) {
      const len = content.length + 2;
      const chks = content.reduce((s, b) => s + b & 255, 0);
      this.rxBuf = [];
      const frame = new Uint8Array(2 + content.length);
      frame[0] = len & 255;
      frame[1] = chks & 255;
      frame.set(content, 2);
      await this.link.write(frame);
      const ackOk = await this.waitForAck(ackTimeout);
      if (!ackOk) throw new Error("CCTOOLS: NACK");
      if (expectPacket) {
        return await this.receivePacket();
      }
      return null;
    }
    async checkLastCmd() {
      const pkt = await this.sendCommandRaw(new Uint8Array([35]), true);
      if (!pkt || pkt.length === 0) return false;
      const status = pkt[0];
      return status === 64;
    }
    async chipId() {
      const pkt = await this.sendCommandRaw(new Uint8Array([40]), true);
      if (!pkt) throw new Error("CCTOOLS: no chip id packet");
      const ok = await this.checkLastCmd();
      if (!ok) throw new Error("CCTOOLS: chip id status failed");
      return pkt;
    }
    async erase(address, length) {
      const content = new Uint8Array(1 + 4 + 4);
      content[0] = 38;
      content.set(this.encodeAddr(address), 1);
      content.set(this.encodeAddr(length >>> 0), 1 + 4);
      await this.sendCommandRaw(content, false, 5e3);
      const ok = await this.checkLastCmd();
      if (!ok) throw new Error("CCTOOLS: erase failed");
    }
    async sectorErase(address) {
      const content = new Uint8Array(1 + 4);
      content[0] = 38;
      content.set(this.encodeAddr(address), 1);
      await this.sendCommandRaw(content, false, 1e4);
      const ok = await this.checkLastCmd();
      if (!ok) throw new Error("CCTOOLS: sector erase failed");
    }
    async bankErase() {
      const content = new Uint8Array([44]);
      await this.sendCommandRaw(content, false, 15e3);
      const ok = await this.checkLastCmd();
      if (!ok) throw new Error("CCTOOLS: bank erase failed");
    }
    async write(data) {
      await this.sendCommandRaw(new Uint8Array([36, ...data]));
      const ok = await this.checkLastCmd();
      if (!ok) throw new Error("CCTOOLS: send data failed");
    }
    async downloadTo(address, chunk) {
      let data = chunk;
      if (data.length % 4 !== 0) {
        const pad = 4 - data.length % 4;
        const tmp = new Uint8Array(data.length + pad);
        tmp.set(data, 0);
        for (let i = 0; i < pad; i++) tmp[data.length + i] = 255;
        data = tmp;
      }
      const dl = new Uint8Array(1 + 4 + 4);
      dl[0] = 33;
      dl.set(this.encodeAddr(address), 1);
      dl.set(this.encodeAddr(data.length), 1 + 4);
      await this.sendCommandRaw(dl);
      const ok1 = await this.checkLastCmd();
      if (!ok1) throw new Error("CCTOOLS: download header failed");
      const sdHeader = new Uint8Array(1 + data.length);
      sdHeader[0] = 36;
      sdHeader.set(data, 1);
      await this.sendCommandRaw(sdHeader, false, 5e3);
      const ok2 = await this.checkLastCmd();
      if (!ok2) throw new Error("CCTOOLS: send data failed");
    }
    async verifyCrc(address, length) {
      const content = new Uint8Array(1 + 4 + 4);
      content[0] = 39;
      content.set(this.encodeAddr(address), 1);
      content.set(this.encodeAddr(length >>> 0), 1 + 4);
      const pkt = await this.sendCommandRaw(content, true);
      if (!pkt || pkt.length < 4) return false;
      const ok = await this.checkLastCmd();
      if (!ok) return false;
      return true;
    }
    async crc32(address, length) {
      const content = new Uint8Array(1 + 4 + 4);
      content[0] = 39;
      content.set(this.encodeAddr(address), 1);
      content.set(this.encodeAddr(length >>> 0), 1 + 4);
      const pkt = await this.sendCommandRaw(content, true);
      if (!pkt || pkt.length < 4) throw new Error("CCTOOLS: CRC packet too short");
      const ok = await this.checkLastCmd();
      if (!ok) throw new Error("CCTOOLS: CRC status failed");
      const crc = (pkt[0] | pkt[1] << 8 | pkt[2] << 16 | pkt[3] << 24) >>> 0;
      return crc;
    }
    async crc32Cc26xx(address, length) {
      const content = new Uint8Array(1 + 4 + 4 + 4);
      content[0] = 39;
      content.set(this.encodeAddr(address), 1);
      content.set(this.encodeAddr(length >>> 0), 1 + 4);
      content.set(this.encodeAddr(0), 1 + 8);
      const pkt = await this.sendCommandRaw(content, true);
      if (!pkt || pkt.length < 4) throw new Error("CCTOOLS: CRC packet too short");
      const ok = await this.checkLastCmd();
      if (!ok) throw new Error("CCTOOLS: CRC status failed");
      const crc = (pkt[0] | pkt[1] << 8 | pkt[2] << 16 | pkt[3] << 24) >>> 0;
      return crc;
    }
    async memRead(addr, widthCode, count) {
      const content = new Uint8Array(1 + 4 + 1 + 1);
      content[0] = 42;
      content.set(this.encodeAddr(addr), 1);
      content[5] = widthCode & 255;
      content[6] = count & 255;
      const pkt = await this.sendCommandRaw(content, true);
      if (!pkt) throw new Error("CCTOOLS: no memRead packet");
      const ok = await this.checkLastCmd();
      if (!ok) throw new Error("CCTOOLS: memRead status failed");
      return pkt;
    }
    async memRead32(addr) {
      return this.memRead(addr, 1, 1);
    }
  };
  var LinkAdapter = class {
    constructor(writeFn, onDataHook) {
      this.writeFn = writeFn;
      this.onDataHook = onDataHook;
    }
    write(data) {
      return this.writeFn(data);
    }
    onData(cb) {
      this.onDataHook(cb);
    }
  };
  async function cctoolsSync(link) {
    const client = new CCToolsClient(new LinkAdapter(link.write, link.onData));
    await client.sync();
    return client;
  }
  function getChipDescription(chipIdPkt, wafer_id, pg_rev, mode_cfg) {
    const chip_id = (chipIdPkt[0] << 8 | chipIdPkt[1]) >>> 0;
    if (chip_id === 47460 || chip_id === 47461) return "CC2538";
    if (chip_id === 4610 && wafer_id === 47991 && pg_rev === 1) return "CC2652P7";
    if (chip_id === 12802 && wafer_id === 47937 && pg_rev === 3 && mode_cfg === 193) return "CC2652P2_launchpad";
    if (chip_id === 12802 && wafer_id === 47937 && pg_rev === 3 && mode_cfg === 250) return "CC2652P2_other";
    if (chip_id === 12802 && wafer_id === 47937 && pg_rev === 3) return "CC2652P2";
    if (chip_id === 12546 && wafer_id === 47937 && pg_rev === 3) return "CC2652RB";
    return `Unknown (C:${chip_id.toString(16).toUpperCase()},W:${wafer_id.toString(16).toUpperCase()},P:${pg_rev.toString(16).toUpperCase()},M:${mode_cfg.toString(16).toUpperCase()})`;
  }
  function xorFcs(bytes) {
    return bytes.reduce((a, b) => a ^ b & 255, 0);
  }
  async function sendMtAndWait(link, cmd0, cmd1, payload = [], timeoutMs = 1500) {
    const len = payload.length & 255;
    const fcs = xorFcs([len, cmd0 & 255, cmd1 & 255, ...payload]);
    const frame = new Uint8Array([254, len, cmd0 & 255, cmd1 & 255, ...payload, fcs & 255]);
    await link.write(frame);
    const chunks = [];
    return await new Promise((resolve) => {
      let done = false;
      const clearDone = (res) => {
        if (done) return;
        done = true;
        try {
          if (timer != null) window.clearTimeout(timer);
        } catch {
        }
        resolve(res);
      };
      const timer = timeoutMs > 0 ? window.setTimeout(() => clearDone(null), timeoutMs) : null;
      const onData = (chunk) => {
        if (done) return;
        for (let i = 0; i < chunk.length; i++) chunks.push(chunk[i]);
        parseLoop: while (true) {
          const startIdx = chunks.indexOf(254);
          if (startIdx === -1) {
            chunks.length = 0;
            break;
          }
          if (chunks.length - startIdx < 5) break;
          const plLen = chunks[startIdx + 1] & 255;
          const fullLen = 5 + plLen;
          if (chunks.length - startIdx < fullLen) break;
          const frameBytes = chunks.splice(startIdx, fullLen);
          const rlen = frameBytes[1];
          const rcmd0 = frameBytes[2];
          const rcmd1 = frameBytes[3];
          const rpayload = frameBytes.slice(4, 4 + rlen);
          const rfcs = frameBytes[4 + rlen] & 255;
          const calc = xorFcs([rlen & 255, rcmd0 & 255, rcmd1 & 255, ...rpayload]) & 255;
          if (calc !== rfcs) {
            continue parseLoop;
          }
          clearDone({ cmd0: rcmd0, cmd1: rcmd1, payload: new Uint8Array(rpayload) });
          return;
        }
      };
      try {
        link.onData(onData);
      } catch {
      }
    });
  }
  function statusOk(status) {
    return status === 0;
  }
  function osalIdFromHex(hex) {
    if (/^0x/i.test(hex)) return parseInt(hex, 16) & 65535;
    return parseInt(hex, 10) & 65535;
  }
  async function getFwVersion(link) {
    const resp = await sendMtAndWait(link, 33, 2, [], 3e3);
    if (!resp || resp.cmd0 !== 97 || resp.cmd1 !== 2) return null;
    const p = resp.payload;
    if (p.length >= 9) {
      const transportrev = p[0];
      const product = p[1];
      const major = p[2];
      const minor = p[3];
      const maint = p[4];
      const fwRev = (p[5] | p[6] << 8 | p[7] << 16 | p[8] << 24) >>> 0;
      return { transportrev, product, major, minor, maint, fwRev, payload: p };
    }
    return null;
  }
  async function pingApp(link, timeoutMs = 1e3) {
    const resp = await sendMtAndWait(link, 33, 1, [], timeoutMs);
    return !!resp;
  }
  async function sysOsalNvLength(link, id) {
    const idLo = id & 255, idHi = id >> 8 & 255;
    const resp = await sendMtAndWait(link, 33, 19, [idLo, idHi], 1500);
    if (!resp) return null;
    const len = (resp.payload[0] | resp.payload[1] << 8) >>> 0;
    return len;
  }
  async function sysOsalNvReadExtAll(link, id, totalLen) {
    const idLo = id & 255, idHi = id >> 8 & 255;
    const out = [];
    let offset = 0;
    while (offset < totalLen) {
      const offLo = offset & 255, offHi = offset >> 8 & 255;
      const resp = await sendMtAndWait(link, 33, 28, [idLo, idHi, offLo, offHi], 2e3);
      if (!resp) break;
      const st = resp.payload[0] ?? 1;
      if (!statusOk(st)) break;
      const chunk = Array.from(resp.payload.subarray(1));
      if (chunk.length === 0) break;
      out.push(...chunk);
      offset += chunk.length;
      if (chunk.length < 1) break;
    }
    return new Uint8Array(out.slice(0, totalLen));
  }
  async function sysOsalNvItemInit(link, id, length) {
    const idLo = id & 255, idHi = id >> 8 & 255;
    const lenLo = length & 255, lenHi = length >> 8 & 255;
    const resp = await sendMtAndWait(link, 33, 7, [idLo, idHi, lenLo, lenHi], 2e3);
    if (!resp) return false;
    const st = resp.payload[0] ?? 1;
    return statusOk(st) || st === 9;
  }
  async function sysOsalNvWrite(link, id, value, offset = 0) {
    const idLo = id & 255, idHi = id >> 8 & 255;
    const offLo = offset & 255, offHi = offset >> 8 & 255;
    const len = value.length & 255;
    const payload = [idLo, idHi, offLo, offHi, len, ...Array.from(value)];
    const resp = await sendMtAndWait(link, 33, 9, payload, 4e3);
    if (!resp) return false;
    return statusOk(resp.payload[0] ?? 1);
  }
  async function sysOsalNvDelete(link, id) {
    const idLo = id & 255, idHi = id >> 8 & 255;
    const resp = await sendMtAndWait(link, 33, 18, [idLo, idHi], 2e3);
    if (!resp) return false;
    return statusOk(resp.payload[0] ?? 1);
  }
  async function sysNvLength(link, itemId, subId) {
    const sysId = 1;
    const payload = [sysId, itemId & 255, itemId >> 8 & 255, subId & 255, subId >> 8 & 255];
    const resp = await sendMtAndWait(link, 33, 50, payload, 1500);
    if (!resp) return null;
    const p = resp.payload;
    if (p.length < 4) return null;
    const len = (p[0] | p[1] << 8 | p[2] << 16 | p[3] << 24) >>> 0;
    return len;
  }
  async function sysNvRead(link, itemId, subId, totalLen) {
    const sysId = 1;
    const out = [];
    let offset = 0;
    while (offset < totalLen) {
      const payload = [
        sysId,
        itemId & 255,
        itemId >> 8 & 255,
        subId & 255,
        subId >> 8 & 255,
        offset & 255,
        offset >> 8 & 255,
        Math.min(244, totalLen - offset) & 255
      ];
      const resp = await sendMtAndWait(link, 33, 51, payload, 2e3);
      if (!resp) return null;
      const st = resp.payload[0] ?? 1;
      if (!statusOk(st)) return null;
      const chunk = Array.from(resp.payload.subarray(1));
      if (chunk.length === 0) break;
      out.push(...chunk);
      offset += chunk.length;
      if (chunk.length < 1) break;
    }
    return new Uint8Array(out.slice(0, totalLen));
  }
  async function sysNvCreate(link, itemId, subId, length) {
    const sysId = 1;
    const payload = [
      sysId,
      itemId & 255,
      itemId >> 8 & 255,
      subId & 255,
      subId >> 8 & 255,
      length & 255,
      length >> 8 & 255,
      length >> 16 & 255,
      length >> 24 & 255
    ];
    const resp = await sendMtAndWait(link, 33, 48, payload, 2e3);
    if (!resp) return false;
    return statusOk(resp.payload[0] ?? 1) || (resp.payload[0] ?? 1) === 10;
  }
  async function sysNvWrite(link, itemId, subId, value) {
    const sysId = 1;
    for (let offset = 0; offset < value.length; offset += 244) {
      const slice = value.subarray(offset, Math.min(value.length, offset + 244));
      const payload = [
        sysId,
        itemId & 255,
        itemId >> 8 & 255,
        subId & 255,
        subId >> 8 & 255,
        offset & 255,
        offset >> 8 & 255,
        ...Array.from(slice)
      ];
      const resp = await sendMtAndWait(link, 33, 52, payload, 3e3);
      if (!resp || !statusOk(resp.payload[0] ?? 1)) return false;
    }
    return true;
  }
  async function sysNvDelete(link, itemId, subId) {
    const sysId = 1;
    const payload = [sysId, itemId & 255, itemId >> 8 & 255, subId & 255, subId >> 8 & 255];
    const resp = await sendMtAndWait(link, 33, 49, payload, 1500);
    if (!resp) return false;
    return statusOk(resp.payload[0] ?? 1);
  }
  async function nvramReadLegacyFull(link, progress) {
    const out = {};
    const ranges = [
      [1, 1023],
      [3840, 4095]
    ];
    let totalIds = 0;
    for (const [s, e] of ranges) totalIds += e - s + 1;
    let processed = 0;
    for (const [start, end] of ranges) {
      for (let id = start; id <= end; id++) {
        try {
          const len = await sysOsalNvLength(link, id);
          if (!len || len === 0) continue;
          const val = await sysOsalNvReadExtAll(link, id, Math.min(len, 4096));
          if (!val || val.length === 0) continue;
          out["0x" + id.toString(16).toUpperCase().padStart(4, "0")] = Array.from(val).map((b) => b.toString(16).padStart(2, "0")).join("");
        } catch {
        } finally {
          processed++;
          progress?.(processed / totalIds * 35, `Legacy ${processed} / ${totalIds}`);
        }
      }
    }
    return out;
  }
  async function nvramReadExtendedAll(link, progress) {
    const exNames = {
      1: "ADDRMGR",
      2: "BINDING_TABLE",
      3: "DEVICE_LIST",
      4: "TCLK_TABLE",
      5: "TCLK_IC_TABLE",
      6: "APS_KEY_DATA_TABLE",
      7: "NWK_SEC_MATERIAL_TABLE"
    };
    const out = {};
    const probe = await sysNvLength(link, 1, 0);
    if (probe === null) return null;
    const tableIds = Object.keys(exNames).map((k) => parseInt(k, 10));
    let tIndex = 0;
    for (const itemId of tableIds) {
      const itemObj = {};
      for (let subId = 0; subId <= 65535; subId++) {
        try {
          const len = await sysNvLength(link, itemId, subId);
          if (!len || len === 0) break;
          const val = await sysNvRead(link, itemId, subId, Math.min(len, 65535));
          if (!val) break;
          itemObj["0x" + subId.toString(16).toUpperCase().padStart(4, "0")] = Array.from(val).map((b) => b.toString(16).padStart(2, "0")).join("");
          progress?.(
            35 + Math.min(55, tIndex / Math.max(1, tableIds.length) * 55),
            `${exNames[itemId]}:${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}`
          );
        } catch {
          break;
        }
      }
      if (Object.keys(itemObj).length > 0) out[exNames[itemId]] = itemObj;
      tIndex++;
    }
    return out;
  }
  async function nvramReadAll(link, progress) {
    progress?.(0, "Reading\u2026");
    const legacy = await nvramReadLegacyFull(link, progress);
    const extended = await nvramReadExtendedAll(link, progress);
    const payload = { LEGACY: legacy };
    if (extended) Object.assign(payload, extended);
    progress?.(100, "Done");
    return payload;
  }
  async function nvramEraseAll(link, progress) {
    progress?.(0, "Erasing\u2026");
    const legacy = await nvramReadLegacyFull(link, progress);
    let totalL = Math.max(1, Object.keys(legacy).length);
    let doneL = 0;
    for (const key of Object.keys(legacy)) {
      try {
        await sysOsalNvDelete(link, osalIdFromHex(key));
      } catch {
      }
      doneL++;
      progress?.(Math.min(50, doneL / totalL * 50), `Erase legacy ${doneL}/${totalL}`);
    }
    const extended = await nvramReadExtendedAll(link, progress);
    if (extended) {
      const nameToId = {
        ADDRMGR: 1,
        BINDING_TABLE: 2,
        DEVICE_LIST: 3,
        TCLK_TABLE: 4,
        TCLK_IC_TABLE: 5,
        APS_KEY_DATA_TABLE: 6,
        NWK_SEC_MATERIAL_TABLE: 7
      };
      const names = Object.keys(extended);
      let idx = 0;
      for (const name of names) {
        const itemId = nameToId[name];
        if (!itemId) continue;
        idx++;
        for (let subId = 0; subId <= 65535; subId++) {
          const ok = await sysNvDelete(link, itemId, subId);
          if (!ok) break;
          progress?.(
            50 + Math.min(45, (idx - 1) / Math.max(1, names.length) * 45),
            `${name}:${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}`
          );
        }
      }
    }
    progress?.(100, "Erase done");
  }
  async function nvramWriteAll(link, obj, log2, progress) {
    progress?.(0, "Writing\u2026");
    const legacy = obj.legacy || obj.LEGACY || {};
    let total = Math.max(1, Object.keys(legacy).length);
    let count = 0;
    for (const key of Object.keys(legacy)) {
      const id = osalIdFromHex(key);
      const hex = legacy[key];
      const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) || []);
      try {
        await sysOsalNvItemInit(link, id, bytes.length);
        await sysOsalNvWrite(link, id, bytes, 0);
        log2?.(`NVRAM LEGACY write 0x${id.toString(16)} len=${bytes.length} => OK`);
      } catch (e) {
        log2?.(`NVRAM LEGACY write fail id=0x${id.toString(16)}: ${e?.message || String(e)}`);
      }
      count++;
      progress?.(Math.min(40, count / total * 40), `Legacy ${count}/${total}`);
    }
    const nameToId = {
      ADDRMGR: 1,
      BINDING_TABLE: 2,
      DEVICE_LIST: 3,
      TCLK_TABLE: 4,
      TCLK_IC_TABLE: 5,
      APS_KEY_DATA_TABLE: 6,
      NWK_SEC_MATERIAL_TABLE: 7
    };
    const extSupported = await sysNvLength(link, 1, 0) !== null;
    if (extSupported) {
      const names = Object.keys(nameToId);
      let idx = 0;
      for (const [name, itemId] of Object.entries(nameToId)) {
        const section = obj[name];
        if (!section) continue;
        idx++;
        for (const subKey of Object.keys(section)) {
          const subId = osalIdFromHex(subKey);
          const hex = section[subKey];
          const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) || []);
          try {
            const created = await sysNvCreate(link, itemId, subId, bytes.length);
            if (!created) {
              await sysNvDelete(link, itemId, subId);
              await sysNvCreate(link, itemId, subId, bytes.length);
            }
            const ok = await sysNvWrite(link, itemId, subId, bytes);
            log2?.(
              `NVRAM EX ${name}[${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}] len=${bytes.length} => ${ok ? "OK" : "ERR"}`
            );
          } catch (e) {
            log2?.(
              `NVRAM EX write fail ${name}[${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}]: ${e?.message || String(e)}`
            );
          }
          progress?.(
            40 + Math.min(55, (idx - 1) / Math.max(1, names.length) * 55),
            `${name}:${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}`
          );
        }
      }
    }
    progress?.(100, "Write done");
  }

  // src/utils/intelhex.ts
  function parseIntelHex(text) {
    let upper = 0;
    let startAddress = 0;
    const chunks = [];
    const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
    for (const line of lines) {
      if (line[0] !== ":") throw new Error("HEX: bad line start");
      const bytes = hexToBytes(line.slice(1));
      const len = bytes[0];
      const addr = bytes[1] << 8 | bytes[2];
      const type = bytes[3];
      const data = bytes.slice(4, 4 + len);
      const _crc = bytes[4 + len];
      switch (type) {
        case 0: {
          const abs = upper << 16 | addr;
          chunks.push({ addr: abs, bytes: data });
          break;
        }
        case 1: {
          break;
        }
        case 4: {
          if (len !== 2) throw new Error("HEX: ELA len!=2");
          upper = data[0] << 8 | data[1];
          break;
        }
        case 5: {
          if (len !== 4) throw new Error("HEX: SLA len!=4");
          startAddress = data[0] << 24 | data[1] << 16 | data[2] << 8 | data[3];
          break;
        }
        default:
          break;
      }
    }
    const min = Math.min(...chunks.map((c) => c.addr));
    const max = Math.max(...chunks.map((c) => c.addr + c.bytes.length));
    const out = new Uint8Array(max - min).fill(255);
    for (const c of chunks) out.set(c.bytes, c.addr - min);
    return { startAddress: startAddress || min, data: out };
  }
  function hexToBytes(hex) {
    if (hex.length % 2) throw new Error("HEX: odd length");
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  // src/netfw.ts
  async function fetchManifest() {
    const url = "https://raw.githubusercontent.com/xyzroe/XZG/zb_fws/ti/manifest.json";
    const resp = await fetch(url, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const j = await resp.json();
    return j;
  }
  function filterFwByChip(man, chip) {
    const categories = ["router", "coordinator", "thread"];
    const chipMap = {
      CC2652P2_launchpad: "CC2652P2_launchpad",
      CC2652P2_other: "CC2652P2_other",
      CC2652P7: "CC2652P7",
      CC2652RB: "CC2652RB"
    };
    const deviceName = chipMap[chip] || chip;
    const result = {};
    for (const cat of categories) {
      const catObj = man[cat];
      if (!catObj) continue;
      for (const sub of Object.keys(catObj)) {
        if (!sub.startsWith(deviceName)) continue;
        const files = catObj[sub];
        for (const fname of Object.keys(files)) {
          const fi = files[fname];
          (result[cat] || (result[cat] = [])).push({ file: fname, ver: fi.ver, link: fi.link, notes: fi.notes });
        }
      }
      if (result[cat]) result[cat].sort((a, b) => b.ver - a.ver);
    }
    return result;
  }
  function isLikelyIntelHexPreview(txt) {
    const lines = txt.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) return false;
    let checked = 0;
    for (const l of lines) {
      if (checked++ > 8) break;
      if (!l.startsWith(":")) return false;
    }
    return true;
  }
  function parseImageFromBuffer(bytes) {
    const previewLen = Math.min(4096, bytes.length);
    const preview = new TextDecoder().decode(bytes.subarray(0, previewLen));
    if (isLikelyIntelHexPreview(preview)) {
      const fullText = new TextDecoder().decode(bytes);
      return parseIntelHex(fullText);
    }
    return { startAddress: 0, data: bytes };
  }
  async function downloadFirmwareFromUrl(url) {
    const resp = await fetch(url, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    return parseImageFromBuffer(new Uint8Array(buf));
  }

  // src/utils/http.ts
  async function httpGetWithFallback(url, timeoutMs = 8e3) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status} ${resp.statusText}${body ? ` - ${body}` : ""}`);
      }
      if (resp.type === "opaque") return { text: null, opaque: true };
      const text = await resp.text();
      return { text, opaque: false };
    } catch (e) {
      const msg = e?.message || String(e);
      if (/Failed to fetch|TypeError|CORS|NetworkError/i.test(msg)) {
        try {
          await fetch(url, { mode: "no-cors", signal: controller.signal });
          return { text: null, opaque: true };
        } catch (e2) {
          throw e;
        }
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // src/flasher.ts
  var currentConnMeta = {};
  function applyControlConfig(cfg, source) {
    if (pinModeSelect) pinModeSelect.checked = !!cfg.remote;
    if (bslUrlInput) bslUrlInput.value = cfg.bslPath ?? DEFAULT_CONTROL.bslPath;
    if (rstUrlInput) rstUrlInput.value = cfg.rstPath ?? DEFAULT_CONTROL.rstPath;
    if (baudUrlInput) baudUrlInput.value = cfg.baudPath ?? DEFAULT_CONTROL.baudPath;
    saveCtrlSettings();
  }
  function getCtrlMode() {
    if (activeConnection === "serial") return "serial-direct";
    const t = (currentConnMeta.type || "").toLowerCase();
    const p = (currentConnMeta.protocol || "").toLowerCase();
    if (/^(zigstar_gw|zig_star_gw|uzg-01|xzg)$/.test(t) && p === "tcp") {
      return "zig-http";
    }
    if (t === "local" && p === "serial") return "bridge-sc";
    return "zig-http";
  }
  function buildCtrlUrl(template, setVal) {
    const base = getBridgeBase();
    const devHost = hostInput.value.trim();
    const rawPort = Number(portInput.value) || 0;
    let t = (template || "").trim();
    if (setVal !== void 0) t = t.replace(/\{SET\}/g, String(setVal));
    t = t.replace(/\{PORT\}/g, String(rawPort)).replace(/\{HOST\}/g, devHost).replace(/\{BRIDGE\}/g, base.replace(/^https?:\/\//, ""));
    if (!/^https?:\/\//i.test(t)) {
      if (/\{BRIDGE\}/.test(template)) return `${base}/${t.replace(/^\/+/, "")}`;
      return `http://${devHost}/${t.replace(/^\/+/, "")}`;
    }
    return t;
  }
  async function sendCtrlUrl(template, setVal) {
    const url = buildCtrlUrl(template, setVal);
    const r = await httpGetWithFallback(url);
    if (r.opaque) {
      return;
    }
  }
  var activeConnection = null;
  var consoleWrapEl = document.getElementById("consoleWrap");
  var logEl = document.getElementById("log");
  var autoScrollEl = document.getElementById("autoScroll");
  var showIoEl = document.getElementById("showIo");
  var chipModelEl = document.getElementById("chipModel");
  var flashSizeEl = document.getElementById("flashSize");
  var ieeeMacEl = document.getElementById("ieeeMac");
  var firmwareVersionEl = document.getElementById("firmwareVersion");
  var netFwSelect = document.getElementById("netFwSelect");
  var netFwRefreshBtn = document.getElementById("netFwRefresh");
  var bitrateInput = document.getElementById("bitrateInput");
  var chooseSerialBtn = document.getElementById("chooseSerial");
  var disconnectBtn = document.getElementById("disconnectBtn");
  var hostInput = document.getElementById("hostInput");
  var portInput = document.getElementById("portInput");
  var mdnsSelect = document.getElementById("mdnsSelect");
  var mdnsRefreshBtn = document.getElementById("mdnsRefresh");
  var tcpSettingsBtn = document.getElementById("tcpSettingsBtn");
  var tcpLinksBtn = document.getElementById("tcpLinksBtn");
  var tcpSettingsPanel = document.getElementById("tcpSettingsPanel");
  var tcpLinksPanel = document.getElementById("tcpLinksPanel");
  var bridgeHostInput = document.getElementById("bridgeHostInput");
  var bridgePortInput = document.getElementById("bridgePortInput");
  var tcpInfoBtn = document.getElementById("tcpInfoBtn");
  var bridgeStatusIcon = document.getElementById("bridgeStatusIcon");
  var bridgeInfoModal = document.getElementById("bridgeInfoModal");
  var bridgeInfoClose = document.getElementById("bridgeInfoClose");
  var bridgeInfoCloseX = document.getElementById("bridgeInfoCloseX");
  var bridgeLink = document.getElementById("bridgeLink");
  var connectTcpBtn = document.getElementById("connectTcp");
  var deviceDetectSpinner = document.getElementById("deviceDetectSpinner");
  var portInfoEl = document.getElementById("portInfo");
  var hexInput = document.getElementById("hexFile");
  var optErase = document.getElementById("optErase");
  var optWrite = document.getElementById("optWrite");
  var optVerify = document.getElementById("optVerify");
  var btnFlash = document.getElementById("btnFlash");
  var progressEl = document.getElementById("progress");
  var nvProgressEl = document.getElementById("nvProgress");
  var firmwareSection = document.getElementById("firmwareSection");
  var nvramSection = document.getElementById("nvramSection");
  var actionsSection = document.getElementById("actionsSection");
  var btnNvRead = document.getElementById("btnNvRead");
  var btnNvErase = document.getElementById("btnNvErase");
  var btnNvWrite = document.getElementById("btnNvWrite");
  var autoBslToggle = document.getElementById("autoBslToggle");
  var enterBslBtn = document.getElementById("enterBslBtn");
  var resetBtn = document.getElementById("resetBtn");
  var btnPing = document.getElementById("btn-ping");
  var btnVersion = document.getElementById("btn-version");
  var btnGetModel = document.getElementById("btn-get-model");
  var pinModeSelect = document.getElementById("pinModeSelect");
  var ctrlUrlRow = document.getElementById("ctrlUrlRow");
  var bslUrlInput = document.getElementById("bslUrlInput");
  var rstUrlInput = document.getElementById("rstUrlInput");
  var baudUrlInput = document.getElementById("baudUrlInput");
  var bslUrlSelect = document.getElementById("bslUrlSelect");
  var rstUrlSelect = document.getElementById("rstUrlSelect");
  var baudUrlSelect = document.getElementById("baudUrlSelect");
  var netFwNotesBtn = document.getElementById("netFwNotesBtn");
  var findBaudToggle = document.getElementById("findBaudToggle");
  var implyGateToggle = document.getElementById("implyGateToggle");
  var serial = null;
  var tcp = null;
  var hexImage = null;
  var netFwCache = null;
  var netFwItems = null;
  function updateConnectionUI() {
    const anyActive = !!activeConnection;
    const setSectionDisabled = (el, disabled) => {
      if (!el) return;
      el.classList.toggle("opacity-50", disabled);
      el.classList.toggle("pe-none", disabled);
      el.setAttribute("aria-disabled", String(disabled));
      const ctrls = el.querySelectorAll(
        'button, input, select, textarea, fieldset, optgroup, option, details, [contenteditable="true"], [tabindex]'
      );
      ctrls.forEach((c) => {
        if (c === disconnectBtn) return;
        if (c instanceof HTMLButtonElement || c instanceof HTMLInputElement || c instanceof HTMLSelectElement || c instanceof HTMLTextAreaElement || c instanceof HTMLFieldSetElement) {
          c.disabled = disabled;
        }
        if (disabled) c.setAttribute("tabindex", "-1");
        else if (c.hasAttribute("tabindex")) c.removeAttribute("tabindex");
      });
    };
    const serialSection = document.getElementById("serialSection");
    const tcpSection = document.getElementById("tcpSection");
    const generalSection = document.getElementById("generalSection");
    setSectionDisabled(serialSection, anyActive);
    setSectionDisabled(tcpSection, anyActive);
    setSectionDisabled(generalSection, anyActive);
    const showDisc = anyActive;
    disconnectBtn.classList.toggle("d-none", !showDisc);
    disconnectBtn.classList.toggle("btn-danger", showDisc);
    disconnectBtn.classList.toggle("btn-outline-secondary", !showDisc);
    disconnectBtn.disabled = !showDisc;
    if (portInfoEl) {
      if (!anyActive) {
        portInfoEl.value = "";
      } else if (activeConnection === "tcp") {
        const host = hostInput.value.trim();
        const port = parseInt(portInput.value, 10);
        portInfoEl.value = host && port ? `tcp://${host}:${port}` : "tcp://";
      } else {
        const br = parseInt(bitrateInput.value, 10) || 115200;
        portInfoEl.value = `serial @ ${br}bps`;
      }
    }
    if (!anyActive) {
      if (chipModelEl) chipModelEl.value = "";
      if (flashSizeEl) flashSizeEl.value = "";
      if (ieeeMacEl) ieeeMacEl.value = "";
      if (firmwareVersionEl) firmwareVersionEl.value = "";
    }
    if (actionsSection) {
      actionsSection.classList.toggle("opacity-50", !anyActive);
      actionsSection.classList.toggle("pe-none", !anyActive);
      actionsSection.setAttribute("aria-disabled", String(!anyActive));
    }
    if (firmwareSection) {
      firmwareSection.classList.toggle("opacity-50", !anyActive);
      firmwareSection.classList.toggle("pe-none", !anyActive);
    }
    if (nvramSection) {
      nvramSection.classList.toggle("opacity-50", !anyActive);
      nvramSection.classList.toggle("pe-none", !anyActive);
    }
    if (netFwSelect) netFwSelect.disabled = !anyActive;
    if (netFwRefreshBtn) netFwRefreshBtn.disabled = !anyActive;
  }
  function getBridgeBase() {
    const host = bridgeHostInput?.value?.trim() || localStorage.getItem("bridgeHost") || "127.0.0.1";
    const port = Number(bridgePortInput?.value || localStorage.getItem("bridgePort") || 8765) || 8765;
    return `http://${host}:${port}`;
  }
  function getBridgeWsBase() {
    const host = bridgeHostInput?.value?.trim() || localStorage.getItem("bridgeHost") || "127.0.0.1";
    const port = Number(bridgePortInput?.value || localStorage.getItem("bridgePort") || 8765) || 8765;
    return `ws://${host}:${port}`;
  }
  function saveBridgeSettings() {
    if (bridgeHostInput) localStorage.setItem("bridgeHost", bridgeHostInput.value.trim() || "127.0.0.1");
    if (bridgePortInput) localStorage.setItem("bridgePort", String(Number(bridgePortInput.value || 8765) || 8765));
  }
  tcpSettingsBtn?.addEventListener("click", () => {
    let tcpSettingsPanelVisible = tcpSettingsPanel?.classList.contains("d-none");
    if (tcpSettingsPanel) tcpSettingsPanel.classList.toggle("d-none", !tcpSettingsPanelVisible);
  });
  tcpLinksBtn?.addEventListener("click", () => {
    let tcpLinksPanelVisible = tcpLinksPanel?.classList.contains("d-none");
    if (tcpLinksPanel) tcpLinksPanel.classList.toggle("d-none", !tcpLinksPanelVisible);
  });
  bridgeHostInput?.addEventListener("change", saveBridgeSettings);
  bridgePortInput?.addEventListener("change", saveBridgeSettings);
  if (bridgeHostInput) bridgeHostInput.value = localStorage.getItem("bridgeHost") || bridgeHostInput.value;
  if (bridgePortInput) bridgePortInput.value = localStorage.getItem("bridgePort") || bridgePortInput.value;
  try {
    const storedHost = localStorage.getItem("bridgeHost");
    const storedPort = localStorage.getItem("bridgePort");
    const loc = window.location;
    const isHttp = loc.protocol === "http:";
    const isLocalhost = loc.hostname === "localhost";
    const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(loc.hostname);
    const isIpLike = isIpv4 || loc.hostname.includes(":");
    const hasPort = !!loc.port;
    if (isHttp && (isLocalhost || isIpLike) && !storedHost && !storedPort && (hasPort || isLocalhost)) {
      const host = loc.hostname;
      const port = "8765";
      if (bridgeHostInput) bridgeHostInput.value = host;
      if (bridgePortInput) bridgePortInput.value = port;
      saveBridgeSettings();
    }
  } catch (e) {
  }
  function loadCtrlSettings() {
    try {
      const mode = localStorage.getItem("pinModeSelect");
      if (pinModeSelect && mode !== null) pinModeSelect.checked = mode === "1";
      if (bslUrlInput) bslUrlInput.value = localStorage.getItem("bslUrlInput") || bslUrlInput.value;
      if (rstUrlInput) rstUrlInput.value = localStorage.getItem("rstUrlInput") || rstUrlInput.value;
    } catch {
    }
  }
  function saveCtrlSettings() {
    try {
      if (pinModeSelect) localStorage.setItem("pinModeSelect", pinModeSelect.checked ? "1" : "0");
      if (bslUrlInput) localStorage.setItem("bslUrlInput", bslUrlInput.value.trim());
      if (rstUrlInput) localStorage.setItem("rstUrlInput", rstUrlInput.value.trim());
    } catch {
    }
  }
  loadCtrlSettings();
  pinModeSelect?.addEventListener("change", () => {
    saveCtrlSettings();
    updateConnectionUI();
  });
  bslUrlInput?.addEventListener("change", saveCtrlSettings);
  rstUrlInput?.addEventListener("change", saveCtrlSettings);
  var bridgeRefreshTimer = null;
  function scheduleBridgeRefresh() {
    if (bridgeRefreshTimer) window.clearTimeout(bridgeRefreshTimer);
    bridgeRefreshTimer = window.setTimeout(() => {
      refreshMdnsList();
    }, 300);
  }
  bridgeHostInput?.addEventListener("input", scheduleBridgeRefresh);
  bridgePortInput?.addEventListener("input", scheduleBridgeRefresh);
  function log(msg, cls = "app") {
    const at = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].replace("Z", "");
    const line = document.createElement("div");
    line.className = `log-line log-${cls}`;
    line.textContent = `[${at}] ${msg}`;
    logEl.appendChild(line);
    if (!autoScrollEl || autoScrollEl.checked) {
      logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight;
    }
  }
  function setBridgeStatus(ok) {
    if (!bridgeStatusIcon) return;
    bridgeStatusIcon.classList.toggle("text-success", ok);
    bridgeStatusIcon.classList.toggle("text-danger", !ok);
    bridgeStatusIcon.classList.remove("text-muted");
    bridgeStatusIcon.innerHTML = `<i class="bi ${ok ? "bi-check-circle-fill" : "bi-x-circle-fill"}"></i>`;
    bridgeStatusIcon.setAttribute("title", ok ? "Bridge reachable" : "Bridge error");
  }
  function setBridgeLoading() {
    if (!bridgeStatusIcon) return;
    bridgeStatusIcon.classList.remove("text-success", "text-danger");
    bridgeStatusIcon.classList.add("text-muted");
    bridgeStatusIcon.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    bridgeStatusIcon.setAttribute("title", "Checking bridge\u2026");
  }
  function deviceDetectBusy(busy) {
    if (!deviceDetectSpinner) return;
    deviceDetectSpinner.classList.toggle("d-none", !busy);
  }
  var nvResetTimer = null;
  function nvProgress(pct, label) {
    if (!nvProgressEl) return;
    if (typeof pct === "number" && !Number.isNaN(pct)) {
      const v = Math.max(0, Math.min(100, Math.round(pct)));
      nvProgressEl.style.width = `${v}%`;
      nvProgressEl.setAttribute("aria-valuenow", String(v));
      if (v >= 100) {
        if (nvResetTimer) clearTimeout(nvResetTimer);
        nvResetTimer = window.setTimeout(() => {
          nvProgressReset("");
        }, 5e3);
      }
    }
    if (label !== void 0) nvProgressEl.textContent = label || "";
  }
  function nvProgressReset(text = "") {
    if (!nvProgressEl) return;
    if (nvResetTimer) {
      clearTimeout(nvResetTimer);
      nvResetTimer = null;
    }
    nvProgressEl.style.width = "0%";
    nvProgressEl.setAttribute("aria-valuenow", "0");
    nvProgressEl.textContent = text;
  }
  function nvProgressSetColor(kind) {
    if (!nvProgressEl) return;
    nvProgressEl.classList.remove("bg-primary", "bg-warning", "bg-danger");
    nvProgressEl.classList.add(`bg-${kind}`);
  }
  var fwResetTimer = null;
  function fwProgress(pct, label) {
    if (!progressEl) return;
    if (typeof pct === "number" && !Number.isNaN(pct)) {
      const v = Math.max(0, Math.min(100, Math.round(pct)));
      progressEl.style.width = `${v}%`;
      progressEl.setAttribute("aria-valuenow", String(v));
      if (v >= 100) {
        if (fwResetTimer) clearTimeout(fwResetTimer);
        fwResetTimer = window.setTimeout(() => {
          fwProgressReset("");
        }, 5e3);
      }
    }
    if (label !== void 0) progressEl.textContent = label || "";
  }
  function fwProgressReset(text = "") {
    if (!progressEl) return;
    if (fwResetTimer) {
      clearTimeout(fwResetTimer);
      fwResetTimer = null;
    }
    progressEl.style.width = `0%`;
    progressEl.setAttribute("aria-valuenow", "0");
    progressEl.textContent = text;
  }
  async function withButtonStatus(btn, fn) {
    btn.querySelectorAll(".btn-status").forEach((el) => el.remove());
    const originalDisabled = btn.disabled;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    const status = document.createElement("span");
    status.className = "btn-status ms-2 d-inline-flex align-items-center";
    status.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    btn.appendChild(status);
    let ok = true;
    try {
      const res = await fn();
      ok = res !== false;
    } catch {
      ok = false;
    }
    status.textContent = ok ? " \u2705" : " \u274C";
    setTimeout(() => {
      status.remove();
      btn.disabled = originalDisabled;
      btn.removeAttribute("aria-busy");
    }, 3e3);
  }
  chooseSerialBtn.addEventListener("click", async () => {
    if (activeConnection) {
      log("Error: a connection is already active");
      return;
    }
    try {
      if (!("serial" in navigator)) throw new Error("Web Serial not supported");
      const br = parseInt(bitrateInput.value, 10) || 115200;
      const chosen = await navigator.serial.requestPort();
      await chosen.open({ baudRate: br });
      serial?.close();
      serial = new SerialPort(br);
      serial.useExistingPortAndStart(chosen);
      serial.onData((d) => {
        log(`RX: ${bufToHex(d)}`, "rx");
      });
      serial.onTx((d) => {
        log(`TX: ${bufToHex(d)}`, "tx");
      });
      log("Serial selected and opened");
      activeConnection = "serial";
      updateConnectionUI();
      await runConnectSequence();
    } catch (e) {
      log(`Serial error: ${e?.message || String(e)}`);
    }
  });
  disconnectBtn.addEventListener("click", async () => {
    if (!activeConnection) return;
    if (activeConnection === "serial") {
      try {
        await serial?.close();
      } catch {
      }
      serial = null;
      activeConnection = null;
      currentConnMeta = {};
      log("Serial disconnected");
    } else if (activeConnection === "tcp") {
      try {
        tcp?.close();
      } catch {
      }
      tcp = null;
      activeConnection = null;
      currentConnMeta = {};
      log("TCP disconnected");
    }
    updateConnectionUI();
  });
  connectTcpBtn.addEventListener("click", async () => {
    if (activeConnection) {
      log("Error: a connection is already active");
      return;
    }
    try {
      const host = hostInput.value.trim();
      const port = parseInt(portInput.value, 10);
      if (!host || !port) throw new Error("Enter host/port");
      if (tcp !== null) {
        tcp.close();
      }
      const wsBase = getBridgeWsBase();
      tcp = new TcpClient(wsBase);
      try {
        await tcp.connect(host, port);
      } catch (e) {
        log("TCP connect error: " + (e?.message || String(e)));
        throw e;
      }
      tcp.onData((d) => log(`RX: ${bufToHex(d)}`, "rx"));
      tcp.onTx?.((d) => log(`TX: ${bufToHex(d)}`, "tx"));
      log(`TCP connected to ${host}:${port}`);
      activeConnection = "tcp";
      updateConnectionUI();
      await runConnectSequence();
    } catch (e) {
      log(`TCP error: ${e?.message || String(e)}`);
    }
  });
  function updateOptionsStateForFile(selected) {
    if (!selected) {
      optWrite.checked = false;
      optWrite.disabled = true;
      optVerify.checked = false;
      optVerify.disabled = true;
    } else {
      optWrite.disabled = false;
      optVerify.disabled = false;
      optWrite.checked = true;
      optVerify.checked = true;
    }
  }
  function getSelectedFwNotes() {
    if (!netFwSelect || !netFwItems) return;
    const opt = netFwSelect.selectedOptions[0];
    if (!opt || !opt.value) return;
    const item = netFwItems.find(function(it) {
      return it.key === opt.value;
    });
    return item && item.notes;
  }
  netFwSelect?.addEventListener("change", async () => {
    if (!netFwSelect || !netFwNotesBtn) return;
    const notes = getSelectedFwNotes();
    netFwNotesBtn.disabled = !notes;
    const opt = netFwSelect.selectedOptions[0];
    const link = opt?.getAttribute("data-link");
    if (!link) return;
    try {
      const img = await downloadFirmwareFromUrl(link);
      hexImage = img;
      updateOptionsStateForFile(true);
      log(`Image loaded from network: ${img.data.length} bytes @ ${toHex(img.startAddress, 8)}`);
    } catch (e) {
      log("HEX download error: " + (e?.message || String(e)));
    }
  });
  hexInput.addEventListener("change", async () => {
    const f = hexInput.files?.[0];
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const img = parseImageFromBuffer(new Uint8Array(buf));
      hexImage = img;
      log(`Image loaded: ${f.name}, ${img.data.length} bytes, start ${toHex(img.startAddress, 8)}`);
      updateOptionsStateForFile(true);
    } catch (e) {
      log("File load error: " + (e?.message || String(e)));
    }
  });
  function getActiveLink() {
    if (activeConnection === "serial" && serial)
      return { write: (d) => serial.write(d), onData: (cb) => serial.onData(cb) };
    if (activeConnection === "tcp" && tcp)
      return { write: (d) => tcp.write(d), onData: (cb) => tcp.onData(cb) };
    throw new Error("No transport connected");
  }
  async function enterBsl() {
    const auto = !!autoBslToggle?.checked;
    const remotePinMode = !!pinModeSelect?.checked;
    const bslTpl = (bslUrlInput?.value || DEFAULT_CONTROL.bslPath).trim();
    log(`Entering BSL: conn=${activeConnection ?? "none"} auto=${auto} pinMode=${remotePinMode}`);
    if (activeConnection === "serial") {
      if (!auto) {
        log("Auto BSL disabled for serial; skipping line sequence");
        return;
      }
      try {
        await bslUseLines(false);
      } catch (e) {
        await bslUseLines(true);
      }
      return;
    }
    if (activeConnection === "tcp") {
      if (!remotePinMode) {
        try {
          await bslUseLines(false);
        } catch (e) {
          await bslUseLines(true);
        }
        return;
      }
      const hasSet = /\{SET\}/.test(bslTpl);
      await sendCtrlUrl(bslTpl, hasSet ? 1 : void 0);
      return;
    }
    throw new Error("No active connection");
  }
  async function performReset() {
    const auto = !!autoBslToggle?.checked;
    const remotePinMode = !!pinModeSelect?.checked;
    const rstTpl = (rstUrlInput?.value || DEFAULT_CONTROL.rstPath).trim();
    log(`Resetting: conn=${activeConnection ?? "none"} auto=${auto} pinMode=${remotePinMode}`);
    if (activeConnection === "serial") {
      if (!auto) {
        log("Auto reset disabled for serial; skipping line sequence");
        return;
      }
      try {
        await resetUseLines(false);
      } catch (e) {
        await resetUseLines(true);
      }
      return;
    }
    if (activeConnection === "tcp") {
      if (!remotePinMode) {
        try {
          await resetUseLines(false);
        } catch (e) {
          await resetUseLines(true);
        }
        return;
      }
      const hasSet = /\{SET\}/.test(rstTpl);
      await sendCtrlUrl(rstTpl, hasSet ? 1 : void 0);
      return;
    }
    throw new Error("No active connection");
  }
  async function readChipInfo(showBusy = true) {
    try {
      if (showBusy) deviceDetectBusy(true);
      const link = getActiveLink();
      const bsl = await cctoolsSync(link);
      const id = await bsl.chipId();
      const chipHex = Array.from(id).map((b) => b.toString(16).padStart(2, "0")).join("");
      log(`BSL OK. ChipId packet: ${chipHex}`);
      try {
        const FLASH_SIZE = 1073938476;
        const IEEE_ADDR_PRIMARY = 1342182128;
        const ICEPICK_DEVICE_ID = 1342182168;
        const TESXT_ID = 360372;
        const dev = await bsl.memRead32?.(ICEPICK_DEVICE_ID);
        const usr = await bsl.memRead32?.(TESXT_ID);
        if (dev && usr && dev.length >= 4 && usr.length >= 4) {
          const wafer_id = ((dev[3] & 15) << 16 | dev[2] << 8 | dev[1] & 240) >>> 4 >>> 0;
          const pg_rev = (dev[3] & 240) >> 4;
          const model = getChipDescription(id, wafer_id, pg_rev, usr[1]);
          log(`Chip model: ${model}`);
          if (chipModelEl) chipModelEl.value = model;
          refreshNetworkFirmwareList(model).catch(
            (e) => log("Network FW list fetch failed: " + (e?.message || String(e)))
          );
        }
        const flashSz = await bsl.memRead32?.(FLASH_SIZE);
        if (flashSz && flashSz.length >= 4) {
          const pages = flashSz[0];
          let size = pages * 8192;
          if (size >= 64 * 1024) size -= 8192;
          log(`Flash size estimate: ${size} bytes`);
          if (flashSizeEl) flashSizeEl.value = `${size} bytes`;
        }
        const mac_lo = await bsl.memRead32?.(IEEE_ADDR_PRIMARY + 0);
        const mac_hi = await bsl.memRead32?.(IEEE_ADDR_PRIMARY + 4);
        if (mac_hi && mac_lo && mac_hi.length >= 4 && mac_lo.length >= 4) {
          const mac = [...mac_lo, ...mac_hi].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
          const macFmt = mac.match(/.{1,2}/g)?.reverse()?.join(":");
          if (macFmt) {
            log(`IEEE MAC: ${macFmt}`);
            if (ieeeMacEl) ieeeMacEl.value = macFmt;
          }
        }
      } catch {
      }
    } catch (e) {
      log("BSL sync or chip read failed: " + (e?.message || String(e)));
    } finally {
      if (showBusy) deviceDetectBusy(false);
    }
  }
  async function pingWithBaudRetries(link, baudCandidates = [9600, 19200, 38400, 57600, 115200, 230400, 460800]) {
    const findBaud = !!findBaudToggle?.checked;
    try {
      const ok0 = await pingApp(link);
      if (findBaud && activeConnection === "serial" || findBaud && activeConnection === "tcp" && (baudUrlInput?.value ?? "").trim() !== "") {
        log(baudUrlInput?.value || "NULL");
        if (ok0) return true;
      } else {
        return ok0;
      }
    } catch {
    }
    const originalBaud = parseInt(bitrateInput.value, 10) || 115200;
    const bauds = Array.from(new Set(baudCandidates.concat([originalBaud]))).sort((a, b) => a - b);
    if (bauds.length <= 1) return false;
    const startIdx = bauds.indexOf(originalBaud);
    let idx = (startIdx + 1) % bauds.length;
    for (; idx !== startIdx; idx = (idx + 1) % bauds.length) {
      const b = bauds[idx];
      try {
        if (activeConnection === "serial") {
          await serial?.reopenWithBaudrate?.(b);
          log(`Serial: switched baud to ${b} for ping retry`);
        } else if (activeConnection === "tcp") {
          await changeBaudOverTcp(b);
          log(`TCP: requested baud change to ${b} for ping retry`);
        }
      } catch (e) {
        log(`Serial: failed to switch baud to ${b}: ${e?.message || String(e)}`);
        continue;
      }
      await performReset().catch((e) => log("Reset failed: " + (e?.message || String(e))));
      await sleep(500);
      try {
        const ok = await pingApp(link);
        if (ok) {
          try {
            bitrateInput.value = String(b);
            updateConnectionUI();
          } catch {
          }
          log(`Ping succeeded at ${b}bps`);
          return true;
        } else {
          log(`Ping at ${b}bps: timed out or no response`);
        }
      } catch (e) {
        log(`Ping error at ${b}bps: ${e?.message || String(e)}`);
      }
    }
    try {
      if (activeConnection === "serial") {
        await serial?.reopenWithBaudrate?.(originalBaud);
        log(`Serial: restored baud to ${originalBaud}`);
      } else if (activeConnection === "tcp") {
        await changeBaudOverTcp(originalBaud);
        log(`TCP: restored baud to ${originalBaud}`);
      }
      try {
        bitrateInput.value = String(originalBaud);
      } catch {
      }
    } catch {
    }
    return false;
  }
  async function runConnectSequence() {
    deviceDetectBusy(true);
    try {
      try {
        if (getCtrlMode() === "bridge-sc") {
          await sleep(250);
        }
      } catch {
      }
      await enterBsl().catch((e) => log("Enter BSL failed: " + (e?.message || String(e))));
      await readChipInfo(false);
      await performReset().catch((e) => log("Reset failed: " + (e?.message || String(e))));
      await sleep(1e3);
      try {
        const link = getActiveLink();
        const ok = await pingWithBaudRetries(link);
        if (!ok) {
          log("App ping: timed out or no response");
        }
      } catch {
        log("App ping skipped");
      }
      try {
        const link = getActiveLink();
        const info = await getFwVersion(link);
        if (!info) {
          log("FW version request: timed out or no response");
        } else if (firmwareVersionEl) {
          firmwareVersionEl.value = String(info.fwRev);
          log(`FW version: ${info.fwRev}`);
        }
      } catch {
        log("FW version check skipped");
      }
    } finally {
      deviceDetectBusy(false);
    }
  }
  function makeOptionLabel(item) {
    return `[${item.category.charAt(0).toUpperCase()}] ${item.ver} \u2014 ${item.file}`;
  }
  async function refreshNetworkFirmwareList(chipModel) {
    if (!netFwSelect) return;
    const chip = chipModel || chipModelEl?.value || "";
    netFwSelect.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = chip ? `\u2014 Firmware for ${chip} \u2014` : "\u2014 Detect device first \u2014";
    netFwSelect.appendChild(def);
    if (!chip) return;
    try {
      const man = netFwCache || (netFwCache = await fetchManifest());
      const filtered = filterFwByChip(man, chip);
      const items = [];
      for (const category of Object.keys(filtered)) {
        for (const it of filtered[category]) {
          const key = `${category}|${it.file}`;
          items.push({
            key,
            link: it.link,
            ver: it.ver,
            notes: it.notes,
            label: makeOptionLabel({ ver: it.ver, file: it.file, category })
          });
        }
      }
      items.sort((a, b) => b.ver - a.ver);
      netFwItems = items;
      window.netFwItems = netFwItems;
      window.netFwSelect = netFwSelect;
      for (const it of items) {
        const o = document.createElement("option");
        o.value = it.key;
        o.textContent = it.label;
        o.setAttribute("data-link", it.link);
        netFwSelect.appendChild(o);
      }
      if (items.length === 0) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "\u2014 No matching firmware \u2014";
        netFwSelect.appendChild(o);
      }
      log(`Cloud FW: ${items.length} options`);
    } catch (e) {
      log("Cloud FW manifest error: " + (e?.message || String(e)));
    }
  }
  netFwRefreshBtn?.addEventListener("click", () => {
    const model = chipModelEl?.value || "";
    refreshNetworkFirmwareList(model);
  });
  async function flash(doVerifyOnly = false) {
    if (!hexImage) throw new Error("Load HEX first");
    try {
      if (activeConnection === "serial") {
        await serial?.reopenWithBaudrate?.(5e5);
        log("Serial: switched baud to 500000");
      } else if (activeConnection === "tcp") {
        await changeBaudOverTcp(460800);
        log("TCP: switched baud to 460800");
      }
    } catch {
      log("Serial: failed to switch baud");
    }
    const userChunk = 248;
    const chunkSize = Math.max(16, Math.min(248, userChunk));
    const startAddr = hexImage.startAddress;
    const data = hexImage.data;
    const link = getActiveLink();
    try {
      await enterBsl();
      await sleep(300);
    } catch (e) {
      log("Enter BSL failed: " + (e?.message || String(e)));
    }
    const bsl = await cctoolsSync(link);
    let chipIdStr = "";
    let chipIsCC26xx = false;
    try {
      const id = await bsl.chipId();
      chipIdStr = Array.from(id).map((b) => b.toString(16).padStart(2, "0")).join("");
      log(`ChipId: ${chipIdStr}`);
      const chipId = (id[0] << 8 | id[1]) >>> 0;
      chipIsCC26xx = !(chipId === 47460 || chipId === 47461);
    } catch {
    }
    if (!doVerifyOnly && optErase.checked) {
      log("Erase\u2026");
      if (chipIsCC26xx) {
        try {
          await bsl.bankErase?.();
          log("Bank erase done");
        } catch (e) {
          log("Bank erase not supported or failed, erasing sectors\u2026");
          const pageSize = 4096;
          const from = startAddr & ~(pageSize - 1);
          const to = startAddr + data.length + pageSize - 1 & ~(pageSize - 1);
          for (let a = from; a < to; a += pageSize) {
            try {
              await bsl.sectorErase?.(a);
            } catch (se) {
              throw se;
            }
          }
          log("Sector erase done");
        }
      } else {
        await bsl.erase(startAddr, data.length);
      }
    }
    if (!doVerifyOnly && optWrite.checked) {
      log(`Writing ${data.length} bytes @ ${toHex(startAddr, 8)}\u2026`);
      fwProgressReset("Writing\u2026");
      const ff = 255;
      for (let off = 0; off < data.length; off += chunkSize) {
        let end = Math.min(off + chunkSize, data.length);
        let chunk = data.subarray(off, end);
        let skip = true;
        for (let i = 0; i < chunk.length; i++) {
          if (chunk[i] !== ff) {
            skip = false;
            break;
          }
        }
        if (!skip) {
          await bsl.downloadTo(startAddr + off, chunk);
        }
        const cur = off + chunk.length;
        const pct = Math.min(100, Math.round(cur / data.length * 100));
        const curAddr = startAddr + cur;
        const endAddr = startAddr + data.length;
        fwProgress(pct, `${curAddr} / ${endAddr}`);
        if (activeConnection === "serial") await sleep(1);
      }
      log("Write done");
      fwProgress(100, "Done");
    }
    if (optVerify.checked || doVerifyOnly) {
      log("Verify\u2026");
      let ok = false;
      try {
        if (chipIsCC26xx && bsl.crc32Cc26xx) {
          const crc = await bsl.crc32Cc26xx(startAddr, data.length);
          log(`CRC32(dev)=0x${crc.toString(16).toUpperCase().padStart(8, "0")}`);
          ok = true;
        } else {
          ok = await bsl.verifyCrc(startAddr, data.length);
        }
      } catch {
      }
      log(ok ? "Verify OK" : "Verify inconclusive");
    }
    const originalBaudRate = parseInt(bitrateInput.value, 10) || 115200;
    try {
      if (activeConnection === "serial") {
        await serial?.reopenWithBaudrate?.(originalBaudRate);
        log(`Serial: switched baud to ${originalBaudRate}`);
      } else if (activeConnection === "tcp") {
        await changeBaudOverTcp(originalBaudRate);
        log(`TCP: switched baud to ${originalBaudRate}`);
      }
    } catch {
      log("Serial: failed to switch baud");
    }
  }
  async function resetUseLines(assumeSwap) {
    await setLines(true, true, assumeSwap);
    await sleep(250);
    await setLines(true, false, assumeSwap);
    await sleep(250);
    await setLines(true, true, assumeSwap);
    await sleep(1e3);
  }
  async function nvramReadAll2() {
    nvProgressReset("Reading\u2026");
    const link = getActiveLink();
    const payload = await nvramReadAll(link, nvProgress);
    nvProgress(100, "Done");
    return payload;
  }
  async function nvramEraseAll2() {
    nvProgressReset("Erasing\u2026");
    const link = getActiveLink();
    await nvramEraseAll(link, nvProgress);
    nvProgress(100, "Erase done");
  }
  async function nvramWriteAll2(obj) {
    nvProgressReset("Writing\u2026");
    const link = getActiveLink();
    await nvramWriteAll(link, obj, (s) => log(s), nvProgress);
    nvProgress(100, "Write done");
  }
  btnNvRead?.addEventListener("click", async () => {
    await withButtonStatus(btnNvRead, async () => {
      try {
        nvProgressSetColor("primary");
        nvProgressReset("Reading\u2026");
        const payload = await nvramReadAll2();
        const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const modelRaw = (chipModelEl?.value || "device").trim();
        const modelSafe = modelRaw.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "");
        const ieeeRaw = (ieeeMacEl?.value || "").toUpperCase();
        const ieeeSafe = ieeeRaw.replace(/[^A-F0-9]/g, "");
        const d = /* @__PURE__ */ new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
          d.getMinutes()
        )}${pad(d.getSeconds())}`;
        const nameParts = ["NVRAM", modelSafe || "device", ieeeSafe || "unknown", ts];
        a.download = nameParts.join("_") + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        log("NVRAM backup downloaded");
        nvProgress(100, "Done");
        return true;
      } catch (e) {
        log("NVRAM read error: " + (e?.message || String(e)));
        nvProgressReset("Error");
        throw e;
      }
    });
  });
  btnNvErase?.addEventListener("click", async () => {
    await withButtonStatus(btnNvErase, async () => {
      try {
        nvProgressSetColor("danger");
        nvProgressReset("Erasing\u2026");
        await nvramEraseAll2();
        log("NVRAM erase done. Resetting\u2026");
        try {
          await performReset();
        } catch {
        }
        nvProgress(100, "Done");
        return true;
      } catch (e) {
        log("NVRAM erase error: " + (e?.message || String(e)));
        nvProgressReset("Error");
        throw e;
      }
    });
  });
  var setLines = async (rstLow, bslLow, assumeSwap) => {
    const { dtr, rts } = computeDtrRts(rstLow, bslLow, assumeSwap);
    if (activeConnection === "serial") {
      await serial?.setSignals?.({ dataTerminalReady: dtr, requestToSend: rts });
      return;
    }
    const bslTpl = (bslUrlInput?.value || DEFAULT_CONTROL.bslPath).trim();
    const rstTpl = (rstUrlInput?.value || DEFAULT_CONTROL.rstPath).trim();
    const bslLevel = bslLow ? 0 : 1;
    const rstLevel = rstLow ? 0 : 1;
    const bslHasSet = /\{SET\}/.test(bslTpl);
    const rstHasSet = /\{SET\}/.test(rstTpl);
    await sendCtrlUrl(bslTpl, bslHasSet ? bslLevel : void 0);
    await sendCtrlUrl(rstTpl, rstHasSet ? rstLevel : void 0);
  };
  async function bslUseLines(assumeSwap) {
    if (implyGateToggle?.checked != true) {
      await setLines(true, true, assumeSwap);
      await sleep(250);
      await setLines(false, true, assumeSwap);
      await sleep(250);
      await setLines(false, false, assumeSwap);
      await sleep(250);
      await setLines(false, true, assumeSwap);
      await sleep(500);
    } else {
      await setLines(true, true, assumeSwap);
      await sleep(250);
      await setLines(true, false, assumeSwap);
      await sleep(250);
      await setLines(false, true, assumeSwap);
      await sleep(450);
      await setLines(false, false, assumeSwap);
      await sleep(250);
    }
  }
  async function changeBaudOverTcp(baud) {
    if (activeConnection !== "tcp" || !tcp) throw new Error("No TCP connection");
    const tpl = (baudUrlInput?.value || DEFAULT_CONTROL.baudPath).trim();
    const hasSet = /\{SET\}/.test(tpl);
    log(`CTRL(tcp): changing baud -> ${baud} using template ${tpl}`);
    await sendCtrlUrl(tpl, hasSet ? baud : void 0).catch((e) => {
      log("Baud change failed: " + (e?.message || String(e)));
      sleep(1e3);
    });
    await sleep(1e3);
    const host = hostInput.value.trim();
    const port = parseInt(portInput.value || "", 10);
    if (!host || !port) throw new Error("Host/port not set for reconnect");
    try {
      try {
        tcp.close();
      } catch {
      }
      const wsBase = getBridgeWsBase();
      tcp = new TcpClient(wsBase);
      await tcp.connect(host, port).catch;
      tcp.onData((d) => log(`RX: ${bufToHex(d)}`, "rx"));
      tcp.onTx?.((d) => log(`TX: ${bufToHex(d)}`, "tx"));
      activeConnection = "tcp";
      updateConnectionUI();
      log(`TCP reconnected to ${host}:${port} after baud change`);
      await sleep(1e3);
    } catch (e) {
      log(`TCP reconnect error after baud change: ${e?.message || String(e)}`);
      throw e;
    }
  }
  enterBslBtn?.addEventListener("click", async () => {
    await withButtonStatus(enterBslBtn, async () => {
      await enterBsl();
    });
  });
  resetBtn?.addEventListener("click", async () => {
    await withButtonStatus(resetBtn, async () => {
      await performReset();
    });
  });
  btnPing?.addEventListener("click", async () => {
    await withButtonStatus(btnPing, async () => {
      const link = getActiveLink();
      const ok = await pingApp(link);
      if (!ok) throw new Error("Ping failed");
      else log("Ping-Pong");
    });
  });
  btnVersion?.addEventListener("click", async () => {
    await withButtonStatus(btnVersion, async () => {
      const link = getActiveLink();
      const info = await getFwVersion(link);
      const ok = !!info;
      if (info && firmwareVersionEl) {
        firmwareVersionEl.value = String(info.fwRev);
        log(`FW version: ${info.fwRev}`);
      }
      if (!ok) throw new Error("Version not available");
    });
  });
  btnGetModel?.addEventListener("click", async () => {
    await withButtonStatus(btnGetModel, async () => {
      await readChipInfo();
    });
  });
  btnNvWrite?.addEventListener("click", async () => {
    await withButtonStatus(btnNvWrite, async () => {
      try {
        nvProgressSetColor("warning");
        nvProgressReset("Writing\u2026");
        let text = null;
        const hasPicker = typeof window.showOpenFilePicker === "function";
        if (hasPicker) {
          try {
            const handles = await window.showOpenFilePicker({
              multiple: false,
              types: [
                {
                  description: "JSON Files",
                  accept: { "application/json": [".json"] }
                }
              ]
            });
            const handle = handles && handles[0];
            if (handle) {
              const file = await handle.getFile();
              text = await file.text();
            }
          } catch (e) {
            if (e && (e.name === "AbortError" || e.code === 20)) {
              log("NVRAM JSON file not selected");
              throw e;
            }
          }
        }
        if (text == null && !hasPicker) {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "application/json";
          input.style.position = "fixed";
          input.style.left = "-10000px";
          document.body.appendChild(input);
          const picked = await new Promise((resolve) => {
            let settled = false;
            const cleanup = () => {
              input.removeEventListener("change", onChange);
              window.removeEventListener("focus", onFocus);
            };
            const onChange = () => {
              if (settled) return;
              settled = true;
              const f = input.files && input.files[0] ? input.files[0] : null;
              cleanup();
              resolve(f);
            };
            const onFocus = () => {
              setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(null);
              }, 0);
            };
            input.addEventListener("change", onChange, { once: true });
            window.addEventListener("focus", onFocus, { once: true });
            input.click();
          });
          if (picked) {
            text = await picked.text();
          }
          input.remove();
        }
        if (!text) {
          const err = new Error("NVRAM JSON file not selected");
          log(err.message);
          throw err;
        }
        const j = JSON.parse(text);
        await nvramWriteAll2(j);
        log("NVRAM write done. Resetting\u2026");
        try {
          await performReset();
        } catch {
        }
        nvProgress(100, "Done");
        return true;
      } catch (e) {
        log("NVRAM write error: " + (e?.message || String(e)));
        nvProgressReset("Error");
        throw e;
      }
    });
  });
  btnFlash.addEventListener("click", async () => {
    await withButtonStatus(btnFlash, async () => {
      try {
        await flash(false);
        log("Flashing finished. Restarting device...");
        try {
          await performReset();
          log("Restart done");
        } catch (e) {
          log("Restart error: " + (e?.message || String(e)));
        }
        log("Pinging device...");
        try {
          const link = getActiveLink();
          const ok = await pingWithBaudRetries(link);
          if (!ok) log("Ping: timed out or no response");
        } catch (e) {
          log("Ping error: " + (e?.message || String(e)));
        }
        log("Reading firmware version...");
        try {
          const info = await getFwVersion(getActiveLink());
          if (info && firmwareVersionEl) {
            firmwareVersionEl.value = String(info.fwRev);
            log(`FW version: ${info.fwRev}`);
          }
        } catch (e) {
          log("Version read error: " + (e?.message || String(e)));
        }
        return true;
      } catch (e) {
        log("Flash error: " + (e?.message || String(e)));
        throw e;
      }
    });
  });
  updateOptionsStateForFile(false);
  updateConnectionUI();
  function applySelectToInput(sel, input) {
    if (!sel || !input) return;
    const v = (sel.value || "").trim();
    if (!v) {
      input.value = "";
      saveCtrlSettings();
      return;
    }
    if (v === "sp:dtr") {
      input.value = "http://{BRIDGE}/sc?port={PORT}&dtr={SET}";
    } else if (v === "sp:rts") {
      input.value = "http://{BRIDGE}/sc?port={PORT}&rts={SET}";
    } else if (v.startsWith("gpio:") || v.startsWith("led:")) {
      const idx = v.indexOf(":");
      const path = idx >= 0 ? v.substring(idx + 1) : v;
      input.value = `http://{BRIDGE}/gpio?path=${path}&set={SET}`;
    } else if (v === "bridge") {
      input.value = "http://{BRIDGE}/sc?port={PORT}&baud={SET}";
    } else if (v === "none") {
      input.value = "";
    } else if (v == "xzg:bsl") {
      input.value = "http://{HOST}/cmdZigBSL";
    } else if (v == "xzg:rst") {
      input.value = "http://{HOST}/cmdZigRST";
    } else if (v == "esphome:bsl") {
      input.value = "http://{HOST}/switch/zBSL/{SET}";
    } else if (v == "esphome:rst") {
      input.value = "http://{HOST}/switch/zRST_gpio/{SET}";
    }
    saveCtrlSettings();
  }
  bslUrlSelect?.addEventListener("change", () => applySelectToInput(bslUrlSelect, bslUrlInput));
  rstUrlSelect?.addEventListener("change", () => applySelectToInput(rstUrlSelect, rstUrlInput));
  baudUrlSelect?.addEventListener("change", () => applySelectToInput(baudUrlSelect, baudUrlInput));
  var btnClearLog = document.getElementById("btnClearLog");
  var btnCopyLog = document.getElementById("btnCopyLog");
  btnClearLog?.addEventListener("click", () => {
    logEl.innerHTML = "";
  });
  btnCopyLog?.addEventListener("click", async () => {
    const lines = Array.from(logEl.querySelectorAll(".log-line")).filter((el) => {
      if (typeof showIoEl !== "undefined" && showIoEl !== null && !showIoEl.checked) {
        if (el.classList.contains("log-rx") || el.classList.contains("log-tx")) return false;
      }
      return true;
    }).map((el) => el.innerText).join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      log("Log copied to clipboard");
    } catch (e) {
      log("Copy failed: " + (e?.message || String(e)));
    }
  });
  async function refreshMdnsList() {
    if (!mdnsSelect) return;
    if (window.location.protocol === "https:") {
      console.warn("Secure page - no request to bridge");
      return;
    }
    setBridgeLoading();
    refreshControlLists();
    try {
      const types = [
        "_zig_star_gw._tcp.local.",
        "_zigstar_gw._tcp.local.",
        "_uzg-01._tcp.local.",
        "_tubeszb._tcp.local.",
        "_xzg._tcp.local.",
        // special token for local serial exposure by the bridge
        "local.serial"
      ].join(",");
      const base = getBridgeBase();
      const url = `${base}/mdns?types=${encodeURIComponent(types)}&timeout=3000`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`mdns http ${resp.status}`);
      const j = await resp.json();
      const devices = j.devices || [];
      mdnsSelect.innerHTML = "";
      const def = document.createElement("option");
      def.value = "";
      def.textContent = devices.length ? "\u2014 Discovered devices \u2014" : "\u2014 No devices found \u2014";
      mdnsSelect.appendChild(def);
      for (const d of devices) {
        const o = document.createElement("option");
        o.value = `${d.host}:${d.port}`;
        const extras = [];
        if (d.type) extras.push(d.type);
        const txt = d.txt || {};
        if (txt.board) extras.push(`board=${String(txt.board)}`);
        if (txt.serial_number) extras.push(`sn=${String(txt.serial_number)}`);
        if (txt.radio_type) extras.push(`radio=${String(txt.radio_type)}`);
        const suffix = extras.length ? ` \u2014 ${extras.join(", ")}` : "";
        const main = `${d.host}:${d.port}`;
        o.textContent = d.name ? `${d.name} (${main})${suffix}` : `${main}${suffix}`;
        o.setAttribute("data-host", d.host);
        o.setAttribute("data-port", String(d.port));
        if (d.type) o.setAttribute("data-type", d.type);
        if (d.protocol) o.setAttribute("data-protocol", d.protocol);
        if (txt.board) o.setAttribute("data-board", String(txt.board));
        if (txt.serial_number) o.setAttribute("data-serial-number", String(txt.serial_number));
        if (txt.radio_type) o.setAttribute("data-radio-type", String(txt.radio_type));
        if (d.fqdn) o.title = d.fqdn;
        mdnsSelect.appendChild(o);
      }
      const manual = document.createElement("option");
      manual.value = "manual";
      manual.textContent = "Manual";
      manual.setAttribute("data-protocol", "tcp");
      manual.setAttribute("data-type", "manual");
      manual.setAttribute("data-port", "6638");
      manual.setAttribute("data-host", "");
      mdnsSelect.appendChild(manual);
      setBridgeStatus(true);
    } catch (e) {
      log("mDNS refresh error: " + (e?.message || String(e)));
      setBridgeStatus(false);
    }
  }
  mdnsRefreshBtn?.addEventListener("click", () => {
    if (activeConnection) return;
    refreshMdnsList();
  });
  mdnsSelect?.addEventListener("change", () => {
    if (!mdnsSelect) return;
    if (mdnsSelect.selectedOptions[0].value === "manual") {
      tcpLinksPanel?.classList.remove("d-none");
    }
    const opt = mdnsSelect.selectedOptions[0];
    const h = opt?.getAttribute("data-host") || "";
    const p = Number(opt?.getAttribute("data-port") || 0);
    if (h) hostInput.value = h;
    if (p) portInput.value = String(p);
    const t = opt?.getAttribute("data-type") || void 0;
    const pr = opt?.getAttribute("data-protocol") || void 0;
    currentConnMeta = { type: t, protocol: pr };
    applyControlConfig(deriveControlConfig(currentConnMeta), "mdns");
    updateConnectionUI();
  });
  refreshMdnsList().catch(() => {
  });
  async function refreshControlLists() {
    if (!bslUrlSelect || !rstUrlSelect) return;
    try {
      let buildSelect2 = function(sel, defaultSerial) {
        sel.innerHTML = "";
        const title = document.createElement("optgroup");
        if (sel === bslUrlSelect) title.label = "\u{1F7E8} BSL";
        else if (sel === rstUrlSelect) title.label = "\u{1F7E9} Reset";
        const oNone = document.createElement("option");
        oNone.value = "";
        oNone.textContent = "None";
        title.appendChild(oNone);
        sel.appendChild(title);
        if (defaultSerial === "") {
          oNone.selected = true;
        }
        addSerialOptgroup(sel, defaultSerial || null);
        addESPHomeOptgroup(sel, defaultSerial || null);
        const gg = document.createElement("optgroup");
        gg.label = "GPIOs";
        if (gpioItems.length) {
          for (const it of gpioItems) {
            const o = document.createElement("option");
            const label = it.label || it.name || it.path || String(it);
            const path = it.path || it.name || label;
            o.value = `gpio:${path}`;
            o.textContent = `${label}` + (it.path ? ` (${it.path})` : "");
            sel.appendChild(o);
          }
        } else {
          const o = document.createElement("option");
          o.disabled = true;
          o.textContent = "no exported GPIOs";
          gg.appendChild(o);
          sel.appendChild(gg);
        }
        const lg = document.createElement("optgroup");
        lg.label = "LEDs";
        if (ledItems.length) {
          for (const it of ledItems) {
            const o = document.createElement("option");
            const label = it.label || it.name || it.path || "led";
            const path = it.path || label;
            o.value = `led:${path}`;
            o.textContent = `${label}` + (it.path ? ` (${it.path})` : "");
            lg.appendChild(o);
          }
          sel.appendChild(lg);
        } else {
          const o = document.createElement("option");
          o.disabled = true;
          o.textContent = "no exported LEDs";
          lg.appendChild(o);
          sel.appendChild(lg);
        }
        addXZGOptgroup(sel, defaultSerial || null);
      };
      var buildSelect = buildSelect2;
      const base = getBridgeBase();
      const url = `${base}/gl`;
      let j = {};
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`gl http ${resp.status}`);
        j = await resp.json();
      } catch (e) {
        log("Control lists fetch failed: " + (e?.message || String(e)));
      }
      const gpioItems = [];
      if (j && j.gpio) {
        if (Array.isArray(j.gpio)) {
          gpioItems.push(...j.gpio);
        } else if (typeof j.gpio === "object") {
          for (const k of Object.keys(j.gpio)) {
            const v = j.gpio[k];
            if (v && typeof v === "object") gpioItems.push(v);
            else gpioItems.push({ path: String(k), label: String(k), value: String(v) });
          }
        }
      }
      const ledItems = Array.isArray(j?.leds) ? j.leds : [];
      buildSelect2(bslUrlSelect, "");
      buildSelect2(rstUrlSelect, "");
    } catch (e) {
      log("Control lists refresh error: " + (e?.message || String(e)));
    }
  }
  function addSerialOptgroup(target, def) {
    const sg = document.createElement("optgroup");
    sg.label = "Serial";
    const oDtr = document.createElement("option");
    oDtr.value = "sp:dtr";
    oDtr.textContent = "DTR";
    const oRts = document.createElement("option");
    oRts.value = "sp:rts";
    oRts.textContent = "RTS";
    sg.appendChild(oDtr);
    sg.appendChild(oRts);
    target.appendChild(sg);
    if (def) {
      try {
        target.value = def;
      } catch {
      }
    }
  }
  function addXZGOptgroup(target, def) {
    const xg = document.createElement("optgroup");
    xg.label = "XZG Firmware";
    const oBsl = document.createElement("option");
    oBsl.value = "xzg:bsl";
    oBsl.textContent = "BSL mode";
    xg.appendChild(oBsl);
    const oRst = document.createElement("option");
    oRst.value = "xzg:rst";
    oRst.textContent = "RST mode";
    xg.appendChild(oRst);
    target.appendChild(xg);
    if (def) {
      try {
        target.value = def;
      } catch {
      }
    }
  }
  function addESPHomeOptgroup(target, def) {
    const xg = document.createElement("optgroup");
    xg.label = "ESP Home";
    const oBsl = document.createElement("option");
    oBsl.value = "esphome:bsl";
    oBsl.textContent = "BSL pin";
    xg.appendChild(oBsl);
    const oRst = document.createElement("option");
    oRst.value = "esphome:rst";
    oRst.textContent = "RST pin";
    xg.appendChild(oRst);
    target.appendChild(xg);
    if (def) {
      try {
        target.value = def;
      } catch {
      }
    }
  }
})();
