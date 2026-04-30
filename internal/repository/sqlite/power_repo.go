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
)

type PowerRepo struct {
	state *DBState
}

func NewPowerRepository(state *DBState) domain.PowerRepository {
	return &PowerRepo{state: state}
}

func (r *PowerRepo) GetPowerCurve() []domain.PowerRecord {
	var records []domain.PowerRecord
	if r.state.UserDB == nil {
		return records
	}
	r.state.UserDB.Order("duration ASC").Find(&records)
	return records
}

func (r *PowerRepo) CheckAndUpdateRecord(newRec domain.PowerRecord) bool {
	if r.state.UserDB == nil {
		return false
	}
	var oldRec domain.PowerRecord
	r.state.UserDB.First(&oldRec, newRec.Duration)

	if newRec.Watts > oldRec.Watts {
		r.state.UserDB.Save(&newRec)
		return true
	}
	return false
}

func (r *PowerRepo) GetPowerRecords() ([]domain.PowerRecord, error) {
	var records []domain.PowerRecord
	if r.state.UserDB == nil {
		return records, nil
	}
	err := r.state.UserDB.Order("duration asc").Find(&records).Error
	return records, err
}
