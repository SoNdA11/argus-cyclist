package domain

import "time"

type WorkoutStepType string

const (
	StepSteady WorkoutStepType = "steady"
	StepRamp   WorkoutStepType = "ramp"
)

type WorkoutStep struct {
	Name           string          `json:"name"`
	Type           WorkoutStepType `json:"type"`
	Duration       int             `json:"duration"` // em segundos
	PowerLow       float64         `json:"powerLow"` // % do FTP
	PowerHigh      float64         `json:"powerHigh"` // % do FTP (igual ao Low se for steady)
	TargetCadence  int             `json:"targetCadence,omitempty"`
}

type Workout struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Author      string        `json:"author"`
	FTP         int           `json:"ftp"`
	Steps       []WorkoutStep `json:"steps"`
	TotalDuration int         `json:"totalDuration"`
}

type WorkoutState struct {
	Active          bool    `json:"active"`
	CurrentStepIndex int    `json:"currentStepIndex"`
	ElapsedInStep   int     `json:"elapsedInStep"`
	RemainingInStep int     `json:"remainingInStep"`
	TargetPower     float64 `json:"targetPower"`
	Progress        float64 `json:"progress"` // 0.0 a 1.0
}

type WorkoutService interface {
	LoadWorkout(id string) (*Workout, error)
	StartWorkout(workout *Workout) error
	StopWorkout()
	GetState() WorkoutState
	Tick() (float64, bool) // Retorna a potência alvo e se o treino acabou
}
