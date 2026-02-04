package domain

import (
	"encoding/xml"
)

// Structures for XML PARSING (ZWO Format)
type ZWOFile struct {
	XMLName     xml.Name   `xml:"workout_file" json:"-"` // Ignora no JSON
	Name        string     `xml:"name" json:"name"`
	Description string     `xml:"description" json:"description"`
	Author      string     `xml:"author" json:"author"`
	Workout     ZWOWorkout `xml:"workout" json:"workout"`
}

type ZWOWorkout struct {
	// Captures any child tag as a generic step
	Steps []ZWOStep `xml:",any" json:"steps"`
}

type ZWOStep struct {
	XMLName     xml.Name `json:"-"`
	Duration    int      `xml:"Duration,attr" json:"duration,omitempty"`
	Power       float64  `xml:"Power,attr" json:"power,omitempty"`
	PowerLow    float64  `xml:"PowerLow,attr" json:"power_low,omitempty"`
	PowerHigh   float64  `xml:"PowerHigh,attr" json:"power_high,omitempty"`
	Repeat      int      `xml:"Repeat,attr" json:"repeat,omitempty"`
	OnDuration  int      `xml:"OnDuration,attr" json:"on_duration,omitempty"`
	OnPower     float64  `xml:"OnPower,attr" json:"on_power,omitempty"`
	OffDuration int      `xml:"OffDuration,attr" json:"off_duration,omitempty"`
	OffPower    float64  `xml:"OffPower,attr" json:"off_power,omitempty"`
	Cadence     int      `xml:"Cadence,attr" json:"cadence,omitempty"`
}

// ===================================
// EXECUTION structures (Argus Engine)
// ===================================

type WorkoutSegment struct {
	Index           int     `json:"index"`
	Type            string  `json:"type"`
	DurationSeconds int     `json:"duration"`
	StartFactor     float64 `json:"start_factor"`
	EndFactor       float64 `json:"end_factor"`
	Text            string  `json:"text"`
}

type ActiveWorkout struct {
	Metadata      ZWOFile          `json:"metadata"`
	Segments      []WorkoutSegment `json:"segments"`
	TotalDuration int              `json:"total_duration"`
}

// Structure for sending state to the Frontend
type WorkoutState struct {
	IsActive          bool    `json:"is_active"`
	WorkoutName       string  `json:"workout_name"`
	CurrentSegmentIdx int     `json:"current_segment_index"`
	SegmentTimeRemain int     `json:"segment_time_remain"`
	SegmentDuration   int     `json:"segment_duration"`
	TargetPower       int     `json:"target_power"`
	NextTargetPower   int     `json:"next_target_power"`
	CompletionPercent float64 `json:"completion_percent"`
}
