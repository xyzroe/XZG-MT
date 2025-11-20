# 📁 XZG Multi Tool Firmware files branch

Welcome to the **fw_files** branch of the XZG Multi Tool repository! This branch is dedicated to storing files necessary for flashing various chips.


## ♥️ Ti 
<div align="center">

![Zigbee Router](https://img.shields.io/badge/Zigbee_Router-17_files-brightgreen?style=for-the-badge) ![Zigbee Coodinator](https://img.shields.io/badge/Zigbee_Coordinator-51_files-brightgreen?style=for-the-badge&color=ff0000) ![OpenThread](https://img.shields.io/badge/OpenThread-8_files-brightgreen?style=for-the-badge&color=0000ff)

</div>

Downloaded from:

- [Koenkk/Z-Stack-firmware](https://github.com/Koenkk/Z-Stack-firmware)
- [Andrik45719/Z-Stack-firmware](https://github.com/Andrik45719/Z-Stack-firmware)
- [jethome-ru/zigbee-firmware](https://github.com/jethome-ru/zigbee-firmware)
- [Koenkk/OpenThread-TexasInstruments-firmware](https://github.com/Koenkk/OpenThread-TexasInstruments-firmware)
- [arendst/Tasmota](https://github.com/arendst/Tasmota)
- [egony/cc2652p_cc1352p_RF-STAR](https://github.com/egony/cc2652p_cc1352p_RF-STAR)
- [egony/cc2652p_E72-2G4M20S1E](https://github.com/egony/cc2652p_E72-2G4M20S1E)
- [tube0013/tube_gateways](https://github.com/tube0013/tube_gateways)
- [agriadsi/MOD-Z-Stack-Firmware](https://github.com/agriadsi/MOD-Z-Stack-Firmware)
- [mercenaruss/zigstar_gateways](https://github.com/mercenaruss/zigstar_gateways)


## 💚 Sl 
<div align="center">

![Zigbee Router](https://img.shields.io/badge/Zigbee_Router-2_files-brightgreen?style=for-the-badge) ![Zigbee NCP](https://img.shields.io/badge/Zigbee_NCP-96_files-brightgreen?style=for-the-badge&color=ff0000) ![OpenThread RCP](https://img.shields.io/badge/OpenThread-64_files-brightgreen?style=for-the-badge&color=0000ff) ![Multi PAN](https://img.shields.io/badge/Multi_PAN-65_files-brightgreen?style=for-the-badge&color=ffff00)

</div>

Indexed from:

- [darkxst/silabs-firmware-builder](https://github.com/darkxst/silabs-firmware-builder)
- [xsp1989/zigbeeFirmware](https://github.com/xsp1989/zigbeeFirmware)


## 🗂 Directory Structure

- **.github**:
  - **workflows/run_ti.yml**: GitHub Actions workflow that automates running Python script for TI chips.
  - **workflows/run_sl.yml**: GitHub Actions workflow that automates running Python script for Silabs chips.
  - **scripts/process_ti.py**: Python script that processes TI firmware files and update manifest.
  - **scripts/process_sl.py**: Python script that processes Silabs firmware files and update manifest.
  - **scripts/update_readme.py**: Python script that update README.md.
- **ti**:
  - **task.json**: Contains a structured list of tasks related to the available firmware files and their types (e.g., coordinator, router).
  - **manifest.json**: Maps specific firmware versions to their devices and provides detailed notes about each firmware update.
  - **coordinator**: Contains `.hex` files for Zigbee coordinator firmware.
  - **router**: Contains `.hex` files for Zigbee router firmware.
  - **thread**: Contains `.hex` files for Thread firmware.
- **sl**:
  - **task.json**: Contains a structured list of tasks related to the available firmware files.
  - **manifest.json**: Maps specific firmware versions to their devices and provides detailed notes about each firmware update.

## 🛠 How to Use

All firmware files and scripts in this branch are intended to be used with the [XZG Multi Tool](http://mt.xyzroe.cc/). Please refer to the main branch for more detailed information and instructions.

## 🤝 Contributing

Contributions are always welcome! Feel free to submit a pull request or create an issue for any updates, fixes, or improvements.

---

<div align="center"> Created with &#x2764;&#xFE0F; by <a href="https://xyzroe.cc/">xyzroe</a> © 2025</div>

---
