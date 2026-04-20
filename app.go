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
	"encoding/json"
	"fmt"
	"math"
	"net/http"
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
	"argus-cyclist/internal/service/strava"
	"argus-cyclist/internal/service/workout"

	"github.com/joho/godotenv"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the main application struct exposed to Wails.
// It orchestrates services, session lifecycle, and runtime events.
type App struct {
	ctx                    context.Context
	gpxService             *gpx.Service
	fitService             *fit.Service
	physicsEngine          *sim.Engine
	trainerService         domain.TrainerService
	storageService         *storage.Service
	workoutService         *workout.Service
	activeWorkout          *domain.ActiveWorkout
	workoutIntensity       float64
	workoutStartTimeOffset float64
	currentDirectGrade     float64

	workoutStartTime time.Time
	isInWorkout      bool

	isRecording bool
	isPaused    bool

	isTrainerConnected bool
	isHRConnected      bool
	isVirtualTrainer   bool
	currentDist        float64
	telemetryChan      chan domain.Telemetry
	cancelSim          context.CancelFunc

	// Session metadata
	currentRouteName     string    // Selected GPX route name
	sessionStart         time.Time // Session start time (for duration calculation)
	sessionActiveTime    float64
	sessionPowerSum      uint64 // Sum of power samples (for average power)
	sessionTicks         int    // Number of power samples
	sessionPowerData     []int
	sessionHRData        []int // Array to store HR history second-by-second
	simPower             int16
	sessionElevationGain float64
	lastAltitude         float64
	isCooldown           bool
	cooldownStart        time.Time
	peakHR               int
	hrAt1Min             int
	hrAt2Min             int
}

type ExportPoint struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
	Ele float64 `json:"ele"`
}

type SessionSummary struct {
	Activity domain.Activity `json:"activity"`
	Zones    fit.TimeInZones `json:"zones"`
	NewFTP   int             `json:"new_ftp"`
	NewMaxHR int             `json:"new_max_hr"`
}

// ActivityDetails contains the time-series data for the charts
type ActivityDetails struct {
	Power     []int     `json:"power"`
	HeartRate []int     `json:"hr"`
	Cadence   []int     `json:"cadence"`
	Distance  []float64 `json:"distance"`
}

// DecouplingRecord represents a historical point for cardiovascular drift
type DecouplingRecord struct {
	Date       string  `json:"date"`
	Decoupling float64 `json:"decoupling"`
}

// CareerDashboard groups the data required for the Career tab
type CareerDashboard struct {
	PMC        []fit.PMCDay       `json:"pmc"`
	Decoupling []DecouplingRecord `json:"decoupling"` // Replaces MMP
}

