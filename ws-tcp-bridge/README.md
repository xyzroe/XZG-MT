# ws-tcp-bridge

<div align="center"> 
<a href="https://github.com/xyzroe/ws-tcp-bridge/releases"><img src="https://img.shields.io/github/release/xyzroe/ws-tcp-bridge.svg" alt="GitHub version"></img></a>
<a href="https://github.com/xyzroe/ws-tcp-bridge/actions/workflows/build-binaries.yml"><img src="https://img.shields.io/github/actions/workflow/status/xyzroe/ws-tcp-bridge/build-binaries.yml" alt="GitHub Actions Workflow Status"></img></a>
<a href="https://github.com/xyzroe/ws-tcp-bridge/releases/latest"><img src="https://img.shields.io/github/downloads/xyzroe/ws-tcp-bridge/total.svg" alt="GitHub download"></img></a>
<a href="https://github.com/xyzroe/ws-tcp-bridge/issues"><img src="https://img.shields.io/github/issues/xyzroe/ws-tcp-bridge" alt="GitHub Issues or Pull Requests"></img></a>
<a href="LICENSE"><img src="https://img.shields.io/github/license/xyzroe/ws-tcp-bridge.svg" alt="License"></img></a>
</div>

Tiny WebSocket ↔ TCP bridge for local development. It can also discover devices via mDNS and expose local serial ports over TCP for quick tests.

Warning: development helper only. Don’t expose it to the public Internet.

## What it’s for

- Bridge a WebSocket client to any TCP host:port
- Optionally discover targets via mDNS
- Optionally expose each local serial port as a TCP server and control DTR/RTS

## Quick start - Home Assistant Add-On

<div align="center"> 
<a alt="Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled." href="https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fxyzroe%2Fws-tcp-bridge"><img src="https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg" alt="GitHub Actions Workflow Status"></img></a>
</div>

## Quick start — Docker

- [Docker images page](https://github.com/xyzroe/ws-tcp-bridge/pkgs/container/ws-tcp-bridge)

Prebuilt multi-arch images are published to GHCR on each release/tag.

- Image: `ghcr.io/xyzroe/ws-tcp-bridge:<tag>` (e.g. `v0.1.1`)

Run (basic):

```bash
docker run --rm -p 8765:8765 -e ADVERTISE_HOST=192.168.1.42 ghcr.io/xyzroe/ws-tcp-bridge:latest
```

Customize port or advertised host:

```bash
docker run --rm \
  -e PORT=9000 \
  -e ADVERTISE_HOST=192.168.1.42 \
  -p 9000:9000 \
  ghcr.io/xyzroe/ws-tcp-bridge:latest
```

mDNS and local serial notes:

- mDNS discovery inside containers require host networking on Linux. If needed:
  ```bash
  docker run --rm --network host ghcr.io/xyzroe/ws-tcp-bridge:latest
  ```
- To expose a host serial device to the container add `--device` (Linux):
  ```bash
  docker run --rm --network host \
    --device /dev/ttyUSB0:/dev/ttyUSB0 \
    ghcr.io/xyzroe/ws-tcp-bridge:latest
  ```
  Then query `/mdns?types=local` and connect via the advertised TCP port.

## Quick start — prebuilt binaries

No Node.js required. Download a ready-to-run binary from Releases, make it executable (Linux/macOS), and run. The port argument is optional; default is 8765.

- [Releases page](https://github.com/xyzroe/ws-tcp-bridge/releases)

How to run:

- Windows:

  - Run: `ws-tcp-bridge-windows-*.exe` or double click

- Linux:

  1. Make executable:
     ```
     chmod +x ./ws-tcp-bridge-linux-arm64
     ```
     or
     ```
     chmod +x ./ws-tcp-bridge-linux-x64
     ```
  2. Run: `./ws-tcp-bridge-linux-*` or double click

- macOS:

  1. Make executable and remove quarantine:

  ```
  chmod +x ./ws-tcp-bridge-macos-arm64
  xattr -d com.apple.quarantine ./ws-tcp-bridge-macos-arm64
  ```

  or

  ```
  chmod +x ./ws-tcp-bridge-macos-x64
  xattr -d com.apple.quarantine ./ws-tcp-bridge-macos-x64
  ```

  2. Run: `./ws-tcp-bridge-macos-*` or double click

  On start it prints the effective URL and needed modules statuses, e.g.

  ```
  [bridge] listening ws://192.168.1.42:8765
  [startup] modules: ws=ok, bonjour=ok, serial=ok
  ```

To run on custom port: `./ws-tcp-bridge-* 9999`

## Quick start — Node.js

Requires Node.js >= 16.

1. Install deps: `npm install`
2. Run: `node ws-tcp-bridge.js 8765` (or `npm start` for the default 8765)

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

Set DTR/RTS on a local serial port.

Query (one of `path` or `port` is required):

- `path`: serial device path (e.g. `/dev/tty.usbserial-1410`, `COM3`)
- `port`: TCP port of the serial TCP server returned by `/mdns`
- `dtr`: `1|0|true|false` (optional)
- `rts`: `1|0|true|false` (optional)

Response:
`{ "ok": true, "path": "/dev/tty...", "tcpPort": 50123, "set": { "dtr": true, "rts": false } }`

## Serial over TCP (overview)

- Request local serial via `/mdns?types=local` to spin up per‑device TCP servers.
- To talk to a serial device via WS, connect to:
  `ws://<bridgeHost>:<WS_PORT>/?host=<advertisedHost>&port=<serialTcpPort>`

## Configuration

The Home Assistant add-on (and Docker/CLI) supports the following configuration keys (see `ws-tcp-bridge-ha/config.json`):

- `port` (int, default: 8765) — TCP port the WebSocket server listens on. Can also be set via the `PORT` env var or CLI arg.
- `serial_scan_interval` (int, default: 5000) — interval in milliseconds used when scanning/exposing local serial ports (set to `0` to disable serial monitoring).
- `advertise_host` (string, optional) — override the host/IP published in logs and `/mdns` serial entries (env var `ADVERTISE_HOST`).
- `debug_serial` (bool, default: false) — enable extra serial debug logs (env var `DEBUG_SERIAL`, set to `true`)

Examples:

Docker run with serial scan interval and debug enabled:

```bash
docker run --rm -p 8765:8765 \
  -e PORT=8765 \
  -e SERIAL_SCAN_INTERVAL=5000 \
  -e ADVERTISE_HOST=192.168.1.42 \
  -e DEBUG_SERIAL=true \
  ghcr.io/xyzroe/ws-tcp-bridge:latest
```

Or using the CLI/packaged binary:

```bash
PORT=9000 SERIAL_SCAN_INTERVAL=5000 ADVERTISE_HOST=192.168.1.42 DEBUG_SERIAL=true \
  node ws-tcp-bridge.js 9000 5000
```

## Home Assistant add-on (optional)

An add-on definition is included under `home-assistant-addon/ws-tcp-bridge/` and is published alongside releases.

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

Legacy Windows 7 build (optional): `npm run build:legacy:win7` → `dist/win-legacy/ws-tcp-bridge.exe`.

## Notes

- Designed for local use; disable or firewall it in production networks.
- Nagle’s algorithm is disabled on WS and TCP sockets to reduce latency.

## License

MIT
