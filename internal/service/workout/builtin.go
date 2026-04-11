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

package workout

import (
	"argus-cyclist/internal/domain"
)

func GetBuiltInAssessments() []domain.ActiveWorkout {
	return []domain.ActiveWorkout{
		createRampTest(),
		create20MinFTPTest(),
		create5MinVO2MaxTest(),
	}
}

func createRampTest() domain.ActiveWorkout {
	segments := []domain.WorkoutSegment{
		{Index: 0, Type: "Warmup", DurationSeconds: 300, StartFactor: 0.50, EndFactor: 0.50, Text: "Warmup: Spin easy", FreeRide: false},
	}

	idx := 1
	for p := 0.56; p <= 1.50; p += 0.06 {
		segments = append(segments, domain.WorkoutSegment{
			Index:           idx,
			Type:            "Active",
			DurationSeconds: 60,
			StartFactor:     p,
			EndFactor:       p,
			Text:            "Hold target power!",
			FreeRide:        false,
		})
		idx++
	}

	return domain.ActiveWorkout{
		Metadata: domain.ZWOFile{
			Name:        "Ramp Test (FTP)",
			Description: "Incremental test to exhaustion. Resistance increases every minute. FTP = 75% of best 1-minute power.",
			Author:      "Argus Cyclist",
		},
		IsTest:        true,
		TestType:      "ramp",
		Segments:      segments,
		TotalDuration: 300 + ((idx - 1) * 60),
	}
}

func create20MinFTPTest() domain.ActiveWorkout {
	segments := []domain.WorkoutSegment{
		{Index: 0, Type: "Warmup", DurationSeconds: 1200, StartFactor: 0.50, EndFactor: 0.70, Text: "Progressive warmup", FreeRide: false},
		{Index: 1, Type: "Active", DurationSeconds: 300, StartFactor: 1.10, EndFactor: 1.10, Text: "Clearing effort: Wake up your legs!", FreeRide: false},
		{Index: 2, Type: "Rest", DurationSeconds: 600, StartFactor: 0.50, EndFactor: 0.50, Text: "Recover for the test", FreeRide: false},
		{Index: 3, Type: "Active", DurationSeconds: 1200, StartFactor: 1.05, EndFactor: 1.05, Text: "20 MIN TEST: Find your pace!", FreeRide: true},
		{Index: 4, Type: "Cooldown", DurationSeconds: 600, StartFactor: 0.50, EndFactor: 0.40, Text: "Cooldown", FreeRide: false},
	}

	return domain.ActiveWorkout{
		Metadata: domain.ZWOFile{
			Name:        "20-Min FTP Test",
			Description: "Hunter Allen/Coggan protocol. Includes activation and 20 minutes free riding. FTP = 95% of average power.",
			Author:      "Argus Cyclist",
		},
		IsTest:        true,
		TestType:      "ftp20",
		Segments:      segments,
		TotalDuration: 3900,
	}
}

func create5MinVO2MaxTest() domain.ActiveWorkout {
	segments := []domain.WorkoutSegment{
		{Index: 0, Type: "Warmup", DurationSeconds: 900, StartFactor: 0.60, EndFactor: 0.60, Text: "Easy spin", FreeRide: false},
		{Index: 1, Type: "Active", DurationSeconds: 60, StartFactor: 1.15, EndFactor: 1.15, Text: "High cadence", FreeRide: false},
		{Index: 2, Type: "Rest", DurationSeconds: 60, StartFactor: 0.50, EndFactor: 0.50, Text: "Recover", FreeRide: false},
		{Index: 3, Type: "Active", DurationSeconds: 60, StartFactor: 1.15, EndFactor: 1.15, Text: "High cadence", FreeRide: false},
		{Index: 4, Type: "Rest", DurationSeconds: 60, StartFactor: 0.50, EndFactor: 0.50, Text: "Recover", FreeRide: false},
		{Index: 5, Type: "Active", DurationSeconds: 60, StartFactor: 1.15, EndFactor: 1.15, Text: "Final effort", FreeRide: false},
		{Index: 6, Type: "Rest", DurationSeconds: 300, StartFactor: 0.50, EndFactor: 0.50, Text: "Get ready", FreeRide: false},
		{Index: 7, Type: "Active", DurationSeconds: 300, StartFactor: 1.20, EndFactor: 1.20, Text: "VO2 MAX TEST: 5 MIN ALL OUT!", FreeRide: true},
		{Index: 8, Type: "Cooldown", DurationSeconds: 600, StartFactor: 0.40, EndFactor: 0.40, Text: "Cooldown", FreeRide: false},
	}

	return domain.ActiveWorkout{
		Metadata: domain.ZWOFile{
			Name:        "5-Min VO2Max (MAP) Test",
			Description: "Measures your Maximum Aerobic Power (MAP) based on the Hunter Allen protocol.",
			Author:      "Argus Cyclist",
		},
		IsTest:        true,
		TestType:      "vo2max5",
		Segments:      segments,
		TotalDuration: 2400,
	}
}
