package fit

import (
	"context"
	"os"
	"time"

	"argus-cyclist/internal/domain"

	"github.com/muktihari/fit/encoder"
	"github.com/muktihari/fit/profile/mesgdef"
	"github.com/muktihari/fit/profile/typedef"
	"github.com/muktihari/fit/proto"
)

// Constant for converting Degrees to Semicircles (FIT Standard)
const degreesToSemicircles = 2147483648.0 / 180.0

type Service struct {
	records   []*mesgdef.Record
	startTime time.Time
}

func NewService() *Service {
	return &Service{
		records: []*mesgdef.Record{},
	}
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