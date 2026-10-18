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

package fit

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"argus-cyclist/internal/domain"

	"github.com/muktihari/fit/decoder"
	"github.com/muktihari/fit/profile/mesgdef"
	"github.com/muktihari/fit/profile/untyped/mesgnum"
)

// TestSaveDerivesElapsedTimeFromRecords makes sure the FIT session elapsed
// time comes from the recorded samples, not from the wall clock. This is
// what keeps a session restored from a crash-recovery snapshot (possibly
// days after it originally started) from reporting the crash-to-recovery
// gap as its duration.
func TestSaveDerivesElapsedTimeFromRecords(t *testing.T) {
	svc := NewService()

	start := time.Now().Add(-72 * time.Hour) // Session started three days ago
	svc.StartSession(start)

	const recordedSpan = time.Hour
	for i := 0; i <= 60; i++ {
		svc.AddRecord(domain.Telemetry{
			Timestamp:     start.Add(time.Duration(i) * recordedSpan / 60),
			Power:         200,
			Cadence:       90,
			HeartRate:     140,
			Speed:         30,
			TotalDistance: float64(i * 500),
			Altitude:      100,
		})
	}

	path := filepath.Join(t.TempDir(), "workout.fit")
	if err := svc.Save(path); err != nil {
		t.Fatalf("Save returned error: %v", err)
	}

	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("opening saved file: %v", err)
	}
	defer file.Close()

	fitFile, err := decoder.New(file).Decode()
	if err != nil {
		t.Fatalf("decoding saved file: %v", err)
	}

	var session *mesgdef.Session
	for i := range fitFile.Messages {
		msg := &fitFile.Messages[i]
		if msg.Num == mesgnum.Session {
			session = mesgdef.NewSession(msg)
			break
		}
	}
	if session == nil {
		t.Fatal("saved file has no session message")
	}

	got := time.Duration(session.TotalElapsedTime) * time.Millisecond
	if got < 59*time.Minute || got > recordedSpan+time.Minute {
		t.Errorf("TotalElapsedTime = %v, want about %v (recorded span, not wall clock)", got, recordedSpan)
	}
}
