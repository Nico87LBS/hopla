// Package backup saves a whole family in one file and puts it back: the
// members and their accounts, the tasks and their history, the hops, the
// rewards, the games, Apprendre and the files (photos, attachments).
package backup

import (
	"fmt"
	"strings"
)

// scope says which rows of a table belong to a family.
type scope int

const (
	byFamily    scope = iota // family_id = la famille
	byFamilyID               // id = la famille (la table families)
	byUserID                 // id parmi les membres (la table users)
	byMember                 // user_id parmi les membres
	byChore                  // chore_id parmi les tâches de la famille
	byRoutine                // routine_id parmi les routines de la famille
	byChallenge              // challenge_id parmi les défis de la famille
)

type table struct {
	name  string
	scope scope
}

// saved lists the tables kept in a backup, parents first: a restore inserts
// them in this order and empties them in the reverse one.
var saved = []table{
	{"families", byFamilyID},
	{"users", byUserID},
	{"user_families", byFamily},
	{"labels", byFamily},
	{"chores", byFamily},
	{"chore_assignees", byChore},
	{"chore_labels", byChore},
	{"chore_histories", byChore},
	{"sub_tasks", byChore},
	{"time_sessions", byChore},
	{"rewards", byFamily},
	{"reward_redemptions", byFamily},
	{"points_presets", byFamily},
	{"points_histories", byFamily},
	{"game_rules", byFamily},
	{"bonus_periods", byFamily},
	{"flashes", byFamily},
	{"surprises", byFamily},
	{"game_ranks", byFamily},
	{"quests", byFamily},
	{"quest_draws", byFamily},
	{"challenges", byFamily},
	{"challenge_wins", byChallenge},
	{"absences", byFamily},
	{"routines", byFamily},
	{"routine_steps", byRoutine},
	{"routine_wins", byRoutine},
	{"learn_modules", byFamily},
	{"learn_activations", byFamily},
	{"learn_person_settings", byFamily},
	{"learn_placements", byFamily},
	{"learn_pack_players", byFamily},
	{"learn_card_edits", byFamily},
	{"learn_cards", byFamily},
	{"learn_reviews", byFamily},
	{"learn_tests", byFamily},
	{"learn_sessions", byFamily},
	{"learn_reports", byFamily},
	{"learn_recre_settings", byFamily},
	{"learn_recre_plays", byFamily},
	{"api_tokens", byMember},
	{"calendar_tokens", byMember},
	{"storage_files", byMember},
	{"storage_usages", byFamily},
	{"sync_cursors", byFamily},
	{"tombstones", byFamily},
}

// dropped lists the tables of short-lived rows: a restore empties them for the
// family (everyone signs in again) but a backup never keeps them.
var dropped = []table{
	{"user_sessions", byMember},
	{"mfa_sessions", byMember},
	{"user_password_resets", byMember},
	{"learn_play_tokens", byFamily},
}

// server lists the tables of the whole server, outside any family.
var server = []string{"migrations", "gorp_migrations", "sqlite_sequence"}

// ids are the keys that tie a family's rows together.
type ids struct {
	family     int
	members    []int
	chores     []int
	routines   []int
	challenges []int
}

// where returns the condition that picks a family's rows of a table.
func (t table) where(k ids) (string, []any) {
	switch t.scope {
	case byFamily:
		return "family_id = ?", []any{k.family}
	case byFamilyID:
		return "id = ?", []any{k.family}
	case byUserID:
		return "id IN ?", []any{orNone(k.members)}
	case byMember:
		return "user_id IN ?", []any{orNone(k.members)}
	case byChore:
		return "chore_id IN ?", []any{orNone(k.chores)}
	case byRoutine:
		return "routine_id IN ?", []any{orNone(k.routines)}
	case byChallenge:
		return "challenge_id IN ?", []any{orNone(k.challenges)}
	}
	panic(fmt.Sprintf("backup: table %s sans portée", t.name))
}

// orNone keeps "IN ?" valid for an empty list: 0 is never a row's id.
func orNone(list []int) []int {
	if len(list) == 0 {
		return []int{0}
	}
	return list
}

// known reports whether a table is listed above, saved or not.
func known(name string) bool {
	for _, t := range saved {
		if t.name == name {
			return true
		}
	}
	for _, t := range dropped {
		if t.name == name {
			return true
		}
	}
	for _, n := range server {
		if n == name {
			return true
		}
	}
	return strings.HasPrefix(name, "sqlite_")
}
