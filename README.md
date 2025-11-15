# XZG Multi-tool

<div align="center">
  <img src="https://mt.xyzroe.cc/fav/favicon.svg" alt="XZG Multi-tool" style="height:160px; margin-bottom:12px;" />
</div>

---

<div align="center"> 
<a href="https://github.com/xyzroe/XZG-MT/releases"><img src="https://img.shields.io/github/release/xyzroe/XZG-MT.svg" alt="GitHub version"></img></a>
<a href="https://github.com/xyzroe/XZG-MT/actions/workflows/build-binaries.yml"><img src="https://img.shields.io/github/actions/workflow/status/xyzroe/XZG-MT/build-binaries.yml" alt="GitHub Actions Workflow Status"></img></a>
<a href="https://github.com/xyzroe/XZG-MT/releases/latest"><img src="https://img.shields.io/github/downloads/xyzroe/XZG-MT/total.svg" alt="GitHub download"></img></a>
<a href="https://github.com/xyzroe/XZG-MT/issues"><img src="https://img.shields.io/github/issues/xyzroe/XZG-MT" alt="GitHub Issues or Pull Requests"></img></a>
<a href="LICENSE"><img src="https://img.shields.io/github/license/xyzroe/XZG-MT.svg" alt="License"></img></a>
</div>

## 📖 About

XZG Multi-tool is aimed at hobbyists and developers who need an easy way to flash TI CC1352 / CC2652 and SL EFR32 devices. The web frontend provides a polished UI and local flashing via Web Serial. The `bridge` allows remote or headless hosts to expose serial devices over TCP and connect them to the web UI.

## ⭐ Features

- 🔌 Work with local USB TI CC1352 / CC2652 and SL EFR32 via Web Serial or with remote via WS-TCP bridge
- 📂 Flash firmware from custom local file or select from provided
- 🦾 Automatic chip model, flash size, IEEE and firmware version detection
- 📝 Cloud firmware's list with description
- 💾 Backup, restore, and erase NVRAM

## 🚀 Quick start

### 🔌 Local USB

<div align="center"> 
🌐 Open: <a href="https://mt.xyzroe.cc" target="_blank">mt.xyzroe.cc</a><br>
<i>from Chrome or Edge</i>
</div>

### 📡 Remote (TCP or remote USB/serial)

Because browsers don't support TCP connections you need to use WebSocket ↔ TCP bridge that can forward WebSocket clients to TCP hosts and as option expose local serial ports over TCP.

You have some options:

#### 🏠 Home Assistant Add-On

<div align="center"> 
<a alt="Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled." href="https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fxyzroe%2FXZG-MT" target="_blank"><img src="https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg" alt="GitHub Actions Workflow Status"></img></a>
</div>
 
Just click on the button above or add this repository to your Home Assistant add-on store manually and then install the add-on to expose remote TCP / host serial devices to the web UI.

#### 🐳 [Docker images](https://github.com/xyzroe/XZG-MT/pkgs/container/xzg-mt)

Prebuilt multi-arch images are published to GHCR on each release/tag.

Image: `ghcr.io/xyzroe/XZG-MT:<tag>` (e.g. `v0.1.1`)

- Run (basic):

```bash
docker run --rm -p 8765:8765 ghcr.io/xyzroe/XZG-MT:latest
```

- Run with mDNS:

```bash
docker run --rm --network host ghcr.io/xyzroe/XZG-MT:latest
```

- To expose a host serial device to the container add `--device` (Linux):

```bash
docker run --rm --network host \
  --device /dev/ttyUSB0:/dev/ttyUSB0 \
  ghcr.io/xyzroe/XZG-MT:latest
```

- Customize port, advertised host, disable serial scan amd enable debug logs:

```bash
docker run --rm \
  -e PORT=9000 \
  -e ADVERTISE_HOST=192.168.1.42 \
  -e DEBUG_MODE=true \
  -p 9000:9000 \
  ghcr.io/xyzroe/XZG-MT:latest
```

#### 📦 Prebuilt binaries

