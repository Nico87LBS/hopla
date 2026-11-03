package calendar

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/nico87lbs/hopla/internal/chore"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	"github.com/nico87lbs/hopla/internal/games"
)

// The feed covers the tasks of the next feedDays days, one event for each
// time a task falls due (each slot of a task done several times a day), and
// the tasks done over the last doneDays days, crossed out.
const (
	feedDays  = 30
	doneDays  = 7
	maxEvents = 3000
	// perTask bounds the events of one task, for a task repeated every hour.
	perTask = 200
)

// event is one VEVENT of the feed.
type event struct {
	UID         string
	Start       time.Time
	End         time.Time
	Summary     string
	Description string
	Priority    int
	Modified    time.Time
	Done        bool
}

// feedOptions says what a feed shows.
type feedOptions struct {
	// Who are the members whose tasks the feed shows; nil shows everyone's.
	Who map[int]bool
	// Names are the family's members, to say who a task is for when the feed
	// shows several people.
	Names    map[int]string
	Several  bool
	Away     map[int]bool
	Currency string
	Now      time.Time
	Location *time.Location
}

func (o feedOptions) shows(id int) bool { return o.Who == nil || o.Who[id] }

// forWhom returns who a task is for now: its assignee, or everyone it is
// for when they do it together or when it has no assignee yet.
func forWhom(ch *chModel.Chore) []int {
	if ch.AssignStrategy != chModel.AssignmentStrategyTogether && ch.AssignedTo != nil {
		return []int{*ch.AssignedTo}
	}
	ids := make([]int, 0, len(ch.Assignees))
	for _, a := range ch.Assignees {
		ids = append(ids, a.UserID)
	}
	return ids
}

func (o feedOptions) concerns(ch *chModel.Chore) bool {
	if o.Who == nil {
		return true
	}
	for _, id := range forWhom(ch) {
		if o.Who[id] {
			return true
		}
	}
	return false
}

// label names the people of a task, for a feed that shows several.
func (o feedOptions) label(ids []int) string {
	if !o.Several {
		return ""
	}
	names := []string{}
	for _, id := range ids {
		if name := o.Names[id]; name != "" && o.shows(id) {
			names = append(names, name)
		}
	}
	return strings.Join(names, ", ")
}

// strike crosses a text out, character by character, as calendars show it.
func strike(s string) string {
	var b strings.Builder
	for _, r := range s {
		b.WriteRune(r)
		if r != ' ' {
			b.WriteRune('̶')
		}
	}
	return b.String()
}

func title(name, slot, who string) string {
	if slot != "" {
		name += " · " + slot
	}
	if who != "" {
		name += " (" + who + ")"
	}
	return name
}

func dayKey(t time.Time, loc *time.Location) string { return t.In(loc).Format("2006-01-02") }

func eventDuration(ch *chModel.Chore, o chore.Occurrence) time.Duration {
	if o.Ends != nil {
		if d := o.Ends.Sub(o.At); d > 0 && d < time.Hour {
			return d
		}
		return time.Hour
	}
	if ch.CompletionWindow != nil && *ch.CompletionWindow > 0 {
		return time.Duration(*ch.CompletionWindow) * time.Hour
	}
	return time.Hour
}

// planEvents lists the feed's events: what is still to do, then what was
// done, in time order.
func planEvents(ctx context.Context, chores []*chModel.Chore, history []*chModel.ChoreHistory, opt feedOptions) []event {
	loc := opt.Location
	if loc == nil {
		loc = time.UTC
	}
	today := time.Date(opt.Now.In(loc).Year(), opt.Now.In(loc).Month(), opt.Now.In(loc).Day(), 0, 0, 0, 0, loc)
	to := today.AddDate(0, 0, feedDays)
	byID := make(map[int]*chModel.Chore, len(chores))
	for _, ch := range chores {
		byID[ch.ID] = ch
	}

	// The slots done (or waiting for a parent) are shown as done, not as to do.
	doneSlot := map[string]bool{}
	events := []event{}
	for _, h := range history {
		ch := byID[h.ChoreID]
		if ch == nil || !opt.shows(h.CompletedBy) {
			continue
		}
		if h.Status != chModel.ChoreHistoryStatusCompleted && h.Status != chModel.ChoreHistoryStatusPendingApproval {
			continue
		}
		at := h.PerformedAt
		slotName := ""
		if h.Slot != nil && h.DueDate != nil {
			at = h.DueDate
			doneSlot[fmt.Sprintf("%d/%d/%s", ch.ID, *h.Slot, dayKey(*h.DueDate, loc))] = true
			if slots := ch.FrequencyMetadataV2; slots != nil && *h.Slot < len(slots.Slots) {
				slotName = slots.Slots[*h.Slot].Name
			}
		}
		if at == nil {
			continue
		}
		mark := "✓ "
		if h.Status == chModel.ChoreHistoryStatusPendingApproval {
			mark = "⏳ "
		}
		modified := h.CreatedAt
		if h.UpdatedAt != nil {
			modified = *h.UpdatedAt
		}
		events = append(events, event{
			UID:         fmt.Sprintf("fait-%d@hopla", h.ID),
			Start:       at.UTC(),
			End:         at.UTC().Add(30 * time.Minute),
			Summary:     mark + strike(title(ch.Name, slotName, "")) + whoSuffix(opt.label([]int{h.CompletedBy})),
			Description: doneDescription(h, opt),
			Modified:    modified.UTC(),
			Done:        true,
		})
	}

	for _, ch := range chores {
		if len(events) >= maxEvents {
			break
		}
		if !opt.concerns(ch) || games.Paused(ch, opt.Away) {
			continue
		}
		who := opt.label(forWhom(ch))
		for _, o := range chore.Occurrences(ctx, ch, today, to, perTask) {
			if o.Slot != nil && doneSlot[fmt.Sprintf("%d/%d/%s", ch.ID, *o.Slot, dayKey(o.At, loc))] {
				continue
			}
			uid := fmt.Sprintf("tache-%d-%s@hopla", ch.ID, o.At.Format("20060102T1504Z"))
			events = append(events, event{
				UID:         uid,
				Start:       o.At,
				End:         o.At.Add(eventDuration(ch, o)),
				Summary:     title(ch.Name, o.SlotName, who),
				Description: buildChoreDescription(ch, opt.Currency),
				Priority:    mapPriority(ch.Priority),
				Modified:    ch.UpdatedAt.UTC(),
			})
		}
	}
	sort.SliceStable(events, func(a, b int) bool { return events[a].Start.Before(events[b].Start) })
	if len(events) > maxEvents {
		events = events[:maxEvents]
	}
	return events
}

