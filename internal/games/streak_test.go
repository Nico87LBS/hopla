package games

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func noon(daysAgo int) time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 12, 0, 0, 0, time.Local).AddDate(0, 0, -daysAgo)
}

func TestStreaks(t *testing.T) {
	days := map[string]bool{}
	for _, ago := range []int{1, 2, 3, 6, 7} {
		days[dayKey(noon(ago))] = true
	}
	s := streakOf(2, days, noon(0))
	require.Equal(t, 3, s.Current, "alive until the end of today")
	require.False(t, s.DoneToday)
	require.Equal(t, 3, s.Best)
	days[dayKey(noon(0))] = true
	days[dayKey(noon(4))] = true
	days[dayKey(noon(5))] = true
	s = streakOf(2, days, noon(0))
	require.Equal(t, 8, s.Current)
	require.Equal(t, 8, s.Best)
	require.Equal(t, 0, streakOf(2, map[string]bool{dayKey(noon(2)): true}, noon(0)).Current, "a missed day breaks it")
}
