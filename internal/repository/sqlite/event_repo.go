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

type EventRepo struct {
	state *DBState
}

func NewEventRepository(state *DBState) domain.EventRepository {
	return &EventRepo{state: state}
}

func (r *EventRepo) SaveEventRecord(record domain.EventRecord) error {
	if r.state.EventDB == nil {
		return fmt.Errorf("Event database not initialized")
	}
	return r.state.EventDB.Create(&record).Error
}

func (r *EventRepo) GetTopEventRecords(mode string, limit int) ([]domain.EventRecord, error) {
	var records []domain.EventRecord
	if r.state.EventDB == nil {
		return records, fmt.Errorf("Event database not initialized")
	}

	err := r.state.EventDB.Where("event_mode = ? AND status = ?", mode, "success").
		Order("score desc").
		Limit(limit).
		Find(&records).Error

	return records, err
}

func (r *EventRepo) ResetEventLeaderboard(mode string) error {
	if r.state.EventDB == nil {
		return fmt.Errorf("Event database not initialized")
	}
	if mode == "all" {
		return r.state.EventDB.Exec("DELETE FROM event_records").Error
	}
	return r.state.EventDB.Where("event_mode = ?", mode).Delete(&domain.EventRecord{}).Error
}
