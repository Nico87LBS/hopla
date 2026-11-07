package chore

import (
	"context"
	"testing"
	"time"
	_ "time/tzdata"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/zone"
)

// A task whose deadline is over is missed at each passage gone, and falls due
// at the first passage still to come; a task done once has none.
func TestMissedPassages(t *testing.T) {
	paris, _ := time.LoadLocation("Europe/Paris")
	zone.Set(0, paris)
	defer zone.Forget(0)
	hours := "hours"
	at := func(d, h int) time.Time { return time.Date(2026, 11, d, h, 0, 0, 0, paris).UTC() }
	minutes := func(n int) *int { return &n }
	every6 := &chModel.FrequencyMetadata{Unit: &hours, Timezone: "Europe/Paris"}
	daily := &chModel.FrequencyMetadata{Time: "2026-01-01T18:00:00+01:00", Timezone: "Europe/Paris"}
	tests := []struct {
		name   string
		chore  chModel.Chore
		due    time.Time
		now    time.Time
		missed []time.Time
		next   *time.Time
	}{
		{"avant la limite : en retard, rien de manqué",
			chModel.Chore{FrequencyType: "interval", Frequency: 6, FrequencyMetadataV2: every6, DeadlineMinutes: minutes(120)},
			at(2, 8), at(2, 9), nil, ptr(at(2, 8))},
		{"un passage manqué, passe au suivant",
			chModel.Chore{FrequencyType: "interval", Frequency: 6, FrequencyMetadataV2: every6, DeadlineMinutes: minutes(120)},
			at(2, 8), at(2, 11), []time.Time{at(2, 8)}, ptr(at(2, 14))},
		{"deux passages manqués",
			chModel.Chore{FrequencyType: "interval", Frequency: 6, FrequencyMetadataV2: every6, DeadlineMinutes: minutes(120)},
			at(2, 8), at(2, 17), []time.Time{at(2, 8), at(2, 14)}, ptr(at(2, 20))},
		{"sans limite : rien",
			chModel.Chore{FrequencyType: "interval", Frequency: 6, FrequencyMetadataV2: every6},
			at(2, 8), at(9, 8), nil, ptr(at(2, 8))},
		{"un rythme à moments n'a pas de limite de ce genre",
			chModel.Chore{FrequencyType: "daily", FrequencyMetadataV2: daily, DeadlineMinutes: minutes(60)},
			at(2, 18), at(9, 18), nil, ptr(at(2, 18))},
		{"tâche à créneaux : pas de limite",
			chModel.Chore{FrequencyType: "daily", FrequencyMetadataV2: &chModel.FrequencyMetadata{Slots: []chModel.Slot{{Name: "Soir", Time: "18:00"}}}, DeadlineMinutes: minutes(60)},
			at(2, 18), at(9, 18), nil, ptr(at(2, 18))},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			chore := test.chore
			due := test.due
			chore.NextDueDate = &due
			missed, next, err := missedPassages(context.Background(), &chore, test.now)
			if err != nil {
				t.Fatal(err)
			}
			if len(missed) != len(test.missed) {
				t.Fatalf("missed %v, want %v", missed, test.missed)
			}
			for i := range missed {
				if !missed[i].Equal(test.missed[i]) {
					t.Fatalf("missed %v, want %v", missed, test.missed)
				}
			}
			if (next == nil) != (test.next == nil) || next != nil && !next.Equal(*test.next) {
				t.Fatalf("next %v, want %v", next, test.next)
			}
		})
	}
}

// A task left long gone writes at most maxMissed passages and starts again
// after today.
func TestMissedPassagesBounded(t *testing.T) {
	paris, _ := time.LoadLocation("Europe/Paris")
	zone.Set(0, paris)
	defer zone.Forget(0)
	minutes := 60
	due := time.Date(2026, 1, 1, 18, 0, 0, 0, paris).UTC()
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, paris).UTC()
	hours := "hours"
	chore := chModel.Chore{FrequencyType: "interval", Frequency: 24, NextDueDate: &due, DeadlineMinutes: &minutes,
		FrequencyMetadataV2: &chModel.FrequencyMetadata{Unit: &hours, Timezone: "Europe/Paris"}}
	missed, next, err := missedPassages(context.Background(), &chore, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(missed) != maxMissed {
		t.Fatalf("missed %d passages, want %d", len(missed), maxMissed)
	}
	if want := time.Date(2026, 11, 5, 18, 0, 0, 0, paris); next == nil || !next.Equal(want) {
		t.Fatalf("next %v, want %v", next, want)
	}
}

func ptr(t time.Time) *time.Time { return &t }
