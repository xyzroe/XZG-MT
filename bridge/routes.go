package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

func setupRoutes(e *echo.Echo) {
	// CORS middleware
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Response().Header().Set("Access-Control-Allow-Origin", "*")
			c.Response().Header().Set("Access-Control-Allow-Credentials", "true")
			c.Response().Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
			c.Response().Header().Set("Access-Control-Allow-Headers", "Content-Type,Accept,Origin,X-Requested-With,Authorization")
			c.Response().Header().Set("Access-Control-Allow-Private-Network", "true")
			c.Response().Header().Set("Access-Control-Max-Age", "86400")

			if c.Request().Method == "OPTIONS" {
				return c.NoContent(204)
			}

			return next(c)
		}
	})

	// WebSocket upgrade handlers
	e.GET("/ws", handleWebSocketUpgrade)
	e.GET("/connect", handleWebSocketUpgrade)

	// mDNS discovery endpoint
	e.GET("/mdns", handleMdnsScan)

	// Serial control endpoint
	e.GET("/sc", handleSerialControl)

	// GPIO control endpoint
	e.GET("/gpio", handleGpioControl)

	// GPIO list endpoint
	e.GET("/gl", handleGpioList)

	// Static file serving
	e.GET("/*", handleStaticFiles)
}

func handleWebSocketUpgrade(c echo.Context) error {
	// Get target host and port from query parameters
	host := c.QueryParam("host")
	portStr := c.QueryParam("port")

	if host == "" || portStr == "" {
		return c.String(http.StatusBadRequest, "Missing host or port parameter")
	}

	port, err := strconv.Atoi(portStr)
	if err != nil {
		return c.String(http.StatusBadRequest, "Invalid port parameter")
	}

	// Upgrade to WebSocket
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins
		},
	}

	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	// Handle WebSocket connection
	handleWebSocketConnection(ws, host, port)

	return nil
}

func handleMdnsScan(c echo.Context) error {
	typesParam := c.QueryParam("types")
	timeoutStr := c.QueryParam("timeout")

	timeout := 2000 // default timeout
	if timeoutStr != "" {
		if t, err := strconv.Atoi(timeoutStr); err == nil {
			timeout = t
		}
	}

	// Ensure timeout is within reasonable bounds
	if timeout < 500 {
		timeout = 500
	} else if timeout > 10000 {
		timeout = 10000
	}

	types := strings.Split(typesParam, ",")
	var normalizedTypes []ServiceType
	var wantsLocalSerial bool

	for _, t := range types {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}

		if isLocalSerialToken(t) {
			wantsLocalSerial = true
		} else {
			if st := parseServiceType(t); st != nil {
				normalizedTypes = append(normalizedTypes, *st)
			}
		}
	}

	var results []ServiceInfo

	// Scan mDNS services
	if len(normalizedTypes) > 0 {
		results = scanMdns(normalizedTypes, timeout)
	}

	// Add local serial services
	if wantsLocalSerial {
		scanAndSyncSerialPorts()
		locals := listLocalSerialAsServices()
		results = append(results, locals...)
	}

	response := map[string]interface{}{
		"devices": results,
	}

	return c.JSON(http.StatusOK, response)
}

func handleGpioControl(c echo.Context) error {
	// Handle GPIO control logic here
	path := c.QueryParam("path")
	setStr := c.QueryParam("set")

	if path == "" || setStr == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Missing path or set parameter",
		})
	}

	// Trim surrounding quotes/spaces and clean the path
	path = strings.TrimSpace(path)
	path = strings.Trim(path, "\"' ")
	path = filepath.Clean(path)

	var setValue int
	var err error
	setValue, err = strconv.Atoi(setStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid set value",
		})
	}
	if setValue < 0 || setValue > 1 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid set value",
		})
	}

	// Set GPIO state here
	err = setGpioState(path, setValue)

	ok := (err == nil)
	resp := map[string]interface{}{
		"ok":   ok,
		"path": path,
		"set":  setValue,
	}
	if err != nil {
		resp["error"] = err.Error()
	}

	return c.JSON(http.StatusOK, resp)
}

