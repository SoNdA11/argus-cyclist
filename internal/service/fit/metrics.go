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

package fit

import (
	"argus-cyclist/internal/domain"
	"math"
	"time"
)

// TimeInZones stores the seconds spent in each Coggan power zone
type TimeInZones struct {
	Z1 int `json:"z1_time"` // < 55% FTP
	Z2 int `json:"z2_time"` // 55% - 74% FTP
	Z3 int `json:"z3_time"` // 75% - 89% FTP
	Z4 int `json:"z4_time"` // 90% - 104% FTP
	Z5 int `json:"z5_time"` // 105% - 120% FTP
	Z6 int `json:"z6_time"` // > 120% FTP
}

// PMCDay represents the training status on a specific day
type PMCDay struct {
	Date string  `json:"date"`
	TSS  float64 `json:"tss"`
	CTL  float64 `json:"ctl"`
	ATL  float64 `json:"atl"`
	TSB  float64 `json:"tsb"`
}

// CalculateNormalizedPower calculates NP using a 30s rolling average raised to the 4th power
func CalculateNormalizedPower(powerData []int) int {
	if len(powerData) < 30 {
		sum := 0
		for _, p := range powerData {
			sum += p
		}
		if len(powerData) == 0 {
			return 0
		}
		return sum / len(powerData)
	}

	var rollingAverages []float64
	window := 30

	// Calculate the 30-second rolling average
	for i := 0; i <= len(powerData)-window; i++ {
		sum := 0.0
		for j := 0; j < window; j++ {
			sum += float64(powerData[i+j])
		}
		rollingAverages = append(rollingAverages, sum/float64(window))
	}

	// Raise each average to the 4th power
	sumFourthPower := 0.0
	for _, avg := range rollingAverages {
		sumFourthPower += math.Pow(avg, 4)
	}

	// Calculate the mean of the 4th powers and extract the 4th root
	avgFourthPower := sumFourthPower / float64(len(rollingAverages))
	return int(math.Round(math.Pow(avgFourthPower, 0.25)))
}

// CalculateIntensityFactor calculates IF (NP / FTP)
func CalculateIntensityFactor(np int, ftp int) float64 {
	if ftp <= 0 {
		return 0.0
	}
	return float64(np) / float64(ftp)
}

// CalculateTSS calculates the Training Stress Score
func CalculateTSS(durationSec int, np int, ifactor float64, ftp int) float64 {
	if ftp <= 0 {
		return 0.0
	}
	tss := (float64(durationSec) * float64(np) * ifactor) / (float64(ftp) * 3600.0) * 100.0
	return math.Round(tss*10) / 10
}

// CalculateCalories estimates calories (Kj ≈ kCal for cycling due to ~22% biological efficiency)
func CalculateCalories(avgPower int, durationSec int) int {
	return (avgPower * durationSec) / 1000
}

// CalculatePowerZones classifies the time (ticks) spent in each zone
func CalculatePowerZones(powerData []int, ftp int) TimeInZones {
	zones := TimeInZones{}
	if ftp <= 0 {
		ftp = 200 // Safety fallback for null FTP
	}

	f := float64(ftp)

	for _, p := range powerData {
		power := float64(p)
		switch {
		case power < 0.55*f:
			zones.Z1++
		case power < 0.75*f:
			zones.Z2++
		case power < 0.90*f:
			zones.Z3++
		case power < 1.05*f:
			zones.Z4++
		case power < 1.21*f:
			zones.Z5++
		default:
			zones.Z6++
		}
	}
	return zones
}

// CalculatePMC generates the performance curve from the first workout until today
func CalculatePMC(activities []domain.Activity) []PMCDay {
	if len(activities) == 0 {
		return []PMCDay{}
	}

	// 1. Find the date of the first activity and group TSS by day
	tssPerDay := make(map[string]float64)
	var firstDate time.Time

	for i, act := range activities {
		if i == 0 || act.CreatedAt.Before(firstDate) {
			firstDate = act.CreatedAt
		}
		dateStr := act.CreatedAt.Format("2006-01-02")
		tssPerDay[dateStr] += act.TSS
	}

	// 2. Iterate day by day to calculate exponential decay
	var pmc []PMCDay
	var currentCTL, currentATL float64

	// Normalize to midnight
	start := time.Date(firstDate.Year(), firstDate.Month(), firstDate.Day(), 0, 0, 0, 0, time.Local)
	hoje := time.Now()
	end := time.Date(hoje.Year(), hoje.Month(), hoje.Day(), 0, 0, 0, 0, time.Local)

	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		dateStr := d.Format("2006-01-02")
		dailyTSS := tssPerDay[dateStr]

		tsb := currentCTL - currentATL

		// Classic EWMA (Exponential Weighted Moving Average) formulas
		currentCTL = currentCTL + (dailyTSS-currentCTL)/42.0
		currentATL = currentATL + (dailyTSS-currentATL)/7.0

		pmc = append(pmc, PMCDay{
			Date: dateStr,
			TSS:  dailyTSS,
			CTL:  math.Round(currentCTL*10) / 10,
			ATL:  math.Round(currentATL*10) / 10,
			TSB:  math.Round(tsb*10) / 10,
		})
	}

	// If the history is very long, we may want to send only the last 365 days to the frontend
	if len(pmc) > 365 {
		pmc = pmc[len(pmc)-365:]
	}

	return pmc
}
