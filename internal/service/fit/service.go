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
	"context"
	"fmt"
	"os"
	"time"

	"argus-cyclist/internal/domain"

	"github.com/muktihari/fit/decoder"
	"github.com/muktihari/fit/encoder"
	"github.com/muktihari/fit/profile/mesgdef"
	"github.com/muktihari/fit/profile/typedef"
	"github.com/muktihari/fit/profile/untyped/mesgnum"
	"github.com/muktihari/fit/proto"
)

// Constant for converting Degrees to Semicircles (FIT Standard)
const degreesToSemicircles = 2147483648.0 / 180.0

type Service struct {
	records   []*mesgdef.Record
	startTime time.Time
}

type ActivityDetails struct {
	Time      []string  `json:"time"`
	Power     []int     `json:"power"`
	HeartRate []int     `json:"hr"`
	Cadence   []int     `json:"cadence"`
	Distance  []float64 `json:"distance"`
	Elevation []float64 `json:"elevation"`
}

func NewService() *Service {
	return &Service{
		records: []*mesgdef.Record{},
	}
}

// GetRecordCount returns the number of telemetry records stored.
func (s *Service) GetRecordCount() int {
	return len(s.records)
}

// StartSession marks the beginning of the workout
func (s *Service) StartSession(startTime time.Time) {
	s.startTime = startTime
	s.records = []*mesgdef.Record{} // Clears previous records
}

// AddRecord converts app telemetry to FIT binary format
func (s *Service) AddRecord(t domain.Telemetry) {
	// 1. Lat/Lon: Degrees -> Semicircles
	lat := int32(t.Latitude * degreesToSemicircles)
	lon := int32(t.Longitude * degreesToSemicircles)

	// 2. Speed: km/h -> mm/s
	speedMps := t.Speed / 3.6
	scaledSpeed := uint32(speedMps * 1000)

	// 3. Distance: Meters -> cm
	scaledDist := uint32(t.TotalDistance * 100)

	// 4. Altitude: Meters -> (Meters + 500) * 5 (Scale 5, Offset 500)
	// NOW WE USE THE REAL ALTITUDE FROM TELEMETRY
	// The 500m offset allows for negative values (e.g., geographic depression) without breaking uint32
	scaledAlt := uint32((t.Altitude + 500.0) * 5.0)

	record := &mesgdef.Record{
		Timestamp:        t.Timestamp,
		PositionLat:      lat,
		PositionLong:     lon,
		Distance:         scaledDist,
		EnhancedSpeed:    scaledSpeed,
		Power:            uint16(t.Power),
		HeartRate:        t.HeartRate,
		Cadence:          t.Cadence,
		EnhancedAltitude: scaledAlt,
	}

	s.records = append(s.records, record)
}

// Save finalizes the file, calculates session totals, and writes to disk
func (s *Service) Save(filepath string) error {
	f, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer f.Close()

	// 1. Creates the encoder
	enc := encoder.New(f)

	// 2. Creates the FIT container structure
	fit := proto.FIT{}

	// 3. File Header (File ID)
	fileIdMesg := mesgdef.FileId{
		Type:         typedef.FileActivity,
		Manufacturer: typedef.ManufacturerDevelopment,
		Product:      0,
		SerialNumber: 12345,
		TimeCreated:  s.startTime,
	}

	// Converts to generic message and adds it
	fit.Messages = append(fit.Messages, fileIdMesg.ToMesg(nil))

	// 4. Adds Records (Second-by-second data)
	for _, rec := range s.records {
		fit.Messages = append(fit.Messages, rec.ToMesg(nil))
	}

	// 5. Calculations for Summary
	totalTime := time.Since(s.startTime).Seconds()
	avgPower := calculateAvgPower(s.records)
	lastDist := getLastDistance(s.records)

	// 6. Event Message (Timer StopAll)
	eventMesg := mesgdef.Event{
		Timestamp: time.Now(),
		Event:     typedef.EventTimer,
		EventType: typedef.EventTypeStopAll,
	}
	fit.Messages = append(fit.Messages, eventMesg.ToMesg(nil))

	// 7. Lap Message
	lapMesg := mesgdef.Lap{
		Timestamp:        time.Now(),
		StartTime:        s.startTime,
		TotalElapsedTime: uint32(totalTime * 1000), // ms
		TotalTimerTime:   uint32(totalTime * 1000), // ms
		TotalDistance:    lastDist,
		AvgPower:         avgPower,
		Event:            typedef.EventLap,
		EventType:        typedef.EventTypeStop,
	}
	fit.Messages = append(fit.Messages, lapMesg.ToMesg(nil))

	// 8. Session Message (Final Summary)
	sessionMesg := mesgdef.Session{
		Timestamp:        time.Now(),
		StartTime:        s.startTime,
		TotalElapsedTime: uint32(totalTime * 1000), // ms
		TotalTimerTime:   uint32(totalTime * 1000), // ms
		TotalDistance:    lastDist,
		AvgPower:         avgPower,
		Sport:            typedef.SportCycling,
		SubSport:         typedef.SubSportVirtualActivity,
		Event:            typedef.EventSession,
		EventType:        typedef.EventTypeStop,
		Trigger:          typedef.SessionTriggerActivityEnd,
	}
	fit.Messages = append(fit.Messages, sessionMesg.ToMesg(nil))

	// 9. Writes everything to disk
	if err := enc.Encode(&fit); err != nil {
		return err
	}

	return nil
}