func whoSuffix(who string) string {
	if who == "" {
		return ""
	}
	return " (" + who + ")"
}

func doneDescription(h *chModel.ChoreHistory, opt feedOptions) string {
	parts := []string{}
	if h.Status == chModel.ChoreHistoryStatusPendingApproval {
		parts = append(parts, "En attente d'un parent")
	} else {
		parts = append(parts, "Fait")
	}
	if name := opt.Names[h.CompletedBy]; name != "" {
		parts[0] += " par " + name
	}
	if h.Points != nil && *h.Points > 0 {
		parts = append(parts, fmt.Sprintf("+%d %s", *h.Points, currencyName(opt.Currency)))
	}
	return strings.Join(parts, "\n")
}

// writeCalendar renders the events as a VCALENDAR. alarm, in minutes, adds a
// reminder before each task still to do.
func writeCalendar(name, timezone string, events []event, alarm int, now time.Time) string {
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\n")
	b.WriteString("VERSION:2.0\r\n")
	b.WriteString(foldLine(fmt.Sprintf("PRODID:%s", calendarProdID)))
	b.WriteString(foldLine(fmt.Sprintf("X-WR-CALNAME:%s", escapeICalText(name))))
	b.WriteString("METHOD:PUBLISH\r\n")
	b.WriteString("CALSCALE:GREGORIAN\r\n")
	// Calendar apps read the feed again about every hour.
	b.WriteString("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n")
	b.WriteString("X-PUBLISHED-TTL:PT1H\r\n")
	// "Local" names no zone a calendar app knows.
	if timezone != "" && timezone != "Local" {
		b.WriteString(foldLine(fmt.Sprintf("X-WR-TIMEZONE:%s", timezone)))
	}
	stamp := now.UTC().Format(icalTime)
	for _, e := range events {
		b.WriteString("BEGIN:VEVENT\r\n")
		b.WriteString(foldLine("UID:" + e.UID))
		b.WriteString("DTSTAMP:" + stamp + "\r\n")
		b.WriteString("DTSTART:" + e.Start.UTC().Format(icalTime) + "\r\n")
		b.WriteString("DTEND:" + e.End.UTC().Format(icalTime) + "\r\n")
		b.WriteString(foldLine("SUMMARY:" + escapeICalText(e.Summary)))
		if e.Description != "" {
			b.WriteString(foldLine("DESCRIPTION:" + escapeICalText(e.Description)))
		}
		if e.Priority > 0 {
			b.WriteString(fmt.Sprintf("PRIORITY:%d\r\n", e.Priority))
		}
		// A task takes no time in the agenda: it never shows as busy.
		b.WriteString("TRANSP:TRANSPARENT\r\n")
		if !e.Modified.IsZero() {
			b.WriteString("LAST-MODIFIED:" + e.Modified.UTC().Format(icalTime) + "\r\n")
		}
		if alarm > 0 && !e.Done {
			b.WriteString("BEGIN:VALARM\r\n")
			b.WriteString("ACTION:DISPLAY\r\n")
			b.WriteString(foldLine("DESCRIPTION:" + escapeICalText(e.Summary)))
			b.WriteString(fmt.Sprintf("TRIGGER:-PT%dM\r\n", alarm))
			b.WriteString("END:VALARM\r\n")
		}
		b.WriteString("END:VEVENT\r\n")
	}
	b.WriteString("END:VCALENDAR\r\n")
	return b.String()
}

const icalTime = "20060102T150405Z"
