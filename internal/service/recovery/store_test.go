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

package recovery

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"argus-cyclist/internal/domain"
)

func testMeta() Meta {
	return Meta{
		StartedAt:         time.Date(2026, 10, 18, 14, 0, 0, 0, time.Local),
		RouteName:         "natal-15km.gpx",
		SessionActiveTime: 1234.5,
		PeakHR:            178,
		HRAt1Min:          150,
		HRAt2Min:          132,
		UpdatedAt:         time.Date(2026, 10, 18, 14, 20, 0, 0, time.Local),
	}
}

func testSample(t time.Time, power int16, hr uint8, dist float64) domain.Telemetry {
	return domain.Telemetry{
		Timestamp:     t,
		Power:         power,
		Cadence:       90,
		HeartRate:     hr,
		Speed:         32.5,
		TotalDistance: dist,
		Latitude:      -5.2,
		Longitude:     37.3,
		Altitude:      120.0,
		ElevationGain: 45.0,
		RiderWeight:   75,
	}
}

func newTestStore(t *testing.T) *Store {
	t.Helper()
	return NewStore(filepath.Join(t.TempDir(), ".recovery"))
}

func TestBeginAppendLoadRoundTrip(t *testing.T) {
	store := newTestStore(t)

	if err := store.Begin(testMeta()); err != nil {
		t.Fatalf("Begin returned error: %v", err)
	}
	if !store.Pending() {
		t.Fatal("Pending() = false after Begin")
	}

	start := time.Date(2026, 10, 18, 14, 0, 1, 0, time.Local)
	want := []domain.Telemetry{
		testSample(start, 200, 140, 8.5),
		testSample(start.Add(time.Second), 210, 142, 17.1),
		testSample(start.Add(2*time.Second), 205, 145, 25.8),
	}
	for _, sample := range want {
		if err := store.AppendSample(sample); err != nil {
			t.Fatalf("AppendSample returned error: %v", err)
		}
	}

	meta, samples, err := store.Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if meta.Version != SchemaVersion {
		t.Errorf("meta.Version = %d, want %d", meta.Version, SchemaVersion)
	}
	if meta.RouteName != "natal-15km.gpx" {
		t.Errorf("meta.RouteName = %q, want %q", meta.RouteName, "natal-15km.gpx")
	}
	if meta.SessionActiveTime != 1234.5 {
		t.Errorf("meta.SessionActiveTime = %v, want 1234.5", meta.SessionActiveTime)
	}
	if !meta.StartedAt.Equal(testMeta().StartedAt) {
		t.Errorf("meta.StartedAt = %v, want %v", meta.StartedAt, testMeta().StartedAt)
	}
	if len(samples) != len(want) {
		t.Fatalf("len(samples) = %d, want %d", len(samples), len(want))
	}
	for i, sample := range samples {
		if sample.Power != want[i].Power {
			t.Errorf("samples[%d].Power = %d, want %d", i, sample.Power, want[i].Power)
		}
		if sample.TotalDistance != want[i].TotalDistance {
			t.Errorf("samples[%d].TotalDistance = %v, want %v", i, sample.TotalDistance, want[i].TotalDistance)
		}
		if !sample.Timestamp.Equal(want[i].Timestamp) {
			t.Errorf("samples[%d].Timestamp = %v, want %v", i, sample.Timestamp, want[i].Timestamp)
		}
	}
}

func TestLoadWithoutPendingSnapshot(t *testing.T) {
	store := newTestStore(t)

	if store.Pending() {
		t.Fatal("Pending() = true on an empty store")
	}
	if _, _, err := store.Load(); !errors.Is(err, ErrNoPending) {
		t.Fatalf("Load error = %v, want ErrNoPending", err)
	}
}

func TestAppendWithoutBeginIsIgnored(t *testing.T) {
	store := newTestStore(t)

	if err := store.AppendSample(testSample(time.Now(), 100, 100, 1.0)); err != nil {
		t.Fatalf("AppendSample returned error: %v", err)
	}
	if store.Pending() {
		t.Fatal("Pending() = true after an append without Begin")
	}
}

func TestTruncatedTrailingLineIsSkipped(t *testing.T) {
	store := newTestStore(t)

	if err := store.Begin(testMeta()); err != nil {
		t.Fatalf("Begin returned error: %v", err)
	}
	for i := 0; i < 3; i++ {
		if err := store.AppendSample(testSample(time.Now(), 150, 130, float64(i))); err != nil {
			t.Fatalf("AppendSample returned error: %v", err)
		}
	}

	// Simulate a hard crash in the middle of a write: a partial JSON line
	// with no terminating newline.
	file, err := os.OpenFile(filepath.Join(store.dir, SamplesFileName), os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatalf("opening samples file: %v", err)
	}
	if _, err := file.WriteString(`{"timestamp":"2026-10-18T14:0`); err != nil {
		t.Fatalf("writing partial line: %v", err)
	}
	file.Close()

	_, samples, err := store.Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if len(samples) != 3 {
		t.Fatalf("len(samples) = %d, want 3 (partial line must be skipped)", len(samples))
	}
}

