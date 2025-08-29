# ws-tcp-bridge Home Assistant Add-on

![Supports aarch64 Architecture][aarch64-shield]
![Supports amd64 Architecture][amd64-shield]
![Supports armhf Architecture][armhf-shield]
![Supports armv7 Architecture][armv7-shield]
![Supports i386 Architecture][i386-shield]

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armhf-shield]: https://img.shields.io/badge/armhf-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
[i386-shield]: https://img.shields.io/badge/i386-yes-green.svg

<div align="center"> 
<a href="https://github.com/xyzroe/ws-tcp-bridge/releases"><img src="https://img.shields.io/github/release/xyzroe/ws-tcp-bridge.svg" alt="GitHub version"></img></a>
<a href="https://github.com/xyzroe/ws-tcp-bridge/actions/workflows/build-binaries.yml"><img src="https://img.shields.io/github/actions/workflow/status/xyzroe/ws-tcp-bridge/build-binaries.yml" alt="GitHub Actions Workflow Status"></img></a>
<a href="https://github.com/xyzroe/ws-tcp-bridge/releases/latest"><img src="https://img.shields.io/github/downloads/xyzroe/ws-tcp-bridge/total.svg" alt="GitHub download"></img></a>
<a href="https://github.com/xyzroe/ws-tcp-bridge/issues"><img src="https://img.shields.io/github/issues/xyzroe/ws-tcp-bridge" alt="GitHub Issues or Pull Requests"></img></a>
<a href="https://github.com/xyzroe/ws-tcp-bridge/blob/main/LICENSE"><img src="https://img.shields.io/github/license/xyzroe/ws-tcp-bridge.svg" alt="License"></img></a>
</div>

Home Assistant add-on for ws-tcp-bridge. Tiny WebSocket ↔ TCP bridge with mDNS discovery and local serial port exposure.

**Warning**: development helper only. Don't expose it to the public Internet.

## What it's for

- Bridge a WebSocket client to any TCP host:port
- Optionally discover targets via mDNS
- Optionally expose each local serial port as a TCP server and control DTR/RTS
- Integrated into Home Assistant supervisor with configurable access controls

## Installation

1. Add this repository to your Home Assistant add-on store
2. Install the "WS-TCP Bridge" add-on
3. Configure the add-on options
4. Start the add-on

## Configuration

The add-on will be available on the configured port (default: 8765).

### Options

- `port` (int, default: 8765) — WebSocket server port
- `advertise_host` (str, optional) — Host IP to advertise (auto-detected if empty)

### Example Configuration

```yaml
port: 8765
advertise_host: ""
```

## Usage

### WebSocket bridge

Connect to WebSocket server:

```
ws://<homeassistant_ip>:<port>/?host=<target_host>&port=<target_port>
```

Example — bridge to device at 192.168.1.50:8888:

```
ws://192.168.1.100:8765/?host=192.168.1.50&port=8888
```

### mDNS discovery

Get available devices and services:

```
GET http://<homeassistant_ip>:<port>/mdns?types=_zigstar_gw._tcp,local
```

Query parameters:

- `types` — comma-separated service types to discover (e.g., `_http._tcp`, `_zigstar_gw._tcp.local`, `local` for serial ports)
- `timeout` — scan timeout in milliseconds (500-10000, default: 2000)

### Serial control

Control DTR/RTS signals on serial ports:

```
GET http://<homeassistant_ip>:<port>/sc?path=/dev/ttyUSB0&dtr=1&rts=0
```

Query parameters:

- `path` — serial device path (e.g., `/dev/ttyUSB0`) OR `port` — TCP port of serial server
- `dtr` — set DTR signal (1/0 or true/false)
- `rts` — set RTS signal (1/0 or true/false)

## Repository

Main project: https://github.com/xyzroe/ws-tcp-bridge
