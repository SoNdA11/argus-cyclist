package ble

import (
	"argus-cyclist/internal/domain"
	"time"
)

// MockService simulates a trainer that responds to keyboard input
type MockService struct {
	stopChan     chan struct{}
	currentPower int16
	currentCad   uint8
	currentHR    uint8
}

func NewMockService() *MockService {
	return &MockService{
		stopChan:     make(chan struct{}),
		currentPower: 150,
		currentCad:   85,
		currentHR:    140,
	}
}

// Connect simulates a delay so the user can see the loading screen
func (m *MockService) Connect(onStatus func(stage string, data string)) error {
    onStatus("SCANNING", "Scanning for simulated devices...")
    time.Sleep(1 * time.Second)
    
    onStatus("FOUND", "Argus X1 Simulator")
    time.Sleep(500 * time.Millisecond)
    
    onStatus("CONNECTING", "Connecting...")
    time.Sleep(500 * time.Millisecond)
    
    onStatus("DISCOVERING", "Configuring services...")
    time.Sleep(500 * time.Millisecond)
    
    onStatus("READY", "Connected")
    return nil
}

func (m *MockService) Disconnect() error {
    // Checks if the channel is already closed to avoid panic
    select {
    case <-m.stopChan:
        return nil
    default:
        close(m.stopChan)
    }
    return nil
}

func (m *MockService) SetGrade(grade float64) error {
    return nil
}

// AdjustPower allows manual control (Exported with capital 'A')
func (m *MockService) AdjustPower(delta int16) int16 {
    m.currentPower += delta
    if m.currentPower < 0 { m.currentPower = 0 }
    if m.currentPower > 1200 { m.currentPower = 1200 }
    return m.currentPower
}

func (m *MockService) SubscribeStats(ch chan<- domain.Telemetry) error {
	m.stopChan = make(chan struct{})

	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-m.stopChan:
				return
			case t := <-ticker.C:
				ch <- domain.Telemetry{
					Timestamp: t,
					Power:     m.currentPower,
					Cadence:   m.currentCad,
					HeartRate: m.currentHR,
				}
			}
		}
	}()
	return nil
}