func TestMalformedMiddleLineIsSkipped(t *testing.T) {
	store := newTestStore(t)

	if err := store.Begin(testMeta()); err != nil {
		t.Fatalf("Begin returned error: %v", err)
	}
	if err := store.AppendSample(testSample(time.Now(), 150, 130, 10)); err != nil {
		t.Fatalf("AppendSample returned error: %v", err)
	}
	file, err := os.OpenFile(filepath.Join(store.dir, SamplesFileName), os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatalf("opening samples file: %v", err)
	}
	if _, err := file.WriteString("garbage line\n"); err != nil {
		t.Fatalf("writing malformed line: %v", err)
	}
	file.Close()
	if err := store.AppendSample(testSample(time.Now(), 160, 131, 20)); err != nil {
		t.Fatalf("AppendSample returned error: %v", err)
	}

	_, samples, err := store.Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if len(samples) != 2 {
		t.Fatalf("len(samples) = %d, want 2", len(samples))
	}
	if samples[1].Power != 160 {
		t.Errorf("samples[1].Power = %d, want 160", samples[1].Power)
	}
}

func TestUpdateMetaPersistsLatestValues(t *testing.T) {
	store := newTestStore(t)

	if err := store.Begin(testMeta()); err != nil {
		t.Fatalf("Begin returned error: %v", err)
	}

	updated := testMeta()
	updated.SessionActiveTime = 3600
	updated.PeakHR = 181
	if err := store.UpdateMeta(updated); err != nil {
		t.Fatalf("UpdateMeta returned error: %v", err)
	}

	meta, _, err := store.Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if meta.SessionActiveTime != 3600 {
		t.Errorf("meta.SessionActiveTime = %v, want 3600", meta.SessionActiveTime)
	}
	if meta.PeakHR != 181 {
		t.Errorf("meta.PeakHR = %d, want 181", meta.PeakHR)
	}
}

func TestUpdateMetaWithoutBeginIsIgnored(t *testing.T) {
	store := newTestStore(t)

	if err := store.UpdateMeta(testMeta()); err != nil {
		t.Fatalf("UpdateMeta returned error: %v", err)
	}
	if store.Pending() {
		t.Fatal("Pending() = true after UpdateMeta without Begin")
	}
}

func TestClearRemovesSnapshot(t *testing.T) {
	store := newTestStore(t)

	if err := store.Begin(testMeta()); err != nil {
		t.Fatalf("Begin returned error: %v", err)
	}
	if err := store.AppendSample(testSample(time.Now(), 100, 100, 1)); err != nil {
		t.Fatalf("AppendSample returned error: %v", err)
	}
	if err := store.Clear(); err != nil {
		t.Fatalf("Clear returned error: %v", err)
	}

	if store.Pending() {
		t.Fatal("Pending() = true after Clear")
	}
	if _, _, err := store.Load(); !errors.Is(err, ErrNoPending) {
		t.Fatalf("Load error = %v, want ErrNoPending", err)
	}
}

func TestBeginDiscardsPreviousSnapshot(t *testing.T) {
	store := newTestStore(t)

	if err := store.Begin(testMeta()); err != nil {
		t.Fatalf("Begin returned error: %v", err)
	}
	if err := store.AppendSample(testSample(time.Now(), 100, 100, 1)); err != nil {
		t.Fatalf("AppendSample returned error: %v", err)
	}

	second := testMeta()
	second.RouteName = "venice-24.3-km-route.gpx"
	if err := store.Begin(second); err != nil {
		t.Fatalf("second Begin returned error: %v", err)
	}

	meta, samples, err := store.Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if meta.RouteName != "venice-24.3-km-route.gpx" {
		t.Errorf("meta.RouteName = %q, want the second session route", meta.RouteName)
	}
	if len(samples) != 0 {
		t.Errorf("len(samples) = %d, want 0 after a fresh Begin", len(samples))
	}
}

func TestMeaningfulThresholds(t *testing.T) {
	short := Meta{SessionActiveTime: 5}
	if short.Meaningful(10) {
		t.Error("short session reported as meaningful")
	}

	longTime := Meta{SessionActiveTime: 90}
	if !longTime.Meaningful(0) {
		t.Error("long session without samples should be meaningful")
	}

	manySamples := Meta{SessionActiveTime: 10}
	if !manySamples.Meaningful(120) {
		t.Error("session with many samples should be meaningful")
	}
}

func TestLoadFailsOnUnsupportedVersion(t *testing.T) {
	store := newTestStore(t)

	if err := store.Begin(testMeta()); err != nil {
		t.Fatalf("Begin returned error: %v", err)
	}
	// Rewrite the metadata with a future schema version.
	raw := []byte(`{"version": 999, "started_at": "2026-10-18T14:00:00Z"}`)
	if err := os.WriteFile(filepath.Join(store.dir, MetaFileName), raw, 0o644); err != nil {
		t.Fatalf("writing meta: %v", err)
	}

	if _, _, err := store.Load(); err == nil {
		t.Fatal("Load succeeded on an unsupported snapshot version")
	}
}
