# How to Use CCLoader for Flashing CC2530 Chips

## 📖 Introduction

The CC2530 is a System-on-Chip (SoC) from Texas Instruments, commonly used in Zigbee applications, smart home devices, and IoT projects. CCLoader is an ESP/Arduino-based device with special firmware that allows programming CC2530 family chips without the need for dedicated debuggers like TI CC Debugger. This guide covers using CCLoader to program CC2530 chips using the XZG-MT tool.

## 🔧 Required Hardware

- **CCLoader**: An Arduino/ESP8266/ESP32 module flashed with the special CCLoader firmware.
- **CC2530 device**: The target device to be flashed.
- **USB Cable**: For connecting the CCLoader to your host device.
- **Host device**: Computer (Windows, Linux, macOS)

## 💻 Preparing CCLoader Firmware

Before using CCLoader, you need to flash the Arduino/ESP with the special CCLoader firmware. This can be done using XZG-MT:

1. **Open XZG-MT**:

   - Open the [XZG-MT](https://mt.xyzroe.cc) on your computer.

2. **Select Chip Family**:

   - In XZG-MT, select the `Arduino` or `ESP` in the Family section.

3. **Connect to Device**:

   - Connect your board to your computer via USB.
   - Click the `Connect` button in XZG-MT.
   - The web browser should display a list of available serial ports; select yours and click `Connect`.

4. **Select Firmware**:

   - In the cloud firmware list, select the corresponding CCLoader firmware for your board and pinout.

     _For pinout information on how to connect the board to the CC2530, click the info button after selecting the firmware in the cloud list. A popup will display the required connections._

5. **Flash the Firmware**:
   - Click the `Flash` button in XZG-MT.
   - Wait for the process to complete. The progress should be displayed in the interface.
6. **Disconnect the serial connection**:

   - Click `Disconnect` button.

## ⚡ Flashing Procedure

1. **Prepare Your Setup**:

   - Ensure the CC2530 chip is properly connected to the CCLoader according to the pinout provided in the firmware info popup.
   - Power on the target device if required.

2. **Open XZG-MT**:

   - Open the [XZG-MT](https://mt.xyzroe.cc) on your computer.

3. **Select Chip Family**:

   - In XZG-MT, select the `TI CC25XX` in the Family section.

4. **Connect CCLoader**:

   - Click the `Connect Loader` button.
   - Web browser should display a list of available serial ports, select your CCLoader and click `Connect`.
   - XZG-MT will detect the CCLoader and the connected CC2530 chip's model and IEEE.

5. **Load Firmware**:

   - Select the firmware file (`.hex` or `.bin`) you want to flash.

6. **Flash the Chip**:

   - Select the options you need (Write and Verify). Erase will be done in any case.
   - Click the `Start` button in XZG-MT.
   - Wait for the process to complete. The progress should be displayed in the interface. More information can be found in `Logs` section.

7. **Verify**:
   - After flashing, verify that the device functions as expected.

## 💾 Dump flash to a file

XZG-MT allows to read device's flash and save it to a local file.

1. Connect to device as described above (1-4)
2. Click on `Dump flash` button in the `Actions` section.
3. Wait until all data will be read. The progress should be displayed in the interface. More information can be found in `Logs` section.
4. Save file to your computer.

## 🛠️ Troubleshooting

- **Device Not Recognized**: Try a different USB port or cable.
- **Connection Failed**: Check physical connections between CCLoader and CC2530 according to the pinout. Ensure the chip is powered. Ensure the CCLoader is properly flashed with CCLoader firmware.
- **CC2530 Flashing Errors**: Verify the firmware file is compatible with CC2530. Check for voltage issues or faulty hardware.
- **CCLoader Flashing Issues**: Ensure you selected the correct Arduino / ESP board and firmware in XZG-MT.

## 🆘 If the Problem Persists

If the problem persists after trying the troubleshooting steps, please open an issue on the [XZG-MT GitHub repository](https://github.com/xyzroe/XZG-MT/issues). Provide detailed information about your setup, operating system, error messages, and steps you've taken.
