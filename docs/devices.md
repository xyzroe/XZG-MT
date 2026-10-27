## 💻 Supported Chips

| Manufacturer      | Model                  | Notes                          | Interface | Detect | Erase | Write | Verify | Read | Copy IEEE | NVRAM |  Local files   | Cloud FWs |
| :---------------- | :--------------------- | :----------------------------- | :-------: | :----: | :---: | :---: | :----: | :--: | :-------: | :---: | :------------: | :-------: |
| Texas Instruments | CC2538, CC1352, CC2652 | with BSL loader                |  🔌 / 🌐  |   ✅   |  ✅   |  ✅   |   ✅   |  ✅  |    ✅     |  ✅   | `.hex`, `.bin` |    ✅     |
| Texas Instruments | CC2674P10 (Cortex-M33) | dedicated M33 profile; see below |  🔌 / 🌐  |   ✅   |  ⚠️   |  ✅   |   ✅   |  ❌  |    ✅     |  ❌   | `.hex`        |    ❌     |
| Silicon Labs      | EFR32MG21 series       | with Gecko Bootloader          |  🔌 / 🌐  |   ✅   |  ❌   |  ✅   |   ❌   |  ❌  |    ✅     |  ❌   | `.ota`, `.gbl` |    ✅     |
| Espressif         | ESP8266, ESP32 series  | almost any chip                |    🔌     |   ✅   |  ✅   |  ✅   |   ❌   |  ❌  |    ◻️     |  ◻️   |     `.bin`     |    ⚠️     |
| Texas Instruments | CC253X, CC254X\*       | using TI CC Debugger           |    🧰     |   ✅   |  ✅   |  ✅   |   ✅   |  ✅  |    ❌     |  ❌   | `.hex`, `.bin` |    ❌     |
| Texas Instruments | CC253X, CC254X\*       | using CC Loader FW             |    🔌     |   ✅   |  ✅   |  ✅   |   ✅   |  ✅  |    ❌     |  ❌   | `.hex`, `.bin` |    ❌     |
| Arduino           | Nano, Uno, Pro Mini    | any ATmega328P                 |    🔌     |   ✅   |  ◻️   |  ✅   |   ✅   |  ✅  |    ◻️     |  ◻️   |     `.hex`     |    ⚠️     |
| Telink            | TLSR825X, TLSR826X\*\* | swire emulation and uart2swire |    🔌     |   ✅   |  ✅   |  ✅   |   ✅   |  ✅  |    ◻️     |  ◻️   |     `.bin`     |    ❌     |

<small>\* CC2530, CC2531, CC2533, CC2540, CC2541, CC2543, CC2544, CC2545</small>  
<small>\*\* TLSR8250, TLSR8251, TLSR8253, TLSR8258, TLSR8266, TLSR8269</small>

<small>Legend: 🔌 Web Serial, 🧰 Web USB, 🌐 WS-TCP bridge, ✅ full support, ⚠️ partial support, ❌ not implemented, ◻️ not applicable</small>

### CC2674P10

- Select **TI CC2674P10 (M33)**, not the legacy TI family. Device identity and flash capacity must match the registered profile.
- Use a local Intel HEX image containing main flash and a valid CCFG bootloader configuration. Main flash and the independent CCFG sector are kept separate; binary and cloud images are not supported.
- Writing requires **Erase, Write and Verify** together. Erase-only operation is disabled; verify-only is available.
- The complete CCFG sector is read and CRC-checked before any erase. Firmware CCFG bytes are overlaid on that snapshot, preserving omitted configuration and an existing non-FF secondary IEEE address. Main flash is verified before CCFG is erased; the complete rewritten CCFG is verified afterward.
- Writes refuse latched CCFG protection, disabled bank/chip erase, changed protection/security configuration, or changes to an already-enabled bootloader backdoor configuration. These conservative restrictions avoid silently disabling recovery; they are not support for arbitrary security configurations.
- If external hardware has already entered ROM BSL, enable **Already in BSL** before connecting. Reset/control, baud switching and application probing are skipped, and the device remains in BSL afterward. Use the actual bootloader transport baud rate.
- NVRAM and full-flash reads are not implemented for M33.

Upstream PR #103 reports hardware validation on Dongle-PP10 over WebSerial and Dongle-MP10 over TCP. The additional preservation and protection checks need hardware regression testing, including older TI devices. Flash/CCFG updates are not atomic: loss of power or transport can still require hardware recovery.

### Connection and recovery limitations

- **UZG-01 (#96):** its USB bridge does not wire DTR/RTS to the radio BSL/reset pins. Use LAN with working remote boot/reset controls. IEEE Write re-enters BSL and redetects the device; preserved CCFG is CRC-checked before erase and after writing.
- **ZG-808Z (#99):** a responding application does not establish that ROM BSL is reachable. When automatic BSL is disabled, enter the bootloader manually before ROM operations. Baud-change/reconnect failures now abort instead of continuing on a broken transport. Firmware that disables recovery may require a physical debugger.
- **ZBT-2 (#92):** MG24 behind its ESP32-S3 bridge needs device-specific bootloader control and hardware validation; IEEE writing is not advertised as supported.
- **Silabs expansion (#101):** full NVM3 backup/restore, scan/sniff and EUI64 mismatch recovery are not implemented. Flashing a compatible recovery GBL is distinct from a supported migration/recovery workflow.
