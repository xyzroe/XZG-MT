package main

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestWebSocketByteStream(t *testing.T) {
	tests := []struct {
		name   string
		frames [][]byte
	}{
		{"ack and packet", [][]byte{{0x00, 0xcc, 0x03, 0x40, 0x40}}},
		{"split ack", [][]byte{{0x00}, {0xcc, 0x03}, {0x40, 0x40}}},
		{"arbitrary data", [][]byte{{0x00, 0xcc, 0xff}, {0x01, 0x02}}},
		{"empty frame", [][]byte{{}, {0x55, 0x55}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			serverConns := make(chan *wsNetConn, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				ws, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
				if err != nil {
					t.Errorf("upgrade: %v", err)
					return
				}
				serverConns <- newWsNetConn(ws, "local", "remote")
			}))
			defer server.Close()
			client, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
			if err != nil {
				t.Fatal(err)
			}
			defer client.Close()
			conn := <-serverConns
			defer conn.Close()
			expected := bytes.Join(tt.frames, nil)
			for _, frame := range tt.frames {
				if err := client.WriteMessage(websocket.BinaryMessage, frame); err != nil {
					t.Fatal(err)
				}
			}
			// A stalled protocol-specific buffer must not hang the test.
			timer := time.AfterFunc(2*time.Second, func() { _ = conn.Close() })
			defer timer.Stop()
			actual := make([]byte, len(expected))
			if _, err := io.ReadFull(conn, actual); err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(actual, expected) {
				t.Fatalf("got %x, want %x", actual, expected)
			}
			if _, err := conn.Write(expected); err != nil {
				t.Fatal(err)
			}
			_, reply, err := client.ReadMessage()
			if err != nil || !bytes.Equal(reply, expected) {
				t.Fatalf("reply %x, error %v", reply, err)
			}
		})
	}
}
