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

package storage

import (
	"argus-cyclist/internal/domain"
	"fmt"
	"os"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// LocalAccount represents a user profile in the master database
type LocalAccount struct {
	ID        string    `json:"id" gorm:"primaryKey"`
	Name      string    `json:"name"`
	Avatar    string    `json:"avatar"`
	CreatedAt time.Time `json:"created_at"`
}

type PowerRecord struct {
	Duration int       `json:"duration" gorm:"primaryKey"`
	Watts    int       `json:"watts"`
	Wkg      float64   `json:"wkg"`
	Date     time.Time `json:"date"`
}

// ProfileSummary contains the master account info plus stats from the isolated DB
type ProfileSummary struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Avatar    string  `json:"avatar"`
	Level     int     `json:"level"`
	TotalKm   float64 `json:"total_km"`
	TotalTime int64   `json:"total_time"`
}

// Service encapsulates all database operations.
// It manages the master DB (accounts) and the isolated user DB.
type Service struct {
	masterDB *gorm.DB
	userDB   *gorm.DB
}

// NewService initializes the master database connection.
func NewService() *Service {
	masterPath := "argus_master.db"

	db, err := gorm.Open(sqlite.Open(masterPath), &gorm.Config{})
	if err != nil {
		panic("failed to connect to master database")
	}

	// Migrate the LocalAccount table in the master DB
	err = db.AutoMigrate(&LocalAccount{})
	if err != nil {
		fmt.Println("Error migrating master DB:", err)
	}

	return &Service{masterDB: db, userDB: nil}
}

// ====================
// MASTER DB (PROFILES)
// ====================

// GetLocalAccounts returns all registered local profiles.
func (s *Service) GetLocalAccounts() []LocalAccount {
	var accounts []LocalAccount
	s.masterDB.Order("created_at asc").Find(&accounts)
	return accounts
}

// CreateLocalAccount registers a new profile in the master DB.
func (s *Service) CreateLocalAccount(acc LocalAccount) error {
	return s.masterDB.Create(&acc).Error
}

// LoadUserDatabase connects to the isolated database for a specific user.
func (s *Service) LoadUserDatabase(userID string) error {
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

	// Migrate user-specific tables
	err = db.AutoMigrate(&domain.UserProfile{}, &domain.Activity{}, &PowerRecord{})
	if err != nil {
		return fmt.Errorf("Table migration failed: %v", err)
	}

	// GUARANTEE: Injects a blank profile if the table has just been created
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

	// Initialize default MMP intervals
	defaultIntervals := []int{1, 5, 15, 30, 60, 300, 600, 1200}
	for _, duration := range defaultIntervals {
		db.Model(&PowerRecord{}).Where("duration = ?", duration).Count(&count)
		if count == 0 {
			db.Create(&PowerRecord{Duration: duration, Watts: 0, Wkg: 0, Date: time.Now()})
		}
	}

	s.userDB = db
	return nil
}

// DeleteLocalAccount removes the profile from the master DB and deletes its isolated database file.
func (s *Service) DeleteLocalAccount(id string) error {
	// 1. Remove from Master DB
	if err := s.masterDB.Where("id = ?", id).Delete(&LocalAccount{}).Error; err != nil {
		return fmt.Errorf("failed to delete account from master db: %v", err)
	}

	// 2. Delete the physical isolated database file
	dbPath := fmt.Sprintf("users_data/argus_data_%s.db", id)
	if err := os.Remove(dbPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete database file: %v", err)
	}

	return nil
}

// ============
// USER PROFILE
// ============

// GetProfile returns the user profile from the isolated DB.
func (s *Service) GetProfile() (domain.UserProfile, error) {
	var user domain.UserProfile
	if s.userDB == nil {
		return user, fmt.Errorf("User database not loaded")
	}

	result := s.userDB.First(&user)
	return user, result.Error
}

// UpdateProfile updates the existing user profile in the isolated DB.
func (s *Service) UpdateProfile(u domain.UserProfile) error {
	if s.userDB == nil {
		return fmt.Errorf("User database not loaded")
	}

	var existing domain.UserProfile
	if err := s.userDB.First(&existing).Error; err == nil {
		if u.StravaAccessToken == "" {
			u.StravaAccessToken = existing.StravaAccessToken
			u.StravaRefreshToken = existing.StravaRefreshToken
			u.StravaExpiresAt = existing.StravaExpiresAt
		}
	}

	// Always enforce ID 1 since it's an isolated DB per user
	u.ID = 1
	return s.userDB.Save(&u).Error
}

