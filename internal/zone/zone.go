// Package zone keeps each family's time zone. Every date the family sees, and
// every "today" the server counts (due dates, slots, streaks, quests, reward
// quotas), follows it rather than the zone of the device in hand: a parent's
// tablet can stay in UTC while the children's follows the family on holiday.
// A family without one follows the server's zone (TZ).
package zone

import (
	"sync"
	"time"

	"gorm.io/gorm"
)

var (
	mu    sync.RWMutex
	db    *gorm.DB
	cache = map[int]*time.Location{}
)

// Init gives the package the database it reads the families' zones from.
func Init(database *gorm.DB) {
	mu.Lock()
	defer mu.Unlock()
	db = database
	cache = map[int]*time.Location{}
}

// Server returns the server's zone, the default of every family.
func Server() *time.Location { return time.Local }

// Of returns a family's zone.
func Of(circleID int) *time.Location {
	mu.RLock()
	loc, ok := cache[circleID]
	database := db
	mu.RUnlock()
	if ok {
		return loc
	}
	loc = Server()
	if database != nil && circleID != 0 {
		var name string
		if err := database.Table("circles").Select("timezone").Where("id = ?", circleID).Scan(&name).Error; err == nil {
			if l, err := Load(name); err == nil && l != nil {
				loc = l
			}
		}
		mu.Lock()
		cache[circleID] = loc
		mu.Unlock()
	}
	return loc
}

// Name returns the IANA name of a family's zone.
func Name(circleID int) string { return NameOf(Of(circleID)) }

// NameOf returns the IANA name of a zone; the server's zone has the name of
// TZ, "UTC" when unset.
func NameOf(loc *time.Location) string {
	if name := loc.String(); name != "" && name != "Local" {
		return name
	}
	return "UTC"
}

// Load reads an IANA zone name; an empty name is the server's zone (nil).
func Load(name string) (*time.Location, error) {
	if name == "" {
		return nil, nil
	}
	return time.LoadLocation(name)
}

// Set records a family's zone; nil is the server's.
func Set(circleID int, loc *time.Location) {
	if loc == nil {
		loc = Server()
	}
	mu.Lock()
	cache[circleID] = loc
	mu.Unlock()
}

// Forget drops a family's cached zone after it changed.
func Forget(circleID int) {
	mu.Lock()
	delete(cache, circleID)
	mu.Unlock()
}

// StartOfDay returns midnight of the day t falls on in loc.
func StartOfDay(t time.Time, loc *time.Location) time.Time {
	local := t.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
}

// SameWallClock moves t to the same date and time of day in another zone:
// a task due at 07:00 at home is due at 07:00 where the family went.
func SameWallClock(t time.Time, from, to *time.Location) time.Time {
	local := t.In(from)
	return time.Date(local.Year(), local.Month(), local.Day(), local.Hour(), local.Minute(), local.Second(), local.Nanosecond(), to)
}