// MergeFiles combines multiple FIT files into a single one
func (s *Service) MergeFiles(inputPaths []string, outputPath string) error {
	if len(inputPaths) == 0 {
		return fmt.Errorf("no input files provided")
	}

	allRecords := []*mesgdef.Record{}
	var firstStartTime time.Time
	var totalDistance uint32 = 0

	for _, path := range inputPaths {
		file, err := os.Open(path)
		if err != nil {
			continue
		}
		
		dec := decoder.New(file)
		fitFile, err := dec.Decode()
		file.Close()
		if err != nil {
			continue
		}

		var fileStartTime time.Time
		fileRecords := []*mesgdef.Record{}

		for _, msg := range fitFile.Messages {
			if msg.Num == mesgnum.FileId {
				fid := mesgdef.NewFileId(&msg)
				fileStartTime = fid.TimeCreated
			}
			if msg.Num == mesgnum.Record {
				rec := mesgdef.NewRecord(&msg)
				fileRecords = append(fileRecords, rec)
			}
		}

		if firstStartTime.IsZero() {
			firstStartTime = fileStartTime
		}

		// Adjust distance to be continuous
		for _, rec := range fileRecords {
			// Offset the distance by the previous total
			rec.Distance += totalDistance
			allRecords = append(allRecords, rec)
		}

		if len(fileRecords) > 0 {
			totalDistance = fileRecords[len(fileRecords)-1].Distance
		}
	}

	if len(allRecords) == 0 {
		return fmt.Errorf("no records found in input files")
	}

	oldRecords := s.records
	oldStartTime := s.startTime
	
	s.records = allRecords
	s.startTime = firstStartTime
	
	err := s.Save(outputPath)
	
	// Restore state
	s.records = oldRecords
	s.startTime = oldStartTime
	
	return err
}

// Helpers

func calculateAvgPower(records []*mesgdef.Record) uint16 {
	if len(records) == 0 {
		return 0
	}
	var sum uint64
	for _, r := range records {
		sum += uint64(r.Power)
	}
	return uint16(sum / uint64(len(records)))
}

func getLastDistance(records []*mesgdef.Record) uint32 {
	if len(records) == 0 {
		return 0
	}
	return records[len(records)-1].Distance
}

// Validate implements the interface needed for some consumers (boilerplate)
func (s *Service) Validate(ctx context.Context) error {
	return nil
}

func (s *Service) ParseActivity(filePath string) (ActivityDetails, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return ActivityDetails{}, err
	}
	defer file.Close()

	dec := decoder.New(file)
	fitFile, err := dec.Decode()
	if err != nil {
		return ActivityDetails{}, err
	}

	details := ActivityDetails{
		Time:      []string{},
		Power:     []int{},
		HeartRate: []int{},
		Cadence:   []int{},
		Distance:  []float64{},
		Elevation: []float64{},
	}

	var startTime time.Time

	for _, msg := range fitFile.Messages {
		if msg.Num == mesgnum.Record {
			record := mesgdef.NewRecord(&msg)

			if startTime.IsZero() {
				startTime = record.Timestamp
			}
			elapsed := record.Timestamp.Sub(startTime)
			totalSecs := int(elapsed.Seconds())

			m := totalSecs / 60
			s := totalSecs % 60
			details.Time = append(details.Time, fmt.Sprintf("%02d:%02d", m, s))

			details.Power = append(details.Power, int(record.Power))
			details.HeartRate = append(details.HeartRate, int(record.HeartRate))
			details.Cadence = append(details.Cadence, int(record.Cadence))

			distMeters := float64(record.Distance) / 100.0
			details.Distance = append(details.Distance, distMeters)

			altMeters := 0.0
			if record.EnhancedAltitude != 4294967295 && record.EnhancedAltitude > 0 {
				altMeters = (float64(record.EnhancedAltitude) / 5.0) - 500.0
			} else if record.Altitude != 65535 && record.Altitude > 0 {
				altMeters = (float64(record.Altitude) / 5.0) - 500.0
			}
			details.Elevation = append(details.Elevation, altMeters)
		}
	}

	return details, nil
}
