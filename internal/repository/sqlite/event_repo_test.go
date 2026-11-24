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
package sqlite

import (
	"testing"
	"time"

	"argus-cyclist/internal/domain"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newTestEventRepo(t *testing.T) domain.EventRepository {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&domain.EventRecord{}); err != nil {
		t.Fatal(err)
	}
	return NewEventRepository(&DBState{EventDB: db})
}

func TestGetTopEventRecordsBestPerRider(t *testing.T) {
	repo := newTestEventRepo(t)
	base := time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC)
	add := func(name, mode string, score float64, status string, simulated bool, minute int) {
		err := repo.SaveEventRecord(domain.EventRecord{
			RiderName: name, EventMode: mode, Score: score, Status: status,
			IsSimulated: simulated, CreatedAt: base.Add(time.Duration(minute) * time.Minute),
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	add("Ana [F]", "sprint200", 21.4, "success", false, 0)
	add("Ana [F]", "sprint200", 19.9, "success", false, 1)  // Ana's best
	add("ana [F] ", "sprint200", 25.0, "success", false, 2) // same rider, different spelling
	add("Bia [F]", "sprint200", 20.5, "success", false, 3)
	add("Caio [M]", "sprint200", 18.0, "success", true, 4) // simulator: not ranked
	add("Duda [G]", "sprint200", 17.0, "failed", false, 5) // DNF
	add("Edu [M]", "climb400", 10.0, "success", false, 6)  // other mode

	got, err := repo.GetTopEventRecords("sprint200", 10, true, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].RiderName != "Ana [F]" || got[0].Score != 19.9 || got[1].RiderName != "Bia [F]" {
		t.Fatalf("ranking = %+v, want Ana 19.9 then Bia 20.5", got)
	}

	withSim, _ := repo.GetTopEventRecords("sprint200", 10, true, true)
	if len(withSim) != 3 || withSim[0].RiderName != "Caio [M]" {
		t.Fatalf("with simulated = %+v, want Caio first", withSim)
	}

	// Descending modes (points) keep the highest score per rider.
	add("Ana [F]", "timeTrial", 40, "success", false, 7)
	add("Ana [F]", "timeTrial", 55, "success", false, 8)
	desc, _ := repo.GetTopEventRecords("timeTrial", 10, false, false)
	if len(desc) != 1 || desc[0].Score != 55 {
		t.Fatalf("descending ranking = %+v, want Ana 55", desc)
	}

	if top1, _ := repo.GetTopEventRecords("sprint200", 1, true, false); len(top1) != 1 {
		t.Fatalf("limit 1 returned %d records", len(top1))
	}
}
