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

package domain

import "time"

// LocalAccount represents a user profile in the master database.
type LocalAccount struct {
	ID        string    `json:"id" gorm:"primaryKey"`
	Name      string    `json:"name"`
	Avatar    string    `json:"avatar"`
	CreatedAt time.Time `json:"created_at"`
}

// ProfileSummary contains the master account info plus stats from the isolated DB.
type ProfileSummary struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Avatar    string  `json:"avatar"`
	Level     int     `json:"level"`
	TotalKm        float64 `json:"total_km"`
	TotalTime      int64   `json:"total_time"`
	TotalElevation float64 `json:"total_elevation"`
}

// PowerRecord represents a power curve data point.
type PowerRecord struct {
	Duration int       `json:"duration" gorm:"primaryKey"`
	Watts    int       `json:"watts"`
	Wkg      float64   `json:"wkg"`
	Date     time.Time `json:"date"`
}

// ConnectionManager handles the lifecycle of database connections.
type ConnectionManager interface {
	LoadUserDatabase(userID string) error
	GetProfilesSummary() []ProfileSummary
	GetLocalAccounts() []LocalAccount
	CreateLocalAccount(acc LocalAccount) error
	DeleteLocalAccount(id string) error
}

// UserRepository handles the current user's profile operations.
type UserRepository interface {
	GetProfile() (UserProfile, error)
	UpdateProfile(u UserProfile) error
	ClearStravaTokens() error
	SaveSyncQueue(item SyncQueue) error
	GetActiveGoals() []CustomGoal
	GetAllGoals() []CustomGoal
	SaveGoal(g CustomGoal) error
	GetUserBadges() []UserBadge
	SaveBadge(b UserBadge) error
	DeleteGoal(id uint) error
}

// ActivityRepository handles activity persistence.
type ActivityRepository interface {
	SaveActivity(a Activity) error
	GetRecentActivities(limit int) ([]Activity, error)
	GetActivityCount() int
	GetTotalDistance() float64
	GetTotalDuration() int64
	GetTotalElevation() float64
	GetActivitiesByMonth(monthStr string) ([]Activity, error)
	GetAllActivities() ([]Activity, error)
	GetActivityByID(id uint) (Activity, error)
	DeleteActivity(id uint) error
	UpdateActivityStatus(id uint, uploaded bool) error
}

// PowerRepository manages power curve records.
type PowerRepository interface {
	GetPowerCurve() []PowerRecord
	CheckAndUpdateRecord(newRec PowerRecord) bool
	GetPowerRecords() ([]PowerRecord, error)
}

// ComponentRepository manages bike component wear tracking.
type ComponentRepository interface {
	GetComponents() ([]BikeComponent, error)
	GetComponentByID(id uint) (BikeComponent, error)
	SaveComponent(c BikeComponent) error
	UpdateComponent(c BikeComponent) error
	DeleteComponent(id uint) error
	GetComponentReplacements(componentID uint) ([]ComponentReplacement, error)
	SaveReplacement(r ComponentReplacement) error
}

// AIRepository manages AI conversation persistence.
type AIRepository interface {
	NewConversation(title string, model string) (AIConversation, error)
	ListConversations() ([]AIConversation, error)
	GetConversation(id uint) (AIConversation, error)
	DeleteConversation(id uint) error
	SaveMessage(msg *AIMessage) error
	GetMessageByID(id uint) (AIMessage, error)
	GetMessages(conversationID uint) ([]AIMessage, error)
	UpdateConversation(id uint, title string, updatedAt time.Time) error
}

// EventRepository manages the global event leaderboard.
type EventRepository interface {
	SaveEventRecord(record EventRecord) error
	GetTopEventRecords(mode string, limit int) ([]EventRecord, error)
	ResetEventLeaderboard(mode string) error
	GetRaceHistory(riderName string) ([]EventRecord, error)
	GetEventRecordsByID(ids []uint) ([]EventRecord, error)
	UpdateEventRecordStatus(id uint, uploaded bool) error
	DeleteEventRecord(id uint) error
}
