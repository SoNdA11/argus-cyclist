// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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