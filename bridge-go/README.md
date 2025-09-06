# XZG-MT Go Bridge

A Go implementation of the XZG Multi-tool Bridge server. This is a WebSocket-TCP bridge with mDNS discovery and local serial port exposure capabilities.

## Features

- **WebSocket ↔ TCP Bridge**: Forward WebSocket connections to TCP devices
- **mDNS Discovery**: Automatically discover devices on the local network
- **Serial Port Support**: Expose local serial ports as TCP servers
- **HTTP Control**: Control DTR/RTS pins and baud rates via HTTP API
- **Embedded Web UI**: Built-in web interface for device management
- **Cross-Platform**: Builds for Windows, macOS, and Linux (x64 and ARM64)

## Quick Start

### Prerequisites

- Go 1.21 or later
- Git

### Installation

1. Clone the repository:

```bash
git clone https://github.com/xyzroe/XZG-MT.git
cd XZG-MT/bridge-go
```

2. Install dependencies:

```bash
make deps
```

3. Run locally:

```bash
make run
```

4. Open your browser to `http://localhost:8765`

### Building Binaries

Build for all platforms:

```bash
make build
```

Build for current platform only:

```bash
make build-local
```

## Usage

### Command Line Options

```bash
./XZG-MT-linux-amd64 [options]
```

Options:

- `-port`: WebSocket server port (default: 8765)
- `-serial-scan-interval`: Serial port scan interval in milliseconds (default: 10000)
- `-advertise-host`: Host to advertise for mDNS (default: auto-detect)
- `-debug`: Enable debug mode (default: no)

### Environment Variables

- `PORT`: WebSocket server port
- `SERIAL_SCAN_INTERVAL`: Serial port scan interval in milliseconds
- `ADVERTISE_HOST`: Host to advertise for mDNS
- `DEBUG_MODE`: Enable debug mode (1, true, yes, on)

### API Endpoints

#### WebSocket Bridge

- `GET /ws?host=<target_host>&port=<target_port>`: WebSocket bridge to TCP device

#### mDNS Discovery

- `GET /mdns?types=<service_types>&timeout=<ms>`: Discover devices via mDNS

#### Serial Control

- `GET /sc?path=<serial_path>&dtr=<0|1>&rts=<0|1>&baud=<rate>`: Control serial port

#### Static Files

- `GET /*`: Serve embedded web interface

## Architecture

The Go implementation follows the same architecture as the original Node.js version:

1. **HTTP Server**: Serves the web UI and API endpoints
2. **WebSocket Handler**: Manages WebSocket connections and forwards to TCP
3. **Serial Manager**: Handles serial port discovery and TCP server creation
4. **mDNS Scanner**: Discovers devices on the local network
5. **Embedded Assets**: Web UI files are embedded in the binary

## Development

### Project Structure

```
go/
├── main.go          # Main application entry point
├── routes.go        # HTTP route handlers
├── websocket.go     # WebSocket connection handling
├── serial.go        # Serial port management
├── mdns.go          # mDNS discovery
├── embed.go         # Embedded file handling
├── go.mod           # Go module definition
├── build.sh         # Build script
├── Makefile         # Build automation
├── web/             # Web UI files (embedded)
└── dist/            # Built binaries (created during build)
```

### Building

```bash
# Install dependencies
make deps

# Format code
make fmt

# Lint code
make lint

# Clean build artifacts if any
make clean

# Build for all platforms
make build
```
