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

func (s *MockService) ConnectTrainer(macAddress string, onStatus func(string, string)) error {
	onStatus("CONNECTING_TRAINER", "Connecting to Virtual Trainer...")

	time.Sleep(1 * time.Second)

	onStatus("TRAINER_CONNECTED", "Virtual Trainer Connected")
	return nil
}

func (s *MockService) ConnectHR(macAddress string, onStatus func(string, string)) error {
	onStatus("CONNECTING_HR", "Connecting to Virtual HR...")
	time.Sleep(1 * time.Second)

	onStatus("HR_CONNECTED", "Virtual HR Connected")
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

func (m *MockService) DisconnectHR() {
	m.currentHR = 0
}
