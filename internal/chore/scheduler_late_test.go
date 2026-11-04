package chore

import (
	"context"
	"testing"
	"time"
	_ "time/tzdata"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/zone"
)

// A task done late is not due again before the next day.
func TestNextDueAfterDoneLate(t *testing.T) {
	paris, _ := time.LoadLocation("Europe/Paris")
	zone.Set(0, paris)
	defer zone.Forget(0)
	days, hours := "days", "hours"
	monday, wednesday, friday := "monday", "wednesday", "friday"
	at := func(d, h int) time.Time { return time.Date(2026, 11, d, h, 0, 0, 0, paris) }
	meta := func(unit *string) *chModel.FrequencyMetadata {
		return &chModel.FrequencyMetadata{Unit: unit, Time: "2026-01-01T18:00:00+01:00", Timezone: "Europe/Paris"}
	}
	tests := []struct {
		name  string
		chore chModel.Chore
		due   time.Time
		done  time.Time
		want  time.Time
	}{
		{"quotidienne, un jour de retard", chModel.Chore{FrequencyType: "daily", FrequencyMetadataV2: meta(nil)}, at(3, 18), at(4, 8), at(5, 18)},
		{"quotidienne, trois jours de retard", chModel.Chore{FrequencyType: "daily", FrequencyMetadataV2: meta(nil)}, at(1, 18), at(4, 8), at(5, 18)},
		{"quotidienne, à l'heure", chModel.Chore{FrequencyType: "daily", FrequencyMetadataV2: meta(nil)}, at(4, 18), at(4, 17), at(5, 18)},
		{"quotidienne, en avance", chModel.Chore{FrequencyType: "daily", FrequencyMetadataV2: meta(nil)}, at(5, 18), at(4, 17), at(6, 18)},
		{"tous les jours, en retard", chModel.Chore{FrequencyType: "interval", Frequency: 1, FrequencyMetadataV2: meta(&days)}, at(2, 18), at(4, 8), at(5, 18)},
		{"hebdomadaire, en retard d'un jour", chModel.Chore{FrequencyType: "weekly", FrequencyMetadataV2: meta(nil)}, at(2, 18), at(3, 8), at(9, 18)},
		{"lundi, mercredi, vendredi", chModel.Chore{FrequencyType: "days_of_the_week", FrequencyMetadataV2: &chModel.FrequencyMetadata{
			Days: []*string{&monday, &wednesday, &friday}, Time: "2026-01-01T18:00:00+01:00", Timezone: "Europe/Paris"}}, at(2, 18), at(4, 8), at(6, 18)},
		{"toutes les 12 heures", chModel.Chore{FrequencyType: "interval", Frequency: 12, FrequencyMetadataV2: meta(&hours)}, at(3, 6), at(4, 8), at(4, 18)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			due := tt.due.UTC()
			tt.chore.NextDueDate = &due
			got, err := nextDueAfterDone(context.Background(), &tt.chore, tt.done.UTC())
			if err != nil || got == nil || !got.Equal(tt.want) {
				t.Fatalf("got %v (%v), want %v", got.In(paris), err, tt.want)
			}
		})
	}
}
