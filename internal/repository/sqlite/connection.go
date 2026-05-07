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
	"os"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// DBState holds the active database connections.
type DBState struct {
	MasterDB *gorm.DB
	UserDB   *gorm.DB
	EventDB  *gorm.DB
}

type ConnectionManager struct {
	state *DBState
}

func NewDBState() *DBState {
	masterPath := "argus_master.db"
	db, err := gorm.Open(sqlite.Open(masterPath), &gorm.Config{})
	if err != nil {
		panic("failed to connect to master database")
	}

	err = db.AutoMigrate(&domain.LocalAccount{})
	if err != nil {
		fmt.Println("Error migrating master DB:", err)
	}

	eventDbPath := "events_ranking.db"
	eventDB, err := gorm.Open(sqlite.Open(eventDbPath), &gorm.Config{})
	if err != nil {
		fmt.Println("Error opening event DB:", err)
	} else {
		eventDB.AutoMigrate(&domain.EventRecord{})
	}

	return &DBState{MasterDB: db, UserDB: nil, EventDB: eventDB}
}

func NewConnectionManager(state *DBState) domain.ConnectionManager {
	return &ConnectionManager{state: state}
}

func (s *ConnectionManager) LoadUserDatabase(userID string) error {
	if _, err := os.Stat("users_data"); os.IsNotExist(err) {
		err = os.MkdirAll("users_data", os.ModePerm)
		if err != nil {
			return fmt.Errorf("Failed to create users_data directory: %v", err)
		}
	}

	dbPath := fmt.Sprintf("users_data/argus_data_%s.db", userID)
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		return fmt.Errorf("Failed to open SQLite database: %v", err)
	}

	err = db.AutoMigrate(&domain.UserProfile{}, &domain.Activity{}, &domain.PowerRecord{}, &domain.SyncQueue{})
	if err != nil {
		return fmt.Errorf("Table migration failed: %v", err)
	}

	var count int64
	db.Model(&domain.UserProfile{}).Count(&count)
	if count == 0 {
		db.Create(&domain.UserProfile{
			Name:       "New Rider",
			Weight:     75.0,
			BikeWeight: 9.0,
			FTP:        200,
			Units:      "metric",
			Level:      1,
		})
	}

	defaultIntervals := []int{1, 5, 15, 30, 60, 300, 600, 1200}
	for _, duration := range defaultIntervals {
		db.Model(&domain.PowerRecord{}).Where("duration = ?", duration).Count(&count)
		if count == 0 {
			db.Create(&domain.PowerRecord{Duration: duration, Watts: 0, Wkg: 0, Date: time.Now()})
		}
	}

	s.state.UserDB = db
	return nil
}

func (s *ConnectionManager) GetProfilesSummary() []domain.ProfileSummary {
	var accounts []domain.LocalAccount
	s.state.MasterDB.Order("created_at asc").Find(&accounts)

	var summaries []domain.ProfileSummary

	for _, acc := range accounts {
		summary := domain.ProfileSummary{
			ID:        acc.ID,
			Name:      acc.Name,
			Avatar:    acc.Avatar,
			Level:     1,
			TotalKm:   0,
			TotalTime: 0,
		}

		dbPath := fmt.Sprintf("users_data/argus_data_%s.db", acc.ID)
		db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
		if err == nil {
			var user domain.UserProfile
			db.First(&user)
			if user.Level > 0 {
				summary.Level = user.Level
			}

			var dist *float64
			db.Model(&domain.Activity{}).Select("sum(total_distance)").Scan(&dist)
			if dist != nil {
				summary.TotalKm = *dist / 1000.0
			}

			var dur *int64
			db.Model(&domain.Activity{}).Select("sum(duration)").Scan(&dur)
			if dur != nil {
				summary.TotalTime = *dur
			}

			var elev *float64
			db.Model(&domain.Activity{}).Select("sum(elevation_gain)").Scan(&elev)
			if elev != nil {
				summary.TotalElevation = *elev
			}
		}

		summaries = append(summaries, summary)
	}

	return summaries
}

func (s *ConnectionManager) GetLocalAccounts() []domain.LocalAccount {
	var accounts []domain.LocalAccount
	s.state.MasterDB.Order("created_at asc").Find(&accounts)
	return accounts
}

func (s *ConnectionManager) CreateLocalAccount(acc domain.LocalAccount) error {
	return s.state.MasterDB.Create(&acc).Error
}

func (s *ConnectionManager) DeleteLocalAccount(id string) error {
	if err := s.state.MasterDB.Where("id = ?", id).Delete(&domain.LocalAccount{}).Error; err != nil {
		return fmt.Errorf("failed to delete account from master db: %v", err)
	}

	dbPath := fmt.Sprintf("users_data/argus_data_%s.db", id)
	if err := os.Remove(dbPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete database file: %v", err)
	}
	return nil
}
