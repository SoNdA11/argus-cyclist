package main

import (
	"argus-cyclist/internal/domain"
	"fmt"
	"math"
	"time"
)

// CalculateLevel returns the level based on an exponential/polynomial XP curve.
// E.g. Level = floor( (XP / 100) ^ 0.5 ) + 1
// If Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 400 XP, Level 4 = 900 XP.
func CalculateLevel(totalXP int64) int {
	if totalXP <= 0 {
		return 1
	}
	// Let's use a smoother curve: Level = floor((XP / 500)^0.6) + 1
	// E.g., L2 = 500XP, L3 = ~1500XP, L4 = ~3000XP
	lvl := math.Pow(float64(totalXP)/500.0, 0.6)
	return int(math.Floor(lvl)) + 1
}

// ProcessGamification calculates XP, checks streaks, goals, and badges.
func (a *App) ProcessGamification(activity domain.Activity) GamificationResult {
	profile := a.GetUserProfile()
	
	now := time.Now()
	
	// 1. Weekly Streak Logic
	streakMultiplier := 0.0
	
	if profile.LastWorkoutDate.IsZero() {
		profile.CurrentStreak = 1
	} else {
		daysSinceLast := now.Sub(profile.LastWorkoutDate).Hours() / 24.0
		
		if daysSinceLast > 7.0 {
			// Streak broken
			profile.CurrentStreak = 1
		} else {
			// Check if this is a new week for the streak
			// We'll use ISO Week to determine if it's a new calendar week
			lastYear, lastWeek := profile.LastWorkoutDate.ISOWeek()
			currYear, currWeek := now.ISOWeek()
			
			if currYear > lastYear || (currYear == lastYear && currWeek > lastWeek) {
				// New week!
				profile.CurrentStreak++
			}
			// If same week, streak stays same
		}
	}
	profile.LastWorkoutDate = now
	
	// Streak Bonus: Week 2 = +5%, Week 3 = +10%, capped at +20% (Week 5+)
	if profile.CurrentStreak > 1 {
		streakMultiplier = float64(profile.CurrentStreak-1) * 0.05
		if streakMultiplier > 0.20 {
			streakMultiplier = 0.20
		}
	}
	
	// 2. Base XP Calculation
	// Time (seconds) * Multiplier (e.g. 0.5 XP per second -> 30 XP per min)
	timeXP := int64(float64(activity.Duration) * 0.5)
	
	// Distance (meters) * Multiplier (e.g. 0.01 XP per meter -> 10 XP per km)
	distanceXP := int64(activity.TotalDistance * 0.01)
	
	// Elevation (meters) * High Multiplier (e.g. 2 XP per meter -> 200 XP per 100m)
	elevationXP := int64(activity.ElevationGain * 2.0)
	
	baseXP := timeXP + distanceXP + elevationXP
	streakBonusXP := int64(float64(baseXP) * streakMultiplier)
	
	totalEarned := baseXP + streakBonusXP
	
	// 3. Update Goals
	// We need repository access for goals and badges. I will add this to storage facade later.
	// For now, let's assume we fetch them and update them.
	goalsCompleted := a.updateAndCheckGoals(activity, &totalEarned)
	
	// 4. Update Badges
	badgesUnlocked := a.updateAndCheckBadges(&totalEarned)
	
	// 5. Level up
	profile.CurrentXP += totalEarned
	newLevel := CalculateLevel(profile.CurrentXP)
	levelUp := newLevel > profile.Level
	if levelUp {
		profile.Level = newLevel
	}
	
	// Save profile
	a.UpdateUserProfile(profile)
	
	return GamificationResult{
		TimeXP:         timeXP,
		DistanceXP:     distanceXP,
		ElevationXP:    elevationXP,
		StreakBonusXP:  streakBonusXP,
		TotalXPEarned:  totalEarned,
		NewLevel:       newLevel,
		LevelUp:        levelUp,
		BadgesUnlocked: badgesUnlocked,
		GoalsCompleted: goalsCompleted,
	}
}

