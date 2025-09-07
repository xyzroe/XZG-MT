package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"go.bug.st/serial"
)

type SerialPortInfo struct {
	Path         string
	Manufacturer string
	SerialNumber string
	VendorID     string
	ProductID    string
}

type SerialState struct {
	DTR      bool
	RTS      bool
	BaudRate int
}

type ServerInfo struct {
	Server net.Listener
	Port   int
}

var (
	openSerialPorts     = make(map[string]serial.Port)
	serialPortRefCount  = make(map[string]int)
	tcpPortToSerialPath = make(map[int]string)
	serialPortStates    = make(map[string]SerialState)
	serialServers       = make(map[string]ServerInfo)
	serialPortDetails   = make(map[string]SerialPortInfo)
	serialMutex         sync.RWMutex
)

var validRates = []int{9600, 19200, 38400, 57600, 115200, 230400, 460800, 500000}

func isValidBaudRate(baud int) bool {
	for _, rate := range validRates {
		if rate == baud {
			return true
		}
	}
	return false
}

func listSerialPorts() []SerialPortInfo {
	var ports []SerialPortInfo

	// Try library-provided list first
	portList, err := serial.GetPortsList()
	if err != nil {
		if debugMode {
			fmt.Printf("[serial] error getting port list: %v\n", err)
		}
	} else if len(portList) == 0 {
		if debugMode {
			fmt.Printf("[serial] GetPortsList returned 0 ports, will try /dev fallback\n")
		}
	}

	// If library returned nothing, try scanning /dev (common on Linux)
	if len(portList) == 0 {
		globs := []string{
			"/dev/ttyUSB*",
			"/dev/ttyACM*",
			"/dev/ttyS*",
			"/dev/serial/by-id/*",
		}
		seen := make(map[string]bool)
		for _, g := range globs {
			matches, _ := filepath.Glob(g)
			for _, m := range matches {
				// ensure file exists and is a character device (optional simple check)
				if fi, err := os.Stat(m); err == nil && fi.Mode()&os.ModeCharDevice != 0 {
					if !seen[m] {
						portList = append(portList, m)
						seen[m] = true
					}
				} else {
					// still add even if not char device: some symlinks in by-id
					if !seen[m] {
						portList = append(portList, m)
						seen[m] = true
					}
				}
			}
		}
	}

	// Filter ports to avoid duplicates on macOS and normalize names
	seenPorts := make(map[string]bool)

	for _, portName := range portList {
		if portName == "" {
			continue
		}

		// On macOS, prefer /dev/tty.* over /dev/cu.*
		if strings.HasPrefix(portName, "/dev/cu.") {
			ttyName := strings.Replace(portName, "/dev/cu.", "/dev/tty.", 1)
			if seenPorts[ttyName] {
				continue
			}
			portName = ttyName
		}

		if seenPorts[portName] {
			continue
		}
		seenPorts[portName] = true

		info := SerialPortInfo{
			Path:         portName,
			Manufacturer: "Unknown",
		}
		ports = append(ports, info)
	}

	if debugMode {
		fmt.Printf("[serial] found %d serial ports\n", len(ports))
		for _, port := range ports {
			fmt.Printf("[serial] - %s\n", port.Path)
		}
	}

	return ports
}

func openSerialPort(path string, baudRate int) serial.Port {
	fmt.Printf("[serial] attempting to open serial port %s at %d baud\n", path, baudRate)

	mode := &serial.Mode{
		BaudRate: baudRate,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}

	port, err := serial.Open(path, mode)
	if err != nil {
		fmt.Printf("[serial] failed to open port %s: %v\n", path, err)
		return nil
	}

	fmt.Printf("[serial] successfully opened serial port %s at %d baud\n", path, baudRate)
	return port
}

func closeSerial(port serial.Port) {
	if port != nil {
		fmt.Printf("[serial] closing serial port\n")
		port.Close()
	}
}

func writeSerial(port serial.Port, data []byte) (int, error) {
	if port == nil {
		fmt.Printf("[serial] mock write %d bytes: %x\n", len(data), data)
		// Log to debug file for testing
		// In real implementation, you might want to log to a file
		return len(data), nil
	}

	if debugMode {
		fmt.Printf("[serial] writing %d bytes to real serial port: %x\n", len(data), data)
	}
	n, err := port.Write(data)
	if err != nil {
		fmt.Printf("[serial] write error: %v\n", err)
		return 0, err
	}

	// if debugMode {
	// 	fmt.Printf("[serial] successfully wrote %d bytes to serial port\n", n)
	// }
	return n, nil
}

