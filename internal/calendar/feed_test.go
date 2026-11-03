package calendar

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
)

func ptr[T any](v T) *T { return &v }

func plan(chores []*chModel.Chore, history []*chModel.ChoreHistory, opt feedOptions) []event {
	if opt.Now.IsZero() {
		opt.Now = feedNow
	}
	if opt.Location == nil {
		opt.Location = time.UTC
	}
	return planEvents(context.Background(), chores, history, opt)
}

func TestPlanEvents_RepeatsOverThirtyDays(t *testing.T) {
	due := time.Date(2025, 6, 2, 9, 0, 0, 0, time.UTC)
	chores := []*chModel.Chore{{ID: 1, Name: "Poubelles", NextDueDate: &due, FrequencyType: chModel.FrequencyTypeWeekly}}

	events := plan(chores, nil, feedOptions{})

	// June 2, 9, 16, 23 and 30: the 30 days from June 1.
	if len(events) != 5 {
		t.Fatalf("expected 5 weekly events, got %d", len(events))
	}
	if !events[4].Start.Equal(due.AddDate(0, 0, 28)) {
		t.Errorf("last event at %v", events[4].Start)
	}
}

func TestPlanEvents_OneEventPerSlot(t *testing.T) {
	chores := []*chModel.Chore{{
		ID: 2, Name: "Dents", FrequencyType: chModel.FrequencyTypeDaily,
		FrequencyMetadataV2: &chModel.FrequencyMetadata{Slots: []chModel.Slot{{Name: "Matin", Time: "07:30"}, {Name: "Soir", Time: "20:00"}}},
	}}
	// The morning slot of the first day is done: it shows crossed out, once.
	morning := time.Date(2025, 6, 1, 7, 30, 0, 0, time.Local)
	done := time.Date(2025, 6, 1, 7, 40, 0, 0, time.UTC)
	history := []*chModel.ChoreHistory{{ID: 9, ChoreID: 2, CompletedBy: 5, Status: chModel.ChoreHistoryStatusCompleted,
		Slot: ptr(0), DueDate: &morning, PerformedAt: &done}}

	events := plan(chores, history, feedOptions{Location: time.Local, Names: map[int]string{5: "Anna"}})

	if len(events) != 60 {
		t.Fatalf("expected 30 days x 2 slots = 60 events, got %d", len(events))
	}
	var crossed, mornings int
	for _, e := range events {
		if e.Done {
			crossed++
			if !strings.HasPrefix(e.Summary, "✓ ") || !strings.Contains(e.Summary, "̶") {
				t.Errorf("a done task is not crossed out: %q", e.Summary)
			}
		}
		if strings.Contains(e.Summary, "Matin") {
			mornings++
		}
	}
	if crossed != 1 {
		t.Errorf("expected one done event, got %d", crossed)
	}
	if mornings != 29 {
		t.Errorf("expected 29 mornings still to do, got %d", mornings)
	}
}

func TestPlanEvents_WhoAndLabels(t *testing.T) {
	due := time.Date(2025, 6, 3, 18, 0, 0, 0, time.UTC)
	chores := []*chModel.Chore{
		{ID: 1, Name: "Table", NextDueDate: &due, AssignedTo: ptr(5)},
		{ID: 2, Name: "Linge", NextDueDate: &due, AssignedTo: ptr(6)},
		{ID: 3, Name: "Ranger", NextDueDate: &due, AssignStrategy: chModel.AssignmentStrategyTogether,
			Assignees: []chModel.ChoreAssignees{{UserID: 5}, {UserID: 6}}},
	}
	names := map[int]string{5: "Anna", 6: "Elena"}

	anna := plan(chores, nil, feedOptions{Who: map[int]bool{5: true}, Names: names})
	if len(anna) != 2 {
		t.Fatalf("Anna's feed should have her task and the shared one, got %d", len(anna))
	}
	for _, e := range anna {
		if strings.Contains(e.Summary, "(") {
			t.Errorf("a one-person feed names nobody: %q", e.Summary)
		}
	}

	family := plan(chores, nil, feedOptions{Several: true, Names: names})
	if len(family) != 3 {
		t.Fatalf("the family feed should have every task, got %d", len(family))
	}
	summaries := family[0].Summary + family[1].Summary + family[2].Summary
	for _, want := range []string{"Table (Anna)", "Linge (Elena)", "Ranger (Anna, Elena)"} {
		if !strings.Contains(summaries, want) {
			t.Errorf("missing %q in %q", want, summaries)
		}
	}
}

