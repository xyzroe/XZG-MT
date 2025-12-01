# XZG-MT Bridge

A Go implementation of the XZG Multi-tool Bridge server. This is a WebSocket-TCP bridge with mDNS discovery and local serial port exposure capabilities.

## ⭐ Features

- **WebSocket ↔ TCP Bridge**: Forward WebSocket connections to TCP devices
- **mDNS Discovery**: Automatically discover devices on the local network
- **Serial Port Support**: Expose local serial ports as TCP servers
- **HTTP Control**: Control DTR/RTS pins, general GPIOs (only 🐧) and baud rates via HTTP API
- **Embedded Web UI**: Built-in web interface for device management
- **Cross-Platform**: Builds for: **Linux**: (amd64, arm64, 386, arm, mips, mipsle, mips64, mips64le); **macOS** (darwin): (amd64, arm64); **Windows** (amd64, 386, arm64);

## 🏗️ Architecture

- **HTTP Server**: Serves the web UI and API endpoints
- **WebSocket Handler**: Manages WebSocket connections and forwards to TCP
- **Serial Manager**: Handles serial port discovery and TCP server creation
- **mDNS Scanner**: Discovers devices on the local network
- **Embedded Assets**: Web UI files are embedded in the binary

## 🚀 Quick Start

The easiest way is to use prebuild binaries, ready yo use Docker images or even HomeAssist Add-on.
More info can be found in the [main readme](../README.md#-remote-tcp-or-remote-usbserial)

## 🛠️ Build from the source

### Prerequisites

- Go 1.21 or later
- Git

### Installation

1. Clone the repository:

```bash
git clone https://github.com/xyzroe/XZG-MT.git
cd XZG-MT/bridge
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

### Building Docker image

```bash
docker buildx build --platform linux/amd64 --build-arg VERSION=dev -t xzg-mt-bridge:dev --load -f bridge/Dockerfile .
```

## 📖 Usage

### Command Line Options

```bash
./XZG-MT-linux-amd64 [options]
```

Options:

- `-port`: WebSocket server port (default: 8765)
- `-advertise-host`: Host to advertise for mDNS (default: auto-detect)
- `-debug`: Enable debug mode (default: no)

### Environment Variables

- `PORT`: WebSocket server port
- `ADVERTISE_HOST`: Host to advertise for mDNS
- `DEBUG_MODE`: Enable debug mode (1, true, yes, on)

## 🔌 API Endpoints

#### WebSocket Bridge

- `GET /ws?host=<target_host>&port=<target_port>`: WebSocket bridge to TCP device

#### mDNS Discovery

- `GET /mdns?types=<service_types>&timeout=<ms>`: Discover devices via mDNS

#### Serial Control

- `GET /sc?path=<serial_path>&dtr=<0|1>&rts=<0|1>&baud=<rate>`: Control serial port

#### GPIO Control

- `GET /gpio?path=<full_system_gpio_path>&set=<0|1>`: Control GPIO port

#### Static Files

- `GET /*`: Serve embedded web interface

## 📁 Project Structure

```
bridge/
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
