package sim

import (
	"math"
	"testing"
)

// requiredPower is the quasi-static Martin equation solved by CalculateSpeed
// (thesis, eq. martin-estatica): wheel power needed to hold speed v.
func requiredPower(e *Engine, v, gradePercent float64) float64 {
	m := e.UserWeight + e.BikeWeight
	theta := math.Atan(gradePercent / 100)
	return 0.5*Rho*CdA*v*v*v + (m*Gravity*Crr*math.Cos(theta)+m*Gravity*math.Sin(theta))*v
}

func TestCalculateSpeedSatisfiesMartinEquation(t *testing.T) {
	e := NewEngine(75, 9)
	for _, tc := range []struct{ watts, grade float64 }{
		{100, 0}, {200, 0}, {300, 0}, {200, 5}, {250, 10}, {200, 18},
	} {
		v := e.CalculateSpeed(tc.watts, tc.grade)
		// Bisection stops when the bracket is < 0.01 m/s, so the residual
		// must be within the power change caused by +/-0.01 m/s.
		got := requiredPower(e, v, tc.grade)
		want := tc.watts * Drivetrain
		tol := math.Abs(requiredPower(e, v+0.01, tc.grade) - got)
		if math.Abs(got-want) > tol {
			t.Errorf("%v W @ %v%%: v=%.3f m/s needs %.1f W at the wheel, want %.1f (tol %.2f)",
				tc.watts, tc.grade, v, got, want, tol)
		}
	}
}

func TestCalculateSpeedPhysicalSanity(t *testing.T) {
	e := NewEngine(75, 9)

	// More power on the same grade -> faster; steeper grade at the same power -> slower.
	if !(e.CalculateSpeed(300, 0) > e.CalculateSpeed(200, 0)) {
		t.Error("speed should increase with power")
	}
	if !(e.CalculateSpeed(200, 8) < e.CalculateSpeed(200, 2)) {
		t.Error("speed should decrease with grade")
	}
	// Flat road at 200 W: roughly 34-36 km/h for this CdA/Crr.
	if kmh := e.CalculateSpeed(200, 0) * 3.6; kmh < 33 || kmh > 37 {
		t.Errorf("200 W on the flat = %.1f km/h, want ~35", kmh)
	}
	// Zero power on a descent still yields a terminal speed; on the flat it is 0.
	if v := e.CalculateSpeed(0, -6); v <= 5 {
		t.Errorf("0 W at -6%% = %.2f m/s, want a positive terminal speed", v)
	}
	if v := e.CalculateSpeed(0, 0); v > 0.01 {
		t.Errorf("0 W on the flat = %.3f m/s, want 0", v)
	}
	// Speed is capped by the 40 m/s search interval.
	if v := e.CalculateSpeed(0, -25); v > 40 {
		t.Errorf("speed %.1f m/s exceeds the 40 m/s bracket", v)
	}
}
