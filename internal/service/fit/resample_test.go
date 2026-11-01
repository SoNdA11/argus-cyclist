package fit

import (
	"reflect"
	"testing"
)

func TestSecondResamplerThreeHz(t *testing.T) {
	var r SecondResampler
	var powers, hrs []int
	// 10 s of notifications at ~3 Hz: power alternates 100/200/300, HR 140.
	for i := 0; i < 30; i++ {
		p, h := r.Add(1.0/3.0+1e-9, 100*(i%3+1), 140)
		powers = append(powers, p...)
		hrs = append(hrs, h...)
	}
	if len(powers) != 10 {
		t.Fatalf("got %d samples for 10 s, want 10", len(powers))
	}
	for i := range powers {
		if powers[i] != 200 || hrs[i] != 140 {
			t.Fatalf("second %d = %d W / %d bpm, want the mean 200 W / 140 bpm", i, powers[i], hrs[i])
		}
	}
}

func TestSecondResamplerFillsGap(t *testing.T) {
	var r SecondResampler
	p1, _ := r.Add(1.0, 150, 130)
	// A single notification closing a 3 s gap fills every missing second.
	p2, h2 := r.Add(3.0, 250, 0)
	if !reflect.DeepEqual(p1, []int{150}) {
		t.Errorf("first second = %v, want [150]", p1)
	}
	if !reflect.DeepEqual(p2, []int{250, 250, 250}) || !reflect.DeepEqual(h2, []int{0, 0, 0}) {
		t.Errorf("gap = %v / %v, want three seconds of 250 W and HR 0 (sensor lost)", p2, h2)
	}
}

func TestSecondResamplerIgnoresZeroHRInMean(t *testing.T) {
	var r SecondResampler
	r.Add(0.5, 200, 150)
	_, h := r.Add(0.5, 200, 0)
	if !reflect.DeepEqual(h, []int{150}) {
		t.Errorf("HR = %v, want [150]", h)
	}
}
