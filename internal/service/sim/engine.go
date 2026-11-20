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

package sim

import "math"

// Physical constants for cycling
const (
	Gravity    = 9.81
	Rho        = 1.225 // Air density (sea level)
	CdA        = 0.32  // Drag coefficient
	Crr        = 0.005 // Rolling resistance coefficient
	Drivetrain = 0.96  // Drivetrain efficiency

	// WheelInertiaMass is the rotational inertia of both wheels expressed as extra
	// translational mass (I/r² for two road wheels).
	WheelInertiaMass = 1.5
	// MinTractionSpeed caps the propulsive force P/v near standstill, so a standing
	// start accelerates at a finite rate instead of an infinite one.
	MinTractionSpeed = 1.0 // m/s
	// MaxSpeed matches the CalculateSpeed search interval (~144 km/h).
	MaxSpeed = 40.0
	stepSize = 0.02 // s, integration sub-step
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

		if math.Abs(high-low) < 0.01 {
			break
		}
	}

	v := (low + high) / 2

	if v < 0 {
		return 0
	}

	return v
}

// Step advances the speed v (m/s) by dt seconds with the given power and grade,
// integrating Newton's second law with the same forces as CalculateSpeed:
//
//	m·dv/dt = P·η/v − ½ρCdA·v² − Crr·m·g·cosθ − m·g·sinθ
//
// so a constant effort converges to CalculateSpeed(watts, grade), but the rider
// now accelerates, coasts and decelerates with inertia instead of jumping
// instantly to the steady-state speed.
func (e *Engine) Step(v, watts, gradePercent, dt float64) float64 {
	if dt <= 0 {
		return v
	}
	v = math.Max(0, math.Min(MaxSpeed, v))
	watts = math.Max(0, watts)

	totalMass := e.UserWeight + e.BikeWeight
	inertialMass := totalMass + WheelInertiaMass
	theta := math.Atan(gradePercent / 100.0)
	forceGravity := totalMass * Gravity * math.Sin(theta)
	forceRolling := totalMass * Gravity * math.Cos(theta) * Crr
	powerWheel := watts * Drivetrain
	constAero := 0.5 * Rho * CdA

	steps := int(math.Ceil(dt / stepSize))
	h := dt / float64(steps)
	for i := 0; i < steps; i++ {
		forcePropulsive := powerWheel / math.Max(v, MinTractionSpeed)
		drive := forcePropulsive - forceGravity
		if v == 0 && drive <= forceRolling {
			continue // static: not enough push (or downhill pull) to overcome rolling resistance
		}
		accel := (drive - forceRolling - constAero*v*v) / inertialMass
		v = math.Max(0, math.Min(MaxSpeed, v+accel*h))
	}
	return v
}
