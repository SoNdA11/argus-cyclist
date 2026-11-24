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

func TestStepConvergesToSteadyState(t *testing.T) {
	e := NewEngine(75, 9)
	for _, tc := range []struct{ watts, grade float64 }{
		{150, 0}, {250, 0}, {250, 6}, {300, 10}, {0, -6},
	} {
		v := 0.0
		for i := 0; i < 600; i++ { // 10 minutes at 1 s ticks
			v = e.Step(v, tc.watts, tc.grade, 1)
		}
		want := e.CalculateSpeed(tc.watts, tc.grade)
		if math.Abs(v-want) > 0.05 {
			t.Errorf("%v W @ %v%%: Step settles at %.3f m/s, CalculateSpeed gives %.3f", tc.watts, tc.grade, v, want)
		}
	}
}

func TestStepHasInertia(t *testing.T) {
	e := NewEngine(75, 9)
	target := e.CalculateSpeed(300, 0)

	// Standing start at 300 W: moving after 1 s, but far from top speed; ~90% within a minute.
	v1 := e.Step(0, 300, 0, 1)
	if v1 <= 0 || v1 > 0.6*target {
		t.Errorf("after 1 s at 300 W: %.2f m/s, want > 0 and well below %.2f", v1, target)
	}
	v := v1
	for i := 0; i < 59; i++ {
		v = e.Step(v, 300, 0, 1)
	}
	if v < 0.9*target {
		t.Errorf("after 60 s at 300 W: %.2f m/s, want >= 90%% of %.2f", v, target)
	}

	// Stop pedaling on the flat: coasts down gradually, never negative.
	coast := e.Step(v, 0, 0, 2)
	if coast >= v || coast < 0.7*v {
		t.Errorf("2 s coasting from %.2f m/s gave %.2f, want a gradual slowdown", v, coast)
	}
	for i := 0; i < 600; i++ {
		coast = e.Step(coast, 0, 0, 1)
	}
	if coast < 0 || coast > 0.5 {
		t.Errorf("long coast on the flat ended at %.2f m/s, want ~0", coast)
	}

	// Standing still on a climb with no power stays still (no rolling backwards).
	if v := e.Step(0, 0, 8, 5); v != 0 {
		t.Errorf("0 W at standstill on 8%% gave %.2f m/s, want 0", v)
	}
	// Tick size must not change the physics much (1 s vs 0.25 s ticks).
	a, b := 0.0, 0.0
	for i := 0; i < 20; i++ {
		a = e.Step(a, 250, 3, 1)
		for k := 0; k < 4; k++ {
			b = e.Step(b, 250, 3, 0.25)
		}
	}
	if math.Abs(a-b) > 0.01 {
		t.Errorf("1 s ticks gave %.3f m/s, 0.25 s ticks gave %.3f", a, b)
	}
}
