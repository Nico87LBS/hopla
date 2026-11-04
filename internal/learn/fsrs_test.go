package learn

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

// The cases of testdata/fsrs.json come from ts-fsrs 5.4 (FSRS-6, default
// parameters, short-term on, no fuzz); the web app reads the same file.
func TestFSRSMatchesTheReference(t *testing.T) {
	raw, err := os.ReadFile("testdata/fsrs.json")
	if err != nil {
		t.Fatal(err)
	}
	var data struct {
		Cases []struct {
			Retention   float64 `json:"retention"`
			MaxInterval int     `json:"maxInterval"`
			Steps       []struct {
				Elapsed    int     `json:"elapsed"`
				Grade      int     `json:"grade"`
				Stability  float64 `json:"stability"`
				Difficulty float64 `json:"difficulty"`
				Interval   int     `json:"interval"`
			} `json:"steps"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Cases) == 0 {
		t.Fatal("no cases")
	}
	for i, c := range data.Cases {
		var s, d float64
		for j, step := range c.Steps {
			s, d = NextState(s, d, step.Elapsed, step.Grade)
			if math.Abs(s-step.Stability) > 1e-6 || math.Abs(d-step.Difficulty) > 1e-6 {
				t.Fatalf("case %d step %d: got S %v D %v, want S %v D %v", i, j, s, d, step.Stability, step.Difficulty)
			}
			if got := Interval(s, c.Retention, c.MaxInterval); got != step.Interval {
				t.Fatalf("case %d step %d: interval %d, want %d", i, j, got, step.Interval)
			}
		}
	}
}
