package gpx

import (
	"fmt"
	"math"

	"argus-cyclist/internal/domain"

	"github.com/tkrajina/gpxgo/gpx"
)

type Service struct {
	points []domain.RoutePoint
}

func NewService() *Service {
	return &Service{
		points: []domain.RoutePoint{},
	}
}

func (s *Service) LoadAndProcess(filepath string) ([]domain.RoutePoint, error) {
	gpxFile, err := gpx.ParseFile(filepath)
	if err != nil {
		return nil, err
	}

	var processedPoints []domain.RoutePoint
	var totalDist float64
	
	var previousPoint *gpx.GPXPoint 
	firstPoint := true

	processPoint := func(p *gpx.GPXPoint) {
		distDelta := 0.0
		if !firstPoint && previousPoint != nil {
			distDelta = previousPoint.Distance3D(p)
		}
		
		totalDist += distDelta

		processedPoints = append(processedPoints, domain.RoutePoint{
			Latitude:  p.Point.Latitude,
			Longitude: p.Point.Longitude,
			Elevation: p.Elevation.Value(),
			Distance:  totalDist,
			Grade:     0,
		})

		pCopy := *p
		previousPoint = &pCopy
		firstPoint = false
	}

	for _, track := range gpxFile.Tracks {
		for _, segment := range track.Segments {
			for i := range segment.Points {
				processPoint(&segment.Points[i])
			}
		}
	}

	if len(processedPoints) == 0 {
		for _, route := range gpxFile.Routes {
			for i := range route.Points {
				processPoint(&route.Points[i])
			}
		}
	}

	if len(processedPoints) < 2 {
        return nil, fmt.Errorf("the GPX file does not contain valid GPS points")
    }

	s.points = smoothGrades(processedPoints)
	return s.points, nil
}

func (s *Service) GetAllPoints() []domain.RoutePoint {
	return s.points
}

func (s *Service) GetTotalDistance() float64 {
	if len(s.points) == 0 {
		return 0
	}
	return s.points[len(s.points)-1].Distance
}

func (s *Service) GetPointAtDistance(distanceMeter float64) domain.RoutePoint {
	if len(s.points) == 0 {
		return domain.RoutePoint{}
	}

	lastPoint := s.points[len(s.points)-1]
	if distanceMeter >= lastPoint.Distance {
		return lastPoint
	}

	low := 0
	high := len(s.points) - 1

	for low <= high {
		mid := (low + high) / 2
		pMid := s.points[mid]

		if pMid.Distance < distanceMeter {
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	if low >= len(s.points) { return lastPoint }
	if low == 0 { return s.points[0] }

	return s.points[low]
}

func smoothGrades(points []domain.RoutePoint) []domain.RoutePoint {
	windowSize := 5
	count := len(points)

	if count < 2 { return points }

	for i := 0; i < count; i++ {
		start := math.Max(0, float64(i-windowSize))
		end := math.Min(float64(count-1), float64(i+windowSize))

		pStart := points[int(start)]
		pEnd := points[int(end)]

		distDelta := pEnd.Distance - pStart.Distance
		elevDelta := pEnd.Elevation - pStart.Elevation

		if distDelta > 10.0 {
			grade := (elevDelta / distDelta) * 100
			if grade > 25 { grade = 25 }
			if grade < -25 { grade = -25 }
			points[i].Grade = grade
		} else {
			points[i].Grade = 0
		}
	}
	return points
}