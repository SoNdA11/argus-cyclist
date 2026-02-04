package workout

import (
	"argus-cyclist/internal/domain"
	"encoding/xml"
	"os"
)

type Service struct{}

func NewService() *Service {
	return &Service{}
}

// LoadZWO reads the file and converts it to Argus' internal format
func (s *Service) LoadZWO(path string) (*domain.ActiveWorkout, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var zwo domain.ZWOFile
	if err := xml.Unmarshal(data, &zwo); err != nil {
		return nil, err
	}

	active := &domain.ActiveWorkout{
		Metadata: zwo,
		Segments: make([]domain.WorkoutSegment, 0),
	}

	idx := 0
	totalTime := 0

	// Flattening logic
	for _, step := range zwo.Workout.Steps {
		tagName := step.XMLName.Local

		switch tagName {
		case "SteadyState", "FreeRide":
			active.Segments = append(active.Segments, domain.WorkoutSegment{
				Index: idx, Type: "STEADY", DurationSeconds: step.Duration,
				StartFactor: step.Power, EndFactor: step.Power,
			})
			idx++
			totalTime += step.Duration

		case "Warmup", "Cooldown", "Ramp":
			t := "RAMP"
			if tagName == "Warmup" {
				t = "WARMUP"
			}
			if tagName == "Cooldown" {
				t = "COOLDOWN"
			}

			active.Segments = append(active.Segments, domain.WorkoutSegment{
				Index: idx, Type: t, DurationSeconds: step.Duration,
				StartFactor: step.PowerLow, EndFactor: step.PowerHigh,
			})
			idx++
			totalTime += step.Duration

		case "IntervalsT":
			// Expands repetitions into individual blocks
			for i := 0; i < step.Repeat; i++ {
				// ON part
				active.Segments = append(active.Segments, domain.WorkoutSegment{
					Index: idx, Type: "INTERVAL_ON", DurationSeconds: step.OnDuration,
					StartFactor: step.OnPower, EndFactor: step.OnPower,
				})
				idx++
				totalTime += step.OnDuration

				// OFF part
				active.Segments = append(active.Segments, domain.WorkoutSegment{
					Index: idx, Type: "INTERVAL_OFF", DurationSeconds: step.OffDuration,
					StartFactor: step.OffPower, EndFactor: step.OffPower,
				})
				idx++
				totalTime += step.OffDuration
			}
		}
	}

	active.TotalDuration = totalTime
	return active, nil
}