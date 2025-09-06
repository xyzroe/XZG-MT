package main

import (
	"fmt"
	"net"

	"github.com/gorilla/websocket"
)

func handleWebSocketConnection(ws *websocket.Conn, targetHost string, targetPort int) {
	fmt.Printf("[websocket] establishing TCP connection to %s:%d\n", targetHost, targetPort)
	
	// Create TCP connection to target
	tcpConn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", targetHost, targetPort))
	if err != nil {
		fmt.Printf("[websocket] failed to connect to %s:%d: %v\n", targetHost, targetPort, err)
		ws.Close()
		return
	}
	defer tcpConn.Close()
	
	fmt.Printf("[websocket] TCP connection established to %s:%d\n", targetHost, targetPort)
	
	// Set up bidirectional forwarding
	done := make(chan bool)
	
	// TCP -> WebSocket forwarding
	go func() {
		defer func() { done <- true }()
		buffer := make([]byte, 4096)
		for {
			n, err := tcpConn.Read(buffer)
			if err != nil {
				fmt.Printf("[websocket] TCP->WS: read error: %v\n", err)
				return
			}
			if n > 0 {
				if debugMode {
					fmt.Printf("[websocket] TCP->WS: received %d bytes from TCP: %x\n", n, buffer[:n])
				}
				if err := ws.WriteMessage(websocket.BinaryMessage, buffer[:n]); err != nil {
					fmt.Printf("[websocket] TCP->WS: write error: %v\n", err)
					return
				}
				if debugMode {
					fmt.Printf("[websocket] TCP->WS: sent %d bytes to WebSocket\n", n)
				}
			}
		}
	}()
	
	// WebSocket -> TCP forwarding
	go func() {
		defer func() { done <- true }()
		for {
			messageType, data, err := ws.ReadMessage()
			if err != nil {
				fmt.Printf("[websocket] WS->TCP: read error: %v\n", err)
				return
			}
			
			if messageType == websocket.CloseMessage {
				fmt.Printf("[websocket] WS->TCP: WebSocket close frame received\n")
				return
			}
			
			if messageType == websocket.BinaryMessage || messageType == websocket.TextMessage {
				if debugMode {
					fmt.Printf("[websocket] WS->TCP: received %d bytes from WebSocket: %x\n", len(data), data)
				}
				if _, err := tcpConn.Write(data); err != nil {
					fmt.Printf("[websocket] WS->TCP: write error: %v\n", err)
					return
				}
				if debugMode {
					fmt.Printf("[websocket] WS->TCP: sent %d bytes to TCP\n", len(data))
				}
			}
		}
	}()
	
	// Wait for either direction to close
	<-done
	
	fmt.Printf("[websocket] connection closing for %s:%d\n", targetHost, targetPort)
}
