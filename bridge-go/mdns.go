package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/grandcat/zeroconf"
)

type ServiceType struct {
	Type     string
	Protocol string
}

type ServiceInfo struct {
	Name     string            `json:"name"`
	Host     string            `json:"host"`
	Port     int               `json:"port"`
	Type     string            `json:"type"`
	Protocol string            `json:"protocol"`
	FQDN     string            `json:"fqdn"`
	TXT      map[string]string `json:"txt"`
}

func parseServiceType(full string) *ServiceType {
	full = strings.ToLower(full)

	// Special tokens for local serial
	if isLocalSerialToken(full) {
		return &ServiceType{Type: "local", Protocol: "serial"}
	}

	// Parse mDNS service type format: _service._tcp.local
	if strings.HasPrefix(full, "_") && strings.Contains(full, "._tcp") {
		parts := strings.Split(full, ".")
		if len(parts) >= 2 {
			serviceType := strings.TrimPrefix(parts[0], "_")
			return &ServiceType{Type: serviceType, Protocol: "tcp"}
		}
	}

	if strings.HasPrefix(full, "_") && strings.Contains(full, "._udp") {
		parts := strings.Split(full, ".")
		if len(parts) >= 2 {
			serviceType := strings.TrimPrefix(parts[0], "_")
			return &ServiceType{Type: serviceType, Protocol: "udp"}
		}
	}

	return nil
}

func isLocalSerialToken(s string) bool {
	localTokens := []string{"local.serial", "local:serial", "local-serial", "local"}
	s = strings.ToLower(s)
	for _, token := range localTokens {
		if s == token {
			return true
		}
	}
	return false
}

func scanMdns(typeList []ServiceType, timeoutMs int) []ServiceInfo {
	fmt.Printf("[mdns] scanning with timeout %d\n", timeoutMs)

	var results []ServiceInfo
	foundDevices := make(map[string]ServiceInfo)
	var mu sync.Mutex
	includeLocal := false

	// Check whether to include local devices
	for _, serviceType := range typeList {
		if serviceType.Protocol == "serial" || serviceType.Type == "local" {
			includeLocal = true
			break
		}
	}

	// Create a WaitGroup to synchronize goroutines
	var wg sync.WaitGroup

	// Start a search for each service type
	for _, serviceType := range typeList {
		// Skip non-network services
		if serviceType.Protocol != "tcp" && serviceType.Protocol != "udp" {
			continue
		}

		wg.Add(1)
		go func(st ServiceType) {
			defer wg.Done()

			serviceName := fmt.Sprintf("_%s._%s", st.Type, st.Protocol)
			fmt.Printf("[mdns] looking for %s\n", serviceName)

			// Create a new resolver for each service
			resolver, err := zeroconf.NewResolver(nil)
			if err != nil {
				fmt.Printf("[mdns] failed to create resolver for %s: %v\n", serviceName, err)
				return
			}

			// Create a context with timeout for this specific service
			ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs)*time.Millisecond)
			defer cancel()

			// Channel to receive discovered devices
			entries := make(chan *zeroconf.ServiceEntry, 10)

			// Run Browse in a separate goroutine
			go func() {
				defer func() {
					if r := recover(); r != nil {
						// Ignore panic from the zeroconf library
						fmt.Printf("[mdns] recovered from panic in %s: %v\n", serviceName, r)
					}
				}()

				err := resolver.Browse(ctx, serviceName, "local.", entries)
				if err != nil && err != context.Canceled && err != context.DeadlineExceeded {
					fmt.Printf("[mdns] browse error for %s: %v\n", serviceName, err)
				}
			}()

			// Process discovered devices
			for {
				select {
				case entry, ok := <-entries:
					if !ok {
						return
					}

					mu.Lock()

					// Determine host
					host := ""
					if len(entry.AddrIPv4) > 0 {
						host = entry.AddrIPv4[0].String()
					} else if len(entry.AddrIPv6) > 0 {
						host = entry.AddrIPv6[0].String()
					} else if entry.HostName != "" {
						host = entry.HostName
					} else {
						host = getAdvertiseHost()
					}

					key := fmt.Sprintf("%s|%s|%d", entry.Instance, host, entry.Port)

					// Avoid duplication
					if _, exists := foundDevices[key]; !exists {
						// Parse TXT records
						txtMap := make(map[string]string)
						for _, txt := range entry.Text {
							parts := strings.SplitN(txt, "=", 2)
							if len(parts) == 2 {
								txtMap[parts[0]] = parts[1]
							}
						}

						service := ServiceInfo{
							Name:     entry.Instance,
							Host:     host,
							Port:     entry.Port,
							Type:     st.Type,
							Protocol: st.Protocol,
							FQDN:     entry.Instance,
							TXT:      txtMap,
						}

						foundDevices[key] = service
						fmt.Printf("[mdns] found: %s on %s:%d (%s, %s)\n", st.Type, host, entry.Port, txtMap["board"], txtMap["serial_number"])
					}

					mu.Unlock()

				case <-ctx.Done():
					return
				}
			}
		}(serviceType)
	}

	// Wait for all goroutines to finish or for a global timeout
	done := make(chan bool)
	go func() {
		wg.Wait()
		done <- true
	}()

	select {
	case <-done:
		// All goroutines finished
	case <-time.After(time.Duration(timeoutMs) * time.Millisecond):
		// Global timeout
		fmt.Printf("[mdns] scan timeout reached\n")
	}

	// Collect results
	mu.Lock()
	for _, service := range foundDevices {
		results = append(results, service)
	}
	mu.Unlock()

	// If requested, add local serial ports as services
	if includeLocal {
		local := listLocalSerialAsServices()
		if len(local) > 0 {
			fmt.Printf("[mdns] adding %d local serial services\n", len(local))
			results = append(results, local...)
		}
	}

	fmt.Printf("[mdns] scan done, found %d\n", len(results))
	return results
}

func listLocalSerialAsServices() []ServiceInfo {
	var services []ServiceInfo
	hostIP := getAdvertiseHost()

	serialMutex.RLock()
	defer serialMutex.RUnlock()

	for pathName, info := range serialServers {
		details := serialPortDetails[pathName]
		service := ServiceInfo{
			Name:     pathName,
			Host:     hostIP,
			Port:     info.Port,
			Type:     "local",
			Protocol: "serial",
			FQDN:     pathName,
			TXT: map[string]string{
				"board":         details.Manufacturer,
				"serial_number": details.SerialNumber,
				"vendor_id":     details.VendorID,
				"product_id":    details.ProductID,
			},
		}
		services = append(services, service)
	}

	return services
}
