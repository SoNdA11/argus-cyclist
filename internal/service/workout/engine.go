package workout

import (
	"argus-cyclist/internal/domain"
	"sync"
)

type Engine struct {
	currentWorkout *domain.Workout
	state          domain.WorkoutState
	mutex          sync.Mutex
}

func NewEngine() *Engine {
	return &Engine{
		state: domain.WorkoutState{
			Active: false,
		},
	}
}

func (e *Engine) StartWorkout(w *domain.Workout) error {
	e.mutex.Lock()
	defer e.mutex.Unlock()

	e.currentWorkout = w
	e.state = domain.WorkoutState{
		Active:           true,
		CurrentStepIndex: 0,
		ElapsedInStep:    0,
		RemainingInStep:  w.Steps[0].Duration,
		Progress:         0,
	}
	e.calculateTargetPower()
	return nil
}

func (e *Engine) StopWorkout() {
	e.mutex.Lock()
	defer e.mutex.Unlock()
	e.state.Active = false
}

func (e *Engine) GetState() domain.WorkoutState {
	e.mutex.Lock()
	defer e.mutex.Unlock()
	return e.state
}

func (e *Engine) Tick() (float64, bool) {
	e.mutex.Lock()
	defer e.mutex.Unlock()

	if !e.state.Active || e.currentWorkout == nil {
		return 0, false
	}

	e.state.ElapsedInStep++
	e.state.RemainingInStep--

	// Verifica se o passo atual acabou
	currentStep := e.currentWorkout.Steps[e.state.CurrentStepIndex]
	if e.state.ElapsedInStep >= currentStep.Duration {
		e.state.CurrentStepIndex++
		e.state.ElapsedInStep = 0
		
		// Verifica se o treino acabou
		if e.state.CurrentStepIndex >= len(e.currentWorkout.Steps) {
			e.state.Active = false
			return 0, true
		}
		
		e.state.RemainingInStep = e.currentWorkout.Steps[e.state.CurrentStepIndex].Duration
	}

	e.calculateTargetPower()
	return e.state.TargetPower, false
}

func (e *Engine) calculateTargetPower() {
	if e.currentWorkout == nil || e.state.CurrentStepIndex >= len(e.currentWorkout.Steps) {
		return
	}

	step := e.currentWorkout.Steps[e.state.CurrentStepIndex]
	ftp := float64(e.currentWorkout.FTP)
	
	var targetPercent float64
	if step.Type == domain.StepRamp {
		// Interpolação linear para rampas
		progress := float64(e.state.ElapsedInStep) / float64(step.Duration)
		targetPercent = step.PowerLow + (step.PowerHigh-step.PowerLow)*progress
	} else {
		targetPercent = step.PowerLow
	}

	e.state.TargetPower = (targetPercent / 100.0) * ftp
	
	// Calcula progresso total (simplificado)
	e.state.Progress = float64(e.state.CurrentStepIndex) / float64(len(e.currentWorkout.Steps))
}