func readSerial(port serial.Port, maxBytes int) ([]byte, error) {
	if port == nil {
		return nil, nil
	}

	buffer := make([]byte, maxBytes)
	n, err := port.Read(buffer)
	if err != nil {
		if err != io.EOF {
			fmt.Printf("[serial] read error: %v\n", err)
		}
		return nil, err
	}

	if n > 0 {
		return buffer[:n], nil
	}

	return nil, nil
}

func setSerialDTR(port serial.Port, state bool) {
	if port != nil {
		if debugMode {
			fmt.Printf("[serial] DTR set to %v\n", state)
		}
		if err := port.SetDTR(state); err != nil {
			fmt.Printf("[serial] DTR set error: %v\n", err)
		} else {
			// Small delay to ensure the signal is processed
			time.Sleep(10 * time.Millisecond)
		}
	}
}

func setSerialRTS(port serial.Port, state bool) {
	if port != nil {
		if debugMode {
			fmt.Printf("[serial] RTS set to %v\n", state)
		}
		if err := port.SetRTS(state); err != nil {
			fmt.Printf("[serial] RTS set error: %v\n", err)
		} else {
			// Small delay to ensure the signal is processed
			time.Sleep(10 * time.Millisecond)
		}
	}
}

// setSerialDTRRTS sets both DTR and RTS pins simultaneously
func setSerialDTRRTS(port serial.Port, dtr, rts bool) {
	if port != nil {
		if debugMode {
			fmt.Printf("[serial] DTR set to %v, RTS set to %v\n", dtr, rts)
		}

		// Set DTR
		if err := port.SetDTR(dtr); err != nil {
			fmt.Printf("[serial] DTR set error: %v\n", err)
		}

		// Set RTS
		if err := port.SetRTS(rts); err != nil {
			fmt.Printf("[serial] RTS set error: %v\n", err)
		}

		// Small delay to ensure the signals are processed
		time.Sleep(50 * time.Millisecond)
	}
}

func reopenSerialPort(path string, newBaudRate int) bool {
	serialMutex.Lock()
	defer serialMutex.Unlock()

	if port, exists := openSerialPorts[path]; exists {
		closeSerial(port)
		delete(openSerialPorts, path)
		delete(serialPortRefCount, path)
	}

	time.Sleep(100 * time.Millisecond)
	fmt.Printf("[serial] closed serial port for %s, new baudrate %d will be used\n", path, newBaudRate)
	return true
}

func ensureSerialTcpServer(path string, baudRate int) (*ServerInfo, error) {
	serialMutex.Lock()
	defer serialMutex.Unlock()

	if info, exists := serialServers[path]; exists {
		return &info, nil
	}

	// Create TCP server
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return nil, err
	}

	port := listener.Addr().(*net.TCPAddr).Port

	// Handle incoming connections
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				if debugMode {
					fmt.Printf("[serial] connection error: %v\n", err)
				}
				continue
			}

			// Try to set TCP options (disable Nagle and increase buffers) to reduce latency
			if tcpConn, ok := conn.(*net.TCPConn); ok {
				// disable Nagle
				_ = tcpConn.SetNoDelay(true)
				// enlarge buffers a bit (ignore errors)
				_ = tcpConn.SetReadBuffer(64 * 1024)
				_ = tcpConn.SetWriteBuffer(64 * 1024)
				// optional: enable keepalive to help persistent connections
				_ = tcpConn.SetKeepAlive(true)
			}
			fmt.Printf("[serial] client connected for %s\n", path)

			// Get current baud rate and control-line state from stored state
			currentState := getSerialPortState(path)
			currentBaudRate := currentState.BaudRate

			var serialPort serial.Port

			// Check if we have existing serial port
			if existingPort, exists := openSerialPorts[path]; exists && existingPort != nil {
				serialPort = existingPort
				serialMutex.Lock()
				serialPortRefCount[path]++
				serialMutex.Unlock()
				fmt.Printf("[serial] reusing existing serial port for %s, refs: %d\n", path, serialPortRefCount[path])
				// Ensure control lines reflect desired state for this session
				// (best-effort; ignore errors)
				setSerialDTRRTS(serialPort, currentState.DTR, currentState.RTS)
			} else {
				serialPort = openSerialPort(path, currentBaudRate)
				if serialPort != nil {
					// After opening, apply saved DTR/RTS immediately (critical for many bootloaders)
					setSerialDTRRTS(serialPort, currentState.DTR, currentState.RTS)

					serialMutex.Lock()
					openSerialPorts[path] = serialPort
					serialPortRefCount[path] = 1
					serialMutex.Unlock()
					fmt.Printf("[serial] opened serial port for %s with baudrate %d\n", path, currentBaudRate)
				}
			}

			// Handle connection
			go handleSerialConnection(conn, serialPort, path)
		}
	}()

	fmt.Printf("[serial] TCP server for %s listening on %d with baudrate %d\n", path, port, baudRate)

	info := ServerInfo{
		Server: listener,
		Port:   port,
	}
	serialServers[path] = info
	tcpPortToSerialPath[port] = path

	return &info, nil
}

