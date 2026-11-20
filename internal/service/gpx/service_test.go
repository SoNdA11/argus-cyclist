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
	"testing"

	"argus-cyclist/internal/domain"
)

func TestGetPointAtDistanceInterpolatesGrade(t *testing.T) {
	s := NewService()
	s.SetPoints([]domain.RoutePoint{
		{Latitude: 0, Longitude: 0, Elevation: 0, Distance: 0, Grade: 2},
		{Latitude: 0, Longitude: 0.001, Elevation: 10, Distance: 100, Grade: 6},
		{Latitude: 0, Longitude: 0.002, Elevation: 10, Distance: 200, Grade: 0},
	})

	cases := []struct {
		dist, grade, elevation float64
	}{
		{0, 2, 0},
		{25, 3, 2.5},
		{50, 4, 5},
		{100, 6, 10},
		{150, 3, 10},
		{250, 0, 10}, // past the end clamps to the last point
	}
	for _, c := range cases {
		p := s.GetPointAtDistance(c.dist)
		if math.Abs(p.Grade-c.grade) > 1e-9 || math.Abs(p.Elevation-c.elevation) > 1e-9 {
			t.Errorf("dist %.0f: got grade %.3f elevation %.3f, want %.3f / %.3f", c.dist, p.Grade, p.Elevation, c.grade, c.elevation)
		}
	}
}

func TestBuildCourse(t *testing.T) {
	pts := BuildCourse(400, 300, []float64{2, 6})
	last := pts[len(pts)-1]
	if math.Abs(last.Distance-700) > 1e-9 {
		t.Fatalf("course length %.1f m, want 700 (race + runout)", last.Distance)
	}
	for i := 1; i < len(pts); i++ {
		if pts[i].Distance <= pts[i-1].Distance {
			t.Fatalf("distances not increasing at %d", i)
		}
	}
	s := NewService()
	s.SetPoints(pts)
	if g := s.GetPointAtDistance(0).Grade; math.Abs(g-2) > 1e-9 {
		t.Errorf("grade at start %.2f, want 2", g)
	}
	if g := s.GetPointAtDistance(200).Grade; math.Abs(g-4) > 0.01 {
		t.Errorf("grade at mid race %.2f, want 4", g)
	}
	if g := s.GetPointAtDistance(650).Grade; math.Abs(g-6) > 1e-9 {
		t.Errorf("grade in the runout %.2f, want 6 (last grade)", g)
	}
	// Elevation gain over the race ≈ mean grade (4%) × 400 m.
	gain := s.GetPointAtDistance(400).Elevation - pts[0].Elevation
	if math.Abs(gain-16) > 0.5 {
		t.Errorf("elevation gain over the race %.2f m, want ~16", gain)
	}
	if flat := BuildCourse(200, 0, nil); flat[len(flat)-1].Elevation != flat[0].Elevation {
		t.Error("course without grades should be flat")
	}
}
