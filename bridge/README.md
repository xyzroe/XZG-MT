# XZG-MT Bridge - Node.js

> ⚠️ **ARCHIVED / UNMAINTAINED**
>
> This directory contains the legacy Node.js bridge implementation and is no longer actively maintained. It will not receive updates or security fixes.
> Prefer the Go bridge (../bridge-go) or the official Docker images on GHCR for supported builds and fixes.
>
> If you rely on this code, consider forking and maintaining your own copy.

A Node.js implementation of the XZG Multi-tool Bridge server. This is a WebSocket-TCP bridge with mDNS discovery and local serial port exposure capabilities.

## Features

- **WebSocket ↔ TCP Bridge**: Forward WebSocket connections to TCP devices
- **mDNS Discovery**: Automatically discover devices on the local network
- **Serial Port Support**: Expose local serial ports as TCP servers
- **HTTP Control**: Control DTR/RTS pins and baud rates via HTTP API
- **Embedded Web UI**: Built-in web interface for device management
- **Cross-Platform**: Builds for Windows, macOS, and Linux (x64 and ARM64)

## Quick start — Node.js

Requires Node.js >= 16.

1. Install deps: `npm install`
2. Run: `node bridge.js 8765` (or `npm start` for the default 8765)

## Protocol: WebSocket ↔ TCP

- Server listens on `ws://0.0.0.0:<WS_PORT>`
- Connect your WS client to:
  `ws://<bridgeHost>:<WS_PORT>/?host=<TCP_HOST>&port=<TCP_PORT>`
- All WS frames are forwarded to the TCP socket; TCP data is sent back as WS binary frames.

Example (bridge to local TCP echo on 127.0.0.1:7000):
`ws://localhost:8765/?host=127.0.0.1&port=7000`

## HTTP endpoints

All responses include CORS headers.

### GET /mdns

Scan via mDNS and/or include local serial ports as “services”.

Query:

- `types`: comma‑separated service types, e.g. `_http._tcp`, `_zigstar_gw._tcp.local.`
  - To include local serial ports: any of `local.serial`, `local:serial`, `local-serial`, `local`
- `timeout`: scan time in ms (500–10000). Default 2000.

Response:

```
{ "devices": [
  { "name": "string", "host": "IPv4 or hostname", "port": 1234,
    "type": "_type_ or 'local'", "protocol": "tcp|udp|serial",
    "fqdn": "string", "txt": { "k": "v" } }
] }
```

Notes:

- When local serial is requested, each port is exposed as a TCP server on an ephemeral port bound to 0.0.0.0.
- The advertised `host` is `ADVERTISE_HOST` (if set) or your primary IPv4.
- Default serial speed: 115200.

### GET /sc

Set DTR/RTS on a local serial port or change baud rate.

Query (one of `path` or `port` is required):

- `path`: serial device path (e.g. `/dev/tty.usbserial-1410`, `COM3`)
- `port`: TCP port of the serial TCP server returned by `/mdns`
- `dtr`: `1|0|true|false` (optional)
- `rts`: `1|0|true|false` (optional)
- `baud`: integer (optional) — set the serial baud rate. If provided, the port speed will be changed immediately and applied after TCP reconnect. Common values: `9600`, `19200`, `38400`, `57600`, `115200`, `230400`, `460800`.

Response:
`{ "ok": true, "path": "/dev/tty...", "tcpPort": 50123, "set": { "dtr": true, "rts": false, "baud": 115200 } }`

## Serial over TCP (overview)

- Request local serial via `/mdns?types=local` to spin up per‑device TCP servers.
- To talk to a serial device via WS, connect to:
  `ws://<bridgeHost>:<WS_PORT>/?host=<advertisedHost>&port=<serialTcpPort>`

## Configuration

The Home Assistant add-on (and Docker/CLI) supports the following configuration keys (see `xzg-multi-tool-addon/config.json`):

- `port` (int, default: 8765) — TCP port the WebSocket server listens on. Can also be set via the `PORT` env var or CLI arg.
- `serial_scan_interval` (int, default: 5000) — interval in milliseconds used when scanning/exposing local serial ports (set to `0` to disable serial monitoring).
- `advertise_host` (string, optional) — override the host/IP published in logs and `/mdns` serial entries (env var `ADVERTISE_HOST`).
- `debug_mode` (bool, default: false) — enable extra debug logs (env var `DEBUG_MODE`, set to `true`)

Examples:

Docker run with serial scan interval and debug enabled:

```bash
docker run --rm -p 8765:8765 \
  -e PORT=8765 \
  -e SERIAL_SCAN_INTERVAL=5000 \
  -e ADVERTISE_HOST=192.168.1.42 \
  -e DEBUG_MODE=true \
  ghcr.io/xyzroe/XZG-MT:latest
```

Or using the CLI/packaged binary:

```bash
PORT=9000 SERIAL_SCAN_INTERVAL=5000 ADVERTISE_HOST=192.168.1.42 DEBUG_MODE=true \
  node bridge.js 9000 5000
```

## Home Assistant add-on (optional)

An add-on definition is included under `home-assistant-addon/bridge/` and is published alongside releases.

Install:

1. In Home Assistant, go to Settings → Add-ons → Add-on Store.
2. Add this repository URL or import the add-on folder into a local add-ons repo.
3. Install “WS TCP Bridge”, start it, and toggle “Start on boot” if desired.

Config keys:

- `port` (default: 8765)
- `advertise_host` (optional): IP/hostname to publish in logs and `/mdns` serial entries.

Serial and mDNS tips:

- Ensure the add-on has access to serial hardware (enable UART/hardware access or map devices depending on your HA setup).
- For better mDNS behavior, host networking may be required depending on your environment.

## Build your own binaries (optional)

This project uses `pkg` to produce self‑contained executables.

1. `npm install`
2. Build one or all targets:
   - `npm run build:pkg:mac`
   - `npm run build:pkg:linux`
   - `npm run build:pkg:win`
   - `npm run build:pkg:all`

Outputs go to `dist/`.

Legacy Windows 7 build (optional): `npm run build:legacy:win7` → `dist/win-legacy/bridge.exe`.

## Notes

- Designed for local use; disable or firewall it in production networks.
- Nagle’s algorithm is disabled on WS and TCP sockets to reduce latency.

## License

MIT
