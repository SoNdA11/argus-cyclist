package domain

import "time"

// RoutePoint represents a specific point on the map/GPX.
// The backend pre-calculates the Grade (slope) between points to facilitate simulation.
type RoutePoint struct {
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"lon"`
	Elevation float64 `json:"elevation"` // In meters
	Distance  float64 `json:"distance"`  // Accumulated distance from the start (in meters)
	Grade     float64 `json:"grade"`    // Grade in % (e.g., 5.2 for 5.2%)
}

// Telemetry represents the current state of the cyclist and trainer every second.
// These are the data sent to the Frontend (Wails) and to the .FIT file.
type Telemetry struct {
	Timestamp     time.Time `json:"timestamp"`
	Power         int16     `json:"power"`       // Watts
	Cadence       uint8     `json:"cadence"`     // RPM
	HeartRate     uint8     `json:"heart_rate"`  // BPM
	Speed         float64   `json:"speed"`       // km/h (Virtual)
	TotalDistance float64   `json:"total_dist"`  // Meters traveled
	CurrentGrade  float64   `json:"grade"`       // Current Grade (%)
	Latitude      float64   `json:"lat"`         // Current Position
	Longitude     float64   `json:"lon"`         // Current Position
	Altitude      float64   `json:"alt"`

}

// AppState holds the global state of the application.
type AppState struct {
	IsConnected    bool   `json:"is_connected"`
	TrainerName    string `json:"trainer_name"`
	IsRecording    bool   `json:"is_recording"`
	SecurityStatus string `json:"security_status"` // "STANDBY", "MONITORING", "ALERT"
}