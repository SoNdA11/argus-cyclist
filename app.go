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

package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	stdruntime "runtime"
	"strings"
	"time"

	"argus-cyclist/internal/domain"
	"argus-cyclist/internal/service/ble"
	"argus-cyclist/internal/service/fit"
	"argus-cyclist/internal/service/gpx"
	"argus-cyclist/internal/service/sim"
	"argus-cyclist/internal/service/storage"
	"argus-cyclist/internal/service/workout"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the main application struct exposed to Wails.
// It orchestrates services, session lifecycle, and runtime events.
type App struct {
	ctx              context.Context
	gpxService       *gpx.Service
	fitService       *fit.Service
	physicsEngine    *sim.Engine
	trainerService   domain.TrainerService
	storageService   *storage.Service
	workoutService   *workout.Service
	activeWorkout    *domain.ActiveWorkout
	workoutIntensity float64

	workoutStartTime time.Time
	isInWorkout      bool

	isRecording bool
	isPaused    bool

	isTrainerConnected bool
	isHRConnected      bool

	currentDist   float64
	telemetryChan chan domain.Telemetry
	cancelSim     context.CancelFunc

	// Session metadata
	currentRouteName string    // Selected GPX route name
	sessionStart     time.Time // Session start time (for duration calculation)
	sessionPowerSum  uint64    // Sum of power samples (for average power)
	sessionTicks     int       // Number of power samples
	sessionPowerData []int
	simPower         int16
}

type ExportPoint struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
	Ele float64 `json:"ele"`
}

// NewApp initializes all core services and dependencies.
func NewApp() *App {
	// Initialize persistent storage (SQLite)
	store := storage.NewService()

	// Load user profile to configure the physics engine
	profile, _ := store.GetProfile()

	return &App{
		gpxService: gpx.NewService(),
		fitService: fit.NewService(),
		// Initialize physics engine using stored user data
		physicsEngine: sim.NewEngine(profile.Weight, profile.BikeWeight),
		trainerService: ble.NewRealService(),
		//trainerService: ble.NewMockService(),
		workoutService: workout.NewService(),

		storageService: store,
		telemetryChan:  make(chan domain.Telemetry),
	}
}

// Startup is called by Wails when the app starts.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

// Shutdown is called by Wails when the app is closing.
func (a *App) Shutdown(ctx context.Context) {
	fmt.Println("Closing app: Disconnecting BLE...")
	a.trainerService.Disconnect()
}

// OpenFileFolder opens the system file explorer at the given file location.
func (a *App) OpenFileFolder(filename string) {
	absPath, err := filepath.Abs(filename)
	if err != nil {
		return
	}

	dir := filepath.Dir(absPath)

	var cmd *exec.Cmd

	// OS-specific file explorer handling
	switch stdruntime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", "/select,", absPath)
	case "darwin":
		cmd = exec.Command("open", "-R", absPath)
	case "linux":
		cmd = exec.Command("xdg-open", dir)
	default:
		return
	}

	cmd.Start()
}

// SelectProfileImage opens a dialog to select an image and returns it as Base64.
func (a *App) SelectProfileImage() string {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Profile Picture",
		Filters: []runtime.FileFilter{
			{DisplayName: "Images", Pattern: "*.png;*.jpg;*.jpeg"},
		},
	})

	if err != nil || selection == "" {
		return ""
	}

	// Read file
	bytes, err := os.ReadFile(selection)
	if err != nil {
		runtime.EventsEmit(a.ctx, "error", "Error reading image")
		return ""
	}

	// Convert to Base64 string to display easily in Frontend
	var base64Encoding string
	mimeType := "image/png" // Default detection could be better but this works for basic img tags
	if strings.HasSuffix(selection, ".jpg") || strings.HasSuffix(selection, ".jpeg") {
		mimeType = "image/jpeg"
	}

	base64Encoding = fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(bytes))
	return base64Encoding
}

// ====================
// USER PROFILE & STATS
// ====================

// GetUserProfile returns the persisted user profile.
func (a *App) GetUserProfile() domain.UserProfile {
	u, _ := a.storageService.GetProfile()
	return u
}

// UpdateUserProfile updates the user profile and applies changes
// immediately to the physics engine.
func (a *App) UpdateUserProfile(u domain.UserProfile) string {
	if err := a.storageService.UpdateProfile(u); err != nil {
		return "Error updating profile"
	}

	// Apply changes in real time
	a.physicsEngine.UserWeight = u.Weight
	a.physicsEngine.BikeWeight = u.BikeWeight
	return "Profile Saved"
}

