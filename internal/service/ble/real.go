package ble

import (
	"argus-cyclist/internal/domain"
	"fmt"
	"time"

	"tinygo.org/x/bluetooth"
)

// UUIDs
var (
	ServiceCyclingPower = bluetooth.ServiceUUIDCyclingPower
	ServiceFitnessMach  = bluetooth.New16BitUUID(0x1826) // FTMS
	ServiceHeartRate    = bluetooth.ServiceUUIDHeartRate

	CharCyclingPowerMeasure = bluetooth.CharacteristicUUIDCyclingPowerMeasurement
	CharHeartRateMeasure    = bluetooth.CharacteristicUUIDHeartRateMeasurement
	CharControlPoint        = bluetooth.New16BitUUID(0x2A66) // Cycling Power Control Point
	CharFTMSControl         = bluetooth.New16BitUUID(0x2AD9) // FTMS Control Point
)

type RealService struct {
	adapter *bluetooth.Adapter
	
	trainerDevice *bluetooth.Device
	hrDevice      *bluetooth.Device

	trainerPointChar *bluetooth.DeviceCharacteristic

	lastCrankRevs  uint16
	lastCrankTime  uint16
	firstCrankRead bool
}

func NewRealService() domain.TrainerService {
	return &RealService{
		adapter:        bluetooth.DefaultAdapter,
		firstCrankRead: true,
	}
}

func (s *RealService) ConnectTrainer(onStatus func(string, string)) error {
	if err := s.adapter.Enable(); err != nil {
		return fmt.Errorf("bluetooth error: %w", err)
	}

	onStatus("SCAN_TRAINER", "Searching for Trainer...")
	fmt.Println("[BLE] Starting Trainer Scan...")

	ch := make(chan bluetooth.ScanResult)
	
	go func() {
		err := s.adapter.Scan(func(adapter *bluetooth.Adapter, result bluetooth.ScanResult) {
			if result.LocalName() == "" { return }
			if result.HasServiceUUID(ServiceCyclingPower) || result.HasServiceUUID(ServiceFitnessMach) {
				fmt.Printf("[BLE] Trainer: %s (%s)\n", result.LocalName(), result.Address.String())
				adapter.StopScan()
				ch <- result
			}
		})
		if err != nil { fmt.Println("Scan error:", err) }
	}()

	select {
	case result := <-ch:
		onStatus("CONNECTING_TRAINER", "Connecting to: "+result.LocalName())
		
		deviceStruct, err := s.adapter.Connect(result.Address, bluetooth.ConnectionParams{})
		if err != nil { return fmt.Errorf("connection error: %w", err) }
		
		// Persistent pointer
		ptr := new(bluetooth.Device)
		*ptr = deviceStruct
		s.trainerDevice = ptr
		
		// Resets cadence state upon connection
		s.firstCrankRead = true
		
		fmt.Println("[BLE] Trainer Connected.")
		onStatus("TRAINER_CONNECTED", "Trainer Connected")
		return nil
		
	case <-time.After(15 * time.Second):
		s.adapter.StopScan()
		return fmt.Errorf("trainer timeout")
	}
}

func (s *RealService) ConnectHR(onStatus func(string, string)) error {
	err := s.adapter.Enable()
	if err != nil {
    return fmt.Errorf("bluetooth error: %w", err)
	}

	onStatus("SCAN_HR", "Searching for HR...")
	fmt.Println("[BLE] Starting HR Scan...")

	ch := make(chan bluetooth.ScanResult)

	go func() {
		err := s.adapter.Scan(func(adapter *bluetooth.Adapter, result bluetooth.ScanResult) {
			if result.HasServiceUUID(ServiceHeartRate) {
				fmt.Printf("[BLE] HR: %s\n", result.LocalName())
				adapter.StopScan()
				ch <- result
			}
		})
		if err != nil { fmt.Println("Erro scan HR:", err) }
	}()

	select {
	case result := <-ch:
		onStatus("CONNECTING_HR", "Connecting HR: "+result.LocalName())
		
		deviceStruct, err := s.adapter.Connect(result.Address, bluetooth.ConnectionParams{})
		if err != nil { return fmt.Errorf("HR connection error: %w", err) }
		
		ptr := new(bluetooth.Device)
		*ptr = deviceStruct
		s.hrDevice = ptr
		
		fmt.Println("[BLE] HR Connected.")
		onStatus("HR_CONNECTED", "HR Connected: "+result.LocalName())
		return nil

	case <-time.After(15 * time.Second):
		s.adapter.StopScan()
		return fmt.Errorf("HR timeout")
	}
}