func (a *App) updateAndCheckGoals(activity domain.Activity, totalXP *int64) []domain.CustomGoal {
	var completed []domain.CustomGoal
	
	// Fetch active goals
	goals := a.storageService.GetActiveGoals()
	
	for _, g := range goals {
		if g.Status != "active" || time.Now().After(g.Deadline) {
			continue
		}
		
		switch g.Metric {
		case "distance":
			g.CurrentProgress += activity.TotalDistance / 1000.0 // in km
		case "time":
			g.CurrentProgress += float64(activity.Duration) / 3600.0 // in hours
		case "elevation":
			g.CurrentProgress += activity.ElevationGain // in m
		}
		
		if g.CurrentProgress >= g.TargetValue {
			g.Status = "completed"
			now := time.Now()
			g.CompletedAt = &now
			completed = append(completed, g)
			
			// Award dynamic XP bounty
			// E.g. target * multiplier
			bounty := int64(g.TargetValue * 10)
			*totalXP += bounty
		}
		
		a.storageService.SaveGoal(g)
	}
	
	return completed
}

func (a *App) updateAndCheckBadges(totalXP *int64) []domain.UserBadge {
	var unlocked []domain.UserBadge
	
	// Get total stats
	totalDistKm := a.storageService.GetTotalDistance() / 1000.0
	totalTimeHrs := float64(a.storageService.GetTotalDuration()) / 3600.0
	totalElev := a.storageService.GetTotalElevation()
	
	// Fetch already unlocked badges
	existingBadges := a.storageService.GetUserBadges()
	badgeMap := make(map[string]bool)
	for _, b := range existingBadges {
		badgeMap[b.BadgeType+"_"+fmt.Sprint(b.Tier)] = true
	}
	
	// Define thresholds
	distTiers := []int{250, 500, 1000, 1500}
	for _, t := range distTiers {
		key := "distance_" + fmt.Sprint(t)
		if !badgeMap[key] && totalDistKm >= float64(t) {
			b := domain.UserBadge{BadgeType: "distance", Tier: t, Name: fmt.Sprintf("%d km Distance", t), AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 1000 // massive one-time XP burst
		}
	}
	
	elevTiers := []int{2000, 5000, 8848, 10000}
	for _, t := range elevTiers {
		key := "elevation_" + fmt.Sprint(t)
		if !badgeMap[key] && totalElev >= float64(t) {
			name := fmt.Sprintf("%d m Elevation", t)
			if t == 8848 {
				name = "Everest (8848m)"
			}
			b := domain.UserBadge{BadgeType: "elevation", Tier: t, Name: name, AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 1500
		}
	}
	
	timeTiers := []int{10, 25, 50}
	for _, t := range timeTiers {
		key := "time_" + fmt.Sprint(t)
		if !badgeMap[key] && totalTimeHrs >= float64(t) {
			b := domain.UserBadge{BadgeType: "time", Tier: t, Name: fmt.Sprintf("%d hours Saddle Time", t), AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 800
		}
	}
	
	return unlocked
}

// ========================
// Frontend Endpoints
// ========================

func (a *App) CreateCustomGoal(metric string, targetValue float64, deadline string) error {
	deadlineTime, err := time.Parse(time.RFC3339, deadline)
	if err != nil {
		return err
	}
	
	goal := domain.CustomGoal{
		Metric:      metric,
		TargetValue: targetValue,
		Deadline:    deadlineTime,
		Status:      "active",
		CreatedAt:   time.Now(),
	}
	
	return a.storageService.SaveGoal(goal)
}

func (a *App) DeleteCustomGoal(id uint) error {
	return a.storageService.DeleteGoal(id)
}

func (a *App) GetCustomGoals() []domain.CustomGoal {
	return a.storageService.GetAllGoals()
}

func (a *App) GetUserBadges() []domain.UserBadge {
	return a.storageService.GetUserBadges()
}