// GetActivities returns recent recorded activities.
func (a *App) GetActivities() []domain.Activity {
    // Passa -1 ou 0 para indicar "sem limite"
    activities, err := a.storageService.GetRecentActivities(-1) 

    if err != nil {
        return []domain.Activity{}
    }
    return activities
}

// GetTotalStats returns aggregated statistics.
func (a *App) GetTotalStats() map[string]float64 {
	dist := a.storageService.GetTotalDistance()
	dur := a.storageService.GetTotalDuration()
	return map[string]float64{
		"total_km":   dist / 1000.0,
		"total_time": float64(dur),
	}
}

func (a *App) GetMonthlyActivities(year int, month int) []domain.Activity {
	monthStr := fmt.Sprintf("%04d-%02d", year, month)
	acts, _ := a.storageService.GetActivitiesByMonth(monthStr)
	return acts
}

func (a *App) GetPowerCurve() []storage.PowerRecord {
	return a.storageService.GetPowerCurve()
}

// ====================
// GPX & ROUTE HANDLING
// ====================

// SelectGPX opens a file dialog and loads the selected GPX route.
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

	a.currentRouteName = filepath.Base(selection)

	totalDistKm := 0.0
	if len(points) > 0 {
		totalDistKm = points[len(points)-1].Distance / 1000.0
	}
	runtime.EventsEmit(a.ctx, "log", fmt.Sprintf("GPX Loaded: %d points | %.2f km", len(points), totalDistKm))

	return a.currentRouteName
}

// GetRoutePath returns all processed GPX points.
func (a *App) GetRoutePath() []domain.RoutePoint {
	return a.gpxService.GetAllPoints()
}

// GetElevationProfile returns only elevation values for charting.
func (a *App) GetElevationProfile() []float64 {
	points := a.gpxService.GetAllPoints()
	elevations := make([]float64, len(points))
	for i, p := range points {
		elevations[i] = p.Elevation
	}
	return elevations
}

