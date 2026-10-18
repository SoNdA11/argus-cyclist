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
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"argus-cyclist/internal/domain"
	"argus-cyclist/internal/service/recovery"
)

// TestSessionCrashRecoveryEndToEnd simulates a crash mid-session (a recovery
// snapshot is on disk and nothing was finalized) and verifies that
// CheckPendingRecovery / RecoverPendingSession rebuild the session, write the
// FIT file, persist the activity and clear the snapshot.
func TestSessionCrashRecoveryEndToEnd(t *testing.T) {
	t.Chdir(t.TempDir())

	app := NewApp()
	// No Wails context in tests: emitEvent is a nil-safe no-op.

	if err := app.storageService.LoadUserDatabase("recovery-test"); err != nil {
		t.Fatalf("loading user database: %v", err)
	}
	if err := app.storageService.UpdateProfile(domain.UserProfile{ID: 1, Weight: 75, FTP: 250, MaxHR: 190, RestingHR: 55}); err != nil {
		t.Fatalf("seeding profile: %v", err)
	}

	start := time.Now().Add(-30 * time.Minute)
	const sampleCount = 1800
	store := recovery.NewStore(filepath.Join("workouts", ".recovery"))
	if err := store.Begin(recovery.Meta{
		StartedAt:         start,
		RouteName:         "recovery-test-route.gpx",
		SessionActiveTime:  float64(sampleCount),
	}); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	for i := 0; i < sampleCount; i++ {
		if err := store.AppendSample(domain.Telemetry{
			Timestamp:     start.Add(time.Duration(i) * time.Second),
			Power:         200,
			Cadence:       90,
			HeartRate:     140,
			Speed:         30,
			TotalDistance: float64(i * 8),
			Altitude:      100,
		}); err != nil {
			t.Fatalf("AppendSample: %v", err)
		}
	}

	pending := app.CheckPendingRecovery()
	if pending == nil {
		t.Fatal("CheckPendingRecovery = nil, want a pending session")
	}
	if pending.RouteName != "recovery-test-route.gpx" {
		t.Errorf("RouteName = %q", pending.RouteName)
	}
	if pending.SampleCount != sampleCount {
		t.Errorf("SampleCount = %d, want %d", pending.SampleCount, sampleCount)
	}
	if pending.ActiveTime != sampleCount {
		t.Errorf("ActiveTime = %d, want %d", pending.ActiveTime, sampleCount)
	}

	summary, err := app.RecoverPendingSession()
	if err != nil {
		t.Fatalf("RecoverPendingSession: %v", err)
	}

	if summary.Activity.Duration != sampleCount {
		t.Errorf("activity duration = %d, want %d", summary.Activity.Duration, sampleCount)
	}
	if summary.Activity.RouteName != "recovery-test-route.gpx" {
		t.Errorf("activity route = %q", summary.Activity.RouteName)
	}
	wantDistance := float64((sampleCount - 1) * 8)
	if summary.Activity.TotalDistance != wantDistance {
		t.Errorf("activity distance = %v, want %v", summary.Activity.TotalDistance, wantDistance)
	}
	if summary.Activity.AvgPower != 200 {
		t.Errorf("activity avg power = %d, want 200", summary.Activity.AvgPower)
	}

	entries, err := os.ReadDir("workouts")
	if err != nil {
		t.Fatalf("reading workouts dir: %v", err)
	}
	fitFound := false
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "workout_") && strings.HasSuffix(e.Name(), ".fit") {
			fitFound = true
		}
	}
	if !fitFound {
		t.Error("no workout_*.fit file was written")
	}

	activities, err := app.storageService.GetRecentActivities(5)
	if err != nil {
		t.Fatalf("GetRecentActivities: %v", err)
	}
	if len(activities) == 0 {
		t.Error("recovered activity was not persisted")
	}

	if pending := app.CheckPendingRecovery(); pending != nil {
		t.Errorf("snapshot still pending after recovery: %+v", pending)
	}
	if _, _, err := store.Load(); err == nil {
		t.Error("recovery files still on disk after recovery")
	}
}
