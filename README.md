# XZG Multi-tool

<div align="center">
  <img src="https://mt.xyzroe.cc/fav/favicon.svg" alt="XZG Multi-tool" style="height:160px; margin-bottom:12px;" />
</div>

<div align="center"> 
<a href="https://github.com/xyzroe/XZG-MT/releases"><img src="https://img.shields.io/github/release/xyzroe/XZG-MT.svg" alt="GitHub version"></img></a>
<a href="https://github.com/xyzroe/XZG-MT/actions/workflows/build-binaries.yml"><img src="https://img.shields.io/github/actions/workflow/status/xyzroe/XZG-MT/build-binaries.yml" alt="GitHub Actions Workflow Status"></img></a>
<a href="https://github.com/xyzroe/XZG-MT/releases/latest"><img src="https://img.shields.io/github/downloads/xyzroe/XZG-MT/total.svg" alt="GitHub download"></img></a>
<a href="https://github.com/xyzroe/XZG-MT/issues"><img src="https://img.shields.io/github/issues/xyzroe/XZG-MT" alt="GitHub Issues or Pull Requests"></img></a>
<a href="LICENSE"><img src="https://img.shields.io/github/license/xyzroe/XZG-MT.svg" alt="License"></img></a>
</div>

A combined repository that bundles a browser-based TI CC2538 / CC26x2 flasher web app with a tiny WebSocket ↔ TCP bridge for remote or remote-serial flashing.

This monorepo contains two main projects and a Home Assistant add-on helper.

🌐 Use it at: [mt.xyzroe.cc](https://mt.xyzroe.cc)

Highlights

- 🌐 Web UI to flash TI devices from your browser (Web Serial or remote via bridge)
- 🔌 Lightweight WS ↔ TCP bridge that can forward WebSocket clients to TCP hosts and expose local serial ports over TCP
- 🧰 Scripts to build the web assets and to produce standalone bridge binaries

Quick links

- Web app: `web-page/` — browser flasher (uses Web Serial API)
- Bridge: `bridge/` — WebSocket to TCP bridge and binary build pipeline
- Home Assistant add-on: `xzg-multi-tool-addon/` — add-on wrapper for Home Assistant

Table of contents

- About
- Repo structure
- Tech & badges
- Where to read more

## About

XZG Multi-tool is aimed at hobbyists and developers who need an easy way to flash TI CC2538/CC26x2 devices. The web frontend provides a polished UI and local flashing via Web Serial. The `bridge` allows remote or headless hosts to expose serial devices over TCP and connect them to the web UI.

## Repository structure

- web-page/ — The web frontend. Contains source TypeScript, build scripts, favicon and static assets. See `web-page/README.md` for full docs.
- bridge/ — The small Node.js app that bridges WebSocket ↔ TCP, supports mDNS discovery and exposing local serial ports as TCP servers. See `bridge/README.md`.
- xzg-multi-tool-addon/ — Home Assistant add-on wrapper for `bridge`.
- LICENSE — License for the whole repository (MIT).
- repository.json — repository metadata.

## Quick start

- Local USB: use the hosted web app — open the online flasher at [https://mt.xyzroe.cc](https://mt.xyzroe.cc) and connect your device via the browser's Web Serial API.
- Remote TCP or remote USB/serial: add this repository to your Home Assistant add-on store and install the `bridge` add-on to expose remote/host serial devices to the web UI.
  <div align="center"> 
  <a alt="Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled." href="https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fxyzroe%2Fbridge"><img src="https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg" alt="GitHub Actions Workflow Status"></img></a>
  </div>

On the [bridge README](bridge/README.md) page you'll find more installation options (Docker images, prebuilt binaries, or building your own) and detailed configuration notes.

## Tech & badges

Below are key technologies, libraries and tools used across the projects (click the badges for quick context):

<div align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20.18.0-brightgreen" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-%5E5.5-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/esbuild-%3E%3D0.23.0-purple" alt="esbuild" />
  <img src="https://img.shields.io/badge/pkg-for_binaries-lightgrey" alt="pkg" />
  <img src="https://img.shields.io/badge/ws-WebSocket-orange" alt="ws" />
  <img src="https://img.shields.io/badge/serialport-native-red" alt="serialport" />
  <img src="https://img.shields.io/badge/bonjour-service-mdns-yellow" alt="bonjour-service" />
  <img src="https://img.shields.io/badge/browser--sync-dev_server-blue" alt="browser-sync" />
  <img src="https://img.shields.io/badge/realfavicon-fav_gen-lightblue" alt="realfavicon" />
  <img src="https://img.shields.io/badge/sharp-image_processing-teal" alt="sharp" />
  <img src="https://img.shields.io/badge/concurrently-dev_helpers-grey" alt="concurrently" />
  <img src="https://img.shields.io/badge/copyfiles-static_copy-grey" alt="copyfiles" />
  <img src="https://img.shields.io/badge/nodemon-dev_watch-red" alt="nodemon" />
  <img src="https://img.shields.io/badge/Docker-container-blue" alt="docker" />
</div>

The list above was composed from the `package.json` files in `web-page/` and `bridge/` and highlights the main runtime, build and developer dependencies used in this repository.

## Where to read more

Read the individual project READMEs for full documentation and advanced options:

- Web UI: [README](web-page/README.md)
- WebSocket bridge: [README](bridge/README.md)
- Home Assistant add-on: [README](xzg-multi-tool-addon/README.md)

## License

MIT — see `LICENSE` for details.

## Community

- 💬 Telegram: [https://t.me/xzg_fw](https://t.me/xzg_fw)
- 🗨️ Discord: [https://discord.gg/A5ge3cYRKW](https://discord.gg/A5ge3cYRKW)

If you found an issue or want to request a feature, please open an issue in this repository.

---

<div align="center">
  <sub>Made with <span aria-hidden="true">❤️</span> for the Zigbee community!</sub>
</div>
  
---

## Support

If you find this project useful and want to support further development, you can sponsor or donate to the author:

<div align="center">
  <a href="https://github.com/xyzroe" title="GitHub Sponsors"><img alt="GitHub Sponsors" src="https://img.shields.io/github/sponsors/xyzroe" style="margin:6px;"/></a>
  <a href="https://www.buymeacoffee.com/xyzroe" title="Buy Me a Coffee"><img alt="Buy Me a Coffee" src="https://img.shields.io/badge/Buy%20me%20a%20coffee-%23FFDD00.svg?logo=buy-me-a-coffee&logoColor=black" style="margin:6px;"/></a>
  <a href="https://www.paypal.com/paypalme/xyzroe" title="PayPal Me"><img alt="PayPal" src="https://img.shields.io/badge/PayPal-Donate-blue.svg?logo=paypal" style="margin:6px;"/></a>
  <a href="https://nowpayments.io/donation/xyzroe" title="Crypto donation via NOWPayments"><img alt="NOWPayments" src="https://img.shields.io/badge/Crypto-NOWPayments-purple.svg?logo=bitcoin" style="margin:6px;"/></a>
</div>

Thank you — every little contribution helps keep the project alive and maintained. 🙏
