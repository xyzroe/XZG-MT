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
	entries := make(map[string]ServiceInfo)

	resolver, err := zeroconf.NewResolver(nil)
	if err != nil {
		fmt.Printf("[mdns] failed to initialize resolver: %v\n", err)
		return results
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()

	entriesChan := make(chan *zeroconf.ServiceEntry, 64)
	var wg sync.WaitGroup

	// For each requested service type start a goroutine that repeatedly browses
	// for short intervals until the overall timeout. We forward per-iteration
	// results into entriesChan and close entriesChan once all goroutines finish.
	for _, serviceType := range typeList {
		serviceName := fmt.Sprintf("_%s._%s", serviceType.Type, serviceType.Protocol)
		fmt.Printf("[mdns] looking for %s\n", serviceName)

		wg.Add(1)
		go func(svcName string) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
				}

				subCtx, subCancel := context.WithTimeout(ctx, 700*time.Millisecond)
				perChan := make(chan *zeroconf.ServiceEntry, 16)

				// forwarder
				forwardDone := make(chan struct{})
				go func(pc chan *zeroconf.ServiceEntry) {
					for e := range pc {
						entriesChan <- e
					}
					close(forwardDone)
				}(perChan)

				if err := resolver.Browse(subCtx, svcName, "local.", perChan); err != nil {
					fmt.Printf("[mdns] browse error for %s: %v\n", svcName, err)
					// ensure perChan is closed if Browse errors immediately
					select {
					case <-forwardDone:
					default:
						close(perChan)
					}
				}

				// wait for forwarder to drain perChan
				<-forwardDone
				subCancel()

				select {
				case <-ctx.Done():
					return
				case <-time.After(100 * time.Millisecond):
				}
			}
		}(serviceName)
	}

	// close aggregated channel after all workers finish
	go func() {
		wg.Wait()
		close(entriesChan)
	}()

readLoop:
	for {
		select {
		case entry, ok := <-entriesChan:
			if !ok {
				break readLoop
			}

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
			if _, exists := entries[key]; exists {
				continue
			}

			txtMap := make(map[string]string)
			for _, txt := range entry.Text {
				parts := strings.SplitN(txt, "=", 2)
				if len(parts) == 2 {
					txtMap[parts[0]] = parts[1]
				}
			}

			serviceType := "unknown"
			protocol := "tcp"
			if strings.Contains(entry.Service, "_xzg._tcp") {
				serviceType = "xzg"
				protocol = "tcp"
			} else if strings.Contains(entry.Service, "_zig_star_gw._tcp") {
				serviceType = "zig_star_gw"
				protocol = "tcp"
			} else if strings.Contains(entry.Service, "_zigstar_gw._tcp") {
				serviceType = "zigstar_gw"
				protocol = "tcp"
			} else if strings.Contains(entry.Service, "_uzg-01._tcp") {
				serviceType = "uzg-01"
				protocol = "tcp"
			} else if strings.Contains(entry.Service, "_tubeszb._tcp") {
				serviceType = "tubeszb"
				protocol = "tcp"
			}

			service := ServiceInfo{
				Name:     entry.Instance,
				Host:     host,
				Port:     entry.Port,
				Type:     serviceType,
				Protocol: protocol,
				FQDN:     entry.Instance,
				TXT:      txtMap,
			}

			entries[key] = service
			fmt.Printf("[mdns] found: %s on %s:%d (%s, %s)\n", serviceType, host, entry.Port, txtMap["board"], txtMap["serial_number"])

		case <-ctx.Done():
			break readLoop
		}
	}

	// collect results
	for _, s := range entries {
		results = append(results, s)
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
