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
	monday, tuesday := "monday", "tuesday"
	at := func(d, h int) time.Time { return time.Date(2026, 11, d, h, 0, 0, 0, paris).UTC() }
	minutes := func(n int) *int { return &n }
	weekdays := &chModel.FrequencyMetadata{Days: []*string{&monday, &tuesday}, Time: "2026-01-01T18:00:00+01:00", Timezone: "Europe/Paris"}
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
			chModel.Chore{FrequencyType: "days_of_the_week", FrequencyMetadataV2: weekdays, DeadlineMinutes: minutes(120)},
			at(2, 18), at(2, 19), nil, ptr(at(2, 18))},
		{"lundi manqué à 20h, passe à mardi",
			chModel.Chore{FrequencyType: "days_of_the_week", FrequencyMetadataV2: weekdays, DeadlineMinutes: minutes(120)},
			at(2, 18), at(2, 20), []time.Time{at(2, 18)}, ptr(at(3, 18))},
		{"lundi et mardi manqués, passe au lundi suivant",
			chModel.Chore{FrequencyType: "days_of_the_week", FrequencyMetadataV2: weekdays, DeadlineMinutes: minutes(120)},
			at(2, 18), at(4, 9), []time.Time{at(2, 18), at(3, 18)}, ptr(at(9, 18))},
		{"limite au lendemain : mardi encore en retard",
			chModel.Chore{FrequencyType: "daily", FrequencyMetadataV2: daily, DeadlineMinutes: minutes(36 * 60)},
			at(2, 18), at(4, 7), []time.Time{at(2, 18)}, ptr(at(3, 18))},
		{"une seule fois : manquée puis plus d'échéance",
			chModel.Chore{FrequencyType: "once", DeadlineMinutes: minutes(60)},
			at(7, 10), at(7, 11), []time.Time{at(7, 10)}, nil},
		{"sans limite : rien",
			chModel.Chore{FrequencyType: "daily", FrequencyMetadataV2: daily},
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
	chore := chModel.Chore{FrequencyType: "daily", NextDueDate: &due, DeadlineMinutes: &minutes,
		FrequencyMetadataV2: &chModel.FrequencyMetadata{Time: "2026-01-01T18:00:00+01:00", Timezone: "Europe/Paris"}}
	missed, next, err := missedPassages(context.Background(), &chore, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(missed) != maxMissed {
		t.Fatalf("missed %d passages, want %d", len(missed), maxMissed)
	}
	if want := time.Date(2026, 11, 6, 18, 0, 0, 0, paris); next == nil || !next.Equal(want) {
		t.Fatalf("next %v, want %v", next, want)
	}
}

func ptr(t time.Time) *time.Time { return &t }
