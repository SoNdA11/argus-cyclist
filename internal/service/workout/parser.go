package workout

import (
	"argus-cyclist/internal/domain"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io/ioutil"
	"os"
	"strconv"
)

// ZWO Structures
type ZwoWorkoutFile struct {
	XMLName     xml.Name `xml:"workout_file"`
	Author      string   `xml:"author"`
	Name        string   `xml:"name"`
	Description string   `xml:"description"`
	Workout     ZwoWorkout `xml:"workout"`
}

type ZwoWorkout struct {
	Steps []ZwoStep `xml:",any"`
}

type ZwoStep struct {
	XMLName xml.Name
	Duration int    `xml:"Duration,attr"`
	Power    float64 `xml:"Power,attr"`
	PowerLow float64 `xml:"PowerLow,attr"`
	PowerHigh float64 `xml:"PowerHigh,attr"`
	Cadence  int     `xml:"Cadence,attr"`
}

func ParseZWO(path string) (*domain.Workout, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	byteValue, _ := ioutil.ReadAll(file)
	var zwo ZwoWorkoutFile
	err = xml.Unmarshal(byteValue, &zwo)
	if err != nil {
		return nil, err
	}

	workout := &domain.Workout{
		Name:        zwo.Name,
		Description: zwo.Description,
		Author:      zwo.Author,
		FTP:         200, // Default FTP, deve ser configurável
	}

	totalDuration := 0
	for _, s := range zwo.Workout.Steps {
		step := domain.WorkoutStep{
			Name:          s.XMLName.Local,
			Duration:      s.Duration,
			TargetCadence: s.Cadence,
		}

		switch s.XMLName.Local {
		case "SteadyState":
			step.Type = domain.StepSteady
			step.PowerLow = s.Power * 100
			step.PowerHigh = s.Power * 100
		case "Ramp":
			step.Type = domain.StepRamp
			step.PowerLow = s.PowerLow * 100
			step.PowerHigh = s.PowerHigh * 100
		case "Warmup", "Cooldown":
			step.Type = domain.StepRamp
			step.PowerLow = s.PowerLow * 100
			step.PowerHigh = s.PowerHigh * 100
		}
		
		workout.Steps = append(workout.Steps, step)
		totalDuration += s.Duration
	}
	workout.TotalDuration = totalDuration

	return workout, nil
}

func ParseJSON(path string) (*domain.Workout, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	byteValue, _ := ioutil.ReadAll(file)
	var workout domain.Workout
	err = json.Unmarshal(byteValue, &workout)
	if err != nil {
		return nil, err
	}

	totalDuration := 0
	for _, s := range workout.Steps {
		totalDuration += s.Duration
	}
	workout.TotalDuration = totalDuration

	return &workout, nil
}

func LoadWorkoutFromFile(path string) (*domain.Workout, error) {
	if len(path) > 4 && path[len(path)-4:] == ".zwo" {
		return ParseZWO(path)
	}
	return ParseJSON(path)
}
