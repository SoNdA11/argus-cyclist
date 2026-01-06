package sim

import "math"

// Physical constants for cycling
const (
	Gravity    = 9.81
	Rho        = 1.225 // Air density (sea level)
	CdA        = 0.32  // Drag coefficient
	Crr        = 0.005 // Rolling resistance coefficient
	Drivetrain = 0.96  // Drivetrain efficiency
)

type Engine struct {
	UserWeight float64 // kg
	BikeWeight float64 // kg
}

func NewEngine(userWeight, bikeWeight float64) *Engine {
	if userWeight == 0 {
		userWeight = 66.0
	}
	if bikeWeight == 0 {
		bikeWeight = 9.0
	}
	return &Engine{
		UserWeight: userWeight,
		BikeWeight: bikeWeight,
	}
}

// CalculateSpeed estimates speed (m/s) based on power and grade.
func (e *Engine) CalculateSpeed(watts float64, gradePercent float64) float64 {
	totalMass := e.UserWeight + e.BikeWeight
	powerWheel := watts * Drivetrain

	// Grade: % -> Radians
	theta := math.Atan(gradePercent / 100.0)
	sinTheta := math.Sin(theta)
	cosTheta := math.Cos(theta)

    // Linear Forces (Gravity + Rolling)
    // Gravity assists (-) or hinders (+)
	forceGravity := totalMass * Gravity * sinTheta
	forceRolling := totalMass * Gravity * cosTheta * Crr
	
	forceLinear := forceGravity + forceRolling
	constAero := 0.5 * Rho * CdA

    // Robust Iterative Solution (Binary Search / Bisection)
    // For steep descents, speed can be high even with 0 watts.
	
	// Defining search limits for speed (0 to ~144 km/h)
	low := 0.0
	high := 40.0 // ~144 km/h

    // 20 iterations of Bisection are sufficient and unbreakable
    // This ensures we never have division by zero.
	for i := 0; i < 20; i++ {
		mid := (low + high) / 2
		
		powerRequired := (constAero * math.Pow(mid, 3)) + (forceLinear * mid)
		
		if powerRequired < powerWheel {
			low = mid
		} else {
			high = mid
		}
		
		if math.Abs(high - low) < 0.01 {
			break
		}
	}

	v := (low + high) / 2

	if v < 0 { return 0 }
	
	return v
}