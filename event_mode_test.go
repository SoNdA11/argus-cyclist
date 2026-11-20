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
	"encoding/json"
	"math"
	"testing"
)

func TestSetEventCourseLoadsRaceWithRunout(t *testing.T) {
	t.Chdir(t.TempDir())
	app := NewApp()
	for mode, course := range eventCourses {
		info, err := app.SetEventCourse(mode)
		if err != nil {
			t.Fatalf("%s: %v", mode, err)
		}
		if info.Distance != course.Distance || info.Length < course.Distance+eventCourseRunout-1e-9 {
			t.Errorf("%s: info %+v, want distance %.0f and runout", mode, info, course.Distance)
		}
		if got := app.gpxService.GetTotalDistance(); math.Abs(got-info.Length) > 1e-9 {
			t.Errorf("%s: active route %.1f m, want %.1f", mode, got, info.Length)
		}
		if !isTimeRanked(mode) {
			t.Errorf("%s should be ranked by time", mode)
		}
	}
	if _, err := app.SetEventCourse("kom"); err == nil {
		t.Error("legacy/unknown modes must be rejected")
	}
	if isTimeRanked("timeTrial") {
		t.Error("the Zone Challenge is ranked by points, not time")
	}
}

func TestSetEventRiderWeightBounds(t *testing.T) {
	t.Chdir(t.TempDir())
	app := NewApp()
	for _, kg := range []float64{34.9, 150.1, math.NaN()} {
		if err := app.SetEventRiderWeight(kg); err == nil {
			t.Errorf("weight %v accepted, want an error", kg)
		}
	}
	if err := app.SetEventRiderWeight(62); err != nil || app.physicsEngine.UserWeight != 62 {
		t.Errorf("weight 62: err %v, engine weight %.1f", err, app.physicsEngine.UserWeight)
	}
}

func TestFairModeBlocksSimulator(t *testing.T) {
	t.Chdir(t.TempDir())
	app := NewApp()
	app.isVirtualTrainer = true
	app.isRecording = true // a running session keeps its trainer
	app.simPower = 120

	app.SetFairMode(true)
	if app.simPower != 0 || !app.GetFairMode() {
		t.Fatalf("fair mode on: simPower %d, fairMode %v", app.simPower, app.GetFairMode())
	}
	if got := app.ChangePowerSimulation(50); got != 0 || app.simPower != 0 {
		t.Errorf("power override under fair mode: returned %d, simPower %d", got, app.simPower)
	}
	if _, err := app.ConnectVirtualTrainer(); err == nil {
		t.Error("connecting the simulator under fair mode must fail")
	}
	// The attempt is still flagged as simulated: the session started on the simulator.
	if !app.attemptIsSimulated() {
		t.Error("a virtual-trainer attempt must be flagged as simulated")
	}

	app.SetFairMode(false)
	app.isVirtualTrainer = false
	if app.attemptIsSimulated() {
		t.Error("a real-trainer attempt without power override is not simulated")
	}
}

func TestSaveRaceResultAndRanking(t *testing.T) {
	t.Chdir(t.TempDir())
	app := NewApp()
	ghost, _ := json.Marshal([]float64{0, 1.2, 2.1})
	if err := app.SaveRaceResult("Ana [F]", "sprint200", 21.5, string(ghost)); err != nil {
		t.Fatal(err)
	}
	if err := app.SaveRaceResult("Ana [F]", "sprint200", 19.75, "not json"); err != nil {
		t.Fatal(err) // a bad ghost is dropped, the time still counts
	}
	app.isVirtualTrainer = true
	if err := app.SaveRaceResult("Sim [M]", "sprint200", 15, ""); err != nil {
		t.Fatal(err)
	}
	if err := app.SaveRaceResult("X", "timeTrial", 10, ""); err == nil {
		t.Error("points modes must not go through SaveRaceResult")
	}

	ranked := app.GetEventRanking("sprint200", false)
	if len(ranked) != 1 || ranked[0].Score != 19.75 || ranked[0].Ghost != "" || ranked[0].IsSimulated {
		t.Fatalf("ranking %+v, want only Ana's best (19.75 s, ghost dropped)", ranked)
	}
	if all := app.GetEventRanking("sprint200", true); len(all) != 2 || all[0].RiderName != "Sim [M]" || !all[0].IsSimulated {
		t.Fatalf("ranking with simulated %+v, want the simulated attempt first", all)
	}
	if ranked[0].Weight != app.physicsEngine.UserWeight {
		t.Errorf("stored weight %.1f, want the physics weight %.1f", ranked[0].Weight, app.physicsEngine.UserWeight)
	}
}

func TestEventRiderWeightSurvivesProfileReloadUntilSessionEnds(t *testing.T) {
	t.Chdir(t.TempDir())
	app := NewApp()
	if _, err := app.EnsureEventModeProfile(); err != nil {
		t.Fatal(err)
	}
	profileWeight := app.physicsEngine.UserWeight

	if err := app.SetEventRiderWeight(58); err != nil {
		t.Fatal(err)
	}
	// Something reloads the profile between the form and GO (e.g. a profile click).
	app.physicsEngine.UserWeight = profileWeight
	app.applyEventRiderWeight() // what startSession does
	if app.physicsEngine.UserWeight != 58 {
		t.Fatalf("race weight at session start = %.1f, want 58", app.physicsEngine.UserWeight)
	}

	app.clearEventRiderWeight() // what DiscardSession does (it needs a Wails context)
	if app.eventRiderWeight != 0 || app.physicsEngine.UserWeight != profileWeight {
		t.Fatalf("after the session: event weight %.1f, physics %.1f, want 0 and the profile's %.1f",
			app.eventRiderWeight, app.physicsEngine.UserWeight, profileWeight)
	}
}
