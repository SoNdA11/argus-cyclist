package fit

import (
	"math"
	"testing"
	"time"

	"argus-cyclist/internal/domain"
)

// These tests pin the physiological formulas documented in the thesis
// (chapter 3) to hand-computed reference values.

func repeat(v, n int) []int {
	s := make([]int, n)
	for i := range s {
		s[i] = v
	}
	return s
}

func TestNormalizedPower(t *testing.T) {
	cases := []struct {
		name string
		data []int
		want int
	}{
		{"empty", nil, 0},
		{"short series falls back to mean", []int{100, 200, 300}, 200},
		{"constant power equals itself", repeat(200, 120), 200},
		// 60 s at 0 W then 60 s at 400 W: mean is 200 W, but the 4th power of
		// the 30 s rolling average weights the hard half more heavily.
		// Reference value computed independently: 318 W.
		{"variable power exceeds mean", append(repeat(0, 60), repeat(400, 60)...), 318},
	}
	for _, c := range cases {
		if got := CalculateNormalizedPower(c.data); got != c.want {
			t.Errorf("%s: NP = %d, want %d", c.name, got, c.want)
		}
	}
}

func TestIntensityFactorAndTSS(t *testing.T) {
	if got := CalculateIntensityFactor(250, 250); got != 1.0 {
		t.Errorf("IF(NP=FTP) = %v, want 1", got)
	}
	if got := CalculateIntensityFactor(200, 0); got != 0 {
		t.Errorf("IF with FTP=0 = %v, want 0", got)
	}
	// By definition, one hour at FTP is 100 TSS.
	if got := CalculateTSS(3600, 250, 1.0, 250); got != 100 {
		t.Errorf("TSS(1 h at FTP) = %v, want 100", got)
	}
	// 30 min at IF 0.8: 0.5 h * 0.8^2 * 100 = 32.
	if got := CalculateTSS(1800, 200, 0.8, 250); got != 32 {
		t.Errorf("TSS(30 min, IF 0.8) = %v, want 32", got)
	}
}

func TestPowerZones(t *testing.T) {
	// FTP 200: boundaries at 110, 150, 180, 210, 242 W.
	z := CalculatePowerZones([]int{100, 110, 150, 180, 210, 241, 242, 500}, 200)
	want := TimeInZones{Z1: 1, Z2: 1, Z3: 1, Z4: 1, Z5: 2, Z6: 2}
	if z != want {
		t.Errorf("zones = %+v, want %+v", z, want)
	}
}

func TestHRZones(t *testing.T) {
	// Max HR 200: 50%, 65%, 75%, 85%, 95%; zero samples are ignored.
	z := CalculateHRZones([]int{100, 130, 150, 170, 190, 0}, 200)
	for _, k := range []string{"Z1", "Z2", "Z3", "Z4", "Z5"} {
		if z[k] != 1 {
			t.Errorf("%s = %d, want 1 (zones %v)", k, z[k], z)
		}
	}
	if z := CalculateHRZones([]int{150}, 0); z["Z3"] != 0 {
		t.Errorf("max HR 0 should yield empty zones, got %v", z)
	}
}

func TestTRIMP(t *testing.T) {
	// 60 min, HRR fraction (150-60)/(180-60) = 0.75:
	// 60 * 0.75 * 0.64 * e^(1.92*0.75) = 121.56 -> 122.
	if got := CalculateTRIMP(3600, 150, 180, 60); got != 122 {
		t.Errorf("TRIMP = %d, want 122", got)
	}
	if got := CalculateTRIMP(3600, 50, 180, 60); got != 0 {
		t.Errorf("TRIMP with avg HR below resting = %d, want 0", got)
	}
}

func TestAerobicDecoupling(t *testing.T) {
	const n = 4200 // 70 min; first 600 samples are discarded
	power := repeat(200, n)
	hr := append(repeat(140, 600+1800), repeat(150, 1800)...)

	// EF1 = 200/140, EF2 = 200/150 -> (1 - 140/150) * 100 = 6.67 -> 6.7
	if got := CalculateAerobicDecoupling(power, hr); got != 6.7 {
		t.Errorf("decoupling = %v, want 6.7", got)
	}
	if got := CalculateAerobicDecoupling(repeat(200, 3599), repeat(140, 3599)); got != 0 {
		t.Errorf("decoupling under 3600 samples = %v, want 0", got)
	}
}

func TestPMC(t *testing.T) {
	now := time.Now()
	yesterday := now.AddDate(0, 0, -1)
	pmc := CalculatePMC([]domain.Activity{{CreatedAt: yesterday, TSS: 42}})

	if len(pmc) != 2 {
		t.Fatalf("PMC days = %d, want 2", len(pmc))
	}
	// Day 1: CTL = 42/42 = 1.0, ATL = 42/7 = 6.0, TSB before update = 0.
	if d := pmc[0]; d.CTL != 1.0 || d.ATL != 6.0 || d.TSB != 0 {
		t.Errorf("day 1 = %+v, want CTL 1.0, ATL 6.0, TSB 0", d)
	}
	// Day 2 (rest): TSB = 1 - 6 = -5; CTL = 1 - 1/42; ATL = 6 - 6/7.
	d := pmc[1]
	if d.TSB != -5 || d.CTL != 1.0 || math.Abs(d.ATL-5.1) > 1e-9 {
		t.Errorf("day 2 = %+v, want TSB -5, CTL 1.0, ATL 5.1", d)
	}
}
