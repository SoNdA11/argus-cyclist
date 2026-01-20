package storage

import (
	"argus-cyclist/internal/domain"
	"fmt"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// Service encapsulates all database operations.
// It acts as the persistence layer of the application.
type Service struct {
	db *gorm.DB
}

// NewService initializes the database connection and runs migrations.
func NewService() *Service {
	// Database file path.
	// For development, the database is stored locally in the project root.
	dbPath := "argus_data.db"
	
	// In production, the recommended approach is to store the database
	// in the user's application data directory:
	//
	// configDir, _ := os.UserConfigDir()
	// dbPath = filepath.Join(configDir, "ArgusCyclist", "argus.db")

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		panic("failed to connect database")
	}

	// AutoMigrate automatically creates or updates database tables
	// based on the domain models.
	err = db.AutoMigrate(&domain.UserProfile{}, &domain.Activity{})
	if err != nil {
		fmt.Println("Erro na migração do banco:", err)
	}

	// Create a default user profile if none exists.
	// The application currently assumes a single-user model.
	var count int64
	db.Model(&domain.UserProfile{}).Count(&count)
	if count == 0 {
		db.Create(&domain.UserProfile{
			Name:       "Cyclist",
			Weight:     75.0,
			BikeWeight: 9.0,
			FTP:        200,
			Units:      "metric",
		})
	}

	return &Service{db: db}
}

// ============
// USER PROFILE
// ============

// GetProfile returns the user profile.
// Currently, this is a single-user application, so it always returns
// the first (and only) profile.
func (s *Service) GetProfile() (domain.UserProfile, error) {
	var user domain.UserProfile
	result := s.db.First(&user)
	return user, result.Error
}

// UpdateProfile updates the existing user profile.
// The ID is forced to 1 to ensure the same record is updated.
func (s *Service) UpdateProfile(u domain.UserProfile) error {
	u.ID = 1 
	return s.db.Save(&u).Error
}

// ==========
// ACTIVITIES
// ==========

func (s *Service) SaveActivity(a domain.Activity) error {
	return s.db.Create(&a).Error
}

// GetRecentActivities returns the most recent activities,
// ordered by creation date (descending).
func (s *Service) GetRecentActivities(limit int) ([]domain.Activity, error) {
	var activities []domain.Activity
	result := s.db.Order("created_at desc").Limit(limit).Find(&activities)
	return activities, result.Error
}

// GetTotalDistance returns the total distance accumulated
// across all recorded activities.
func (s *Service) GetTotalDistance() float64 {
	// A pointer is used to handle NULL values returned by SQL aggregation.
	var total *float64
	
	result := s.db.Model(&domain.Activity{}).Select("sum(total_distance)").Scan(&total)
	
	if result.Error != nil {
		return 0
	}

	// If the table is empty, the SUM result will be NULL.
	if total == nil {
		return 0
	}

	return *total
}