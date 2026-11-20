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
	"fmt"
	"math"
	"time"

	"argus-cyclist/internal/domain"
	"argus-cyclist/internal/service/gpx"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// eventCourse describes a distance race of the event mode.
type eventCourse struct {
	Distance float64   // m from start to finish
	Grades   []float64 // % control points spread evenly over Distance
}

// eventCourses are the distance races, ranked by the lowest time. The runout
// after the finish keeps the rider on the course while the result is computed.
var eventCourses = map[string]eventCourse{
	"sprint200": {Distance: 200, Grades: []float64{0}},
	"climb400":  {Distance: 400, Grades: []float64{3, 5, 6, 6, 6}},
	"tt1k":      {Distance: 1000, Grades: []float64{0, 1, 2, 1, 0, -1, 0, 1, 0}},
}

const (
	eventCourseRunout = 300.0
	minEventWeight    = 35.0
	maxEventWeight    = 150.0
	maxGhostSamples   = 2000
)

// EventCourseInfo is returned to the frontend when a race course is loaded.
type EventCourseInfo struct {
	Mode     string  `json:"mode"`
	Distance float64 `json:"distance"`
	Length   float64 `json:"length"`
}

// isTimeRanked reports whether lower scores rank higher in a mode.
func isTimeRanked(mode string) bool {
	_, ok := eventCourses[mode]
	return ok
}

// SetEventCourse loads the synthetic course of a distance race as the active route.
func (a *App) SetEventCourse(mode string) (EventCourseInfo, error) {
	course, ok := eventCourses[mode]
	if !ok {
		return EventCourseInfo{}, fmt.Errorf("unknown race mode %q", mode)
	}
	points := gpx.BuildCourse(course.Distance, eventCourseRunout, course.Grades)
	a.gpxService.SetPoints(points)
	a.currentRouteName = "Event: " + mode
	a.currentDirectGrade = 0
	return EventCourseInfo{Mode: mode, Distance: course.Distance, Length: points[len(points)-1].Distance}, nil
}

// SetEventRiderWeight applies the visitor's weight to the physics for the next race.
func (a *App) SetEventRiderWeight(kg float64) error {
	if math.IsNaN(kg) || kg < minEventWeight || kg > maxEventWeight {
		return fmt.Errorf("weight must be between %.0f and %.0f kg", minEventWeight, maxEventWeight)
	}
	a.eventRiderWeight = kg
	a.physicsEngine.UserWeight = kg
	return nil
}

// applyEventRiderWeight makes the physics use the visitor's weight for the session
// that is starting (no-op outside event races).
func (a *App) applyEventRiderWeight() {
	if a.eventRiderWeight > 0 {
		a.physicsEngine.UserWeight = a.eventRiderWeight
	}
}

// clearEventRiderWeight returns the physics to the loaded profile's weight.
func (a *App) clearEventRiderWeight() {
	if a.eventRiderWeight == 0 {
		return
	}
	a.eventRiderWeight = 0
	if profile, err := a.storageService.GetProfile(); err == nil && profile.Weight > 0 {
		a.physicsEngine.UserWeight = profile.Weight
	}
}

// SetFairMode turns the operator lock on or off. While on, the simulator cannot be
// connected and its power override is ignored; an active simulator is disconnected.
func (a *App) SetFairMode(on bool) bool {
	a.fairMode = on
	if on {
		a.simPower = 0
		if a.isVirtualTrainer && !a.isRecording {
			a.DisconnectTrainer()
		}
	}
	return a.fairMode
}

// GetFairMode reports whether the operator lock is on.
func (a *App) GetFairMode() bool {
	return a.fairMode
}

// attemptIsSimulated reports whether the current attempt is not a real effort.
func (a *App) attemptIsSimulated() bool {
	return a.isVirtualTrainer || a.simPower != 0
}

// saveEventAttempt fills the fields owned by the backend and stores the record.
func (a *App) saveEventAttempt(record domain.EventRecord) error {
	record.CreatedAt = time.Now()
	record.Weight = a.physicsEngine.UserWeight
	record.IsSimulated = a.attemptIsSimulated()
	if a.fitService != nil {
		record.Duration = a.fitService.GetRecordCount()
		if record.Duration >= 5 {
			record.Filename = a.saveEventFIT()
		}
	}
	return a.storageService.SaveEventRecord(record)
}

// SaveRaceResult stores a finished distance race: seconds is the interpolated
// finish time and ghost a JSON array of elapsed times every domain.GhostStep meters.
func (a *App) SaveRaceResult(riderName, mode string, seconds float64, ghost string) error {
	if !isTimeRanked(mode) {
		return fmt.Errorf("unknown race mode %q", mode)
	}
	if riderName == "" || math.IsNaN(seconds) || seconds <= 0 {
		return fmt.Errorf("invalid race result")
	}
	if ghost != "" {
		var samples []float64
		if err := json.Unmarshal([]byte(ghost), &samples); err != nil || len(samples) > maxGhostSamples {
			ghost = "" // the result still counts without a replayable ghost
		}
	}
	return a.saveEventAttempt(domain.EventRecord{
		RiderName: riderName, EventMode: mode, Score: seconds, Status: "success", Ghost: ghost,
	})
}

// GetEventRanking returns the best attempt of each rider for a mode, best first.
// Simulated attempts are only included on request (e.g. to test without a trainer).
func (a *App) GetEventRanking(mode string, includeSimulated bool) []domain.EventRecord {
	records, err := a.storageService.GetTopEventRecords(mode, 150, isTimeRanked(mode), includeSimulated)
	if err != nil {
		return []domain.EventRecord{}
	}
	return records
}

// emitFairModeRefusal tells the UI why a simulator action was ignored.
func (a *App) emitFairModeRefusal() {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "error", "Fair Mode is on: the simulator is disabled.")
	}
}
