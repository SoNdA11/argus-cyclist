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
package gpx

import (
	"math"

	"argus-cyclist/internal/domain"
)

const (
	courseStep     = 5.0    // m between generated points
	courseStartLat = -23.56 // same anchor as the built-in KOM segment
	courseStartLon = -46.65
	courseStartEle = 760.0
	metersPerDeg   = 111320.0
)

// BuildCourse generates a synthetic event course: raceDistance meters whose grade
// follows the evenly spaced control points in grades (%, linearly interpolated),
// followed by runout meters at the last grade so the rider never reaches the end
// of the route (where the game loop would wrap the distance) while racing.
// The road bends in gentle S-curves so it reads well in the 3D view.
func BuildCourse(raceDistance, runout float64, grades []float64) []domain.RoutePoint {
	if len(grades) == 0 {
		grades = []float64{0}
	}
	total := raceDistance + math.Max(0, runout)
	n := int(math.Ceil(total/courseStep)) + 1
	points := make([]domain.RoutePoint, n)

	gradeAt := func(s float64) float64 {
		if len(grades) == 1 || raceDistance <= 0 {
			return grades[0]
		}
		pos := math.Min(1, s/raceDistance) * float64(len(grades)-1)
		i := int(pos)
		if i >= len(grades)-1 {
			return grades[len(grades)-1]
		}
		t := pos - float64(i)
		return grades[i] + t*(grades[i+1]-grades[i])
	}

	x, z, ele := 0.0, 0.0, courseStartEle
	cosLat := math.Cos(courseStartLat * math.Pi / 180)
	for i := 0; i < n; i++ {
		s := math.Min(float64(i)*courseStep, total)
		if i > 0 {
			ds := s - points[i-1].Distance
			heading := 0.45 * math.Sin(2*math.Pi*s/700) // rad from north; ~26° swings every 700 m
			x += math.Sin(heading) * ds
			z += math.Cos(heading) * ds
			ele += ds * gradeAt(s-ds/2) / 100
		}
		points[i] = domain.RoutePoint{
			Latitude:  courseStartLat + z/metersPerDeg,
			Longitude: courseStartLon + x/(metersPerDeg*cosLat),
			Elevation: ele,
			Distance:  s,
			Grade:     gradeAt(s),
		}
	}
	return points
}