// SaveGeneratedGPX receives points from the frontend and creates a GPX file.
func (a *App) SaveGeneratedGPX(name string, points []ExportPoint) string {
	if name == "" {
		name = fmt.Sprintf("route_%s", time.Now().Format("20060102_1504"))
	}

	// 1. Create the XML content.
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Argus Cyclist">
  <trk>
    <name>` + name + `</name>
    <trkseg>
`)

	for _, p := range points {
		sb.WriteString(fmt.Sprintf(`      <trkpt lat="%.6f" lon="%.6f"><ele>%.2f</ele></trkpt>
`, p.Lat, p.Lon, p.Ele))
	}

	sb.WriteString(`    </trkseg>
  </trk>
</gpx>`)

	// 2. Ensures that the routes folder exists.
	routesDir := "routes"
	if _, err := os.Stat(routesDir); os.IsNotExist(err) {
		os.Mkdir(routesDir, 0755)
	}

	// 3. Save the file.
	filename := fmt.Sprintf("%s.gpx", name)
	fullPath := filepath.Join(routesDir, filename)

	err := os.WriteFile(fullPath, []byte(sb.String()), 0644)
	if err != nil {
		return "Error saving file: " + err.Error()
	}

	return "Saved: " + fullPath
}

// =======================
// WINDOW & DEVICE CONTROL
// =======================

// ToggleAlwaysOnTop toggles the window always-on-top state.
func (a *App) ToggleAlwaysOnTop(on bool) {
	runtime.WindowSetAlwaysOnTop(a.ctx, on)
}

// ConnectTrainer connects to the smart trainer via BLE.
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

// ConnectHeartRate connects to a heart rate monitor.
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

// =================
// SESSION LIFECYCLE
// =================

// ToggleSession starts, pauses, or resumes a training session.
func (a *App) ToggleSession() string {
	if a.isRecording {
		if a.isPaused {
			return a.resumeSession()
		}
		return a.pauseSession()
	}
	return a.startSession()
}

// startSession initializes a new training session.
func (a *App) startSession() string {
	// Requires that at least the Trainer is connected
	if !a.isTrainerConnected {
		runtime.EventsEmit(a.ctx, "error", "Trainer not connected! Go to Settings.")
		return "Error: Trainer Disconnected"
	}

	if a.activeWorkout != nil {
		a.isInWorkout = true
		runtime.EventsEmit(a.ctx, "log", "Workout Mode: ACTIVATED")
	} else {
		a.isInWorkout = false
	}

	a.sessionPowerData = []int{}
	a.currentDist = 0
	a.sessionStart = time.Now()
	a.sessionPowerSum = 0
	a.sessionTicks = 0
	a.workoutIntensity = 1.0

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

// pauseSession pauses the current session.
func (a *App) pauseSession() string {
	a.isPaused = true
	runtime.EventsEmit(a.ctx, "status_change", "PAUSED")
	return "Paused"
}

// resumeSession resumes a paused session.
func (a *App) resumeSession() string {
	a.isPaused = false
	runtime.EventsEmit(a.ctx, "status_change", "RECORDING")
	return "Recording"
}

// FinishSession finalizes the current training session.
// It calculates statistics, saves the activity to the database,
// exports the FIT file, and resets the application state.
func (a *App) FinishSession() string {
	if !a.isRecording {
		return "Not recording"
	}

	// Stop simulation/game loop
	if a.cancelSim != nil {
		a.cancelSim()
	}

	// 1. Define and create the workouts directory
	workoutsDir := "workouts"

	// Create directory if it does not exist
	if err := os.MkdirAll(workoutsDir, 0755); err != nil {
		runtime.EventsEmit(a.ctx, "error", "Error creating workouts directory")
		workoutsDir = "." // Fallback to project root
	}

	// 2. Calculate session statistics (with safety checks)
	duration := time.Since(a.sessionStart)
	durationSec := duration.Seconds()

	avgPower := 0
	if a.sessionTicks > 0 {
		avgPower = int(a.sessionPowerSum) / a.sessionTicks
	}

	// Average power calculation (protected)
	var avgSpeed float64 = 0.0
	if durationSec > 0 {
		avgSpeed = (a.currentDist / durationSec) * 3.6
	}

	// Route name fallback
	routeName := a.currentRouteName
	if routeName == "" {
		routeName = "Treino Livre"
	}

	userWeight := a.GetUserProfile().Weight
	if userWeight == 0 {
		userWeight = 75
	} // Fallback

	intervals := []int{1, 5, 15, 30, 60, 300, 600, 1200}

	for _, duration := range intervals {
		bestWatts := a.calculateMMP(a.sessionPowerData, duration)

		if bestWatts > 0 {
			wkg := float64(bestWatts) / userWeight

			record := storage.PowerRecord{
				Duration: duration,
				Watts:    bestWatts,
				Wkg:      wkg,
				Date:     time.Now(),
			}

			a.storageService.CheckAndUpdateRecord(record)
		}
	}

	// 3. Build FIT file path
	fileName := fmt.Sprintf("workout_%s.fit", time.Now().Format("2006-01-02_15-04-05"))
	fullPath := filepath.Join(workoutsDir, fileName)

	// 4. Create activity record for the database
	activity := domain.Activity{
		RouteName:     routeName,
		Filename:      fullPath,
		TotalDistance: a.currentDist,
		Duration:      int64(durationSec),
		AvgPower:      avgPower,
		AvgSpeed:      avgSpeed,
		CreatedAt:     time.Now(),
	}

	if err := a.storageService.SaveActivity(activity); err != nil {
		fmt.Println("Database save error:", err)
	}

	// 5. Save FIT file to disk
	if err := a.fitService.Save(fullPath); err != nil {
		runtime.EventsEmit(a.ctx, "error", "Error saving FIT file")
		fmt.Println("FIT save error:", err)
	} else {
		absPath, _ := filepath.Abs(fullPath)
		runtime.EventsEmit(a.ctx, "log", fmt.Sprintf("Workout saved: %s", absPath))
	}

	// 6. Final cleanup
	a.isRecording = false
	a.isPaused = false

	runtime.EventsEmit(a.ctx, "status_change", "IDLE")
	return "Finished"
}

// DiscardSession cancels the current session without saving any data.
// Connected devices remain active.
func (a *App) DiscardSession() string {
	if a.isRecording {
		if a.cancelSim != nil {
			a.cancelSim()
		}
		a.isRecording = false
		a.isPaused = false
	}

	a.UnloadWorkout()

	runtime.EventsEmit(a.ctx, "status_change", "IDLE")
	runtime.EventsEmit(a.ctx, "workout_finished", "canceled")

	return "Discarded"
}

// DisconnectDevice disconnects all BLE devices.
// If a session is active, it is immediately stopped and discarded.
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

// gameLoop is the core simulation loop.
// It processes telemetry input, applies physics,
// updates distance, controls trainer resistance,
// records FIT data, and emits frontend events.
func (a *App) gameLoop(ctx context.Context, input <-chan domain.Telemetry) {
	lastUpdate := time.Now()
	var currentPower int16 = 0
	var currentHR uint8 = 0
	var currentCadence uint8 = 0

	lastPowerTime := time.Now()
	lastHRTime := time.Now()
	sensorTimeout := 5 * time.Second
	totalRouteDistance := a.gpxService.GetTotalDistance()

	lastSentPower := -1
	lastSentGrade := -999.0
	currentMode := ""

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

			currentPower += a.simPower

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

			if a.isRecording {
				a.sessionPowerSum += uint64(currentPower)
				a.sessionTicks++
				a.sessionPowerData = append(a.sessionPowerData, int(currentPower))
			}

			if now.Sub(lastPowerTime) > sensorTimeout {
				currentPower = 0
				currentCadence = 0
			}
			if now.Sub(lastHRTime) > sensorTimeout {
				currentHR = 0
			}

			// ===================================
			// Training Control Logic (ERG vs SIM)
			// ===================================

			// We obtain the current point of the route to determine the slope and coordinates.
			routePoint := a.gpxService.GetPointAtDistance(a.currentDist)

			// Variables for the workout state
			targetWatts := 0
			remainingSegmentTime := 0
			currentSegmentIdx := -1
			nextTarget := 0
			workoutName := ""
			completionPct := 0.0

			if a.isInWorkout && a.activeWorkout != nil {
				// --- ERG MODE (WORKOUT ACTIVE) ---

				// Ensure the trainer is in ERG mode.
				if currentMode != "ERG" {
					a.trainerService.SetTrainerMode("ERG")
					currentMode = "ERG"
				}

				elapsed := time.Since(a.sessionStart).Seconds()
				timeAccumulator := 0.0

				// Discover which segment we are in.
				foundSegment := false
				for i, seg := range a.activeWorkout.Segments {
					segDur := float64(seg.DurationSeconds)

					// Check if the elapsed time falls within this segment.
					if elapsed >= timeAccumulator && elapsed < (timeAccumulator+segDur) {
						foundSegment = true
						currentSegmentIdx = seg.Index
						workoutName = a.activeWorkout.Metadata.Name

						// Time calculations
						segmentElapsed := elapsed - timeAccumulator
						remainingSegmentTime = int(segDur - segmentElapsed)

						// Linear Power Interpolation (Supports Ramps and Steady)
						progress := segmentElapsed / segDur
						targetFactor := seg.StartFactor + (seg.EndFactor-seg.StartFactor)*progress

						userFTP := float64(a.GetUserProfile().FTP)
						if userFTP == 0 {
							userFTP = 200
						} // Safe fallback

						targetWatts = int(targetFactor * userFTP * a.workoutIntensity)

						// Next interval forecast for the UI
						if i+1 < len(a.activeWorkout.Segments) {
							nextTarget = int(a.activeWorkout.Segments[i+1].StartFactor * userFTP)
						}

						// Send command to Roll (only if significantly changed so as not to flood BLE)
						if targetWatts != lastSentPower {
							a.trainerService.SetPower(float64(targetWatts))
							lastSentPower = targetWatts
						}

						break
					}
					timeAccumulator += segDur
				}

				// Global progress calculation
				if a.activeWorkout.TotalDuration > 0 {
					completionPct = (elapsed / float64(a.activeWorkout.TotalDuration)) * 100
				}

				// If the time exceeds the total, exit workout mode but CONTINUE the session in SIM mode.
				if !foundSegment && elapsed > float64(a.activeWorkout.TotalDuration) {
					a.isInWorkout = false
					a.activeWorkout = nil

					runtime.EventsEmit(a.ctx, "workout_finished", "completed")

					continue
				}

			} else {
				// --- SIM MODE (FREE ROUTES/GPX) ---

				//Ensure the trainer is in SIM mode.
				if currentMode != "SIM" {
					a.trainerService.SetTrainerMode("SIM")
					currentMode = "SIM"
				}

				// Applies the route slope (grid) to the roller
				// Optimization: Only sends if changes exceed 0.1%
				if math.Abs(routePoint.Grade-lastSentGrade) > 0.1 {
					a.trainerService.SetGrade(routePoint.Grade)
					lastSentGrade = routePoint.Grade
				}
			}

			// ========================
			// PHYSICS and STATE UPDATE
			// ========================

			// Physics always uses the REAL power generated by the cyclist (currentPower),
			// regardless of whether we are in ERG (the trainer forces the power) or SIM (the trainer forces the grid).
			speedMs := a.physicsEngine.CalculateSpeed(float64(currentPower), routePoint.Grade)
			a.currentDist += speedMs * dt

			// End of Route Check (only if a route is loaded)
			if totalRouteDistance > 0 && a.currentDist >= totalRouteDistance {
				a.currentDist = totalRouteDistance
				a.FinishSession()
				runtime.EventsEmit(a.ctx, "route_finished", true)
				return
			}

			// ==============================
			// NOTIFICATIONS FOR THE FRONTEND
			// ==============================

			// 1. Telemetry Package (Speedometer, Map, Graph)
			fullTelemetry := domain.Telemetry{
				Timestamp: now, Power: currentPower, Cadence: currentCadence, HeartRate: currentHR,
				Speed: speedMs * 3.6, TotalDistance: a.currentDist, CurrentGrade: routePoint.Grade,
				Latitude: routePoint.Latitude, Longitude: routePoint.Longitude, Altitude: routePoint.Elevation,
			}
			a.fitService.AddRecord(fullTelemetry)
			runtime.EventsEmit(a.ctx, "telemetry_update", fullTelemetry)

			// 2. Training State Package (Only if you are training)
			if a.isInWorkout {
				workoutState := domain.WorkoutState{
					IsActive:          true,
					WorkoutName:       workoutName,
					CurrentSegmentIdx: currentSegmentIdx,
					SegmentTimeRemain: remainingSegmentTime,
					TargetPower:       targetWatts,
					NextTargetPower:   nextTarget,
					CompletionPercent: completionPct,
					IntensityPct:      int(a.workoutIntensity * 100),
				}
				runtime.EventsEmit(a.ctx, "workout_status", workoutState)
			}
		}
	}
}

// SetPowerTarget sets the target power for ERG mode.
func (a *App) SetPowerTarget(watts float64) {
	if a.trainerService != nil {
		a.trainerService.SetPower(watts)
	}
}

// SetTrainerMode switches between SIM and ERG
func (a *App) SetTrainerMode(mode string) {
	if a.trainerService != nil {
		a.trainerService.SetTrainerMode(mode)
	}
}

// ChangePowerSimulation is a placeholder for manual power simulation.
func (a *App) ChangePowerSimulation(delta int) int {
	a.simPower += int16(delta)

	if a.simPower < -500 {
		a.simPower = -500
	}

	return int(a.simPower)
}

func (a *App) calculateMMP(data []int, window int) int {
	if len(data) < window {
		return 0
	}

	maxSum := 0
	currentSum := 0

	for i := 0; i < window; i++ {
		currentSum += data[i]
	}
	maxSum = currentSum

	for i := window; i < len(data); i++ {
		currentSum += data[i] - data[i-window]
		if currentSum > maxSum {
			maxSum = currentSum
		}
	}

	return maxSum / window
}

// LoadWorkout loads a ZWO and prepares the system.
func (a *App) LoadWorkout() string {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Workout", Filters: []runtime.FileFilter{{DisplayName: "ZWO Files", Pattern: "*.zwo"}},
	})
	if err != nil || selection == "" {
		return ""
	}

	wo, err := a.workoutService.LoadZWO(selection)
	if err != nil {
		runtime.EventsEmit(a.ctx, "error", err.Error())
		return ""
	}

	a.activeWorkout = wo
	// Sends the complete structure to the frontend to draw the graph.
	runtime.EventsEmit(a.ctx, "workout_loaded", wo)
	return "Workout Loaded"
}

// StartWorkout specifically initiates workout mode.
func (a *App) StartWorkout() {
	if a.activeWorkout == nil {
		return
	}
	a.isInWorkout = true
	a.ToggleSession() // Reuses the login logic
}

func (a *App) UnloadWorkout() {
	a.activeWorkout = nil
	a.isInWorkout = false
	a.trainerService.SetTrainerMode("SIM")
	runtime.EventsEmit(a.ctx, "log", "Workout Unloaded")
}

// ChangeWorkoutIntensity adjusts the global workout intensity.
// delta: value to add or subtract (e.g., +5 or -5).
func (a *App) ChangeWorkoutIntensity(delta int) int {
	currentPct := int(math.Round(a.workoutIntensity * 100))
	newPct := currentPct + delta

	// Safety limits (e.g., min 50%, max 150%)
	if newPct < 50 {
		newPct = 50
	}
	if newPct > 150 {
		newPct = 150
	}

	a.workoutIntensity = float64(newPct) / 100.0

	// Forces immediate target update if in ERG mode
	if a.isInWorkout && a.trainerService != nil {
		// The next gameLoop cycle will pick up the new value,
		// but we can log or emit an event if needed.
	}

	return newPct
}