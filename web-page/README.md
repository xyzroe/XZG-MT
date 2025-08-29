# 🚀 XZG Multi-tool

<div align="center">
  <img src="favicon/logo.png" alt="XZG Multi-tool" style="height:200px;margin-bottom:16px;" />
</div>

**A simple online tool to flash TI CC2538/CC26x2 devices right in your browser!**

🌐 Use it at: [mt.xyzroe.cc](https://mt.xyzroe.cc)

---

## Features

- 🔌 Flash TI CC2538/CC26x2 via Web Serial (Chrome/Edge)
- 📂 Load firmware from local files or the cloud
- 💾 Backup, restore, and erase NVRAM
- 🦾 Automatic device model and parameter detection
- 📝 Cloud firmware with descriptions

---

## How to use?

1. Open [mt.xyzroe.cc](https://mt.xyzroe.cc) in Chrome or Edge
2. Connect your device via USB or TCP ([using bridge](https://github.com/xyzroe/bridge))
3. Click "Choose Serial" and select your port
4. Pick a firmware (local or cloud)
5. Click "Start" — that's it! 🎉

> ⚠️ Web Serial requires HTTPS or localhost. mt.xyzroe.cc is already set up for you!

---

## Requirements

- Modern browser: Chrome or Edge (with Web Serial support)
- TI CC2538/CC26x2 device

---

## FAQ

- **Do I need to install anything?**

  > For local USB mode - No! Everything works in your browser. For TCP mode or remote USB mode [using bridge](https://github.com/xyzroe/bridge)

- **Where do I get firmware?**

  > Choose from the cloud (auto-filtered for your model) or upload your own file.

- **Is it safe?**
  > Yes, all operations are local. Your data never leaves your computer.

---

## Community

- 💬 [Telegram chat](https://t.me/xzg_fw)
- 🗨️ [Discord](https://discord.gg/A5ge3cYRKW)

---

. ~/.nvm/nvm.sh
