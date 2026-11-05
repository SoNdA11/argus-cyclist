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

package main

import (
	"testing"
	"time"

	"argus-cyclist/internal/domain"
)

func TestXPForLevelIsInverseOfCalculateLevel(t *testing.T) {
	if XPForLevel(1) != 0 || XPForLevel(2) != 500 {
		t.Fatalf("XPForLevel(1,2) = %d, %d; want 0, 500", XPForLevel(1), XPForLevel(2))
	}
	for l := 2; l <= 200; l++ {
		xp := XPForLevel(l)
		if got := CalculateLevel(xp); got != l {
			t.Errorf("CalculateLevel(XPForLevel(%d)=%d) = %d", l, xp, got)
		}
		if got := CalculateLevel(xp - 1); got != l-1 {
			t.Errorf("CalculateLevel(XPForLevel(%d)-1) = %d, want %d", l, got, l-1)
		}
	}
}

func TestRepairLevelProgress(t *testing.T) {
	// The reported profile: level 11 reached, XP drained to 1224 (= level 2).
	p := domain.UserProfile{Level: 11, CurrentXP: 1224}
	if !repairLevelProgress(&p) || p.Level != 11 || p.CurrentXP != XPForLevel(11) {
		t.Errorf("drained profile → level %d, %d XP; want 11, %d", p.Level, p.CurrentXP, XPForLevel(11))
	}
	// Healthy profile: untouched.
	p = domain.UserProfile{Level: 3, CurrentXP: 2000}
	if repairLevelProgress(&p) || p.Level != 3 || p.CurrentXP != 2000 {
		t.Errorf("healthy profile changed: %+v", p)
	}
	// Level behind the XP (never lowered, only raised).
	p = domain.UserProfile{Level: 2, CurrentXP: XPForLevel(5)}
	if !repairLevelProgress(&p) || p.Level != 5 {
		t.Errorf("level behind XP → level %d, want 5", p.Level)
	}
}

// The frontend used to send its own copy of level / current_xp on every
// profile save. They must not overwrite the values owned by the backend.
func TestUpdateUserProfileKeepsLevelAndXP(t *testing.T) {
	t.Chdir(t.TempDir())
	app := NewApp()
	if err := app.storageService.LoadUserDatabase("xp-test"); err != nil {
		t.Fatalf("loading user database: %v", err)
	}
	if err := app.storageService.UpdateProfile(domain.UserProfile{ID: 1, Name: "Rider", FTP: 200, Level: 11, CurrentXP: 25000}); err != nil {
		t.Fatalf("seeding profile: %v", err)
	}

	// what the old frontend sent after a ride: level from the finish modal, XP lost
	app.UpdateUserProfile(domain.UserProfile{Name: "Rider", FTP: 210, Level: 2, CurrentXP: 0})

	p := app.GetUserProfile()
	if p.Level != 11 || p.CurrentXP != 25000 {
		t.Errorf("after frontend save: level %d, %d XP; want 11, 25000", p.Level, p.CurrentXP)
	}
	if p.FTP != 210 {
		t.Errorf("FTP = %d, want 210 (the rest of the profile is still saved)", p.FTP)
	}

	// A finished ride adds to the cumulative XP and reports it.
	res := app.ProcessGamification(domain.Activity{Duration: 3600, TotalDistance: 30000, ElevationGain: 100, CreatedAt: time.Now()})
	p = app.GetUserProfile()
	if p.CurrentXP < 25000+1800+300+200 {
		t.Errorf("XP after ride = %d, want at least %d", p.CurrentXP, 25000+1800+300+200)
	}
	if res.NewXP != p.CurrentXP || res.NewLevel != p.Level || res.NewLevel < 11 {
		t.Errorf("result new_xp %d / new_level %d, stored %d / %d", res.NewXP, res.NewLevel, p.CurrentXP, p.Level)
	}
	if res.LevelXP != XPForLevel(res.NewLevel) || res.NextLevelXP != XPForLevel(res.NewLevel+1) {
		t.Errorf("bar bounds %d..%d, want %d..%d", res.LevelXP, res.NextLevelXP, XPForLevel(res.NewLevel), XPForLevel(res.NewLevel+1))
	}
}
