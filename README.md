# 📁 XZG Multi Tool CC Loader branch

Welcome to the **cc_loader** branch of the XZG Multi Tool repository!

This branch contains firmware for programming TI CC2530 chips using Arduino/ESP8266/ESP32 boards as a flash programmer. All binary files are automatically generated using GitHub Workflow.

## 🗂 Directory Structure

- `README.md` - This file
- `task.json` - Build/task configuration
- `Arduino/` - Arduino implementation
  - `CCLoader` - Arduino sketch folder
    - `CCLoader.ino` - Arduino sketch for Arduino/ESP8266/ESP32
- `bins/` - Pre-compiled firmware binaries
  - `manifest.json` - Firmware manifest file
- `src/` - Source code for host applications
  - `mac_os_x/` - macOS implementation
    - `main.c` - Host application for macOS

## 🛠 How to Use

All firmware files in this branch are primarily intended to be used with the [XZG Multi Tool](http://mt.xyzroe.cc/), but can also be used with other compatible software.

Ready to user firmware binaries for different ESP boards can be found in the `bins/` directory. Check `bins/manifest.json` for available configurations.

To build the host application from source code:

- **macOS**: `gcc src/mac_os_x/main.c -o CCLoader`

## 📋 Supported Hardware

- **Arduino**: Uno, Nano, Pro Mini, and compatible boards
- **ESP8266**: D1 Mini, NodeMCU, and compatible boards
- **ESP32**: ESP32 Dev, ESP32-C3, ESP32-C6, ESP32-S3

> [!IMPORTANT]
> Only boards with **CH340** or **CP2102** USB-TTL converters are supported. Boards with other converters or native USB connections could not work properly.

## 🔌 Pin Configuration

### CC2530 Pins

The programmer communicates with CC2530 chip using 3 debug interface pins:

| Function  | CC2530 Pin | Description                |
| --------- | ---------- | -------------------------- |
| **DD**    | P2.1       | Debug Data (bidirectional) |
| **DC**    | P2.2       | Debug Clock                |
| **RESET** | RST        | Reset line                 |
| **VCC**   | VCC        | Power supply (3.3V)        |
| **GND**   | GND        | Ground                     |

### ESP Pins

ESP board GPIO pin assignments vary by build and are defined in `bins/manifest.json`:

- **DD, DC, RESET** - Connected to CC2530 debug interface
- **LED** - Status indicator

## 💡 Thanks to

- RedBearLab for [CC Loader](https://github.com/RedBearLab/CCLoader) for the amazing job!
- Timo Kokkonen for [CC Loader fork](https://github.com/tjko/CCLoader) with detect chip id and flash dump functionality!

## 🤝 Contributing

Contributions are always welcome! Feel free to submit a pull request or create an issue for any updates, fixes, or improvements.

---

<div align="center"> Created with &#x2764;&#xFE0F; by <a href="https://xyzroe.cc/">xyzroe</a> © 2025</div>

---
