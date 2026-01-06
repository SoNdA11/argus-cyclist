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