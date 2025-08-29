## Installation

Follow these steps to install the Home Assistant add-on:

1. Add the repository URL to your Home Assistant add-on store.
2. Install the "WS-TCP Bridge" add-on from the store.
3. Configure options as needed (see Configuration below).
4. Start the add-on.

## Configuration

The add-on will be available on the configured port (default: 8765).

Options:

- `port` (int, default: 8765) — WebSocket server port
- `advertise_host` (string, optional) — Host IP to advertise (auto-detected if empty)

Example configuration:

```yaml
port: 8765
advertise_host: ""
```

## Usage

### WebSocket bridge

Connect a WebSocket client to the add-on to forward traffic to a TCP host/port:

```
ws://<homeassistant_ip>:<port>/?host=<target_host>&port=<target_port>
```

Example:

```
ws://192.168.1.100:8765/?host=192.168.1.50&port=8888
```

### mDNS discovery

Scan for available devices and optionally include local serial ports:

```
GET http://<homeassistant_ip>:<port>/mdns?types=_zigstar_gw._tcp,local
```

Query parameters:

- `types` — comma-separated service types to discover (e.g., `_http._tcp`, `_zigstar_gw._tcp.local`, `local` for serial ports)
- `timeout` — scan timeout in milliseconds (500–10000, default: 2000)

### Serial control

Set DTR/RTS on a local serial port exposed by the add-on:

```
GET http://<homeassistant_ip>:<port>/sc?path=/dev/ttyUSB0&dtr=1&rts=0
```

Query parameters:

- `path` — serial device path (e.g., `/dev/ttyUSB0`) OR `port` — TCP port of serial server
- `dtr` — set DTR signal (1/0 or true/false)
- `rts` — set RTS signal (1/0 or true/false)