func handleSerialConnection(conn net.Conn, serialPort serial.Port, path string) {
	defer conn.Close()

	// Bidirectional data forwarding with explicit stop signalling
	done := make(chan bool, 2) // both directions signal completion
	stop := make(chan struct{})
	var stopOnce sync.Once
	// closeStop: close stop channel once and perform early refcount cleanup
	closeStop := func() {
		stopOnce.Do(func() {
			// decrement refcount and close serial port if this was the last reference
			serialMutex.Lock()
			defer serialMutex.Unlock()
			if cnt, ok := serialPortRefCount[path]; ok {
				if cnt <= 1 {
					// last reference: remove and close port to unblock readers
					delete(serialPortRefCount, path)
					if p, exists := openSerialPorts[path]; exists {
						if debugMode {
							fmt.Printf("[serial] early-closing serial port for %s\n", path)
						}
						closeSerial(p)
						delete(openSerialPorts, path)
					}
				} else {
					serialPortRefCount[path] = cnt - 1
				}
			}
			close(stop)
		})
	}

	// Serial -> TCP forwarding
	go func() {
		defer func() { done <- true }()
		for {
			select {
			case <-stop:
				return
			default:
			}

			data, err := readSerial(serialPort, 1024)
			if err != nil {
				// signal stop and exit
				if debugMode {
					fmt.Printf("[serial] Serial->TCP: read error: %v\n", err)
				}
				closeStop()
				return
			}
			if len(data) > 0 {
				if debugMode {
					fmt.Printf("[serial] Serial->TCP: received %d bytes from serial: %x\n", len(data), data)
				}
				if _, err := conn.Write(data); err != nil {
					if debugMode {
						fmt.Printf("[serial] Serial->TCP: error sending to client: %v\n", err)
					}
					closeStop()
					return
				}
				if debugMode {
					fmt.Printf("[serial] Serial->TCP: sent %d bytes to TCP client\n", len(data))
				}
			} else {
				time.Sleep(1 * time.Millisecond)
			}
		}
	}()

	// TCP -> Serial forwarding
	go func() {
		defer func() { done <- true }()
		buffer := make([]byte, 1024)
		for {
			select {
			case <-stop:
				return
			default:
			}

			n, err := conn.Read(buffer)
			if err != nil {
				if debugMode {
					fmt.Printf("[serial] TCP->Serial: client read error: %v\n", err)
				}
				// on client error — signal stop and exit
				closeStop()
				return
			}
			if n > 0 {
				if debugMode {
					fmt.Printf("[serial] TCP->Serial: received %d bytes from TCP: %x\n", n, buffer[:n])
				}
				_, err := writeSerial(serialPort, buffer[:n])
				if err != nil {
					if debugMode {
						fmt.Printf("[serial] TCP->Serial: error writing to serial: %v\n", err)
					}
					closeStop()
					return
				}
				if debugMode {
					fmt.Printf("[serial] TCP->Serial: wrote %d bytes to serial port\n", n)
				}
			}
		}
	}()

	// Wait for both directions to stop
	<-done
	<-done

	// Cleanup: if early cleanup already removed entries, just log; otherwise finish refcount work
	serialMutex.Lock()
	if cnt, exists := serialPortRefCount[path]; exists {
		if cnt > 1 {
			serialPortRefCount[path] = cnt - 1
			fmt.Printf("[serial] connection closed for %s, refs remaining: %d\n", path, cnt-1)
		} else {
			// last ref: close port if still present
			if port, ok := openSerialPorts[path]; ok {
				closeSerial(port)
				delete(openSerialPorts, path)
			}
			delete(serialPortRefCount, path)
			fmt.Printf("[serial] connection closed for %s, port closed\n", path)
		}
	} else {
		// already cleaned up by early closeStop
		fmt.Printf("[serial] connection closed for %s (already cleaned)\n", path)
	}
	serialMutex.Unlock()
}

