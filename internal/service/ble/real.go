package ble

import (
	"argus-cyclist/internal/domain"
	"argus-cyclist/internal/service/ble/fec"
	"fmt"
	"sync"
	"time"

	"tinygo.org/x/bluetooth"
)

// UUIDs
var (
	ServiceCyclingPower = bluetooth.ServiceUUIDCyclingPower
	ServiceFitnessMach  = bluetooth.New16BitUUID(0x1826) // FTMS
	ServiceHeartRate    = bluetooth.ServiceUUIDHeartRate
	ServiceFEC          = bluetooth.New16BitUUID(0xFEC1) // ANT+ FE-C over BLE (Simplified)

	CharCyclingPowerMeasure = bluetooth.CharacteristicUUIDCyclingPowerMeasurement
	CharHeartRateMeasure    = bluetooth.CharacteristicUUIDHeartRateMeasurement
	CharControlPoint        = bluetooth.New16BitUUID(0x2A66) // Cycling Power Control Point
	CharFTMSControl         = bluetooth.New16BitUUID(0x2AD9) // FTMS Control Point
	
	// FEC Specific
	CharFECRead             = bluetooth.New16BitUUID(0xFEC2)
	CharFECWrite            = bluetooth.New16BitUUID(0xFEC3)
)


var (
	ServiceFEC128, _   = bluetooth.ParseUUID("6e40fec1-b5a3-f393-e0a9-e50e24dcca9e")
	CharFECRead128, _  = bluetooth.ParseUUID("6e40fec2-b5a3-f393-e0a9-e50e24dcca9e")
	CharFECWrite128, _ = bluetooth.ParseUUID("6e40fec3-b5a3-f393-e0a9-e50e24dcca9e")
)

type RealService struct {
	adapter *bluetooth.Adapter
	
	trainerDevice *bluetooth.Device
	hrDevice      *bluetooth.Device

	trainerPointChar *bluetooth.DeviceCharacteristic
	fecWriteChar     *bluetooth.DeviceCharacteristic

	lastCrankRevs  uint16
	lastCrankTime  uint16
	firstCrankRead bool
	
	isFEC       bool
	currentMode string // "SIM" ou "ERG"
	
	// Controle de Loop FEC
	targetPower  float64
	targetGrade  float64
	controlMutex sync.Mutex
	stopControl  chan struct{}
	isReady      bool
}

func NewRealService() domain.TrainerService {
	return &RealService{
		adapter:        bluetooth.DefaultAdapter,
		firstCrankRead: true,
		currentMode:    "SIM",
		stopControl:    make(chan struct{}),
	}
}