func TestPlanEvents_SkipsTasksOfMembersAway(t *testing.T) {
	due := time.Date(2025, 6, 3, 18, 0, 0, 0, time.UTC)
	chores := []*chModel.Chore{{ID: 1, Name: "Table", NextDueDate: &due, AssignedTo: ptr(5),
		Assignees: []chModel.ChoreAssignees{{UserID: 5}}}}

	if events := plan(chores, nil, feedOptions{Away: map[int]bool{5: true}}); len(events) != 0 {
		t.Errorf("a task paused while its child is away should not show, got %d", len(events))
	}
}

func TestWriteCalendar_Alarm(t *testing.T) {
	start := time.Date(2025, 6, 3, 18, 0, 0, 0, time.UTC)
	events := []event{
		{UID: "a", Start: start, End: start.Add(time.Hour), Summary: "À faire"},
		{UID: "b", Start: start, End: start.Add(time.Hour), Summary: "Fait", Done: true},
	}

	if out := writeCalendar("Hopla", "", events, 0, feedNow); strings.Contains(out, "VALARM") {
		t.Error("no reminder was asked for")
	}
	out := writeCalendar("Hopla", "", events, 15, feedNow)
	if strings.Count(out, "BEGIN:VALARM") != 1 || !strings.Contains(out, "TRIGGER:-PT15M") {
		t.Errorf("expected one reminder 15 minutes before the task to do:\n%s", out)
	}
}

// seedMember adds a member to the test family with a role.
func seedMember(t *testing.T, h *Handler, id int, name string, role fModel.UserRole) {
	t.Helper()
	if id != testUserID {
		if err := h.db.Create(&uModel.User{ID: id, DisplayName: name, Username: name, FamilyID: testFamilyID}).Error; err != nil {
			t.Fatalf("seed user: %v", err)
		}
	}
	if err := h.db.Create(&fModel.UserFamily{UserID: id, FamilyID: testFamilyID, Role: role, IsActive: true}).Error; err != nil {
		t.Fatalf("seed member: %v", err)
	}
}

func feedStatus(t *testing.T, router http.Handler, token, query string) (int, string) {
	t.Helper()
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/feed/"+token+".ics"+query, nil))
	return w.Code, w.Body.String()
}

func TestServeCalendar_WhoAndReminder(t *testing.T) {
	h, db, router := newTestHandler(t)
	seedMember(t, h, testUserID, "Test User", fModel.UserRoleMember)
	seedMember(t, h, 8, "Anna", fModel.UserRoleMember)

	due := time.Now().UTC().Add(24 * time.Hour)
	if err := db.Create(&chModel.Chore{Name: "Table", FamilyID: testFamilyID, CreatedBy: testUserID, IsActive: true,
		NextDueDate: &due, AssignedTo: ptr(8)}).Error; err != nil {
		t.Fatalf("seed chore: %v", err)
	}
	_, created := callJSON(t, router, http.MethodPost, "/url")
	token := tokenFromURL(t, created.URL)

	if code, body := feedStatus(t, router, token, ""); code != http.StatusOK || strings.Contains(body, "Table") {
		t.Errorf("my feed should not show Anna's task (%d):\n%s", code, body)
	}
	if code, _ := feedStatus(t, router, token, "?qui=famille"); code != http.StatusForbidden {
		t.Errorf("a child cannot see the family's feed, got %d", code)
	}
	if code, _ := feedStatus(t, router, token, "?rappel=abc"); code != http.StatusBadRequest {
		t.Errorf("a bad reminder should be refused, got %d", code)
	}

	// Once a parent, the same link shows Anna's tasks or the family's.
	if err := db.Model(&fModel.UserFamily{}).Where("user_id = ?", testUserID).Update("role", fModel.UserRoleAdmin).Error; err != nil {
		t.Fatal(err)
	}
	code, body := feedStatus(t, router, token, "?qui=8&rappel=10")
	if code != http.StatusOK || !strings.Contains(body, "SUMMARY:Table") || !strings.Contains(body, "TRIGGER:-PT10M") ||
		!strings.Contains(body, "X-WR-CALNAME:Hopla - Anna") {
		t.Errorf("Anna's feed with a reminder (%d):\n%s", code, body)
	}
	code, body = feedStatus(t, router, token, "?qui=famille")
	if code != http.StatusOK || !strings.Contains(body, "SUMMARY:Table (Anna)") {
		t.Errorf("the family feed should name who each task is for (%d):\n%s", code, body)
	}
	if code, _ := feedStatus(t, router, token, "?qui=99"); code != http.StatusNotFound {
		t.Errorf("an unknown member should be refused, got %d", code)
	}
}