// ==========
// ACTIVITIES
// ==========

func (s *Service) SaveActivity(a domain.Activity) error {
	if s.userDB == nil {
		return fmt.Errorf("No user loaded")
	}
	return s.userDB.Create(&a).Error
}

func (s *Service) GetRecentActivities(limit int) ([]domain.Activity, error) {
	var activities []domain.Activity
	if s.userDB == nil {
		return activities, nil
	}

	query := s.userDB.Order("created_at desc")
	if limit > 0 {
		query = query.Limit(limit)
	}

	result := query.Find(&activities)
	return activities, result.Error
}

func (s *Service) GetTotalDistance() float64 {
	var total *float64
	if s.userDB == nil {
		return 0
	}

	s.userDB.Model(&domain.Activity{}).Select("sum(total_distance)").Scan(&total)
	if total == nil {
		return 0
	}
	return *total
}

func (s *Service) GetActivitiesByMonth(monthStr string) ([]domain.Activity, error) {
	var activities []domain.Activity
	if s.userDB == nil {
		return activities, nil
	}
	err := s.userDB.Where("strftime('%Y-%m', created_at) = ?", monthStr).Order("created_at asc").Find(&activities).Error
	return activities, err
}

func (s *Service) GetTotalDuration() int64 {
	var total *int64
	if s.userDB == nil {
		return 0
	}
	s.userDB.Model(&domain.Activity{}).Select("sum(duration)").Scan(&total)
	if total == nil {
		return 0
	}
	return *total
}

func (s *Service) GetPowerCurve() []PowerRecord {
	var records []PowerRecord
	if s.userDB == nil {
		return records
	}
	s.userDB.Order("duration ASC").Find(&records)
	return records
}

func (s *Service) CheckAndUpdateRecord(newRec PowerRecord) bool {
	if s.userDB == nil {
		return false
	}
	var oldRec PowerRecord
	s.userDB.First(&oldRec, newRec.Duration)

	if newRec.Watts > oldRec.Watts {
		s.userDB.Save(&newRec)
		return true
	}
	return false
}

func (s *Service) GetAllActivities() ([]domain.Activity, error) {
	var activities []domain.Activity
	if s.userDB == nil {
		return activities, nil
	}
	err := s.userDB.Order("created_at asc").Find(&activities).Error
	return activities, err
}

func (s *Service) GetPowerRecords() ([]PowerRecord, error) {
	var records []PowerRecord
	if s.userDB == nil {
		return records, nil
	}
	err := s.userDB.Order("duration asc").Find(&records).Error
	return records, err
}

func (s *Service) GetActivityByID(id uint) (domain.Activity, error) {
	var activity domain.Activity
	if s.userDB == nil {
		return activity, fmt.Errorf("no db")
	}
	err := s.userDB.First(&activity, id).Error
	return activity, err
}

func (s *Service) DeleteActivity(id uint) error {
	if s.userDB == nil {
		return fmt.Errorf("no db")
	}
	return s.userDB.Delete(&domain.Activity{}, id).Error
}

// GetProfilesSummary returns all local accounts enriched with their personal stats
func (s *Service) GetProfilesSummary() []ProfileSummary {
	var accounts []LocalAccount
	s.masterDB.Order("created_at asc").Find(&accounts)

	var summaries []ProfileSummary

	for _, acc := range accounts {
		summary := ProfileSummary{
			ID:        acc.ID,
			Name:      acc.Name,
			Avatar:    acc.Avatar,
			Level:     1, // Fallback
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
		}

		summaries = append(summaries, summary)
	}

	return summaries
}

// ClearStravaTokens bypasses the standard UpdateProfile shield to force disconnect Strava
func (s *Service) ClearStravaTokens() error {
	if s.userDB == nil {
		return fmt.Errorf("User database not loaded")
	}

	err := s.userDB.Model(&domain.UserProfile{}).Where("id = ?", 1).Updates(map[string]interface{}{
		"strava_access_token":  "",
		"strava_refresh_token": "",
		"strava_expires_at":    0,
	}).Error

	return err
}

// UpdateActivityStatus marks an activity as successfully uploaded to an external service (e.g., Strava).
func (s *Service) UpdateActivityStatus(id uint, uploaded bool) error {
	if s.userDB == nil {
		return fmt.Errorf("no user database loaded")
	}
	return s.userDB.Model(&domain.Activity{}).Where("id = ?", id).Update("uploaded_to_strava", uploaded).Error
}