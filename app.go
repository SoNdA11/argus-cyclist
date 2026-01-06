package main

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"argus-cyclist/internal/domain"
	"argus-cyclist/internal/service/ble"
	"argus-cyclist/internal/service/fit"
	"argus-cyclist/internal/service/gpx"
	"argus-cyclist/internal/service/sim"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx            context.Context
	gpxService     *gpx.Service
	fitService     *fit.Service
	physicsEngine  *sim.Engine
	trainerService domain.TrainerService

	isRecording bool
	isPaused    bool

	isTrainerConnected bool
	isHRConnected      bool

	currentDist   float64
	telemetryChan chan domain.Telemetry
	cancelSim     context.CancelFunc
}

func NewApp() *App {
	return &App{
		gpxService:     gpx.NewService(),
		fitService:     fit.NewService(),
		physicsEngine:  sim.NewEngine(75.0, 9.0),
		trainerService: ble.NewRealService(),
		telemetryChan:  make(chan domain.Telemetry),
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) Shutdown(ctx context.Context) {
	fmt.Println("Closing app: Disconnecting BLE...")
	a.trainerService.Disconnect()
}

func (a *App) SelectGPX() string {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select the GPX Route", Filters: []runtime.FileFilter{{DisplayName: "GPX files", Pattern: "*.gpx"}},
	})
	if err != nil || selection == "" {
		return ""
	}

	points, err := a.gpxService.LoadAndProcess(selection)
	if err != nil {
		runtime.EventsEmit(a.ctx, "error", fmt.Sprintf("GPX error: %v", err))
		return ""
	}

	totalDistKm := 0.0
	if len(points) > 0 {
		totalDistKm = points[len(points)-1].Distance / 1000.0
	}
	runtime.EventsEmit(a.ctx, "log", fmt.Sprintf("GPX Loaded: %d points | %.2f km", len(points), totalDistKm))
	return filepath.Base(selection)
}

func (a *App) GetRoutePath() []domain.RoutePoint {
	return a.gpxService.GetAllPoints()
}

func (a *App) GetElevationProfile() []float64 {
	points := a.gpxService.GetAllPoints()
	elevations := make([]float64, len(points))
	for i, p := range points {
		elevations[i] = p.Elevation
	}
	return elevations
}

func (a *App) ToggleAlwaysOnTop(on bool) {
	runtime.WindowSetAlwaysOnTop(a.ctx, on)
}

func (a *App) ConnectTrainer() (string, error) {
	if a.isTrainerConnected {
		return "Trainer Already Connected", nil
	}

	statusCallback := func(stage string, data string) {
		runtime.EventsEmit(a.ctx, "ble_connection_status", map[string]string{"stage": stage, "msg": data})
	}

	if err := a.trainerService.ConnectTrainer(statusCallback); err != nil {
		return "Trainer Error", err
	}

	a.isTrainerConnected = true
	return "Trainer Connected", nil
}

func (a *App) ConnectHeartRate() (string, error) {
	if a.isHRConnected {
		return "HR Already Connected", nil
	}

	statusCallback := func(stage string, data string) {
		runtime.EventsEmit(a.ctx, "ble_connection_status", map[string]string{"stage": stage, "msg": data})
	}

	if err := a.trainerService.ConnectHR(statusCallback); err != nil {
		return "HR Error", err
	}

	a.isHRConnected = true
	return "HR Monitor Connected", nil
}

func (a *App) ToggleSession() string {
	if a.isRecording {
		if a.isPaused {
			return a.resumeSession()
		}
		return a.pauseSession()
	}
	return a.startSession()
}

func (a *App) startSession() string {
	// Requires that at least the Trainer is connected
	if !a.isTrainerConnected {
		runtime.EventsEmit(a.ctx, "error", "Trainer not connected! Go to Settings.")
		return "Error: Trainer Disconnected"
	}

	a.fitService.StartSession(time.Now())
	a.currentDist = 0
	a.isRecording = true
	a.isPaused = false

	ctx, cancel := context.WithCancel(context.Background())
	a.cancelSim = cancel

	dataChan := make(chan domain.Telemetry)

	// Starts reading data stats
	if err := a.trainerService.SubscribeStats(dataChan); err != nil {
		cancel()
		return fmt.Sprintf("Erro Subscribe: %v", err)
	}

	go a.gameLoop(ctx, dataChan)

	runtime.EventsEmit(a.ctx, "status_change", "RECORDING")
	return "Started"
}