func scanAndSyncSerialPorts() {
	ports := listSerialPorts()
	foundPaths := make(map[string]bool)

	serialMutex.Lock()
	defer serialMutex.Unlock()

	for _, portInfo := range ports {
		pathName := portInfo.Path
		if pathName == "" {
			continue
		}

		foundPaths[pathName] = true
		serialPortDetails[pathName] = portInfo

		if _, exists := serialServers[pathName]; !exists {
			go func(path string) {
				_, err := ensureSerialTcpServer(path, 115200)
				if err != nil {
					fmt.Printf("[serial] failed to create tcp server for %s: %v\n", path, err)
				}
			}(pathName)
		}
	}

	// Remove servers for ports that disappeared
	for existingPath := range serialServers {
		if !foundPaths[existingPath] {
			info := serialServers[existingPath]
			info.Server.Close()
			delete(tcpPortToSerialPath, info.Port)
			delete(serialServers, existingPath)
			delete(serialPortDetails, existingPath)

			if port, exists := openSerialPorts[existingPath]; exists {
				closeSerial(port)
				delete(openSerialPorts, existingPath)
				delete(serialPortRefCount, existingPath)
			}

			fmt.Printf("[serial] closed TCP server for %s\n", existingPath)
		}
	}
}

func startSerialMonitor() {
	if serialScanInterval == 0 {
		if debugMode {
			fmt.Println("[serial] monitor disabled (SERIAL_SCAN_INTERVAL=0)")
		}
		return
	}

	scanAndSyncSerialPorts()

	ticker := time.NewTicker(time.Duration(serialScanInterval) * time.Millisecond)
	go func() {
		for range ticker.C {
			scanAndSyncSerialPorts()
		}
	}()

	if debugMode {
		fmt.Printf("[serial] monitor started, interval %d\n", serialScanInterval)
	}
}

func stopSerialMonitor() {
	// Implementation would stop the ticker
}

func closeAllSerialServers() {
	serialMutex.Lock()
	defer serialMutex.Unlock()

	for path, info := range serialServers {
		info.Server.Close()
		delete(tcpPortToSerialPath, info.Port)
		delete(serialServers, path)
		delete(serialPortDetails, path)

		if port, exists := openSerialPorts[path]; exists {
			closeSerial(port)
			delete(openSerialPorts, path)
			delete(serialPortRefCount, path)
		}
	}
}

// Helper functions for state management
func getSerialPortState(path string) SerialState {
	serialMutex.RLock()
	defer serialMutex.RUnlock()

	if state, exists := serialPortStates[path]; exists {
		return state
	}
	return SerialState{DTR: false, RTS: false, BaudRate: 115200}
}

func setSerialPortState(path string, state SerialState) {
	serialMutex.Lock()
	defer serialMutex.Unlock()
	serialPortStates[path] = state
}

func getSerialPort(path string) serial.Port {
	serialMutex.RLock()
	defer serialMutex.RUnlock()
	return openSerialPorts[path]
}

func setSerialPort(path string, port serial.Port) {
	serialMutex.Lock()
	defer serialMutex.Unlock()
	openSerialPorts[path] = port
}

func getTcpPortFromPath(path string) int {
	serialMutex.RLock()
	defer serialMutex.RUnlock()

	if info, exists := serialServers[path]; exists {
		return info.Port
	}
	return 0
}

func getSerialPathFromTcpPort(port int) string {
	serialMutex.RLock()
	defer serialMutex.RUnlock()
	return tcpPortToSerialPath[port]
}

func setGpioState(path string, value int) error {
	// accept only 0 or 1
	if value != 0 && value != 1 {
		return fmt.Errorf("invalid gpio value: %d (allowed: 0 or 1)", value)
	}

	// open for write (do not change permissions of existing sysfs file)
	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	// write value (no newline needed for sysfs, but safe to omit or include)
	data := []byte(fmt.Sprintf("%d", value))
	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}
