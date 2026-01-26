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

func NewMockService() domain.TrainerService {
	return &MockService{
		stopChan:     make(chan struct{}),
		currentPower: 150,
		currentCad:   85,
		currentHR:    140,
	}
}

func (m *MockService) ConnectTrainer(onStatus func(string, string)) error {
    onStatus("SCAN_TRAINER", "Scanning for simulated devices...")
    time.Sleep(1 * time.Second)
    onStatus("TRAINER_CONNECTED", "Argus X1 Simulator Connected")
    return nil
}

func (m *MockService) ConnectHR(onStatus func(string, string)) error {
    onStatus("SCAN_HR", "Scanning for simulated HR...")
    time.Sleep(500 * time.Millisecond)
    onStatus("HR_CONNECTED", "Simulated HR Connected")
    return nil
}

func (m *MockService) Disconnect() {
    // Checks if the channel is already closed to avoid panic
    select {
    case <-m.stopChan:
        return
    default:
        close(m.stopChan)
    }
}

func (m *MockService) SetGrade(grade float64) error {
    return nil
}

func (m *MockService) SetPower(watts float64) error {
	m.currentPower = int16(watts)
	return nil
}

func (m *MockService) SetTrainerMode(mode string) {
	// Mock doesn't need logic for this
}

func (m *MockService) SubscribeStats(ch chan domain.Telemetry) error {
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