func handleGpioList(c echo.Context) error {
	// Return only already-exported GPIOs and LEDs in compact format
	type SimpleEntry struct {
		Path  string `json:"path"`
		Label string `json:"label"`
		Value string `json:"value"`
	}
	var gpioOut []SimpleEntry
	entries, _ := os.ReadDir("/sys/class/gpio")
	for _, entry := range entries {
		name := entry.Name()
		// skip gpiochip* and export/unexport entries
		if strings.HasPrefix(name, "gpiochip") || name == "export" || name == "unexport" {
			continue
		}
		valPath := filepath.Join("/sys/class/gpio", name, "value")
		val := ""
		if b, err := os.ReadFile(valPath); err == nil {
			val = strings.TrimSpace(string(b))
		}
		label := name
		gpioOut = append(gpioOut, SimpleEntry{Path: valPath, Label: label, Value: val})
	}
	var ledsOut []SimpleEntry
	leds, _ := os.ReadDir("/sys/class/leds/")
	for _, led := range leds {
		name := led.Name()
		bPath := filepath.Join("/sys/class/leds", name, "brightness")
		val := ""
		if b, err := os.ReadFile(bPath); err == nil {
			val = strings.TrimSpace(string(b))
		}
		ledsOut = append(ledsOut, SimpleEntry{Path: bPath, Label: name, Value: val})
	}

	resp := map[string]interface{}{
		"gpio": gpioOut,
		"leds": ledsOut,
	}

	return c.JSON(http.StatusOK, resp)
}

func handleSerialControl(c echo.Context) error {
	path := c.QueryParam("path")
	tcpPortStr := c.QueryParam("port")
	dtrStr := c.QueryParam("dtr")
	rtsStr := c.QueryParam("rts")
	baudStr := c.QueryParam("baud")

	// Get path from TCP port if not provided directly
	if path == "" && tcpPortStr != "" {
		if tcpPort, err := strconv.Atoi(tcpPortStr); err == nil {
			path = getSerialPathFromTcpPort(tcpPort)
		}
	}

	if path == "" || (dtrStr == "" && rtsStr == "" && baudStr == "") {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Missing path/tcpPort or dtr/rts/baud param",
		})
	}

	// Parse baud rate if provided
	var baud int
	if baudStr != "" {
		var err error
		baud, err = strconv.Atoi(baudStr)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid baud rate",
			})
		}

		if !isValidBaudRate(baud) {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error":      "Invalid baud rate",
				"validRates": validRates,
			})
		}
	}

	// Get current state
	currentState := getSerialPortState(path)

	// Handle baud rate change
	if baud > 0 && baud != currentState.BaudRate {
		if !reopenSerialPort(path, baud) {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "Failed to reopen port with new baud rate",
			})
		}
		currentState.BaudRate = baud

		// Reopen immediately to ensure it's ready
		if _, err := ensureSerialPort(path, baud); err != nil {
			log.Printf("[routes] failed to reopen port %s at %d: %v\n", path, baud, err)
		}
	}

	// Update state
	setObj := currentState
	if dtrStr != "" {
		setObj.DTR = dtrStr == "1" || dtrStr == "true"
	}
	if rtsStr != "" {
		setObj.RTS = rtsStr == "1" || rtsStr == "true"
	}
	if baud > 0 {
		setObj.BaudRate = baud
	}

	setSerialPortState(path, setObj)

	// Apply DTR/RTS if they were changed
	if dtrStr != "" || rtsStr != "" {
		// Use ensureSerialPort to safely get or open the port
		serial, err := ensureSerialPort(path, currentState.BaudRate)
		if err != nil {
			// Log error but continue? Or return error?
			// For now, just log and fail the DTR/RTS part
			log.Printf("[routes] failed to ensure port for %s: %v\n", path, err)
		} else if serial != nil {
			// Set both DTR and RTS simultaneously for better timing
			//setSerialDTRRTS(serial, setObj.DTR, setObj.RTS)
			if dtrStr != "" {
				setSerialDTR(serial, setObj.DTR)
			}
			if rtsStr != "" {
				setSerialRTS(serial, setObj.RTS)
			}
		}
	}

	response := map[string]interface{}{
		"ok":      true,
		"path":    path,
		"tcpPort": getTcpPortFromPath(path),
		"set":     setObj,
	}

	return c.JSON(http.StatusOK, response)
}

func handleStaticFiles(c echo.Context) error {
	path := c.Request().URL.Path

	// Remove leading slash
	path = strings.TrimPrefix(path, "/")

	// Default to index.html
	if path == "" {
		path = "index.html"
	}

	// Try to get embedded file
	if content, found := getEmbeddedFile(path); found {
		contentType := getContentType(path)
		c.Response().Header().Set("Content-Type", contentType)
		return c.String(http.StatusOK, content)
	}

	// File not found
	return c.String(http.StatusNotFound, "File not found")
}

func getContentType(path string) string {
	ext := strings.ToLower(getFileExtension(path))
	switch ext {
	case ".html":
		return "text/html"
	case ".js":
		return "text/javascript"
	case ".css":
		return "text/css"
	case ".json":
		return "application/json"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/x-icon"
	default:
		return "application/octet-stream"
	}
}

func getFileExtension(path string) string {
	if idx := strings.LastIndex(path, "."); idx != -1 {
		return path[idx:]
	}
	return ""
}
