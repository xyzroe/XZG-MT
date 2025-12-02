package main

import (
	"io"
	"log"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// minimal net.Addr implementation for wrapper
type wsAddr struct {
	network string
	addr    string
}

func (a wsAddr) Network() string { return a.network }
func (a wsAddr) String() string  { return a.addr }

// wsNetConn implements net.Conn over a websocket connection (stream-like).
// It pumps incoming WS messages into an io.Pipe for Read(), and implements Write() by
// using NextWriter(websocket.BinaryMessage) for atomic writes.
type wsNetConn struct {
	ws       *websocket.Conn
	pr       *io.PipeReader
	pw       *io.PipeWriter
	writeMu  sync.Mutex
	closeMu  sync.Mutex
	closed   bool
	local    net.Addr
	remote   net.Addr
	readDLMu sync.Mutex
	writeDLM sync.Mutex
}

func newWsNetConn(ws *websocket.Conn, localAddr, remoteAddr string) *wsNetConn {
	pr, pw := io.Pipe()
	conn := &wsNetConn{
		ws:     ws,
		pr:     pr,
		pw:     pw,
		local:  wsAddr{"ws", localAddr},
		remote: wsAddr{"ws", remoteAddr},
	}
	// pump WS -> pipe writer
	go func() {
		defer pw.Close()
		// buffer incoming frame data and emit complete logical packets.
		// Special-case for protocol starting with 0x00 0xCC: third byte is length (L),
		// total packet size = 3 + L. Adjust/extend rules for other protocols as needed.
		buf := make([]byte, 0, 8192)
		for {
			mt, r, err := ws.NextReader()
			if err != nil {
				_ = pw.CloseWithError(err)
				return
			}
			if mt != websocket.BinaryMessage && mt != websocket.TextMessage {
				continue
			}
			// read full frame into tmp slice
			data, err := io.ReadAll(r)
			if err != nil {
				_ = pw.CloseWithError(err)
				return
			}
			if len(data) == 0 {
				// nothing to append, continue
				continue
			}
			buf = append(buf, data...)

			// try to flush complete logical packets from buffer
			for {
				if len(buf) == 0 {
					break
				}
				// protocol: 0x00 0xCC <len> <payload>
				if len(buf) >= 3 && buf[0] == 0x00 && buf[1] == 0xCC {
					plen := int(buf[2])
					total := 3 + plen
					if len(buf) >= total {
						if _, err := pw.Write(buf[:total]); err != nil {
							_ = pw.CloseWithError(err)
							return
						}
						// drop emitted bytes
						buf = buf[total:]
						continue
					}
					// not enough bytes yet — wait for next frame
					break
				}
				// no known header — flush everything (or could implement other rules)
				if len(buf) > 0 {
					if _, err := pw.Write(buf); err != nil {
						_ = pw.CloseWithError(err)
						return
					}
					buf = buf[:0]
				}
			}
		}
	}()
	return conn
}

func (c *wsNetConn) Read(b []byte) (int, error) {
	return c.pr.Read(b)
}

func (c *wsNetConn) Write(b []byte) (int, error) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	// ensure we don't block forever on NextWriter/Close
	_ = c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))

	w, err := c.ws.NextWriter(websocket.BinaryMessage)
	if err != nil {
		// clear deadline on error (best-effort)
		_ = c.ws.SetWriteDeadline(time.Time{})
		return 0, err
	}
	// write full payload
	n, err := w.Write(b)
	closeErr := w.Close()
	// clear deadline after finished
	_ = c.ws.SetWriteDeadline(time.Time{})
	if err != nil {
		return n, err
	}
	if closeErr != nil {
		return n, closeErr
	}
	return n, nil
}

func (c *wsNetConn) Close() error {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()
	if c.closed {
		return nil
	}
	c.closed = true
	// close underlying websocket and pipe
	_ = c.ws.Close()
	// ensure pipe readers are unblocked with an error so io.Copy returns
	_ = c.pw.CloseWithError(io.EOF)
	_ = c.pr.Close()
	return nil
}

func (c *wsNetConn) LocalAddr() net.Addr  { return c.local }
func (c *wsNetConn) RemoteAddr() net.Addr { return c.remote }

func (c *wsNetConn) SetDeadline(t time.Time) error {
	if err := c.SetReadDeadline(t); err != nil {
		return err
	}
	return c.SetWriteDeadline(t)
}

