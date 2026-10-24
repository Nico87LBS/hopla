package games

import (
	"fmt"
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
		days[dayKey(noon(ago), time.Local)] = true
	}
	s := streakOf(2, days, nil, noon(0), time.Local)
	require.Equal(t, 3, s.Current, "alive until the end of today")
	require.False(t, s.DoneToday)
	require.Equal(t, 3, s.Best)
	days[dayKey(noon(0), time.Local)] = true
	days[dayKey(noon(4), time.Local)] = true
	days[dayKey(noon(5), time.Local)] = true
	s = streakOf(2, days, nil, noon(0), time.Local)
	require.Equal(t, 8, s.Current)
	require.Equal(t, 8, s.Best)
	require.Equal(t, 0, streakOf(2, map[string]bool{dayKey(noon(2), time.Local): true}, nil, noon(0), time.Local).Current, "a missed day breaks it")
}

func TestStreakSkipsDaysAway(t *testing.T) {
	days := map[string]bool{dayKey(noon(1), time.Local): true, dayKey(noon(5), time.Local): true, dayKey(noon(6), time.Local): true}
	away := map[string]bool{dayKey(noon(2), time.Local): true, dayKey(noon(3), time.Local): true, dayKey(noon(4), time.Local): true}
	s := streakOf(2, days, away, noon(0), time.Local)
	require.Equal(t, 3, s.Current, "the days away neither break nor extend the run")
	require.Equal(t, 3, s.Best)
	delete(away, dayKey(noon(3), time.Local))
	s = streakOf(2, days, away, noon(0), time.Local)
	require.Equal(t, 1, s.Current, "a day at home without a task still breaks it")
	require.Equal(t, 2, s.Best)
	s = streakOf(2, days, map[string]bool{dayKey(noon(0), time.Local): true, dayKey(noon(1), time.Local): true}, noon(0), time.Local)
	require.Equal(t, 1, s.Current, "away today keeps yesterday's run")
}

func TestQuestTargetFollowsDaysAway(t *testing.T) {
	monday := time.Date(2026, 10, 19, 0, 0, 0, 0, time.Local)
	sunday := monday.AddDate(0, 0, 7)
	away := map[string]bool{"2026-10-19": true, "2026-10-20": true, "2026-10-21": true}
	require.Equal(t, 4, scaledTarget(7, monday, sunday, away, time.Local))
	require.Equal(t, 3, scaledTarget(5, monday, sunday, away, time.Local), "rounded up")
	require.Equal(t, 5, scaledTarget(5, monday, sunday, nil, time.Local))
	require.Equal(t, 5, scaledTarget(5, monday, sunday, map[string]bool{"2026-10-12": true}, time.Local), "a day of another week")
	for day := 22; day <= 25; day++ {
		away[fmt.Sprintf("2026-10-%d", day)] = true
	}
	require.Equal(t, 1, scaledTarget(5, monday, sunday, away, time.Local), "never below 1")
}