func (s *RealService) SubscribeStats(dataChan chan domain.Telemetry) error {
	if s.trainerDevice == nil && s.hrDevice == nil {
		return fmt.Errorf("no device connected")
	}

	go func() {
		// 1. TRAINER
		if s.trainerDevice != nil {
			services, _ := s.trainerDevice.DiscoverServices(nil)
			for _, service := range services {
				chars, _ := service.DiscoverCharacteristics(nil)
				for _, char := range chars {
					// Power + Cadence
					if char.UUID().Is16Bit() && char.UUID() == CharCyclingPowerMeasure {
						char.EnableNotifications(func(buf []byte) {
							// Uses stateful method to calculate RPM
							p, c := s.parseCyclingPower(buf)
							
							dataChan <- domain.Telemetry{
								Power: p, Cadence: c, HeartRate: 0, Timestamp: time.Now(),
							}
						})
					}
					// Controls
					if char.UUID().Is16Bit() && (char.UUID() == CharControlPoint || char.UUID() == CharFTMSControl) {
						c := char
						s.trainerPointChar = &c
						s.trainerPointChar.WriteWithoutResponse([]byte{0x00})
					}
				}
			}
		}

		// 2. HR
		if s.hrDevice != nil {
			services, _ := s.hrDevice.DiscoverServices(nil)
			for _, service := range services {
				chars, _ := service.DiscoverCharacteristics(nil)
				for _, char := range chars {
					if char.UUID().Is16Bit() && char.UUID() == CharHeartRateMeasure {
						char.EnableNotifications(func(buf []byte) {
							hr := parseHR(buf)
							dataChan <- domain.Telemetry{
								Power: -1, HeartRate: hr, Timestamp: time.Now(),
							}
						})
					}
				}
			}
		}
	}()
	return nil
}

func (s *RealService) parseCyclingPower(buf []byte) (int16, uint8) {
	if len(buf) < 4 { return 0, 0 }

	flags := uint16(buf[0]) | uint16(buf[1])<<8
	power := int16(uint16(buf[2]) | uint16(buf[3])<<8)

	offset := 4
	if flags&0x01 != 0 { offset += 1 }
	if flags&0x04 != 0 { offset += 2 }
	if flags&0x10 != 0 { offset += 6 }

	if flags&0x20 != 0 && len(buf) >= offset+4 {
		revs := uint16(buf[offset]) | uint16(buf[offset+1])<<8
		timeVal := uint16(buf[offset+2]) | uint16(buf[offset+3])<<8
		
		return power, s.calcCadence(revs, timeVal)
	}

	return power, 0
}

func (s *RealService) calcCadence(revs, timeVal uint16) uint8 {
	if s.firstCrankRead {
		s.lastCrankRevs = revs
		s.lastCrankTime = timeVal
		s.firstCrankRead = false
		return 0
	}

	dRevs := revs - s.lastCrankRevs
	dTime := timeVal - s.lastCrankTime

	s.lastCrankRevs = revs
	s.lastCrankTime = timeVal

	if dTime == 0 { return 0 }

	rpm := float64(dRevs) * 1024.0 * 60.0 / float64(dTime)

	if rpm > 200 || rpm < 0 { return 0 }
	
	return uint8(rpm)
}

func (s *RealService) SetGrade(grade float64) error {
	if s.trainerPointChar == nil { return nil }
	return nil 
}

func (s *RealService) Disconnect() {
	if s.trainerDevice != nil { s.trainerDevice.Disconnect() }
	if s.hrDevice != nil { s.hrDevice.Disconnect() }
	fmt.Println("[BLE] Devices Disconnected")
}

func parseHR(buf []byte) uint8 {
	if len(buf) < 2 { return 0 }
	if buf[0]&0x01 == 0 { return buf[1] }
	return buf[1]
}