Download a ready-to-run binary from [Releases](https://github.com/xyzroe/XZG-MT/releases), make it executable (Linux/macOS), and run.

##### ⚡ How to run:

Windows:

- Run: `XZG-MT-windows-*.exe` or double click

Linux:

<details>
  <summary>Select the correct binary for your platform</summary>
  
- linux/arm64 — aarch64_generic, aarch64, arm64
- linux/arm — armhf, arm_cortex-a7_neon-vfpv4, arm_cortex-a9_neon
- linux/amd64 — amd64
- linux/386 — i386 / 32-bit x86
- linux/mips — mips_24kc
- linux/mipsle — mipsel_24kc
- linux/mips64 — mips64
- linux/mips64le — mips64le

Note: linux/arm targets ARMv7 (GOARM=7). MIPS and MIPSLE builds use GOMIPS=softfloat for compatibility with older devices (for example, MT7688).

</details>
<br>  
 
 
1. Make executable:

```bash
chmod +x ./XZG-MT-linux-*
```

2. Run: `./XZG-MT-linux-*` or double click

macOS:

1. Make executable and remove quarantine:

```bash
chmod +x ./XZG-MT-darwin-*
xattr -d com.apple.quarantine ./XZG-MT-darwin-*
```

2. Run: `./XZG-MT-darwin-*` or double click

To run on custom port: `./XZG-MT-* 9999`

## 📚 Where to read more

Read the individual project READMEs for full documentation and advanced options:

- 🌐 Web UI: [README](web-page/README.md)
- 🚀 WebSocket bridge (Go) — [README](bridge/README.md)
- ⚠️ WebSocket bridge (Node) — [README](bridge/README.md)
- 🏠 Home Assistant add-on: [README](xzg-multi-tool-addon/README.md)

## 🛠️ Tech & badges

Below are key technologies, libraries and tools used across the projects (click the badges for quick context):

<div align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20.18.0-brightgreen" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-%5E5.5-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/esbuild-%3E%3D0.23.0-purple" alt="esbuild" />
  <img src="https://img.shields.io/badge/pkg-for_binaries-lightgrey" alt="pkg" />
  <img src="https://img.shields.io/badge/ws-WebSocket-orange" alt="ws" />
  <img src="https://img.shields.io/badge/serialport-native-red" alt="serialport" />
  <img src="https://img.shields.io/badge/browser--sync-dev_server-blue" alt="browser-sync" />
  <img src="https://img.shields.io/badge/realfavicon-fav_gen-lightblue" alt="realfavicon" />
  <img src="https://img.shields.io/badge/sharp-image_processing-teal" alt="sharp" />
  <img src="https://img.shields.io/badge/concurrently-dev_helpers-grey" alt="concurrently" />
  <img src="https://img.shields.io/badge/copyfiles-static_copy-grey" alt="copyfiles" />
  <img src="https://img.shields.io/badge/nodemon-dev_watch-red" alt="nodemon" />
  <img src="https://img.shields.io/badge/Docker-container-blue" alt="docker" />
  <img src="https://img.shields.io/badge/Go-%3E%3D1.21-cyan" alt="Go" />
  <img src="https://img.shields.io/badge/golangci--lint-linter-brightgreen" alt="golangci-lint" />
  <img src="https://img.shields.io/badge/mDNS-zeroconf-lightgrey" alt="mDNS" />
</div>

## 📁 Repository structure

- web-page/ — The web frontend. Contains source TypeScript, build scripts, favicon and static assets.
- bridge/ - The small Go app that bridges WebSocket ↔ TCP, supports mDNS discovery and exposing local serial ports as TCP servers.
- xzg-multi-tool-addon/ — Home Assistant add-on wrapper for `bridge`.
- LICENSE — License for the whole repository (MIT).
- repository.json — repository metadata.

## 📜 License

MIT — see `LICENSE` for details.

## 👥 Community

- 💬 [Telegram group](https://t.me/xzg_fw)
- 🗨️ [Discord server](https://discord.gg/A5ge3cYRKW)

If you found an issue or want to request a feature, please open an issue in this repository.

## 💖 Support

If you find this project useful and want to support further development, you can sponsor or donate to the author:

<div align="center">
  <a href="https://github.com/xyzroe" title="GitHub Sponsors"><img alt="GitHub Sponsors" src="https://img.shields.io/github/sponsors/xyzroe" style="margin:6px;"/></a>
  <a href="https://www.buymeacoffee.com/xyzroe" title="Buy Me a Coffee"><img alt="Buy Me a Coffee" src="https://img.shields.io/badge/Buy%20me%20a%20coffee-%23FFDD00.svg?logo=buy-me-a-coffee&logoColor=black" style="margin:6px;"/></a>
  <a href="https://www.paypal.com/paypalme/xyzroe" title="PayPal Me"><img alt="PayPal" src="https://img.shields.io/badge/PayPal-Donate-blue.svg?logo=paypal" style="margin:6px;"/></a>
  <a href="https://nowpayments.io/donation/xyzroe" title="Crypto donation via NOWPayments"><img alt="NOWPayments" src="https://img.shields.io/badge/Crypto-NOWPayments-purple.svg?logo=bitcoin" style="margin:6px;"/></a>
<br><br>
  Thank you — every little contribution helps keep the project alive and maintained. 🙏
</div>

---

<div align="center">
  <sub>Made with <span aria-hidden="true">❤️</span> from Berlin!</sub>
</div>
  
---