// NewApp initializes all core services and dependencies.
func NewApp() *App {
	// Initialize persistent storage (Master DB only at startup)
	store := storage.NewService()

	// Provide default fallback weights since the profile is loaded later
	defaultRiderWeight := 75.0
	defaultBikeWeight := 9.0

	return &App{
		gpxService:     gpx.NewService(),
		fitService:     fit.NewService(),
		physicsEngine:  sim.NewEngine(defaultRiderWeight, defaultBikeWeight),
		trainerService: ble.NewRealService(),
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

// =====================
// LOCAL ACCOUNTS (HOME)
// =====================

// GetLocalAccounts fetches all registered profiles for the Home Screen.
func (a *App) GetLocalAccounts() []storage.ProfileSummary {
	return a.storageService.GetProfilesSummary()
}

// CreateLocalAccount generates a new isolated profile.
func (a *App) CreateLocalAccount(name string, avatar string, weight float64, ftp float64) (string, error) {
	id := fmt.Sprintf("%d", time.Now().UnixNano())

	acc := storage.LocalAccount{
		ID:        id,
		Name:      name,
		Avatar:    avatar,
		CreatedAt: time.Now(),
	}

	// Register in Master DB
	if err := a.storageService.CreateLocalAccount(acc); err != nil {
		return "", fmt.Errorf("Error in master db: %v", err)
	}

	// Initialize the isolated user DB
	if err := a.storageService.LoadUserDatabase(id); err != nil {
		return "", fmt.Errorf("Error loading user database: %v", err)
	}

	// Save settings into the new isolated DB
	defaultProfile := domain.UserProfile{
		Name:       name,
		Weight:     weight,
		BikeWeight: 9.0,
		FTP:        int(ftp),
		Units:      "metric",
		Photo:      avatar,
		Level:      1,
		CurrentXP:  0,
	}

	if err := a.storageService.UpdateProfile(defaultProfile); err != nil {
		return "", fmt.Errorf("Error when updating profile: %v", err)
	}

	return id, nil
}

// SelectLocalAccount is called when a user clicks their profile on the Home Screen.
func (a *App) SelectLocalAccount(id string) (string, error) {
	err := a.storageService.LoadUserDatabase(id)
	if err != nil {
		return "", err
	}

	profile, _ := a.storageService.GetProfile()
	a.physicsEngine.UserWeight = profile.Weight
	a.physicsEngine.BikeWeight = profile.BikeWeight

	return "ok", nil
}

// EnsureEventModeProfile loads a shared profile used by the home event launcher.
// This keeps event sessions independent from manually created rider accounts.
func (a *App) EnsureEventModeProfile() (string, error) {
	const eventModeProfileID = "event-mode-shared"

	if err := a.storageService.LoadUserDatabase(eventModeProfileID); err != nil {
		return "", err
	}

	profile, _ := a.storageService.GetProfile()
	if profile.Name == "" || profile.Name == "New Rider" {
		profile.Name = "Event Mode"
	}
	if profile.Weight <= 0 {
		profile.Weight = 75
	}
	if profile.BikeWeight <= 0 {
		profile.BikeWeight = 9
	}
	if profile.FTP <= 0 {
		profile.FTP = 250
	}
	if profile.Units == "" {
		profile.Units = "metric"
	}
	if profile.Level <= 0 {
		profile.Level = 1
	}

	if err := a.storageService.UpdateProfile(profile); err != nil {
		return "", err
	}

	a.physicsEngine.UserWeight = profile.Weight
	a.physicsEngine.BikeWeight = profile.BikeWeight

	return "ok", nil
}

// GetDeviceConnectionState returns the current backend connection state for trainer and HR.
func (a *App) GetDeviceConnectionState() map[string]interface{} {
	trainerKind := "real"
	if a.isVirtualTrainer {
		trainerKind = "virtual"
	}

	return map[string]interface{}{
		"trainer_connected": a.isTrainerConnected,
		"hr_connected":      a.isHRConnected,
		"trainer_kind":      trainerKind,
	}
}

// DeleteLocalAccount removes a user profile and its associated data permanently.
func (a *App) DeleteLocalAccount(id string) error {
	return a.storageService.DeleteLocalAccount(id)
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

// LoadPredefinedKOMSegment injects the built-in event climb into the active route state.
func (a *App) LoadPredefinedKOMSegment() (string, error) {
	points, err := a.gpxService.LoadAndProcessContent(gpx.GetBuiltInKOMSegmentGPX())
	if err != nil {
		return "", err
	}

	a.currentRouteName = "KOM Event Segment"

	totalDistKm := 0.0
	if len(points) > 0 {
		totalDistKm = points[len(points)-1].Distance / 1000.0
	}
	runtime.EventsEmit(a.ctx, "log", fmt.Sprintf("Built-in KOM loaded: %d points | %.2f km", len(points), totalDistKm))

	return a.currentRouteName, nil
}

// SetDirectGrade sets the trainer resistance to a direct grade percentage (hardcoded control).
func (a *App) SetDirectGrade(grade float64) error {
	a.currentDirectGrade = grade
	if a.trainerService != nil {
		a.trainerService.SetGrade(grade)
	}
	return nil
}

// SetKOMGradeSchedule creates a virtual KOM route with a custom grade schedule from frontend.
func (a *App) SetKOMGradeSchedule(grades string) (string, error) {
	gradeSchedule := []float64{0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8}

	if grades != "" {
		var parsed []float64
		if err := json.Unmarshal([]byte(grades), &parsed); err == nil && len(parsed) > 0 {
			gradeSchedule = parsed
		}
	}

	numPoints := 30
	routeLen := 3000.0
	points := make([]domain.RoutePoint, numPoints)

	startLat := -23.560000
	startLon := -46.650000
	startEle := 760.0

	for i := 0; i < numPoints; i++ {
		pct := float64(i) / float64(numPoints-1)

		gradeIdx := pct * float64(len(gradeSchedule)-1)
		idx1 := int(gradeIdx)
		idx2 := idx1 + 1
		if idx2 >= len(gradeSchedule) {
			idx2 = len(gradeSchedule) - 1
		}
		t := gradeIdx - float64(idx1)
		grade := gradeSchedule[idx1] + t*(gradeSchedule[idx2]-gradeSchedule[idx1])

		lat := startLat - (float64(i) * 0.0012)
		lon := startLon - (float64(i) * 0.0012)
		dist := float64(i) * (routeLen / float64(numPoints))

		ele := startEle
		if i > 0 {
			segLen := routeLen / float64(numPoints)
			ele = points[i-1].Elevation + segLen*(grade/100)
		}

		points[i] = domain.RoutePoint{
			Latitude:  lat,
			Longitude: lon,
			Elevation: ele,
			Distance:  dist,
			Grade:     grade,
		}
	}

	a.gpxService.SetPoints(points)
	a.currentRouteName = "KOM Event Segment"
	runtime.EventsEmit(a.ctx, "log", fmt.Sprintf("KOM route set: %d points", len(points)))

	return a.currentRouteName, nil
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

// ConnectTrainer connects to the training roller using the MAC address selected by the user.
func (a *App) ConnectTrainer(macAddress string) (string, error) {
	if a.isTrainerConnected && a.trainerService != nil {
		a.trainerService.Disconnect()
	}

	if _, isReal := a.trainerService.(*ble.RealService); !isReal {
		a.trainerService = ble.NewRealService()
	}

	statusCallback := func(stage string, data string) {
		runtime.EventsEmit(a.ctx, "ble_connection_status", map[string]string{"stage": stage, "msg": data})
	}

	if err := a.trainerService.ConnectTrainer(macAddress, statusCallback); err != nil {
		return "Trainer Error", err
	}

	a.isTrainerConnected = true
	a.isVirtualTrainer = false
	return "Trainer Connected", nil
}

// ConnectVirtualTrainer overrides the real BLE service with a mock generator
// to allow software testing and presentation without physical hardware.
func (a *App) ConnectVirtualTrainer() (string, error) {
	if a.isTrainerConnected {
		// If something is already connected (real or another mock), disconnect it first.
		a.trainerService.Disconnect()
	}

	// Injects the Mock (Virtual Trainer) dependency.
	a.trainerService = ble.NewMockService()

	statusCallback := func(stage string, data string) {
		runtime.EventsEmit(a.ctx, "ble_connection_status", map[string]string{"stage": stage, "msg": data})
	}

	if err := a.trainerService.ConnectTrainer("", statusCallback); err != nil {
		return "Simulator Error", err
	}

	a.isTrainerConnected = true
	a.isVirtualTrainer = true
	return "Simulator Active", nil
}

// DisconnectTrainer explicitly disconnects the active trainer (real or virtual)
// allowing the user to switch between simulation and real hardware.
func (a *App) DisconnectTrainer() string {
	if a.isTrainerConnected && a.trainerService != nil {
		a.trainerService.Disconnect()
		a.isTrainerConnected = false
	}
	a.isVirtualTrainer = false
	return "Disconnected"
}

// ConnectHeartRate connects to a heart rate monitor using the MAC address.
func (a *App) ConnectHeartRate(macAddress string) (string, error) {
	if a.isHRConnected {
		return "HR Already Connected", nil
	}

	statusCallback := func(stage string, data string) {
		runtime.EventsEmit(a.ctx, "ble_connection_status", map[string]string{"stage": stage, "msg": data})
	}

	if err := a.trainerService.ConnectHR(macAddress, statusCallback); err != nil {
		return "HR Error", err
	}

	a.isHRConnected = true

	if a.isRecording {
		a.trainerService.SubscribeStats(a.telemetryChan)
	}

	return "HR Monitor Connected", nil
}

// DisconnectHeartRate explicitly disconnects the HR monitor at the hardware level.
func (a *App) DisconnectHeartRate() string {
	if a.isHRConnected && a.trainerService != nil {
		a.trainerService.DisconnectHR()
		a.isHRConnected = false
	}
	return "Disconnected"
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
	a.sessionHRData = []int{}
	a.currentDist = 0
	a.sessionStart = time.Now()
	a.sessionActiveTime = 0
	a.workoutStartTimeOffset = 0
	a.sessionPowerSum = 0
	a.sessionTicks = 0
	a.workoutIntensity = 1.0
	a.sessionElevationGain = 0.0
	a.lastAltitude = -9999.0

	// Clear the .FIT file array from memory to avoid altering routes.
	if a.fitService != nil {
		a.fitService.StartSession(a.sessionStart)
	}

	a.isRecording = true
	a.isPaused = false

	ctx, cancel := context.WithCancel(context.Background())
	a.cancelSim = cancel

	if err := a.trainerService.SubscribeStats(a.telemetryChan); err != nil {
		cancel()
		return fmt.Sprintf("Erro Subscribe: %v", err)
	}

	go a.gameLoop(ctx, a.telemetryChan)

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

// InitiateCooldown begins the 2-minute Heart Rate Recovery tracking phase.
func (a *App) InitiateCooldown() (string, error) {
	a.isCooldown = true
	a.isPaused = false
	a.cooldownStart = time.Now()

	a.peakHR = 0
	if len(a.sessionHRData) > 0 {
		a.peakHR = a.sessionHRData[len(a.sessionHRData)-1]
	}

	a.hrAt1Min = 0
	a.hrAt2Min = 0

	runtime.EventsEmit(a.ctx, "status_change", "COOLDOWN")
	return "COOLDOWN", nil
}

// FinishSession finalizes the current training session.
// It calculates statistics, saves the activity to the database,
// exports the FIT file, and resets the application state.
func (a *App) FinishSession() (SessionSummary, error) {
	newFTP := 0
	if a.activeWorkout != nil && a.activeWorkout.IsTest {
		switch a.activeWorkout.TestType {
		case "ramp":
			best1 := a.calculateMMP(a.sessionPowerData, 60)
			newFTP = int(float64(best1) * 0.75)
		case "ftp20":
			best20 := a.calculateMMP(a.sessionPowerData, 1200)
			newFTP = int(float64(best20) * 0.95)
		case "vo2max5":
			best5 := a.calculateMMP(a.sessionPowerData, 300)
			newFTP = int(float64(best5) * 0.80)
		}
	}

	if !a.isRecording {
		return SessionSummary{}, fmt.Errorf("not recording")
	}

	if a.cancelSim != nil {
		a.cancelSim()
	}

	workoutsDir := "workouts"
	if err := os.MkdirAll(workoutsDir, 0755); err != nil {
		runtime.EventsEmit(a.ctx, "error", "Error creating workouts directory")
		workoutsDir = "."
	}

	durationSec := a.sessionActiveTime
	avgPower := 0
	if a.sessionTicks > 0 {
		avgPower = int(a.sessionPowerSum) / a.sessionTicks
	}

	var avgSpeed float64 = 0.0
	if durationSec > 0 {
		avgSpeed = (a.currentDist / durationSec) * 3.6
	}

	routeName := a.currentRouteName
	if routeName == "" {
		routeName = "Free Training"
	}

	userProfile := a.GetUserProfile()
	userWeight := userProfile.Weight
	if userWeight == 0 {
		userWeight = 75
	}
	userFTP := userProfile.FTP
	if userFTP == 0 {
		userFTP = 200
	}

	userMaxHR := userProfile.MaxHR
	userRestingHR := userProfile.RestingHR
	if userRestingHR <= 0 {
		userRestingHR = 60 // Safety fallback
	}

	// Calculate Average and Max HR for the session
	var hrSum int
	var hrTicks int
	var sessionMaxHR int
	for _, hr := range a.sessionHRData {
		if hr > 0 {
			hrSum += hr
			hrTicks++
			if hr > sessionMaxHR {
				sessionMaxHR = hr
			}
		}
	}
	avgHR := 0
	if hrTicks > 0 {
		avgHR = hrSum / hrTicks
	}

	np := fit.CalculateNormalizedPower(a.sessionPowerData)
	intensityFactor := fit.CalculateIntensityFactor(np, userFTP)
	tss := fit.CalculateTSS(int(durationSec), np, intensityFactor, userFTP)
	calories := fit.CalculateCalories(avgPower, int(durationSec))
	zones := fit.CalculatePowerZones(a.sessionPowerData, userFTP)
	hrZones := fit.CalculateHRZones(a.sessionHRData, userMaxHR)
	trimpScore := fit.CalculateTRIMP(int(durationSec), avgHR, userMaxHR, userRestingHR)
	decoupling := fit.CalculateAerobicDecoupling(a.sessionPowerData, a.sessionHRData)

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

	fileName := fmt.Sprintf("workout_%s.fit", time.Now().Format("2006-01-02_15-04-05"))
	fullPath := filepath.Join(workoutsDir, fileName)

	hrr1 := 0
	if a.hrAt1Min > 0 && a.peakHR > 0 {
		hrr1 = a.peakHR - a.hrAt1Min
	}
	hrr2 := 0
	if a.hrAt2Min > 0 && a.peakHR > 0 {
		hrr2 = a.peakHR - a.hrAt2Min
	}

	activity := domain.Activity{
		RouteName:         routeName,
		Filename:          fullPath,
		TotalDistance:     a.currentDist,
		Duration:          int64(durationSec),
		AvgPower:          avgPower,
		AvgSpeed:          avgSpeed,
		ElevationGain:     a.sessionElevationGain,
		NormalizedPower:   np,
		IntensityFactor:   intensityFactor,
		TSS:               tss,
		TRIMP:             trimpScore,
		AerobicDecoupling: decoupling,
		AvgHR:             avgHR,
		MaxHR:             sessionMaxHR,
		Calories:          calories,
		CreatedAt:         time.Now(),
		TimeInHRZones:     hrZones,
		PeakHR:            a.peakHR,
		HRR1:              hrr1,
		HRR2:              hrr2,
		UploadedToStrava:  false,
	}

	if err := a.storageService.SaveActivity(activity); err != nil {
		fmt.Println("Database save error:", err)
	}

	if err := a.fitService.Save(fullPath); err != nil {
		runtime.EventsEmit(a.ctx, "error", "Error saving FIT file")
	} else {
		absPath, _ := filepath.Abs(fullPath)
		runtime.EventsEmit(a.ctx, "log", fmt.Sprintf("Workout saved: %s", absPath))
	}

	a.isRecording = false
	a.isPaused = false
	a.currentDist = 0
	a.sessionPowerData = []int{}
	a.sessionHRData = []int{}
	a.isCooldown = false
	a.peakHR = 0
	a.hrAt1Min = 0
	a.hrAt2Min = 0

	runtime.EventsEmit(a.ctx, "status_change", "IDLE")

	return SessionSummary{
		Activity: activity,
		Zones:    zones,
		NewFTP:   newFTP,
		NewMaxHR: sessionMaxHR,
	}, nil
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

	a.currentDist = 0

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
	lastRoutePos := -1.0

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case rawData := <-input:
			if rawData.Power != -1 {
				currentPower = rawData.Power

				// FILTER: Ignores Cadence = 0 if it's just an empty BLE data page.
				// It only drops to 0 if the cyclist actually stops pedaling (Power == 0).
				if rawData.Cadence > 0 {
					currentCadence = rawData.Cadence
				} else if currentPower == 0 {
					currentCadence = 0
				}

				lastPowerTime = time.Now()
			}
			if rawData.HeartRate > 0 {
				currentHR = rawData.HeartRate
				lastHRTime = time.Now()
			}

			currentPower += a.simPower

			now := time.Now()

			if a.isCooldown {
				lastUpdate = now
				elapsed := now.Sub(a.cooldownStart).Seconds()
				timeLeft := int(120.0 - elapsed)

				if elapsed >= 60.0 && a.hrAt1Min == 0 {
					a.hrAt1Min = int(currentHR)
				}

				if elapsed >= 120.0 && a.hrAt2Min == 0 {
					a.hrAt2Min = int(currentHR)
					a.isCooldown = false

					summary, _ := a.FinishSession()
					runtime.EventsEmit(a.ctx, "cooldown_complete", summary)
				} else {
					runtime.EventsEmit(a.ctx, "cooldown_update", map[string]interface{}{
						"time_left":  timeLeft,
						"current_hr": int(currentHR),
					})
				}
				continue
			}

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

			a.sessionActiveTime += dt

			if a.isRecording {
				a.sessionPowerSum += uint64(currentPower)
				a.sessionTicks++
				a.sessionPowerData = append(a.sessionPowerData, int(currentPower))
				a.sessionHRData = append(a.sessionHRData, int(currentHR))
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
			routePos := a.currentDist
			if totalRouteDistance > 0 {
				routePos = math.Mod(a.currentDist, totalRouteDistance)
			}
			routePoint := a.gpxService.GetPointAtDistance(routePos)

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

				elapsed := a.sessionActiveTime - a.workoutStartTimeOffset
				timeAccumulator := 0.0

				foundSegment := false
				for i, seg := range a.activeWorkout.Segments {
					segDur := float64(seg.DurationSeconds)

					if elapsed >= timeAccumulator && elapsed < (timeAccumulator+segDur) {
						foundSegment = true
						currentSegmentIdx = seg.Index
						workoutName = a.activeWorkout.Metadata.Name
						segmentElapsed := elapsed - timeAccumulator
						remainingSegmentTime = int(segDur - segmentElapsed)

						progress := segmentElapsed / segDur
						targetFactor := seg.StartFactor + (seg.EndFactor-seg.StartFactor)*progress

						userFTP := float64(a.GetUserProfile().FTP)
						if userFTP == 0 {
							userFTP = 200
						}
						targetWatts = int(targetFactor * userFTP * a.workoutIntensity)

						if seg.FreeRide {
							if currentMode != "SIM" {
								a.trainerService.SetTrainerMode("SIM")
								currentMode = "SIM"
							}
							if math.Abs(1.0-lastSentGrade) > 0.1 {
								a.trainerService.SetGrade(1.0)
								lastSentGrade = 1.0
							}
						} else {
							if currentMode != "ERG" {
								a.trainerService.SetTrainerMode("ERG")
								currentMode = "ERG"
							}
							if targetWatts != lastSentPower {
								a.trainerService.SetPower(float64(targetWatts))
								lastSentPower = targetWatts
							}
						}

						if i+1 < len(a.activeWorkout.Segments) {
							nextTarget = int(a.activeWorkout.Segments[i+1].StartFactor * userFTP)
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

				// Use direct grade if set (KOM mode), otherwise use GPX route grade
				activeGrade := routePoint.Grade
				if a.currentDirectGrade != 0 {
					activeGrade = a.currentDirectGrade
				}

				// Applies the route slope (grid) to the roller
				// Optimization: Only sends if changes exceed 0.1%
				if math.Abs(activeGrade-lastSentGrade) > 0.1 {
					a.trainerService.SetGrade(activeGrade)
					lastSentGrade = activeGrade
				}
			}

			// ========================
			// PHYSICS and STATE UPDATE
			// ========================

			activeGrade := routePoint.Grade
			if a.currentDirectGrade != 0 {
				activeGrade = a.currentDirectGrade
			}

			speedMs := a.physicsEngine.CalculateSpeed(float64(currentPower), activeGrade)
			a.currentDist += speedMs * dt

			if a.lastAltitude != -9999.0 {
				if lastRoutePos == -1.0 || routePos >= lastRoutePos {
					if routePoint.Elevation > a.lastAltitude {
						a.sessionElevationGain += (routePoint.Elevation - a.lastAltitude)
					}
				}
			}
			a.lastAltitude = routePoint.Elevation
			lastRoutePos = routePos

			// ==============================
			// NOTIFICATIONS FOR THE FRONTEND
			// ==============================

			// 1. Telemetry Package (Speedometer, Map, Graph)
			fullTelemetry := domain.Telemetry{
				Timestamp: now, Power: currentPower, Cadence: currentCadence, HeartRate: currentHR,
				Speed: speedMs * 3.6, TotalDistance: a.currentDist, CurrentGrade: routePoint.Grade,
				Latitude: routePoint.Latitude, Longitude: routePoint.Longitude, Altitude: routePoint.Elevation,
				ElevationGain: a.sessionElevationGain,
			}
			a.fitService.AddRecord(fullTelemetry)
			runtime.EventsEmit(a.ctx, "telemetry_update", fullTelemetry)

			// 2. Training State Package (Only if you are training)
			if a.isInWorkout {
				isFreeRide := false
				segDuration := 0
				if currentSegmentIdx >= 0 && currentSegmentIdx < len(a.activeWorkout.Segments) {
					isFreeRide = a.activeWorkout.Segments[currentSegmentIdx].FreeRide
					segDuration = a.activeWorkout.Segments[currentSegmentIdx].DurationSeconds
				}

				workoutState := domain.WorkoutState{
					IsActive:          true,
					WorkoutName:       workoutName,
					CurrentSegmentIdx: currentSegmentIdx,
					SegmentTimeRemain: remainingSegmentTime,
					SegmentDuration:   segDuration,
					TargetPower:       targetWatts,
					NextTargetPower:   nextTarget,
					CompletionPercent: completionPct,
					IntensityPct:      int(a.workoutIntensity * 100),
					IsFreeRide:        isFreeRide,
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

	if a.isRecording {
		a.workoutStartTimeOffset = a.sessionActiveTime
		a.isInWorkout = true
	} else {
		a.workoutStartTimeOffset = 0
	}

	// Sends the complete structure to the frontend to draw the graph.
	runtime.EventsEmit(a.ctx, "workout_loaded", wo)
	return "Workout Loaded"
}

// RepeatWorkout allows restarting the currently loaded workout without stopping the session
func (a *App) RepeatWorkout() string {
	if a.activeWorkout == nil {
		return "No workout loaded"
	}

	if a.isRecording {
		a.workoutStartTimeOffset = a.sessionActiveTime
	} else {
		a.workoutStartTimeOffset = 0
	}

	a.isInWorkout = true
	runtime.EventsEmit(a.ctx, "workout_loaded", a.activeWorkout)
	return "Workout Repeated"
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

// ScanTrainers is called by the frontend to search for devices.
func (a *App) ScanTrainers() []domain.BLEDevice {
	if _, isReal := a.trainerService.(*ble.RealService); !isReal {
		a.trainerService = ble.NewRealService()
	}

	if realSvc, ok := a.trainerService.(*ble.RealService); ok {
		devices, err := realSvc.ScanForTrainers()
		if err != nil {
			fmt.Println("[BLE] ScanTrainers error:", err)
			runtime.EventsEmit(a.ctx, "error", err.Error())
			return []domain.BLEDevice{}
		}
		return devices
	}

	return []domain.BLEDevice{}
}

// ScanHeartRate is called by the frontend to search for heart rate monitors.
func (a *App) ScanHeartRate() []domain.BLEDevice {
	if _, isReal := a.trainerService.(*ble.RealService); !isReal {
		a.trainerService = ble.NewRealService()
	}

	if realSvc, ok := a.trainerService.(*ble.RealService); ok {
		devices, err := realSvc.ScanForHR()
		if err != nil {
			fmt.Println("[BLE] ScanHeartRate error:", err)
			runtime.EventsEmit(a.ctx, "error", err.Error())
			return []domain.BLEDevice{}
		}
		return devices
	}

	return []domain.BLEDevice{}
}

func (a *App) GetActivityDetails(filePath string) (fit.ActivityDetails, error) {
	details, err := a.fitService.ParseActivity(filePath)
	if err != nil {
		return fit.ActivityDetails{}, err
	}
	return details, nil
}

func (a *App) GetCareerDashboard() (CareerDashboard, error) {
	activities, err := a.storageService.GetAllActivities()
	if err != nil {
		fmt.Println("Error retrieving history for PMC:", err)
		activities = []domain.Activity{}
	}

	pmcData := fit.CalculatePMC(activities)

	// Build the Decoupling History (Only for rides longer than 1 hour with HR data)
	var decouplingData []DecouplingRecord
	for _, act := range activities {
		if act.Duration >= 3600 && act.AvgHR > 0 {
			decouplingData = append(decouplingData, DecouplingRecord{
				Date:       act.CreatedAt.Format("2006-01-02"),
				Decoupling: act.AerobicDecoupling,
			})
		}
	}

	return CareerDashboard{
		PMC:        pmcData,
		Decoupling: decouplingData,
	}, nil
}

// DeleteActivityHistory deletes the workout from the database and removes the .fit file from disk
func (a *App) DeleteActivityHistory(activityID uint) error {
	// 1. Fetch the activity to discover the associated .fit filename
	activity, err := a.storageService.GetActivityByID(activityID)
	if err != nil {
		return fmt.Errorf("activity not found: %v", err)
	}

	// 2. Delete the record from the SQLite database
	err = a.storageService.DeleteActivity(activityID)
	if err != nil {
		return fmt.Errorf("error deleting from database: %v", err)
	}

	// 3. Delete the physical .fit file from the user's disk
	// If the file does not exist (e.g., manually deleted), the function ignores the error
	if activity.Filename != "" {
		_ = os.Remove(activity.Filename)
	}

	return nil
}

// ResetAppState clears any route (GPX) or structured training (ZWO)
// that is loaded into memory, ensuring a blank slate
// when the user switches profiles.
func (a *App) ResetAppState() {
	a.gpxService = gpx.NewService()
	a.workoutService = workout.NewService()
	a.currentRouteName = ""

	// Resets the physics engine to remove any remaining rotational tilt
	if profile, err := a.storageService.GetProfile(); err == nil {
		a.physicsEngine = sim.NewEngine(profile.Weight, profile.BikeWeight)
	} else {
		a.physicsEngine = sim.NewEngine(75.0, 9.0)
	}
}

// =========================
// STRAVA OAUTH2 INTEGRATION
// =========================

// ConnectStrava starts a local HTTP server, opens the browser for authorization,
// captures the callback, and saves the tokens to the active user's profile.
func (a *App) ConnectStrava() (string, error) {
	_ = godotenv.Load()
	clientID := os.Getenv("STRAVA_CLIENT_ID")
	if clientID == "" {
		return "", fmt.Errorf("STRAVA_CLIENT_ID is missing in the .env file")
	}

	// Channels to handle the async web callback
	tokenChan := make(chan *strava.TokenResponse)
	errChan := make(chan error)

	// Create an isolated HTTP router for this specific authorization process
	mux := http.NewServeMux()
	srv := &http.Server{Addr: ":8080", Handler: mux}

	// Define the callback route
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		if code == "" {
			errChan <- fmt.Errorf("no authorization code returned from Strava")
			fmt.Fprint(w, "<h2 style='color: red; text-align: center; font-family: sans-serif; margin-top: 50px;'>Error: No code returned. You can close this window.</h2>")
			return
		}

		// Exchange the code for the real tokens
		tokenResp, err := strava.ExchangeToken(code)
		if err != nil {
			errChan <- err
			fmt.Fprint(w, "<h2 style='color: red; text-align: center; font-family: sans-serif; margin-top: 50px;'>Error exchanging token. You can close this window.</h2>")
			return
		}

		htmlSuccess := `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<title>Argus Cyclist - Strava</title>
			<style>
				body { background-color: #121212; color: #ffffff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
				.container { text-align: center; background: #1e1e1e; padding: 40px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 400px; border-top: 5px solid #FC4C02; }
				.icon { font-size: 60px; margin-bottom: 20px; }
				h2 { color: #FC4C02; margin: 0 0 15px 0; font-size: 28px; }
				p { color: #aaaaaa; line-height: 1.5; margin-bottom: 20px; font-size: 16px; }
				.btn-close { display: inline-block; background-color: #333; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px; }
			</style>
		</head>
		<body>
			<div class="container">
				<div class="icon">🏆</div>
				<h2>Strava Connected!</h2>
				<p>Argus Cyclist has successfully linked to your Strava account.</p>
				<p>You can now safely close this browser tab and return to the app to upload your workouts.</p>
			</div>
		</body>
		</html>
		`

		// Success! Send token to the main thread and update the browser window
		tokenChan <- tokenResp
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, htmlSuccess)
	})

	// Start the server in the background
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errChan <- err
		}
	}()

	// Build the Authorization URL asking for 'activity:write' permission
	authURL := fmt.Sprintf("https://www.strava.com/oauth/authorize?client_id=%s&response_type=code&redirect_uri=http://localhost:8080/callback&scope=activity:write,read", clientID)

	// Open the default OS browser
	runtime.BrowserOpenURL(a.ctx, authURL)

	// Wait for the user to complete the flow in the browser (Timeout after 3 minutes)
	select {
	case token := <-tokenChan:
		// Retrieve current user profile
		profile, err := a.storageService.GetProfile()
		if err != nil {
			srv.Shutdown(context.Background())
			return "", fmt.Errorf("no active profile found to save tokens")
		}

		// Save tokens to the isolated SQLite DB
		profile.StravaAccessToken = token.AccessToken
		profile.StravaRefreshToken = token.RefreshToken
		profile.StravaExpiresAt = token.ExpiresAt

		if err := a.storageService.UpdateProfile(profile); err != nil {
			srv.Shutdown(context.Background())
			return "", fmt.Errorf("failed to save tokens to database: %v", err)
		}

		// Gracefully shut down the temporary server
		srv.Shutdown(context.Background())
		return "ok", nil

	case err := <-errChan:
		srv.Shutdown(context.Background())
		return "", err

	case <-time.After(3 * time.Minute):
		srv.Shutdown(context.Background())
		return "", fmt.Errorf("timeout: waiting for Strava authorization took too long")
	}
}

// IsStravaConnected returns true if the current active profile has a Strava token
func (a *App) IsStravaConnected() bool {
	profile, err := a.storageService.GetProfile()
	if err != nil {
		return false
	}
	return profile.StravaAccessToken != ""
}

// UploadLastWorkoutToStrava finds the most recently generated .fit file
// and uploads it using the active user's Strava token.
func (a *App) UploadLastWorkoutToStrava() (string, error) {
	profile, err := a.storageService.GetProfile()
	if err != nil || profile.StravaAccessToken == "" {
		return "", fmt.Errorf("strava account is not connected")
	}

	if time.Now().Unix() >= profile.StravaExpiresAt {
		fmt.Println("[STRAVA] Token de Acesso Expirado. Renovando automaticamente...")

		newTokens, err := strava.RefreshToken(profile.StravaRefreshToken)
		if err != nil {
			return "", fmt.Errorf("failed to auto-refresh token: %v", err)
		}

		profile.StravaAccessToken = newTokens.AccessToken
		profile.StravaRefreshToken = newTokens.RefreshToken
		profile.StravaExpiresAt = newTokens.ExpiresAt

		if err := a.storageService.UpdateProfile(profile); err != nil {
			return "", fmt.Errorf("failed to save refreshed token: %v", err)
		}

		fmt.Println("[STRAVA] Token renovado com sucesso!")
	}

	workoutsDir := "workouts"
	files, err := os.ReadDir(workoutsDir)
	if err != nil {
		return "", fmt.Errorf("failed to read workouts directory: %v", err)
	}

	var latestFitFilePath string
	var lastModTime int64 = 0

	for _, file := range files {
		if filepath.Ext(file.Name()) == ".fit" {
			info, err := file.Info()
			if err != nil {
				continue
			}
			if info.ModTime().Unix() > lastModTime {
				lastModTime = info.ModTime().Unix()
				latestFitFilePath = filepath.Join(workoutsDir, file.Name())
			}
		}
	}

	if latestFitFilePath == "" {
		return "", fmt.Errorf("no recent .fit file found to upload")
	}

	err = strava.UploadFitFile(profile.StravaAccessToken, latestFitFilePath)
	if err != nil {
		return "", err
	}

	// Mark the latest activity as uploaded in the database
	latestActivities, err := a.storageService.GetRecentActivities(1)
	if err == nil && len(latestActivities) > 0 {
		a.storageService.UpdateActivityStatus(latestActivities[0].ID, true)
	}

	return "Upload successful", nil
}

// UploadActivityToStrava retrieves a specific historical activity by ID and uploads its .fit file to Strava.
func (a *App) UploadActivityToStrava(activityID uint) (string, error) {
	profile, err := a.storageService.GetProfile()
	if err != nil || profile.StravaAccessToken == "" {
		return "", fmt.Errorf("strava account is not connected")
	}

	// Handle expired tokens dynamically
	if time.Now().Unix() >= profile.StravaExpiresAt {
		fmt.Println("[STRAVA] Access Token Expired. Auto-refreshing...")
		newTokens, err := strava.RefreshToken(profile.StravaRefreshToken)
		if err != nil {
			return "", fmt.Errorf("failed to auto-refresh token: %v", err)
		}

		profile.StravaAccessToken = newTokens.AccessToken
		profile.StravaRefreshToken = newTokens.RefreshToken
		profile.StravaExpiresAt = newTokens.ExpiresAt

		if err := a.storageService.UpdateProfile(profile); err != nil {
			return "", fmt.Errorf("failed to save refreshed token: %v", err)
		}
	}

	// Retrieve the specific activity from the database
	activity, err := a.storageService.GetActivityByID(activityID)
	if err != nil {
		return "", fmt.Errorf("activity not found: %v", err)
	}

	if activity.Filename == "" {
		return "", fmt.Errorf("no .fit file associated with this activity")
	}

	if activity.UploadedToStrava {
		return "", fmt.Errorf("activity already uploaded to Strava")
	}

	// Upload to Strava API
	err = strava.UploadFitFile(profile.StravaAccessToken, activity.Filename)
	if err != nil {
		return "", err
	}

	// Mark as uploaded in the local database
	if err := a.storageService.UpdateActivityStatus(activityID, true); err != nil {
		fmt.Printf("Warning: Upload succeeded, but failed to update local status: %v\n", err)
	}

	return "Upload successful", nil
}

// DisconnectStrava clears the user's saved Strava tokens from the database
func (a *App) DisconnectStrava() error {
	err := a.storageService.ClearStravaTokens()
	if err != nil {
		return fmt.Errorf("failed to clear tokens: %v", err)
	}
	return nil
}

func (a *App) GetFitnessTests() []domain.ActiveWorkout {
	return workout.GetBuiltInAssessments()
}

func (a *App) SetBuiltInWorkout(testType string) string {
	tests := workout.GetBuiltInAssessments()

	for _, t := range tests {
		if t.TestType == testType {
			wo := t
			a.activeWorkout = &wo

			if a.isRecording {
				a.workoutStartTimeOffset = a.sessionActiveTime
				a.isInWorkout = true
			} else {
				a.workoutStartTimeOffset = 0
			}

			runtime.EventsEmit(a.ctx, "workout_loaded", wo)
			return "Loaded"
		}
	}
	return "Not found"
}
