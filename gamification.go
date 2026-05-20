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
	
	allActivities, _ := a.storageService.GetAllActivities()
	activityCount := len(allActivities)
	
	powerCurve := a.storageService.GetPowerCurve()
	maxPower := 0
	mmpMap := make(map[int]int) // duration -> watts
	for _, pr := range powerCurve {
		if pr.Duration == 1 && pr.Watts > maxPower {
			maxPower = pr.Watts
		}
		mmpMap[pr.Duration] = pr.Watts
	}
	
	// Fetch already unlocked badges
	existingBadges := a.storageService.GetUserBadges()
	badgeMap := make(map[string]bool)
	for _, b := range existingBadges {
		badgeMap[b.Name] = true
	}
	
	// 1. Distance Tiers
	distTiers := []int{250, 500, 1000, 2500, 5000, 10000}
	for _, t := range distTiers {
		name := fmt.Sprintf("%d km Distance", t)
		if !badgeMap[name] && totalDistKm >= float64(t) {
			b := domain.UserBadge{BadgeType: "distance", Tier: t, Name: name, AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 1000
		}
	}
	
	// 2. Elevation Tiers
	elevTiers := []int{2000, 5000, 8848, 10000, 25000}
	for _, t := range elevTiers {
		name := fmt.Sprintf("%d m Elevation", t)
		if t == 8848 {
			name = "Everest (8848m)"
		}
		if !badgeMap[name] && totalElev >= float64(t) {
			b := domain.UserBadge{BadgeType: "elevation", Tier: t, Name: name, AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 1500
		}
	}
	
	// 3. Time Tiers
	timeTiers := []int{10, 25, 50, 75, 100, 250, 500}
	for _, t := range timeTiers {
		name := fmt.Sprintf("%d hours Saddle Time", t)
		if !badgeMap[name] && totalTimeHrs >= float64(t) {
			b := domain.UserBadge{BadgeType: "time", Tier: t, Name: name, AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 800
		}
	}

	// 4. Activity Count Tiers
	actTiers := []int{10, 50, 100, 250}
	for _, t := range actTiers {
		name := fmt.Sprintf("%d Activities", t)
		if !badgeMap[name] && activityCount >= t {
			b := domain.UserBadge{BadgeType: "activities", Tier: t, Name: name, AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 500
		}
	}

	// 5. Max Power Tiers
	powTiers := []int{500, 1000, 1500}
	for _, t := range powTiers {
		name := fmt.Sprintf("%dW Max Power", t)
		if !badgeMap[name] && maxPower >= t {
			b := domain.UserBadge{BadgeType: "power", Tier: t, Name: name, AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 1200
		}
	}

	// 6. Single Activity Records (Century Ride & Mountain Goat)
	maxSingleDist := 0.0
	maxSingleElev := 0.0
	totalCalories := 0
	for _, act := range allActivities {
		if act.TotalDistance > maxSingleDist {
			maxSingleDist = act.TotalDistance
		}
		if act.ElevationGain > maxSingleElev {
			maxSingleElev = act.ElevationGain
		}
		totalCalories += act.Calories
	}

	// Century Club (100km in one ride)
	if !badgeMap["Century Club"] && maxSingleDist >= 100000 {
		b := domain.UserBadge{BadgeType: "epic_ride", Tier: 100, Name: "Century Club", AchievedAt: time.Now()}
		a.storageService.SaveBadge(b)
		unlocked = append(unlocked, b)
		*totalXP += 3000
	}

	// Mountain Goat (1000m elevation in one ride)
	if !badgeMap["Mountain Goat"] && maxSingleElev >= 1000 {
		b := domain.UserBadge{BadgeType: "epic_climb", Tier: 1000, Name: "Mountain Goat", AchievedAt: time.Now()}
		a.storageService.SaveBadge(b)
		unlocked = append(unlocked, b)
		*totalXP += 2500
	}

	// Calories Burner (50k total)
	if !badgeMap["Calories Burner"] && totalCalories >= 50000 {
		b := domain.UserBadge{BadgeType: "calories", Tier: 50000, Name: "Calories Burner", AchievedAt: time.Now()}
		a.storageService.SaveBadge(b)
		unlocked = append(unlocked, b)
		*totalXP += 2000
	}

	// 7. MMP Tiers (Just check if record exists for these durations)
	mmpTiers := []int{1, 5, 20}
	for _, t := range mmpTiers {
		name := fmt.Sprintf("%dmin MMP Power", t)
		// Special case for 1 min
		if t == 1 {
			if !badgeMap[name] && mmpMap[60] > 0 {
				b := domain.UserBadge{BadgeType: "power_time", Tier: t, Name: name, AchievedAt: time.Now()}
				a.storageService.SaveBadge(b)
				unlocked = append(unlocked, b)
				*totalXP += 600
			}
		} else {
			durationSecs := t * 60
			if !badgeMap[name] && mmpMap[durationSecs] > 0 {
				b := domain.UserBadge{BadgeType: "power_time", Tier: t, Name: name, AchievedAt: time.Now()}
				a.storageService.SaveBadge(b)
				unlocked = append(unlocked, b)
				*totalXP += 800
			}
		}
	}
	
	// ====================================
	// New Habit, Balance & Recovery Badges
	// ====================================
	profile, _ := a.storageService.GetProfile()

	// 8. Daily Consistency Streaks
	if len(allActivities) > 0 {
		activityDays := make(map[string]bool)
		var uniqueDays []time.Time
		for _, act := range allActivities {
			dateStr := act.CreatedAt.Format("2006-01-02")
			if !activityDays[dateStr] {
				activityDays[dateStr] = true
				t, _ := time.Parse("2006-01-02", dateStr)
				uniqueDays = append(uniqueDays, t)
			}
		}

		maxConsecutive := 0
		currentConsecutive := 0
		var lastDay time.Time
		for i, day := range uniqueDays {
			if i == 0 {
				currentConsecutive = 1
			} else {
				diffDays := day.Sub(lastDay).Hours() / 24.0
				if diffDays >= 0.8 && diffDays <= 1.2 {
					currentConsecutive++
				} else if diffDays > 1.2 {
					if currentConsecutive > maxConsecutive {
						maxConsecutive = currentConsecutive
					}
					currentConsecutive = 1
				}
			}
			lastDay = day
		}
		if currentConsecutive > maxConsecutive {
			maxConsecutive = currentConsecutive
		}

		if !badgeMap["Daily Habit (3 Days)"] && maxConsecutive >= 3 {
			b := domain.UserBadge{BadgeType: "consistency", Tier: 3, Name: "Daily Habit (3 Days)", AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 800
		}
		if !badgeMap["Consistency Champion (5 Days)"] && maxConsecutive >= 5 {
			b := domain.UserBadge{BadgeType: "consistency", Tier: 5, Name: "Consistency Champion (5 Days)", AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 1500
		}
	}

	// 9. Rest is Training & Overtraining Prevention
	if !badgeMap["Rest is Training"] && len(allActivities) >= 2 {
		for i := 0; i < len(allActivities)-1; i++ {
			actA := allActivities[i]
			actB := allActivities[i+1]
			isHard := actA.TSS >= 100 || actA.TRIMP >= 120
			if isHard {
				hoursGap := actB.CreatedAt.Sub(actA.CreatedAt).Hours()
				// 32 to 60 hours implies at least one full calendar day of rest between activities
				if hoursGap >= 32.0 && hoursGap <= 60.0 {
					b := domain.UserBadge{BadgeType: "recovery", Tier: 1, Name: "Rest is Training", AchievedAt: time.Now()}
					a.storageService.SaveBadge(b)
					unlocked = append(unlocked, b)
					*totalXP += 1000
					break
				}
			}
		}
	}

	// 10. Active Recovery (Easy recovery spins)
	if !badgeMap["Active Recovery"] {
		for _, act := range allActivities {
			if act.Duration >= 900 {
				isLowHR := profile.MaxHR > 0 && act.AvgHR > 0 && act.AvgHR < int(0.60*float64(profile.MaxHR))
				isLowPower := profile.FTP > 0 && act.AvgPower > 0 && act.AvgPower < int(0.55*float64(profile.FTP))
				if isLowHR || isLowPower {
					b := domain.UserBadge{BadgeType: "recovery", Tier: 2, Name: "Active Recovery", AchievedAt: time.Now()}
					a.storageService.SaveBadge(b)
					unlocked = append(unlocked, b)
					*totalXP += 800
					break
				}
			}
		}
	}

	// 11. Time-of-day Routines (Early Bird / Night Owl) & Coffee Ride (Quick Spin)
	hasEarlyBird := false
	hasNightOwl := false
	hasQuickSpin := false
	for _, act := range allActivities {
		hour := act.CreatedAt.Hour()
		if hour >= 5 && hour < 8 {
			hasEarlyBird = true
		}
		if hour >= 20 || hour < 4 {
			hasNightOwl = true
		}
		if act.Duration >= 900 && act.Duration <= 1800 {
			hasQuickSpin = true
		}
	}

	if !badgeMap["Early Bird"] && hasEarlyBird {
		b := domain.UserBadge{BadgeType: "routine", Tier: 1, Name: "Early Bird", AchievedAt: time.Now()}
		a.storageService.SaveBadge(b)
		unlocked = append(unlocked, b)
		*totalXP += 500
	}
	if !badgeMap["Night Owl"] && hasNightOwl {
		b := domain.UserBadge{BadgeType: "routine", Tier: 2, Name: "Night Owl", AchievedAt: time.Now()}
		a.storageService.SaveBadge(b)
		unlocked = append(unlocked, b)
		*totalXP += 500
	}
	if !badgeMap["Quick Spin"] && hasQuickSpin {
		b := domain.UserBadge{BadgeType: "routine", Tier: 3, Name: "Quick Spin", AchievedAt: time.Now()}
		a.storageService.SaveBadge(b)
		unlocked = append(unlocked, b)
		*totalXP += 600
	}

	// 12. Route Explorer
	if len(allActivities) > 0 {
		uniqueRoutes := make(map[string]bool)
		for _, act := range allActivities {
			if act.RouteName != "" && act.RouteName != "Free Training" && act.RouteName != "KOM Event Segment" {
				uniqueRoutes[act.RouteName] = true
			}
		}
		numRoutes := len(uniqueRoutes)
		if !badgeMap["Explorer"] && numRoutes >= 3 {
			b := domain.UserBadge{BadgeType: "explorer", Tier: 3, Name: "Explorer", AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 800
		}
		if !badgeMap["Master Explorer"] && numRoutes >= 6 {
			b := domain.UserBadge{BadgeType: "explorer", Tier: 6, Name: "Master Explorer", AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 1500
		}
	}

	// 13. Perfect Harmony (Weekly balance)
	if !badgeMap["Perfect Harmony"] && len(allActivities) >= 4 {
		type weekKey struct {
			year int
			week int
		}
		weekActivityDays := make(map[weekKey]map[string]bool)
		for _, act := range allActivities {
			y, w := act.CreatedAt.ISOWeek()
			key := weekKey{year: y, week: w}
			if weekActivityDays[key] == nil {
				weekActivityDays[key] = make(map[string]bool)
			}
			dateStr := act.CreatedAt.Format("2006-01-02")
			weekActivityDays[key][dateStr] = true
		}

		hasPerfectHarmony := false
		for _, daysMap := range weekActivityDays {
			numActiveDays := len(daysMap)
			if numActiveDays >= 4 && numActiveDays <= 5 {
				hasPerfectHarmony = true
				break
			}
		}

		if hasPerfectHarmony {
			b := domain.UserBadge{BadgeType: "balance", Tier: 1, Name: "Perfect Harmony", AchievedAt: time.Now()}
			a.storageService.SaveBadge(b)
			unlocked = append(unlocked, b)
			*totalXP += 1200
		}
	}

	// 14. Cardio Recovery Master
	if !badgeMap["Cardio Recovery Master"] {
		for _, act := range allActivities {
			targetMaxHR := 150.0
			if profile.MaxHR > 0 {
				targetMaxHR = 0.80 * float64(profile.MaxHR)
			}
			if act.MaxHR >= int(targetMaxHR) && act.HRR1 >= 30 {
				b := domain.UserBadge{BadgeType: "cardio", Tier: 30, Name: "Cardio Recovery Master", AchievedAt: time.Now()}
				a.storageService.SaveBadge(b)
				unlocked = append(unlocked, b)
				*totalXP += 1000
				break
			}
		}
	}
	
	return unlocked
}

// ==================
// Frontend Endpoints
// ==================

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
	// Retroactively check for new badges before returning the list
	var dummyXP int64
	a.updateAndCheckBadges(&dummyXP)
	
	return a.storageService.GetUserBadges()
}
