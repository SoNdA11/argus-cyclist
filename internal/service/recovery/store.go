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

// Package recovery persists lightweight snapshots of an in-progress training
// session so the workout can still be finalized after a crash or an
// unexpected shutdown (for example, killing the terminal that hosts
// `wails dev` before clicking "finish session").
//
// A snapshot is made of two files inside a dedicated directory:
//
//   - session_meta.json: atomically rewritten session metadata (start time,
//     route name, active riding time and HR-recovery extras).
//   - session_samples.ndjson: append-only file with one JSON-encoded
//     domain.Telemetry sample per line. Every line is flushed as it is
//     written, so it survives SIGKILL; a partially-written trailing line
//     caused by a hard crash is skipped on load.
package recovery

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"argus-cyclist/internal/domain"
)

const (
	// MetaFileName is the recovery metadata file name.
	MetaFileName = "session_meta.json"
	// SamplesFileName is the append-only telemetry samples file name.
	SamplesFileName = "session_samples.ndjson"
	// SchemaVersion identifies the snapshot layout written by this build.
	SchemaVersion = 1

	// minMeaningfulSeconds and minMeaningfulSamples decide whether a
	// snapshot is worth offering for recovery. Sessions aborted right
	// after starting are silently discarded instead of prompting the user.
	minMeaningfulSeconds = 60.0
	minMeaningfulSamples = 60
)

// ErrNoPending is returned when there is no snapshot to restore.
var ErrNoPending = errors.New("no pending recovery snapshot")

// Meta is the session state needed to finalize an interrupted session.
// Telemetry-derived values (power/HR arrays, totals and FIT records) are
// rebuilt from the sample file, not from the metadata.
type Meta struct {
	Version           int       `json:"version"`
	StartedAt         time.Time `json:"started_at"`
	RouteName         string    `json:"route_name"`
	SessionActiveTime float64   `json:"session_active_time"`
	PeakHR            int       `json:"peak_hr"`
	HRAt1Min          int       `json:"hr_at_1min"`
	HRAt2Min          int       `json:"hr_at_2min"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// Meaningful reports whether the snapshot holds enough data to be worth
// offering for recovery.
func (m Meta) Meaningful(sampleCount int) bool {
	return m.SessionActiveTime >= minMeaningfulSeconds || sampleCount >= minMeaningfulSamples
}

// Store persists recovery snapshots in a directory.
// It is safe for concurrent use.
type Store struct {
	dir    string
	mu     sync.Mutex
	file   *os.File
	active bool
}

// NewStore creates a store rooted at dir. The directory is created lazily
// by Begin.
func NewStore(dir string) *Store {
	return &Store{dir: dir}
}

// Begin starts a fresh snapshot, discarding any previous one.
func (s *Store) Begin(meta Meta) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.closeFile()

	// Remove stale artifacts so a crash between the steps below can never
	// pair fresh metadata with samples from a previous session.
	if err := os.RemoveAll(s.dir); err != nil {
		return err
	}
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return err
	}
	if err := s.writeMetaLocked(meta); err != nil {
		return err
	}
	file, err := os.Create(filepath.Join(s.dir, SamplesFileName))
	if err != nil {
		return err
	}
	s.file = file
	s.active = true
	return nil
}

// AppendSample appends one telemetry sample. It is a no-op when no snapshot
// is active. The line is written with a single unbuffered Write call so it
// survives process termination.
func (s *Store) AppendSample(t domain.Telemetry) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.active || s.file == nil {
		return nil
	}
	line, err := json.Marshal(t)
	if err != nil {
		return err
	}
	line = append(line, '\n')
	_, err = s.file.Write(line)
	return err
}

// UpdateMeta atomically rewrites the metadata file. It is a no-op when no
// snapshot is active.
func (s *Store) UpdateMeta(meta Meta) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.active {
		return nil
	}
	return s.writeMetaLocked(meta)
}

// Pending reports whether a snapshot exists on disk, even when the store
// has not been activated in this process (e.g. after a restart).
func (s *Store) Pending() bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := os.Stat(filepath.Join(s.dir, MetaFileName))
	return err == nil
}

// Load reads the snapshot from disk. Malformed sample lines (for example a
// partially written trailing line left by a hard crash) are skipped.
// It returns ErrNoPending when no snapshot exists.
func (s *Store) Load() (Meta, []domain.Telemetry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	raw, err := os.ReadFile(filepath.Join(s.dir, MetaFileName))
	if errors.Is(err, os.ErrNotExist) {
		return Meta{}, nil, ErrNoPending
	}
	if err != nil {
		return Meta{}, nil, err
	}

	var meta Meta
	if err := json.Unmarshal(raw, &meta); err != nil {
		return Meta{}, nil, fmt.Errorf("corrupted recovery metadata: %w", err)
	}
	if meta.Version != SchemaVersion {
		return Meta{}, nil, fmt.Errorf("unsupported recovery snapshot version %d", meta.Version)
	}

	samples, err := s.loadSamplesLocked()
	if err != nil {
		return Meta{}, nil, err
	}
	return meta, samples, nil
}

// Clear removes the snapshot from disk and deactivates the store.
func (s *Store) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.closeFile()
	s.active = false

	if err := os.RemoveAll(s.dir); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *Store) loadSamplesLocked() ([]domain.Telemetry, error) {
	file, err := os.Open(filepath.Join(s.dir, SamplesFileName))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var samples []domain.Telemetry
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var sample domain.Telemetry
		if err := json.Unmarshal(line, &sample); err != nil {
			// Skip corrupted lines instead of failing the whole snapshot.
			continue
		}
		samples = append(samples, sample)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return samples, nil
}

func (s *Store) writeMetaLocked(meta Meta) error {
	meta.Version = SchemaVersion
	raw, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(s.dir, MetaFileName+".tmp")
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(s.dir, MetaFileName))
}

func (s *Store) closeFile() {
	if s.file != nil {
		s.file.Close()
		s.file = nil
	}
}
