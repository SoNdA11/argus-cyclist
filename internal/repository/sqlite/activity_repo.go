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

type ActivityRepo struct {
	state *DBState
}

func NewActivityRepository(state *DBState) domain.ActivityRepository {
	return &ActivityRepo{state: state}
}

func (r *ActivityRepo) SaveActivity(a domain.Activity) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("No user loaded")
	}
	return r.state.UserDB.Create(&a).Error
}

func (r *ActivityRepo) GetRecentActivities(limit int) ([]domain.Activity, error) {
	var activities []domain.Activity
	if r.state.UserDB == nil {
		return activities, nil
	}

	query := r.state.UserDB.Order("created_at desc")
	if limit > 0 {
		query = query.Limit(limit)
	}

	result := query.Find(&activities)
	return activities, result.Error
}

func (r *ActivityRepo) GetTotalDistance() float64 {
	var total *float64
	if r.state.UserDB == nil {
		return 0
	}

	r.state.UserDB.Model(&domain.Activity{}).Select("sum(total_distance)").Scan(&total)
	if total == nil {
		return 0
	}
	return *total
}

func (r *ActivityRepo) GetTotalDuration() int64 {
	var total *int64
	if r.state.UserDB == nil {
		return 0
	}
	r.state.UserDB.Model(&domain.Activity{}).Select("sum(duration)").Scan(&total)
	if total == nil {
		return 0
	}
	return *total
}

func (r *ActivityRepo) GetActivitiesByMonth(monthStr string) ([]domain.Activity, error) {
	var activities []domain.Activity
	if r.state.UserDB == nil {
		return activities, nil
	}
	err := r.state.UserDB.Where("strftime('%Y-%m', created_at) = ?", monthStr).Order("created_at asc").Find(&activities).Error
	return activities, err
}

func (r *ActivityRepo) GetAllActivities() ([]domain.Activity, error) {
	var activities []domain.Activity
	if r.state.UserDB == nil {
		return activities, nil
	}
	err := r.state.UserDB.Order("created_at asc").Find(&activities).Error
	return activities, err
}

func (r *ActivityRepo) GetActivityByID(id uint) (domain.Activity, error) {
	var activity domain.Activity
	if r.state.UserDB == nil {
		return activity, fmt.Errorf("no db")
	}
	err := r.state.UserDB.First(&activity, id).Error
	return activity, err
}

func (r *ActivityRepo) DeleteActivity(id uint) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("no db")
	}
	return r.state.UserDB.Delete(&domain.Activity{}, id).Error
}

func (r *ActivityRepo) UpdateActivityStatus(id uint, uploaded bool) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("no user database loaded")
	}
	return r.state.UserDB.Model(&domain.Activity{}).Where("id = ?", id).Update("uploaded_to_strava", uploaded).Error
}
