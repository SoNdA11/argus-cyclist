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
	"argus-cyclist/internal/domain"
	"fmt"
)

type UserRepo struct {
	state *DBState
}

func NewUserRepository(state *DBState) domain.UserRepository {
	return &UserRepo{state: state}
}

func (r *UserRepo) GetProfile() (domain.UserProfile, error) {
	var user domain.UserProfile
	if r.state.UserDB == nil {
		return user, fmt.Errorf("User database not loaded")
	}

	result := r.state.UserDB.First(&user)
	return user, result.Error
}

func (r *UserRepo) UpdateProfile(u domain.UserProfile) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("User database not loaded")
	}

	var existing domain.UserProfile
	if err := r.state.UserDB.First(&existing).Error; err == nil {
		if u.StravaAccessToken == "" {
			u.StravaAccessToken = existing.StravaAccessToken
			u.StravaRefreshToken = existing.StravaRefreshToken
			u.StravaExpiresAt = existing.StravaExpiresAt
		}
		if u.CurrentStreak == 0 {
			u.CurrentStreak = existing.CurrentStreak
		}
		if u.LastWorkoutDate.IsZero() {
			u.LastWorkoutDate = existing.LastWorkoutDate
		}
		if u.Theme == "" {
			u.Theme = existing.Theme
		}
		if u.TotalCoins == 0 {
			u.TotalCoins = existing.TotalCoins
		}
		if u.CreatedAt.IsZero() {
			u.CreatedAt = existing.CreatedAt
		}
	}

	// Always enforce ID 1 since it's an isolated DB per user
	u.ID = 1
	return r.state.UserDB.Save(&u).Error
}

func (r *UserRepo) ClearStravaTokens() error {
	if r.state.UserDB == nil {
		return fmt.Errorf("User database not loaded")
	}

	err := r.state.UserDB.Model(&domain.UserProfile{}).Where("id = ?", 1).Updates(map[string]interface{}{
		"strava_access_token":  "",
		"strava_refresh_token": "",
		"strava_expires_at":    0,
	}).Error

	return err
}

func (r *UserRepo) SaveSyncQueue(item domain.SyncQueue) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("User database not loaded")
	}
	return r.state.UserDB.Create(&item).Error
}

func (r *UserRepo) GetActiveGoals() []domain.CustomGoal {
	var goals []domain.CustomGoal
	if r.state.UserDB != nil {
		r.state.UserDB.Where("status = ?", "active").Find(&goals)
	}
	return goals
}

func (r *UserRepo) SaveGoal(g domain.CustomGoal) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("User database not loaded")
	}
	return r.state.UserDB.Save(&g).Error
}

func (r *UserRepo) GetUserBadges() []domain.UserBadge {
	var badges []domain.UserBadge
	if r.state.UserDB != nil {
		r.state.UserDB.Find(&badges)
	}
	return badges
}

func (r *UserRepo) SaveBadge(b domain.UserBadge) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("User database not loaded")
	}
	return r.state.UserDB.Save(&b).Error
}
func (r *UserRepo) GetAllGoals() []domain.CustomGoal {
	var goals []domain.CustomGoal
	if r.state.UserDB != nil {
		r.state.UserDB.Find(&goals)
	}
	return goals
}

func (r *UserRepo) DeleteGoal(id uint) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("User database not loaded")
	}
	return r.state.UserDB.Delete(&domain.CustomGoal{}, id).Error
}