func (s *RealService) ConnectTrainer(onStatus func(string, string)) error {
	if err := s.adapter.Enable(); err != nil {
		return fmt.Errorf("bluetooth error: %w", err)
	}

	onStatus("SCAN_TRAINER", "Searching for Trainer (FTMS/FEC)...")
	fmt.Println("[BLE] Starting Trainer Scan...")

	ch := make(chan bluetooth.ScanResult)
	
	go func() {
		err := s.adapter.Scan(func(adapter *bluetooth.Adapter, result bluetooth.ScanResult) {
			if result.LocalName() == "" { return }
			if result.HasServiceUUID(ServiceCyclingPower) || 
			   result.HasServiceUUID(ServiceFitnessMach) || 
			   result.HasServiceUUID(ServiceFEC) ||
			   result.HasServiceUUID(ServiceFEC128) {
				fmt.Printf("[BLE] Trainer Found: %s (%s)\n", result.LocalName(), result.Address.String())
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
		
		ptr := new(bluetooth.Device)
		*ptr = deviceStruct
		s.trainerDevice = ptr
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
				fmt.Printf("[BLE] HR Found: %s\n", result.LocalName())
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
					uuid := char.UUID()
					
					// FEC Data (Notify)
					if uuid == CharFECRead || uuid == CharFECRead128 {
						s.isFEC = true
						char.EnableNotifications(func(buf []byte) {
							p, c := fec.DecodeTrainerData(buf)
							if p != -1 {
								dataChan <- domain.Telemetry{
									Power: p, Cadence: c, HeartRate: 0, Timestamp: time.Now(),
								}
							}
						})
					}

					// FEC Control (Write)
					if uuid == CharFECWrite || uuid == CharFECWrite128 {
						c := char
						s.fecWriteChar = &c
						fmt.Println("[BLE] FEC Control Point Found.")
						
						// Sequência de Inicialização do Auuki
						go s.initializeFEC()
					}

					// Standard Power + Cadence
					if uuid == CharCyclingPowerMeasure {
						char.EnableNotifications(func(buf []byte) {
							p, c := s.parseCyclingPower(buf)
							dataChan <- domain.Telemetry{
								Power: p, Cadence: c, HeartRate: 0, Timestamp: time.Now(),
							}
						})
					}

					// FTMS/CP Controls
					if uuid == CharControlPoint || uuid == CharFTMSControl {
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
					if char.UUID() == CharHeartRateMeasure {
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

func (s *RealService) initializeFEC() {
	fmt.Println("[BLE] Initializing FEC Protocol (Auuki Style)...")
	
	// 1. User Configuration (Página 55)
	time.Sleep(1000 * time.Millisecond)
	msgUser := fec.EncodeUserConfig(75.0, 10.0)
	s.fecWriteChar.WriteWithoutResponse(msgUser)
	fmt.Println("[BLE] FEC Step 1: User Config Sent.")

	time.Sleep(1000 * time.Millisecond)
	msgWind := fec.EncodeWindResistance()
	s.fecWriteChar.WriteWithoutResponse(msgWind)
	fmt.Println("[BLE] FEC Step 2: Wind Resistance Sent.")

	s.isReady = true
	fmt.Println("[BLE] FEC Protocol Ready.")

	go s.runControlLoop()
}

func (s *RealService) runControlLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopControl:
			return
		case <-ticker.C:
			if s.fecWriteChar == nil || !s.isReady { continue }

			s.controlMutex.Lock()
			var msg []byte
			if s.currentMode == "ERG" {
				msg = fec.EncodeTargetPower(s.targetPower)
			} else {
				msg = fec.EncodeTrackResistance(s.targetGrade)
			}
			s.controlMutex.Unlock()

			if msg != nil {
				s.fecWriteChar.WriteWithoutResponse(msg)
			}
		}
	}
}

func (s *RealService) SetGrade(grade float64) error {
	s.controlMutex.Lock()
	defer s.controlMutex.Unlock()

	// If in ERG mode, ignore the route grid command.
	if s.currentMode == "ERG" {
		return nil
	}

	s.targetGrade = grade
	
	if s.isFEC && s.fecWriteChar != nil && s.isReady {
		msg := fec.EncodeTrackResistance(grade)
		_, err := s.fecWriteChar.WriteWithoutResponse(msg)
		return err
	}
	return nil 
}

func (s *RealService) SetPower(watts float64) error {
	s.controlMutex.Lock()
	s.targetPower = watts
	s.controlMutex.Unlock()

	if s.isFEC && s.fecWriteChar != nil && s.isReady {
		fmt.Printf("[BLE] Setting ERG Power: %.1f W\n", watts)
		msg := fec.EncodeTargetPower(watts)
		_, err := s.fecWriteChar.WriteWithoutResponse(msg)
		return err
	}
	return nil
}

func (s *RealService) SetTrainerMode(mode string) {
	s.controlMutex.Lock()
	defer s.controlMutex.Unlock()
	s.currentMode = mode
	fmt.Printf("[BLE] Trainer Mode Switched to: %s\n", mode)
}

func (s *RealService) Disconnect() {
	select {
	case s.stopControl <- struct{}{}:
	default:
	}
	if s.trainerDevice != nil { s.trainerDevice.Disconnect() }
	if s.hrDevice != nil { s.hrDevice.Disconnect() }
	fmt.Println("[BLE] Devices Disconnected")
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

func parseHR(buf []byte) uint8 {
	if len(buf) < 2 { return 0 }
	if buf[0]&0x01 == 0 { return buf[1] }
	return buf[1]
}