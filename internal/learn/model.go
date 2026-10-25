// Package learn holds the learning games: modules of knowledge (maths,
// languages, geography…) that parents install and turn on for each person,
// the games played with them and what each person knows.
//
// A module is a "hopla-module" document. The server checks and keeps it, and
// records what is played; the questions themselves are drawn by the web app,
// so a game also works offline.
package learn

import "time"

// Module is a module installed in a circle. Content is the whole document;
// the other fields repeat its header for lists.
type Module struct {
	ID       int      `json:"-" gorm:"primaryKey"`
	CircleID int      `json:"-" gorm:"column:circle_id;not null;uniqueIndex:idx_learn_module"`
	Key      string   `json:"id" gorm:"column:module_key;size:80;not null;uniqueIndex:idx_learn_module"`
	Version  string   `json:"version" gorm:"column:version;not null"`
	Name     string   `json:"name" gorm:"column:name;not null"`
	Subject  string   `json:"subject" gorm:"column:subject"`
	Levels   []string `json:"levels" gorm:"column:levels;type:text;serializer:json"`
	Audience string   `json:"audience" gorm:"column:audience"`
	// Children are the modules a pack gathers; a pack has no questions.
	Children []string `json:"children" gorm:"column:children;type:text;serializer:json"`
	// Builtin modules come from the Hopla catalogue and follow its updates.
	Builtin     bool      `json:"builtin" gorm:"column:builtin;not null;default:false"`
	Content     string    `json:"-" gorm:"column:content;type:text;not null"`
	InstalledAt time.Time `json:"installedAt" gorm:"column:installed_at"`
	UpdatedAt   time.Time `json:"updatedAt" gorm:"column:updated_at"`
}

func (Module) TableName() string { return "learn_modules" }

// IsPack tells whether the module only gathers other modules.
func (m Module) IsPack() bool { return len(m.Children) > 0 }

// Activation turns a module on for a person. Empty settings take the
// module's own.
type Activation struct {
	CircleID  int    `json:"-" gorm:"primaryKey;autoIncrement:false"`
	UserID    int    `json:"userId" gorm:"primaryKey;autoIncrement:false"`
	ModuleKey string `json:"module" gorm:"column:module_key;primaryKey;size:80"`
	// DailyCap is the most hops the person earns with this module in a day.
	DailyCap *int `json:"dailyCap" gorm:"column:daily_cap"`
	// UnlockPercent is how well a chapter must be known to open the next.
	UnlockPercent *int `json:"unlockPercent" gorm:"column:unlock_percent"`
	GameSettings
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at"`
}

// GameSettings shape a game for a person: how many questions, from what
// share of right answers the first star comes, and the hops of a star.
// Empty, they come from above, then from the module.
type GameSettings struct {
	Questions  *int `json:"questions" gorm:"column:questions"`
	Threshold  *int `json:"threshold" gorm:"column:threshold"`
	HopsByStar *int `json:"hopsByStar" gorm:"column:hops_by_star"`
}

func (Activation) TableName() string { return "learn_activations" }

// AllPacks is the scope of a person's settings that applies to every module.
const AllPacks = "*"

// PersonSetting is a person's setting for every module of a pack, or of all
// of them (AllPacks). A module's own activation setting comes first, then
// its pack's, then the one for all; empty settings leave the next one.
type PersonSetting struct {
	CircleID int    `json:"-" gorm:"primaryKey;autoIncrement:false"`
	UserID   int    `json:"userId" gorm:"primaryKey;autoIncrement:false"`
	Scope    string `json:"scope" gorm:"column:scope;primaryKey;size:80"`
	// DailyCap is the most hops earned with each module in a day.
	DailyCap      *int `json:"dailyCap" gorm:"column:daily_cap"`
	UnlockPercent *int `json:"unlockPercent" gorm:"column:unlock_percent"`
	// TotalCap, for all modules only, is the most hops earned with the
	// learning games in a day, all modules together.
	TotalCap *int `json:"totalCap" gorm:"column:total_cap"`
	GameSettings
	UpdatedAt time.Time `json:"updatedAt" gorm:"column:updated_at"`
}

func (PersonSetting) TableName() string { return "learn_person_settings" }

// Session is one game played. ClientID is drawn by the device, so a game
// sent twice, such as after being offline, counts once.
type Session struct {
	ID        int    `json:"id" gorm:"primaryKey"`
	CircleID  int    `json:"-" gorm:"column:circle_id;not null;uniqueIndex:idx_learn_session"`
	ClientID  string `json:"clientId" gorm:"column:client_id;size:64;not null;uniqueIndex:idx_learn_session"`
	UserID    int    `json:"userId" gorm:"column:user_id;not null;index"`
	ModuleKey string `json:"module" gorm:"column:module_key;size:80;not null"`
	// Day is the family's day the game was played, for the daily cap.
	Day         string    `json:"day" gorm:"column:day;size:10;not null"`
	Correct     int       `json:"correct" gorm:"column:correct;not null"`
	Total       int       `json:"total" gorm:"column:total;not null"`
	Stars       int       `json:"stars" gorm:"column:stars;not null"`
	Points      int       `json:"points" gorm:"column:points;not null"`
	DurationSec int       `json:"durationSec" gorm:"column:duration_sec"`
	PlayedAt    time.Time `json:"playedAt" gorm:"column:played_at;not null"`
	PlayedBy    int       `json:"playedBy" gorm:"column:played_by"`
	CreatedAt   time.Time `json:"createdAt" gorm:"column:created_at"`
}

func (Session) TableName() string { return "learn_sessions" }

// Card is what a person knows of one piece of knowledge, for spaced
// repetition. Key names the knowledge itself, such as "mul:7x8", not the
// module that asked it, so two modules asking the same thing share it.
type Card struct {
	CircleID int    `json:"-" gorm:"primaryKey;autoIncrement:false"`
	UserID   int    `json:"-" gorm:"primaryKey;autoIncrement:false"`
	Key      string `json:"key" gorm:"column:card_key;primaryKey;size:160"`
	// Box goes from 1 to 5: each right answer moves the card up and spaces
	// out its next review, a wrong one sends it back to 1.
	Box   int    `json:"box" gorm:"column:box;not null"`
	Due   string `json:"due" gorm:"column:due;size:10;not null"`
	Seen  int    `json:"seen" gorm:"column:seen;not null"`
	Right int    `json:"right" gorm:"column:right_count;not null"`
	Wrong int    `json:"wrong" gorm:"column:wrong_count;not null"`
	// LastAnswer is the last wrong answer given, for parents.
	LastAnswer string    `json:"lastAnswer,omitempty" gorm:"column:last_answer;size:120"`
	ModuleKey  string    `json:"module" gorm:"column:module_key;size:80"`
	LastSeenAt time.Time `json:"lastSeenAt" gorm:"column:last_seen_at"`
}

func (Card) TableName() string { return "learn_cards" }

// BoxDays is how many days a card waits before coming back, by box.
var BoxDays = map[int]int{1: 1, 2: 2, 3: 4, 4: 8, 5: 16}

// MasteredBox is the box from which a card counts as known.
const MasteredBox = 4
