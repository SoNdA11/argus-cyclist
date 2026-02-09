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

package domain

import "time"

// TrainerService defines how the software communicates with the smart trainer.
// Decoupled: It doesn't matter if it's BLE, ANT+, or Simulation.
type TrainerService interface {
	// ConnectTrainer connects ONLY to the Smart Trainer (FTMS/Cycling Power)
	ConnectTrainer(onStatus func(string, string)) error

	// ConnectHR connects ONLY to the Heart Rate Monitor
	ConnectHR(onStatus func(string, string)) error

	// SubscribeStats starts reading data from connected devices
	SubscribeStats(dataChan chan Telemetry) error

	// SetGrade sends the slope/grade to the trainer (if connected)
	SetGrade(grade float64) error

	// SetPower sends the target power (ERG mode) to the trainer
	SetPower(watts float64) error

	// SetTrainerMode switches between "SIM" and "ERG"
	SetTrainerMode(mode string)

	// Disconnect disconnects everything
	Disconnect()
}

// GPXService defines how to load and process routes.
type GPXService interface {
	LoadAndProcess(filepath string) ([]RoutePoint, error)
	GetPointAtDistance(totalDistance float64) RoutePoint
}

// FitService defines how to export the activity to Strava.
type FitService interface {
	StartSession(startTime time.Time)
	AddRecord(t Telemetry)
	Save(filepath string) error
}

// SecurityService (Argus Framework)
// On Windows/Mac, this will be a "dummy". On Linux, it will be the real implementation.
type SecurityService interface {
	MonitorConnection()
	GetStatus() string
}