func (a *App) pauseSession() string {
	a.isPaused = true
	runtime.EventsEmit(a.ctx, "status_change", "PAUSED")
	return "Paused"
}

func (a *App) resumeSession() string {
	a.isPaused = false
	runtime.EventsEmit(a.ctx, "status_change", "RECORDING")
	return "Recording"
}

func (a *App) FinishSession() string {
	if !a.isRecording {
		return "Not recording"
	}

	if a.cancelSim != nil {
		a.cancelSim()
	}
	a.isRecording = false
	a.isPaused = false

	filename := fmt.Sprintf("workout_%s.fit", time.Now().Format("2006-01-02_15-04"))

	if err := a.fitService.Save(filename); err != nil {
		runtime.EventsEmit(a.ctx, "error", "Error saving FIT file")
	} else {
		absPath, _ := filepath.Abs(filename)
		runtime.EventsEmit(a.ctx, "log", fmt.Sprintf("Saved: %s", absPath))
	}

	runtime.EventsEmit(a.ctx, "status_change", "IDLE")
	return "Finished"
}

func (a *App) DiscardSession() string {
	if a.isRecording {
		if a.cancelSim != nil {
			a.cancelSim()
		}
		a.isRecording = false
		a.isPaused = false
	}

	runtime.EventsEmit(a.ctx, "status_change", "IDLE")
	runtime.EventsEmit(a.ctx, "log", "Workout discarded. Devices kept connected.")
	return "Discarded"
}

func (a *App) DisconnectDevice() string {
	if a.isRecording {
		if a.cancelSim != nil {
			a.cancelSim()
		}
		a.isRecording = false
		a.isPaused = false
	}

	a.trainerService.Disconnect()
	a.isTrainerConnected = false
	a.isHRConnected = false

	runtime.EventsEmit(a.ctx, "status_change", "IDLE")
	return "Disconnected"
}

func (a *App) gameLoop(ctx context.Context, input <-chan domain.Telemetry) {
	lastUpdate := time.Now()
	var currentPower int16 = 0
	var currentHR uint8 = 0
	var currentCadence uint8 = 0

	lastPowerTime := time.Now()
	lastHRTime := time.Now()
	sensorTimeout := 5 * time.Second
	totalRouteDistance := a.gpxService.GetTotalDistance()

	for {
		select {
		case <-ctx.Done():
			return
		case rawData := <-input:
			if rawData.Power != -1 {
				currentPower = rawData.Power
				currentCadence = rawData.Cadence
				lastPowerTime = time.Now()
			}
			if rawData.HeartRate > 0 {
				currentHR = rawData.HeartRate
				lastHRTime = time.Now()
			}

			now := time.Now()
			if a.isPaused {
				lastUpdate = now
				runtime.EventsEmit(a.ctx, "telemetry_update", domain.Telemetry{
					Power: currentPower, Cadence: currentCadence, HeartRate: currentHR,
					Speed: 0, TotalDistance: a.currentDist, CurrentGrade: 0,
				})
				continue
			}

			dt := now.Sub(lastUpdate).Seconds()
			lastUpdate = now

			if now.Sub(lastPowerTime) > sensorTimeout {
				currentPower = 0
				currentCadence = 0
			}
			if now.Sub(lastHRTime) > sensorTimeout {
				currentHR = 0
			}

			routePoint := a.gpxService.GetPointAtDistance(a.currentDist)
			speedMs := a.physicsEngine.CalculateSpeed(float64(currentPower), routePoint.Grade)
			a.currentDist += speedMs * dt

			if totalRouteDistance > 0 && a.currentDist >= totalRouteDistance {
				a.currentDist = totalRouteDistance
				a.FinishSession()
				runtime.EventsEmit(a.ctx, "route_finished", true)
				return
			}

			a.trainerService.SetGrade(routePoint.Grade)

			fullTelemetry := domain.Telemetry{
				Timestamp: now, Power: currentPower, Cadence: currentCadence, HeartRate: currentHR,
				Speed: speedMs * 3.6, TotalDistance: a.currentDist, CurrentGrade: routePoint.Grade,
				Latitude: routePoint.Latitude, Longitude: routePoint.Longitude, Altitude: routePoint.Elevation,
			}

			a.fitService.AddRecord(fullTelemetry)
			runtime.EventsEmit(a.ctx, "telemetry_update", fullTelemetry)
		}
	}
}

func (a *App) ChangePowerSimulation(delta int) int {
	return -1
}