func (c *wsNetConn) SetReadDeadline(t time.Time) error {
	c.readDLMu.Lock()
	defer c.readDLMu.Unlock()
	return c.ws.SetReadDeadline(t)
}

func (c *wsNetConn) SetWriteDeadline(t time.Time) error {
	c.writeDLM.Lock()
	defer c.writeDLM.Unlock()
	return c.ws.SetWriteDeadline(t)
}

func handleWebSocketConnection(ws *websocket.Conn, targetHost string, targetPort int) {
	target := net.JoinHostPort(targetHost, strconv.Itoa(targetPort))
	if debugMode {
		log.Printf("[websocket] establishing TCP connection to %s\n", target)
	}

	// Create TCP connection to target
	tcpConn, err := net.Dial("tcp", target)
	if err != nil {
		log.Printf("[websocket] failed to connect to %s: %v\n", target, err)
		_ = ws.Close()
		return
	}
	// ensure cleanup
	defer tcpConn.Close()
	defer ws.Close()

	// try optimize TCP
	if tcp, ok := tcpConn.(*net.TCPConn); ok {
		_ = tcp.SetNoDelay(true)
		_ = tcp.SetKeepAlive(true)
		_ = tcp.SetKeepAlivePeriod(30 * time.Second)
	}

	log.Printf("[websocket] TCP connection established to %s\n", target)

	// wrap websocket as net.Conn
	wsConn := newWsNetConn(ws, ws.LocalAddr().String(), ws.RemoteAddr().String())

	// Try to set TCP_NODELAY on websocket underlying TCP conn (reduce buffering)
	if u := ws.UnderlyingConn(); u != nil {
		if tcpU, ok := u.(*net.TCPConn); ok {
			_ = tcpU.SetNoDelay(true)
		}
	}

	// set reasonable deadlines / ping-pong on websocket side
	ws.SetReadLimit(4 * 1024 * 1024)
	ws.SetReadDeadline(time.Now().Add(60 * time.Second))
	ws.SetPongHandler(func(string) error {
		_ = ws.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Start ping routine
	pingTicker := time.NewTicker(20 * time.Second)
	defer pingTicker.Stop()
	go func() {
		for range pingTicker.C {
			_ = ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			_ = ws.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(10*time.Second))
		}
	}()

	// Bidirectional copy (stream-like) with coalescing for tcp->ws
	errCh := make(chan error, 2)

	// ws -> tcp (keep simple: ensure full write loop)
	go func() {
		_, err := io.Copy(tcpConn, wsConn)
		errCh <- err
	}()

	// tcp -> ws with small coalescing window
	go func() {
		readBuf := make([]byte, 4096)
		for {
			// block until first chunk
			n, rerr := tcpConn.Read(readBuf)
			if n > 0 {
				out := make([]byte, 0, n)
				out = append(out, readBuf[:n]...)
				// coalesce additional immediately-available bytes with short deadline
				_ = tcpConn.SetReadDeadline(time.Now().Add(5 * time.Millisecond))
				for {
					m, err2 := tcpConn.Read(readBuf)
					if m > 0 {
						out = append(out, readBuf[:m]...)
						// prevent unbounded growth
						if len(out) >= 64*1024 {
							break
						}
						continue
					}
					if err2 != nil {
						// timeout or real error: break to send what's collected
						break
					}
				}
				_ = tcpConn.SetReadDeadline(time.Time{}) // clear deadline

				// write as a single websocket frame
				_, werr := wsConn.Write(out)
				if werr != nil {
					errCh <- werr
					return
				}
			}
			if rerr != nil {
				errCh <- rerr
				return
			}
		}
	}()

	// wait for first error/close
	err = <-errCh
	if err != nil && err != io.EOF {
		if debugMode {
			log.Printf("[websocket] proxy error: %v\n", err)
		}
	}
	// wake up/blocking ops: set immediate deadlines so blocked reads/writes unblock
	_ = tcpConn.SetDeadline(time.Now())
	_ = ws.SetWriteDeadline(time.Now())
	_ = ws.SetReadDeadline(time.Now())

	// ensure close both sides
	_ = tcpConn.Close()
	_ = wsConn.Close()
	// extra log: if ws returned a close code -- it often appears in error string, print it
	// (websocket library returns CloseError in some cases)
	if ce, ok := err.(*websocket.CloseError); ok {
		log.Printf("[websocket] remote close code=%d text=%s\n", ce.Code, ce.Text)
	}
	log.Printf("[websocket] connection closing for %s\n", target)
}
