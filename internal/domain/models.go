package domain

import "time"

// RoutePoint represents a specific point on the map/GPX.
// The backend pre-calculates the Grade (slope) between points to facilitate simulation.
type RoutePoint struct {
	Latitude  float64 `json:"lat"`       // Latitude coordinate
	Longitude float64 `json:"lon"`       // Longitude coordinate
	Elevation float64 `json:"elevation"` // Elevation in meters
	Distance  float64 `json:"distance"`  // Accumulated distance from the start (in meters)
	Grade     float64 `json:"grade"`     // Grade in % (e.g., 5.2 for 5.2%)
}

// Telemetry represents the real-time cyclist and trainer state.
// This data is generated every second and sent to:
// - The Frontend (Wails)
// - The .FIT activity file
type Telemetry struct {
	Timestamp     time.Time `json:"timestamp"`  // Time of the telemetry sample
	Power         int16     `json:"power"`      // Power output in watts
	Cadence       uint8     `json:"cadence"`    // Cadence in RPM
	HeartRate     uint8     `json:"heart_rate"` // Heart rate in BPM
	Speed         float64   `json:"speed"`      // Virtual speed in km/h
	TotalDistance float64   `json:"total_dist"` // Total distance traveled (meters)
	CurrentGrade  float64   `json:"grade"`      // Current Grade (%)
	Latitude      float64   `json:"lat"`        // Current latitude
	Longitude     float64   `json:"lon"`        // Current longitude
	Altitude      float64   `json:"alt"`        //Current altitude in meters

}

// AppState represents the global state of the application.
// It is shared with the frontend to control UI behavior.
type AppState struct {
	IsConnected    bool   `json:"is_connected"`    // Trainer connection status
	TrainerName    string `json:"trainer_name"`    // Connected trainer name
	IsRecording    bool   `json:"is_recording"`    // Activity recording status
	SecurityStatus string `json:"security_status"` // "STANDBY", "MONITORING", "ALERT"
}

// ===============
// DATABASE MODELS
// ===============

// UserProfile stores the cyclist's physical data and preferences.
type UserProfile struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	Name       string    `json:"name"`        // Rider name
	Photo      string    `json:"photo"`       // Photo (Base64)
	Weight     float64   `json:"weight"`      // Rider weight (kg)
	BikeWeight float64   `json:"bike_weight"` // Bike weight (kg)
	FTP        int       `json:"ftp"`         // Functional Threshold Power
	MaxHR      int       `json:"max_hr"`
	Theme      string    `json:"theme"` // "dark", "light", etc.
	Units      string    `json:"units"` // "metric", "imperial"
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// Activity represents a completed training session.
type Activity struct {
	ID             uint      `json:"id" gorm:"primaryKey"`
	RouteName      string    `json:"route_name"`      // Name of the GPX route
	Filename       string    `json:"filename"`        // Generated .FIT filename
	TotalDistance  float64   `json:"total_distance"`  // Total distance (meters)
	TotalElevation float64   `json:"total_elevation"` // Elevation gain (meters)
	AvgPower       int       `json:"avg_power"`       // Average power (watts)
	AvgSpeed       float64   `json:"avg_speed"`       // Average speed (km/h)
	Duration       int64     `json:"duration"`        // Duration in seconds
	Calories       int       `json:"calories"`        // Estimated calories burned
	CreatedAt      time.Time `json:"created_at"`      // Activity date
}
