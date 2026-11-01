package fit

import "math"

// SecondResampler turns the irregular stream of BLE notifications into one
// sample per second of active time.
//
// The session loop receives a notification from every connected sensor
// (trainer, power meter, heart-rate strap), which in practice is about three
// per second. The metrics in this package (NP's 30 s window, time in zones,
// the 1 h decoupling requirement, MMP windows) count samples as seconds, so
// they must be fed a 1 Hz series.
//
// Each emitted second is the mean of the notifications that arrived during it
// (heart rate ignores zero readings). If a second had no notification, the
// last emitted value is repeated.
type SecondResampler struct {
	elapsed float64 // active seconds accumulated
	emitted int     // whole seconds already emitted

	powerSum, powerN int
	hrSum, hrN       int
	lastPower        int
	lastHR           int
}

// Add records one notification that closed an interval of dt active seconds
// and returns the 1 Hz samples completed by it (possibly none).
func (r *SecondResampler) Add(dt float64, power, hr int) (powers, hrs []int) {
	if dt < 0 || math.IsNaN(dt) {
		dt = 0
	}
	r.powerSum += power
	r.powerN++
	if hr > 0 {
		r.hrSum += hr
		r.hrN++
	}

	r.elapsed += dt
	for r.emitted < int(r.elapsed) {
		p, h := r.lastPower, r.lastHR
		if r.powerN > 0 {
			p = int(math.Round(float64(r.powerSum) / float64(r.powerN)))
		}
		if r.hrN > 0 {
			h = int(math.Round(float64(r.hrSum) / float64(r.hrN)))
		} else if r.powerN > 0 {
			// Notifications arrived but none carried a heart rate.
			h = 0
		}
		powers = append(powers, p)
		hrs = append(hrs, h)
		r.lastPower, r.lastHR = p, h
		r.powerSum, r.powerN, r.hrSum, r.hrN = 0, 0, 0, 0
		r.emitted++
	}
	return powers, hrs
}
