package workout

import (
	"os"
	"path/filepath"
	"testing"
)

const sampleZWO = `<workout_file>
  <name>test</name>
  <workout>
    <Warmup Duration="300" PowerLow="0.50" PowerHigh="0.70"/>
    <SteadyState Duration="600" Power="0.85"/>
    <IntervalsT Repeat="2" OnDuration="60" OffDuration="30" OnPower="1.10" OffPower="0.50"/>
    <FreeRide Duration="900"/>
    <Cooldown Duration="300" PowerLow="0.60" PowerHigh="0.40"/>
  </workout>
</workout_file>`

func TestLoadZWOFlattensStepsAndMarksFreeRide(t *testing.T) {
	path := filepath.Join(t.TempDir(), "w.zwo")
	if err := os.WriteFile(path, []byte(sampleZWO), 0o644); err != nil {
		t.Fatal(err)
	}

	w, err := NewService().LoadZWO(path)
	if err != nil {
		t.Fatalf("LoadZWO: %v", err)
	}

	// Warmup + SteadyState + 2x(on+off) + FreeRide + Cooldown
	if got, want := len(w.Segments), 8; got != want {
		t.Fatalf("segments = %d, want %d", got, want)
	}
	if got, want := w.TotalDuration, 300+600+2*(60+30)+900+300; got != want {
		t.Errorf("TotalDuration = %d, want %d", got, want)
	}

	for i, seg := range w.Segments {
		wantFree := i == 6
		if seg.FreeRide != wantFree {
			t.Errorf("segment %d (%s): FreeRide = %v, want %v", i, seg.Type, seg.FreeRide, wantFree)
		}
	}
	if seg := w.Segments[0]; seg.Type != "WARMUP" || seg.StartFactor != 0.50 || seg.EndFactor != 0.70 {
		t.Errorf("warmup segment = %+v", seg)
	}
	if seg := w.Segments[2]; seg.Type != "INTERVAL_ON" || seg.StartFactor != 1.10 {
		t.Errorf("first interval segment = %+v", seg)
	}
}
