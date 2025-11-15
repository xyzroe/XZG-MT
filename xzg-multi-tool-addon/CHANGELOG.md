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
- fix: improve HEX parsing logic  (#33) by @xyzroe

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
