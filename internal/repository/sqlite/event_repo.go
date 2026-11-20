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
	"strings"
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

func (r *EventRepo) GetTopEventRecords(mode string, limit int, ascending, includeSimulated bool) ([]domain.EventRecord, error) {
	var records []domain.EventRecord
	if r.state.EventDB == nil {
		return records, fmt.Errorf("Event database not initialized")
	}

	order := "score desc, created_at asc"
	if ascending {
		order = "score asc, created_at asc"
	}
	q := r.state.EventDB.Where("event_mode = ? AND status = ?", mode, "success")
	if !includeSimulated {
		q = q.Where("is_simulated = ?", false)
	}
	if err := q.Order(order).Find(&records).Error; err != nil {
		return records, err
	}
	return BestPerRider(records, limit), nil
}

// BestPerRider keeps the first (best) record of each rider from an already ranked
// list, up to limit entries (limit <= 0 keeps all).
func BestPerRider(ranked []domain.EventRecord, limit int) []domain.EventRecord {
	seen := make(map[string]bool, len(ranked))
	best := make([]domain.EventRecord, 0, len(ranked))
	for _, rec := range ranked {
		key := strings.ToLower(strings.TrimSpace(rec.RiderName))
		if seen[key] {
			continue
		}
		seen[key] = true
		best = append(best, rec)
		if limit > 0 && len(best) == limit {
			break
		}
	}
	return best
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

func (r *EventRepo) GetRaceHistory(riderName string) ([]domain.EventRecord, error) {
	var records []domain.EventRecord
	if r.state.EventDB == nil {
		return records, fmt.Errorf("Event database not initialized")
	}

	err := r.state.EventDB.Where("rider_name = ?", riderName).
		Order("created_at desc").
		Limit(50).
		Find(&records).Error

	return records, err
}

func (r *EventRepo) GetEventRecordsByID(ids []uint) ([]domain.EventRecord, error) {
	var records []domain.EventRecord
	if r.state.EventDB == nil {
		return records, fmt.Errorf("Event database not initialized")
	}

	err := r.state.EventDB.Where("id IN ?", ids).Find(&records).Error
	return records, err
}

func (r *EventRepo) UpdateEventRecordStatus(id uint, uploaded bool) error {
	if r.state.EventDB == nil {
		return fmt.Errorf("Event database not initialized")
	}
	return r.state.EventDB.Model(&domain.EventRecord{}).Where("id = ?", id).Update("uploaded_to_strava", uploaded).Error
}

func (r *EventRepo) DeleteEventRecord(id uint) error {
	if r.state.EventDB == nil {
		return fmt.Errorf("Event database not initialized")
	}
	return r.state.EventDB.Delete(&domain.EventRecord{}, id).Error
}
