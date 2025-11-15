package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// VERSION is set at build time. Use go build -ldflags "-X main.VERSION=1.2.3"
// to override the default value during the build process.
var VERSION = "0.0.0"

const (
	DEFAULT_WS_PORT              = 8765
	//DEFAULT_SERIAL_SCAN_INTERVAL = 10000
)

var (
	wsPort             int
	serialScanInterval int
	advertiseHost      string
	debugMode          bool
)

func main() {
	// Parse command line arguments
	flag.IntVar(&wsPort, "port", DEFAULT_WS_PORT, "WebSocket server port")
	//flag.IntVar(&serialScanInterval, "serial-scan-interval", DEFAULT_SERIAL_SCAN_INTERVAL, "Serial port scan interval in milliseconds")
	flag.StringVar(&advertiseHost, "advertise-host", "", "Advertise host for mDNS")
	flag.BoolVar(&debugMode, "debug", false, "Enable debug mode")
	flag.Parse()

	// Override with environment variables
	if port := os.Getenv("PORT"); port != "" {
		if p, err := fmt.Sscanf(port, "%d", &wsPort); err == nil && p == 1 {
			// Successfully parsed
		}
	}
	// if interval := os.Getenv("SERIAL_SCAN_INTERVAL"); interval != "" {
	// 	if i, err := fmt.Sscanf(interval, "%d", &serialScanInterval); err == nil && i == 1 {
	// 		// Successfully parsed
	// 	}
	// }
	if host := os.Getenv("ADVERTISE_HOST"); host != "" {
		advertiseHost = host
	}
	if debug := os.Getenv("DEBUG_MODE"); debug == "1" || debug == "true" || debug == "yes" || debug == "on" {
		debugMode = true
		fmt.Printf("[XZG-MT] debug mode enabled\n")
	}

	fmt.Printf("[XZG-MT] Local Bridge Server v%s\n", VERSION)
	fmt.Printf("[XZG-MT] access UI at http://%s:%d\n", getAdvertiseHost(), wsPort)
	// fmt.Printf("[bridge] listening on %s:%d\n", getAdvertiseHost(), wsPort)

	// Create Echo instance
	e := echo.New()
	e.HideBanner = true

	// Middleware
	// if debugMode {
	// 	e.Use(middleware.Logger())
	// }
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	// Routes
	setupRoutes(e)

	// Start serial monitor
	//go startSerialMonitor()

	// Start server
	go func() {
		if err := e.Start(fmt.Sprintf(":%d", wsPort)); err != nil {
			log.Fatal(err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Println("[shutdown] graceful shutdown starting...")

	// Stop serial monitor
	//stopSerialMonitor()

	// Close all serial servers
	closeAllSerialServers()

	fmt.Println("[shutdown] done")
}

func getAdvertiseHost() string {
	if advertiseHost != "" {
		return advertiseHost
	}
	return getPrimaryIPv4()
}

func getPrimaryIPv4() string {
	// Find first active non-loopback interface with an IPv4 address
	ifaces, err := net.Interfaces()
	if err != nil {
		return "127.0.0.1"
	}

	for _, iface := range ifaces {
		// skip interfaces that are down or loopback
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, a := range addrs {
			var ip net.IP
			switch v := a.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			ip4 := ip.To4()
			if ip4 == nil {
				continue // not IPv4
			}
			// skip link-local addresses (169.254.x.x)
			if ip4.IsLinkLocalUnicast() {
				continue
			}
			return ip4.String()
		}
	}

	// fallback
	return "127.0.0.1"
}
