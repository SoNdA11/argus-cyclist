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

package usecase

import (
	"argus-cyclist/internal/domain"
	"argus-cyclist/internal/repository/sqlite"
)

// StorageFacade acts as a use-case/service layer to orchestrate the repositories.
// It exposes the exact methods app.go expects, keeping the UI layer decoupled from the DB implementations.
type StorageFacade struct {
	ConnManager  domain.ConnectionManager
	UserRepo     domain.UserRepository
	ActivityRepo domain.ActivityRepository
	PowerRepo    domain.PowerRepository
	EventRepo    domain.EventRepository
}

func NewStorageFacade() *StorageFacade {
	state := sqlite.NewDBState()

	return &StorageFacade{
		ConnManager:  sqlite.NewConnectionManager(state),
		UserRepo:     sqlite.NewUserRepository(state),
		ActivityRepo: sqlite.NewActivityRepository(state),
		PowerRepo:    sqlite.NewPowerRepository(state),
		EventRepo:    sqlite.NewEventRepository(state),
	}
}

// ==================
// Connection Manager
// ==================

func (s *StorageFacade) LoadUserDatabase(userID string) error {
	return s.ConnManager.LoadUserDatabase(userID)
}

func (s *StorageFacade) GetProfilesSummary() []domain.ProfileSummary {
	return s.ConnManager.GetProfilesSummary()
}

func (s *StorageFacade) GetLocalAccounts() []domain.LocalAccount {
	return s.ConnManager.GetLocalAccounts()
}

func (s *StorageFacade) CreateLocalAccount(acc domain.LocalAccount) error {
	return s.ConnManager.CreateLocalAccount(acc)
}

func (s *StorageFacade) DeleteLocalAccount(id string) error {
	return s.ConnManager.DeleteLocalAccount(id)
}

// ===============
// User Repository
// ===============

func (s *StorageFacade) GetProfile() (domain.UserProfile, error) {
	return s.UserRepo.GetProfile()
}

func (s *StorageFacade) UpdateProfile(u domain.UserProfile) error {
	return s.UserRepo.UpdateProfile(u)
}

func (s *StorageFacade) ClearStravaTokens() error {
	return s.UserRepo.ClearStravaTokens()
}

// ===================
// Activity Repository
// ===================

func (s *StorageFacade) SaveActivity(a domain.Activity) error {
	return s.ActivityRepo.SaveActivity(a)
}

func (s *StorageFacade) GetRecentActivities(limit int) ([]domain.Activity, error) {
	return s.ActivityRepo.GetRecentActivities(limit)
}

func (s *StorageFacade) GetTotalDistance() float64 {
	return s.ActivityRepo.GetTotalDistance()
}

func (s *StorageFacade) GetTotalDuration() int64 {
	return s.ActivityRepo.GetTotalDuration()
}

func (s *StorageFacade) GetActivitiesByMonth(monthStr string) ([]domain.Activity, error) {
	return s.ActivityRepo.GetActivitiesByMonth(monthStr)
}

func (s *StorageFacade) GetAllActivities() ([]domain.Activity, error) {
	return s.ActivityRepo.GetAllActivities()
}

func (s *StorageFacade) GetActivityByID(id uint) (domain.Activity, error) {
	return s.ActivityRepo.GetActivityByID(id)
}

func (s *StorageFacade) DeleteActivity(id uint) error {
	return s.ActivityRepo.DeleteActivity(id)
}

func (s *StorageFacade) UpdateActivityStatus(id uint, uploaded bool) error {
	return s.ActivityRepo.UpdateActivityStatus(id, uploaded)
}

// ================
// Power Repository
// ================

func (s *StorageFacade) GetPowerCurve() []domain.PowerRecord {
	return s.PowerRepo.GetPowerCurve()
}

func (s *StorageFacade) CheckAndUpdateRecord(newRec domain.PowerRecord) bool {
	return s.PowerRepo.CheckAndUpdateRecord(newRec)
}

func (s *StorageFacade) GetPowerRecords() ([]domain.PowerRecord, error) {
	return s.PowerRepo.GetPowerRecords()
}

// ================
// Event Repository
// ================

func (s *StorageFacade) SaveEventRecord(record domain.EventRecord) error {
	return s.EventRepo.SaveEventRecord(record)
}

func (s *StorageFacade) GetTopEventRecords(mode string, limit int) ([]domain.EventRecord, error) {
	return s.EventRepo.GetTopEventRecords(mode, limit)
}

func (s *StorageFacade) ResetEventLeaderboard(mode string) error {
	return s.EventRepo.ResetEventLeaderboard(mode)
}