## 💻 Supported Chips

| Manufacturer      | Model                  | Notes                     | Interface | Detect | Erase | Write | Verify | Read | NVRAM |  Local files   | Cloud FWs |
| ----------------- | ---------------------- | ------------------------- | :-------: | :----: | :---: | :---: | :----: | :--: | :---: | :------------: | :-------: |
| Texas Instruments | CC2538, CC1352, CC2652 | with BSL loader           |  🔌 / 🌐  |   ✅   |  ✅   |  ✅   |   ✅   |  ✅  |  ✅   | `.hex`, `.bin` |    ✅     |
| Silicon Labs      | EFR32MG21 series       | with Gecko Bootloader     |  🔌 / 🌐  |   ✅   |  ❌   |  ✅   |   ❌   |  ❌  |  ❌   | `.ota`, `.gbl` |    ✅     |
| Espressif         | ESP8266, ESP32 series  | almost any chip           |    🔌     |   ✅   |  ✅   |  ✅   |   ❌   |  ❌  |  ◻️   |     `.bin`     |    ⚠️     |
| Texas Instruments | CC253X, CC254X\*       | using TI CC Debugger      |    🧰     |   ✅   |  ✅   |  ✅   |   ✅   |  ✅  |  ❌   | `.hex`, `.bin` |    ❌     |
| Texas Instruments | CC253X, CC254X\*       | using ESP based CC Loader |    🔌     |   ✅   |  ✅   |  ✅   |   ✅   |  ✅  |  ❌   | `.hex`, `.bin` |    ❌     |
| Arduino           | Nano, Uno, Pro Mini    | any ATmega328P            |    🔌     |   ✅   |  ◻️   |  ✅   |   ✅   |  ✅  |  ◻️   |     `.hex`     |    ⚠️     |

<small>\* CC2530, CC2531, CC2533, CC2540, CC2541, CC2543, CC2544, CC2545</small>

<small>Legend: 🔌 Web Serial, 🧰 Web USB, 🌐 WS-TCP bridge, ✅ full support, ⚠️ partial support, ❌ not implemented, ◻️ not applicable</small>
