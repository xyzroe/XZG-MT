## v0.3.0

## 🚀 Features
- feat: retry connect with different option if chip id read error (TI & SL) (#83) by @xyzroe
- feat: version detect for MultiPAN (CPC), OpenThred (Spinel) and Router firmwares (SL) (#83) by @xyzroe
- feat: verison detect for OpenThread firmwares (TI) (#83) by @xyzroe
- feat: auto find baud rate (SL) (#83) by @xyzroe
- feat: save and load find baud rate toggle in cookies (#83) by @xyzroe
- feat: save baud rate value in cookies (#83) by @xyzroe

## 🐛 Bug Fixes
- fix: improve auto find baud rate (TI) (#83) by @xyzroe
- fix: setLinesHandler instead of direct import (SL & CCLoader) (#83) by @xyzroe
- fix: some code cleanup (#83) by @xyzroe
- fix: implement saveToFile utility for unify file downloads (#83) by @xyzroe
- 

## v0.2.24

## 🚀 Features
- feat: add dump flash option to CCXX52 devices (#82) by @xyzroe
- feat: hide unrelated option in ESP section (#79) by @xyzroe

## 🐛 Bug Fixes
- fix: massive code cleanup (#82) by @xyzroe
- fix: improve progress logging and update checkbox handling for CC Debugger (#81) by @xyzroe

## 📘 Documentation
- docs: update release drafter version and make auto labeler work (#80) by @xyzroe
- docs: update release drafter configuration  (#78) by @xyzroe



## v0.2.23

## 🚀 Features
- feat: add separate imply gate and original logic to SL reset and boot loader (#77) by @xyzroe
- feat: bridge: separate function to trigger DTR and RTS (#77) by @xyzroe
- feat: bridge: support trigger both using one request (#77) by @xyzroe
- feat: enhance debugger and loader connection UI, update firmware source links (#70) by @xyzroe
- feat: add workflow to update GHCR downloads  (#66) by @xyzroe
- feat: enhance debugger and loader connection UI, update firmware source links (#70) by @xyzroe

## 🐛 Bug Fixes
- fix: make possible to flash dongles with imply gate logic vie bridge (#77) by @xyzroe
- fix: refactor SL tools and TI tools integration (#77) by @xyzroe
- fix: small UI enhancements (#77) by @xyzroe
- fix: bridge: logs with timestamp (#77) by @xyzroe

## 📘 Documentation
- docs: some docs improvements (#77) by @xyzroe
- docs: update .gitignore and update telegram banner (#76) by @xyzroe
- docs: refactor documentation (#75) by @xyzroe
- docs: update how-to guides structure by renaming index.md (#74) by @xyzroe
- docs: update READMEs for improved clarity and consistency in section headings (#73) by @xyzroe
- docs: First how-to guides, bridge diagram, rework some files (#72) by @xyzroe
- docs: move supported chips list and notes to a separate file (#71) by @xyzroe
- docs: improve documentation and add GHCR pulls badge (#69) by @xyzroe
- docs: update badge message formatting for total downloads (#68) by @xyzroe
- docs: correct script path in GHCR downloads badge workflow (#67) by @xyzroe
- docs: reorder and clean up CHANGELOG entries for clarity (#65) by @xyzroe

## v0.2.22

## 🚀 Features

- feat: Implement CC Loader module for flashing CC2530 family devices via ESP board as flasher interface. (#64) by @xyzroe
- feat: Integrate cloud firmware repository listing for ESP platforms (currently scoped to CC Loader). (#64) by @xyzroe
- feat: enhance mobile view (#63) by @xyzroe
- feat: update footer with trademark notice and adjust dark theme colors (#57) by @xyzroe
- feat: SmartRF04EB support and SLS presets (#56) by @xyzroe

## 🐛 Bug Fixes

- fix: Reset flash option checkboxes upon deselection of local firmware file (#64) by @xyzroe
- fix: comment out serial controls and note in CSS (#59) by @xyzroe
- fix: update .gitignore to include some local files (#58) by @xyzroe

##📘 Documentation

- docs: Update README and UI with additional information on CC253X Debugger and Loader support (#64) by @xyzroe

## v0.2.21

## 🚀 Features

- feat: implement support for the CC2530 family (#55) by @xyzroe

## v0.2.20

## 🚀 Features

- feat: automatic select BSL and RST GPIOs if existing (#54) by @xyzroe
- feat: categories inside cloud FW list (#54) by @xyzroe
- feat: individual accepted local file extensions for each family (#54) by @xyzroe
- feat: cloud firmware list for Silicon Labs chips (#54) by @xyzroe
- feat: update firmware manifest URL and add CC2538 support for cloud firmware list (#51) by @xyzroe

## 🐛 Bug Fixes

- fix: reworked mechanism of applying URLs based on templates (#54) by @xyzroe
- fix: clear devices list if no connection to the bridge (#54) by @xyzroe
- fix: cloud firmware list sorting. newest > oldest. (#54) by @xyzroe
- fix: improved SL flashing process. (#54) by @xyzroe
- fix: some code clean up (#54) by @xyzroe
- small fixes in bridge, code cleanup (#53) by @xyzroe
- fix: closing serial port after socket disconnect (#52) by @xyzroe

## 📘 Documentation

- docs: update README to include ESP32 support and improve project structure (#50) by @xyzroe

## v0.2.19

## 🚀 Features

- feat: Initial support of all ESP32 chips (#49) by @xyzroe

## 🐛 Bug Fixes

- fix: code clean up and reorganization (#49) by @xyzroe
- fix: many lint errors (#49) by @xyzroe

## v0.2.18

## 🚀 Features

- feat: add support of TI CC2538 (#47) by @xyzroe

## 🐛 Bug Fixes

- fix: verify CRC after flashing TI chips (#47) by @xyzroe
- fix: some code cleanup (#47) by @xyzroe

## v0.2.17

## 🚀 Features

#### Web UI

- feat: one global "invert levels" switch, instead of two separate (#46) by @xyzroe

#### GitHub

- feat: implement separate task for release notification (#41) by @xyzroe

## 🐛 Bug Fixes

#### Web UI

- fix: GPIOs group title in drop down lists (#46) by @xyzroe
- fix: improve BSL and RST logic for remote connections (#46) by @xyzroe
- fix: remove reset BSL and RST URLs while changing the port. (#46) by @xyzroe

#### Bridge

- fix: deprecate SERIAL_SCAN_INTERVAL option and update related documentation (#45) by @xyzroe
- fix: don't showing non-existent serial ports (#45) by @xyzroe
- fix: errors during intensive serial-tcp communication (#45) by @xyzroe

#### GitHub

- fix: update Telegram notification message format to use MarkdownV2 (#44) by @xyzroe
- fix: correct photo URL in Telegram and Discord notifications (#43) by @xyzroe
- fix: enhance notification to include photo and update message format (#42) by @xyzroe

## v0.2.16

## 🚀 Features

- initial support of SL (#40) by @xyzroe
- feat: add notification step for Telegram and Discord after release (#39) by @xyzroe

## 🐛 Bug Fixes

- initial support of SL (#40) by @xyzroe
- refactor: remove legacy version update steps from build workflow (#38) by @xyzroe
- refactor: update ControlConfig to use pinControl instead of remote (#37) by @xyzroe
- remove node.js bridge (#36) by @xyzroe

## v0.2.14

## 🚀 Features

- feat: some small adjustments (#34) by @xyzroe
- feat: add support for CC1352P7 chip (#32) by @xyzroe

## 🐛 Bug Fixes

- feat: some small adjustments (#34) by @xyzroe
- fix: improve HEX parsing logic (#33) by @xyzroe

## v0.2.13

## 🚀 Features

- feat: add support for CC1352P7 chip (#32) by @xyzroe

## 🐛 Bug Fixes

- fix: add support for custom GPIOs' paths (#31) by @xyzroe

## v0.2.12

## 🐛 Bug Fixes

- fix: add support for custom GPIOs' paths (#31) by @xyzroe

## v0.2.11

- docs: enhance README files (#28) by @xyzroe

## 🚀 Features

- feat: add imply gate logic for BSL enter (#30) by @xyzroe
- feat: more comfortable selection of GPIOs (#27) by @xyzroe

## v0.2.10

## 🚀 Features

- feat: more comfortable selection of GPIOs (#27) by @xyzroe

## v0.2.8

## 🚀 Features

- feat: update release drafter configuration and streamline build workflow (#25) by @xyzroe
- feat: add more build configurations (MIPS, ARM) for binaries and Docker images (#24) by @xyzroe

## 🐛 Bug Fixes

- fix: embed handling on Windows (#24) by @xyzroe
- fix: Print version while start in Docker images (#18) by @xyzroe

## 📚 Documentation

- chore: update README.md to enhance project description (#19, #20, #21, #22, #23) by @xyzroe
- chore: update CHANGELOG for v0.2.7 release (#17) by @xyzroe

## v0.2.8

## 📚 Documentation

- chore: update README.md to enhance project description (#19, #20, #21, #22, #23) by @xyzroe
- chore: update CHANGELOG for v0.2.7 release (#17) by @xyzroe

## 🚀 Features

- feat: add more build configurations (MIPS, ARM) for binaries and Docker images (#24) by @xyzroe

## 🐛 Bug Fixes

- fix: embed handling on Windows (#24) by @xyzroe
- fix: Print version while start in Docker images (#18) by @xyzroe

## v0.2.7

### 🚀 Features

- feat: First Go only bridge release

### 🐛 Bug Fixes

- fix: update output filename format in build script (#16) by @xyzroe

## v0.2.6

### 🚀 Features

- feat: Add a Go implementation of Bridge. Reduce size! Binaries and Docker images (#12) by @xyzroe.
- feat: UI impoves (#11) by @xyzroe

### 🐛 Bug Fixes

- fix: update Go version to 1.21 in build workflow (#15) by @xyzroe
- fix: update artifact download steps to specify names for node and go (#14) by @xyzroe
- fix: update job dependencies in build workflow and (#13) by @xyzroe
- feat: UI impoves (#11) by @xyzroe

## v0.2.3

### 🚀 Features

- fix: use actual version while web page build (#10) by @xyzroe

### 🐛 Bug Fixes

- fix: use actual version while web page build (#10) by @xyzroe

## v0.2.2

### 🐛 Bug Fixes

- fix: update checkout references to use new SHA from version bump step (#9) by @xyzroe

## v0.2.1

- fix: serial module import; feature: some UI enhancements (#8) by @xyzroe

### 🐛 Bug Fixes

- fix: update name-template in release-drafter.yml (#7) by @xyzroe
- fix: prepend 'v' to version headers and some cleanup in CHANGELOG (#6) by @xyzroe
- fix: correct workflow_dispatch indentation in draft-release-notes.yml (#5) by @xyzroe
- fix: update protocol options in documentation to remove mistakes (#4) by @xyzroe

## v0.2.0

### 🚀 Features

- fix: update permissions to include pull-requests read access (#1) by @xyzroe

### 🐛 Bug Fixes

- fix: conditionally log debug messages (#2) by @xyzroe

## v0.1.8

- Initial public release
