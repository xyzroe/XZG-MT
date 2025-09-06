package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

const (
	VERSION = "1.0.0"
	DEFAULT_WS_PORT = 8765
	DEFAULT_SERIAL_SCAN_INTERVAL = 10000
)

var (
	wsPort int
	serialScanInterval int
	advertiseHost string
	debugMode bool
)

func main() {
	// Parse command line arguments
	flag.IntVar(&wsPort, "port", DEFAULT_WS_PORT, "WebSocket server port")
	flag.IntVar(&serialScanInterval, "serial-scan-interval", DEFAULT_SERIAL_SCAN_INTERVAL, "Serial port scan interval in milliseconds")
	flag.StringVar(&advertiseHost, "advertise-host", "", "Advertise host for mDNS")
	flag.BoolVar(&debugMode, "debug", false, "Enable debug mode")
	flag.Parse()

	// Override with environment variables
	if port := os.Getenv("PORT"); port != "" {
		if p, err := fmt.Sscanf(port, "%d", &wsPort); err == nil && p == 1 {
			// Successfully parsed
		}
	}
	if interval := os.Getenv("SERIAL_SCAN_INTERVAL"); interval != "" {
		if i, err := fmt.Sscanf(interval, "%d", &serialScanInterval); err == nil && i == 1 {
			// Successfully parsed
		}
	}
	if host := os.Getenv("ADVERTISE_HOST"); host != "" {
		advertiseHost = host
	}
	if debug := os.Getenv("DEBUG_MODE"); debug == "1" || debug == "true" || debug == "yes" || debug == "on" {
		debugMode = true
	}

	fmt.Printf("[XZG-MT] Go Bridge Server v%s\n", VERSION)
	fmt.Printf("[XZG-MT] access UI at http://%s:%d\n", getAdvertiseHost(), wsPort)
	fmt.Printf("[bridge] listening on %s:%d\n", getAdvertiseHost(), wsPort)

	// Create Echo instance
	e := echo.New()
	e.HideBanner = true

	// Middleware
	if debugMode {
		e.Use(middleware.Logger())
	}
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	// Routes
	setupRoutes(e)

	// Start serial monitor
	go startSerialMonitor()

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
	stopSerialMonitor()
	
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
	// Simplified implementation - in real scenario would use net.Interfaces()
	return "127.0.0.1"
}
