## Options

- PORT (int) — WebSocket/HTTP server port. Default: 8765.
- ADVERTISE_HOST (string) — advertised host/IP. Optional; if empty the host is auto-detected.
- SERIAL_SCAN_INTERVAL (int, ms) — interval to scan and expose local serial ports. Default: 5000 (0 = disabled).
- DEBUG_MODE (bool) — enable debug logs. Default: false.

## Web interface

- Served on the same HTTP port as the WebSocket server: http://<bridgeHost>:<PORT>/
- The UI uses the WebSocket bridge to connect to targets.
- No authentication by default; intended for local networks only.

## WebSocket bridge

URL format:

```
ws://<bridgeHost>:<WS_PORT>/?host=<TCP_HOST>&port=<TCP_PORT>
```

Behavior:

- Forward all WS frames to the TCP socket.
- Send TCP data back as WS binary frames.
- Server listens on 0.0.0.0 by default.

## HTTP endpoints

All endpoints respond with JSON and include CORS headers.

### GET /mdns

Purpose: discover mDNS services and optionally expose local serial ports as ephemeral TCP servers.

Query parameters:

- types (string) — comma-separated service types (e.g. `_http._tcp`, `_zigstar_gw._tcp.local.`). To include local serial ports, use one of: `local`, `local.serial`, `local-serial`, `local:serial`.
- timeout (int) — scan timeout in ms (500–10000). Default: 2000.

Response schema:

```json
{
  "devices": [
    {
      "name": "string",
      "host": "string",
      "port": 1234,
      "type": "string",
      "protocol": "tcp|udp|serial",
      "fqdn": "string",
      "txt": { "k": "v" }
    }
  ]
}
```

Notes:

- When local serial is requested each port is bound to 0.0.0.0 on an ephemeral TCP port.
- The advertised `host` field is ADVERTISE_HOST if set, otherwise the host primary IPv4.
- Default serial baud: 115200.

### GET /sc

Purpose: set DTR/RTS or change baud on a local serial port (identified by `path` or an exposed TCP `port`).

Query parameters (one of `path` or `port` required):

- path (string) — serial device path (e.g. `/dev/ttyUSB0`, `COM3`).
- port (int) — TCP port of the serial server (from `/mdns`).
- dtr (1|0|true|false) — optional.
- rts (1|0|true|false) — optional.
- baud (int) — optional; applied immediately and used for subsequent reconnects.

Response schema:

```json
{ "ok": true, "path": "/dev/tty...", "tcpPort": 50123, "set": { "dtr": true, "rts": false, "baud": 115200 } }
```

## Serial over TCP

- Request `/mdns?types=local` to create per-device TCP servers for local serial ports.
- Connect via WebSocket to the advertised TCP port using the WebSocket bridge URL above.

## Notes

- mDNS in Linux containers require host networking (`--network host`).
- To expose host serial devices to a container, pass `--device /dev/ttyUSB0:/dev/ttyUSB0`.
