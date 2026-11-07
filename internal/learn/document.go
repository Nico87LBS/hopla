package learn

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// Format is the version of the module document this server reads.
const Format = "hopla-module/1"

// Limits of a module document.
const (
	MaxDocumentBytes = 2 << 20
	maxChapters      = 50
	maxCards         = 5000
	maxGenerators    = 200
	maxChildren      = 40
	// maxPlaceName is the longest name of the level and of the group of a
	// chapter.
	maxPlaceName = 60
)

// Settings defaults, used when a module leaves a setting out.
const (
	DefaultQuestions  = 10
	DefaultNew        = 3
	DefaultThreshold  = 70
	DefaultHopsByStar = 1
	DefaultDailyCap   = 10
	// DefaultRetention is the share of cards to recall wanted, in percent:
	// the higher, the sooner a card comes back.
	DefaultRetention = 90
	// DefaultMaxInterval is the longest wait of a card, in days.
	DefaultMaxInterval = 365
	// DefaultNewPerDay is the most new questions of a module in a day.
	DefaultNewPerDay = 10
	// DefaultReviewBonus is the hops earned once a day for reviewing
	// everything due, and DefaultReviewMax the most questions due reviewed
	// in a day, all modules together.
	DefaultReviewBonus = 2
	DefaultReviewMax   = 50
)

// Limits of the spaced repetition settings.
const (
	MinRetention   = 70
	MaxRetention   = 97
	MinMaxInterval = 7
	MaxMaxInterval = 3650
	MaxNewPerDay   = 200
	MaxReviewBonus = 20
	MinReviewMax   = 5
	MaxReviewMax   = 1000
)

// The question types and generators the game knows. A module using another
// one is refused, rather than shown with questions nobody can answer.
var (
	CardTypes      = []string{"choix", "saisie", "retourner", "ecoute", "associer", "ordre", "classer", "zones", "tracer"}
	GeneratorKinds = []string{"addition", "soustraction", "multiplication", "division", "double", "moitie",
		"complement", "comparaison", "position", "lettres", "modele", "compter", "prenom", "heure", "mesurer",
		"regler_heure"}
	Audiences = []string{"enfant", "adulte", "tous"}
	// ReservedDomains begin the keys the generators make, such as "mul:7x8":
	// a written card may not take them, nor a module its id.
	ReservedDomains = []string{"add", "sub", "mul", "div", "cmp", "pos", "num", "pb", "dbl", "half", "cpl", "cnt", "prenom", "hr", "mes"}
)

var (
	idPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,79}$`)
	// A shared key is domaine:compétence:sujet, from two to six parts.
	keyPattern = regexp.MustCompile(`^[a-z0-9-]+(:[a-z0-9-]+){1,5}$`)
)

// maxSharedKey leaves room for the ":inverse" of the other direction.
const maxSharedKey = 150

// Document is the part of a module document the server reads. The web app
// reads the rest, such as how each generator draws its numbers.
type Document struct {
	Format      string `json:"format"`
	ID          string `json:"id"`
	Version     string `json:"version"`
	Name        string `json:"nom"`
	Author      string `json:"auteur"`
	Description string `json:"description"`
	Subject     string `json:"matiere"`
	// Icon is the emoji drawn beside the module's name, so a child finds it
	// at a glance.
	Icon     string   `json:"icone"`
	Levels   []string `json:"niveaux"`
	Audience string   `json:"public"`
	Language string   `json:"langue"`
	// ReadAloud lets the device say the questions and answers aloud, for
	// those who do not read yet, unless a parent turned it off for them.
	ReadAloud ReadAloud `json:"lecture_voix_haute"`
	// Writing is how the words are written: in print (empty), in cursive
	// ("cursive"), or only the question in cursive ("cursive_question").
	Writing       string      `json:"ecriture"`
	Modules       []string    `json:"modules"`
	Prerequisites []Prereq    `json:"prerequis"`
	Chapters      []Chapter   `json:"chapitres"`
	Cards         []CardDef   `json:"fiches"`
	Generators    []Generator `json:"generateurs"`
	Settings      Settings    `json:"reglages"`
}

// Prereq keeps a module or chapter closed until another chapter, possibly of
// another module, is known well enough.
type Prereq struct {
	Module  string `json:"module"`
	Chapter string `json:"chapitre"`
	Percent int    `json:"pourcent"`
}

type Chapter struct {
	ID   string `json:"id"`
	Name string `json:"nom"`
	// OpenAfter is how well the chapter before must be known, in percent, for
	// this one to open. 0 leaves it open.
	OpenAfter int `json:"ouvert_apres"`
	// Level and Group place the chapter in a pack the family wrote: a level
	// of the pack, and a title that gathers chapters. Both are optional.
	Level string `json:"niveau,omitempty"`
	Group string `json:"groupe,omitempty"`
}

type CardDef struct {
	ID       string `json:"id"`
	Chapter  string `json:"chapitre"`
	Type     string `json:"type"`
	Question string `json:"question"`
	Answer   string `json:"reponse"`
	// Key, when set, shares what a person knows of this card with the cards
	// of other modules that have it: they must expect the same answer.
	// Without it the card is the module's own, as id-du-module:id-de-fiche.
	Key string `json:"cle"`
	// Senses are the ways the card is asked, such as "inverse".
	Senses []string `json:"sens"`
	// Image is a drawing of the catalogue, or for zones the zoned picture.
	Image string `json:"image"`
	// Pairs, for associer, are what goes together, left and right.
	Pairs [][]Label `json:"paires"`
	// Elements, for ordre, are the labels in their right order.
	Elements []string `json:"elements"`
	// Boxes and ToSort, for classer: each label goes into one box.
	Boxes  []SortBox  `json:"boites"`
	ToSort []SortItem `json:"a_classer"`
}

// Writings are the ways the words of a module may be written.
var Writings = []string{"", "imprimerie", "cursive", "cursive_question"}

// ReadAloud is what the device says aloud in a module: nothing, everything
// (true in the file), or only the instructions ("consigne") in the modules
// that teach reading, where saying the words would give the answers away.
type ReadAloud string

const (
	ReadNothing      ReadAloud = ""
	ReadEverything   ReadAloud = "tout"
	ReadInstructions ReadAloud = "consigne"
)

func (r *ReadAloud) UnmarshalJSON(raw []byte) error {
	switch string(raw) {
	case "true":
		*r = ReadEverything
	case "false", "null":
		*r = ReadNothing
	case `"consigne"`:
		*r = ReadInstructions
	default:
		return fmt.Errorf(`lecture_voix_haute vaut true, false ou "consigne", pas %s`, raw)
	}
	return nil
}

func (r ReadAloud) MarshalJSON() ([]byte, error) {
	switch r {
	case ReadEverything:
		return []byte("true"), nil
	case ReadInstructions:
		return []byte(`"consigne"`), nil
	}
	return []byte("false"), nil
}

// Label is a word, a drawing or both. It is written as a plain string when
// it is only a word.
type Label struct {
	Text  string `json:"texte"`
	Image string `json:"image"`
}

func (l *Label) UnmarshalJSON(raw []byte) error {
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		*l = Label{Text: text}
		return nil
	}
	type plain Label
	return json.Unmarshal(raw, (*plain)(l))
}

func (l Label) empty() bool { return strings.TrimSpace(l.Text) == "" && l.Image == "" }

type SortBox struct {
	Name  string `json:"nom"`
	Image string `json:"image"`
}

type SortItem struct {
	Text  string `json:"texte"`
	Box   string `json:"boite"`
	Image string `json:"image"`
}

// Limits of the cards that hold several labels.
const (
	minPairs, maxPairs       = 3, 20
	minElements, maxElements = 3, 8
	minBoxes, maxBoxes       = 2, 3
	minToSort, maxToSort     = 2, 30
	maxTraced                = 8
)

// drawingPattern is how a drawing of the catalogue is named.
var drawingPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,79}$`)

// expected is what a card asks to find, to compare two cards of a shared
// key: its answer, or its pairs or labels in order.
func (c CardDef) expected() string {
	switch c.Type {
	case "associer":
		var parts []string
		for _, pair := range c.Pairs {
			if len(pair) == 2 {
				parts = append(parts, pair[0].Text+pair[0].Image+"="+pair[1].Text+pair[1].Image)
			}
		}
		return strings.Join(parts, " | ")
	case "ordre":
		return strings.Join(c.Elements, " | ")
	}
	return c.Answer
}

// checkContent tells what a card of its type lacks, or nil.
func (c CardDef) checkContent() error {
	if strings.TrimSpace(c.Question) == "" {
		return fmt.Errorf("question manquante")
	}
	for _, image := range c.images() {
		if !drawingPattern.MatchString(image) {
			return fmt.Errorf("dessin %q invalide : lettres minuscules, chiffres et tirets", image)
		}
	}
	switch c.Type {
	case "associer":
		if len(c.Pairs) < minPairs || len(c.Pairs) > maxPairs {
			return fmt.Errorf("de %d à %d paires", minPairs, maxPairs)
		}
		left, right := map[string]bool{}, map[string]bool{}
		for _, pair := range c.Pairs {
			if len(pair) != 2 || pair[0].empty() || pair[1].empty() {
				return fmt.Errorf("chaque paire a deux côtés, un mot ou un dessin")
			}
			l, r := pair[0].Text+"|"+pair[0].Image, pair[1].Text+"|"+pair[1].Image
			if left[l] || right[r] {
				return fmt.Errorf("deux paires ont le même côté")
			}
			left[l], right[r] = true, true
		}
	case "ordre":
		if len(c.Elements) < minElements || len(c.Elements) > maxElements {
			return fmt.Errorf("de %d à %d étiquettes à remettre dans l'ordre", minElements, maxElements)
		}
		seen := map[string]bool{}
		for _, e := range c.Elements {
			if strings.TrimSpace(e) == "" || seen[e] {
				return fmt.Errorf("étiquette vide ou en double")
			}
			seen[e] = true
		}
	case "classer":
		if c.Key != "" {
			return fmt.Errorf("une fiche classer ne prend pas de clé : chaque étiquette a la sienne")
		}
		if len(c.Boxes) < minBoxes || len(c.Boxes) > maxBoxes {
			return fmt.Errorf("de %d à %d boîtes", minBoxes, maxBoxes)
		}
		boxes := map[string]bool{}
		for _, box := range c.Boxes {
			if strings.TrimSpace(box.Name) == "" || boxes[box.Name] {
				return fmt.Errorf("boîte sans nom ou en double")
			}
			boxes[box.Name] = true
		}
		if len(c.ToSort) < minToSort || len(c.ToSort) > maxToSort {
			return fmt.Errorf("de %d à %d étiquettes à classer", minToSort, maxToSort)
		}
		seen := map[string]bool{}
		for _, item := range c.ToSort {
			slug := Slug(item.Text)
			switch {
			case slug == "" || seen[slug]:
				return fmt.Errorf("étiquette à classer %q vide ou en double", item.Text)
			case !boxes[item.Box]:
				return fmt.Errorf("étiquette %q : boîte %q inconnue", item.Text, item.Box)
			}
			seen[slug] = true
		}
	case "tracer":
		// What is traced: a letter, a figure or a short word.
		if n := len([]rune(strings.TrimSpace(c.Answer))); n == 0 || n > maxTraced {
			return fmt.Errorf("de 1 à %d caractères à tracer", maxTraced)
		}
		if len(c.Senses) > 0 {
			return fmt.Errorf("une fiche tracer n'a qu'un sens")
		}
	case "zones":
		switch {
		case c.Image == "":
			return fmt.Errorf("image à zones manquante")
		case !drawingPattern.MatchString(c.Question):
			return fmt.Errorf("zone %q invalide : son identifiant dans l'image", c.Question)
		case strings.TrimSpace(c.Answer) == "":
			return fmt.Errorf("nom de la zone manquant")
		}
	default:
		if strings.TrimSpace(c.Answer) == "" {
			return fmt.Errorf("question ou réponse manquante")
		}
	}
	for _, sense := range c.Senses {
		if !contains(sensesOf[c.Type], sense) {
			return fmt.Errorf("sens %q inconnu pour le type %s", sense, c.Type)
		}
	}
	return nil
}

// sensesOf lists the ways each type of card can be asked.
var sensesOf = map[string][]string{
	"choix":     {"direct", "inverse"},
	"saisie":    {"direct", "inverse"},
	"retourner": {"direct", "inverse"},
	"ecoute":    {"direct", "lire", "inverse", "dictee", "chiffres"},
	"zones":     {"toucher", "nommer"},
}

func (c CardDef) images() []string {
	var out []string
	add := func(image string) {
		if image != "" {
			out = append(out, image)
		}
	}
	add(c.Image)
	for _, pair := range c.Pairs {
		for _, side := range pair {
			add(side.Image)
		}
	}
	for _, box := range c.Boxes {
		add(box.Image)
	}
	for _, item := range c.ToSort {
		add(item.Image)
	}
	return out
}

// Slug is how a label to sort is named in its key: lower case, without
// accents, words joined by dashes. The web app does the same.
func Slug(text string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(text) {
		folded, ok := accents[r]
		if !ok {
			folded = string(r)
		}
		if (folded[0] >= 'a' && folded[0] <= 'z') || (folded[0] >= '0' && folded[0] <= '9') {
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			b.WriteString(folded)
			dash = false
		} else {
			dash = true
		}
	}
	out := b.String()
	if len(out) > 40 {
		out = strings.TrimRight(out[:40], "-")
	}
	return out
}

var accents = map[rune]string{
	'à': "a", 'â': "a", 'ä': "a", 'á': "a", 'ç': "c", 'é': "e", 'è': "e", 'ê': "e", 'ë': "e",
	'î': "i", 'ï': "i", 'í': "i", 'ô': "o", 'ö': "o", 'ó': "o", 'ù': "u", 'û': "u", 'ü': "u", 'ú': "u",
	'ÿ': "y", 'ñ': "n", 'œ': "oe", 'æ': "ae",
}

type Generator struct {
	ID        string `json:"id"`
	Chapter   string `json:"chapitre"`
	Operation string `json:"operation"`
}

type Settings struct {
	Questions  int `json:"questions_par_partie"`
	New        int `json:"nouvelles_par_partie"`
	Threshold  int `json:"seuil"`
	HopsByStar int `json:"hops_par_etoile"`
	DailyCap   int `json:"plafond_jour"`
	// Retention is the share of cards to recall wanted, in percent.
	Retention int `json:"memorisation"`
	// MaxInterval is the longest wait of a card, in days.
	MaxInterval int `json:"intervalle_max"`
	// NewPerDay is the most new questions a person meets in a day; past
	// it, the module only asks what is due.
	NewPerDay int `json:"nouvelles_par_jour"`
}

// WithDefaults fills the settings a module left out.
func (s Settings) WithDefaults() Settings {
	if s.Questions == 0 {
		s.Questions = DefaultQuestions
	}
	if s.New == 0 {
		s.New = DefaultNew
	}
	if s.Threshold == 0 {
		s.Threshold = DefaultThreshold
	}
	if s.HopsByStar == 0 {
		s.HopsByStar = DefaultHopsByStar
	}
	if s.DailyCap == 0 {
		s.DailyCap = DefaultDailyCap
	}
	if s.Retention == 0 {
		s.Retention = DefaultRetention
	}
	if s.MaxInterval == 0 {
		s.MaxInterval = DefaultMaxInterval
	}
	if s.NewPerDay == 0 {
		s.NewPerDay = DefaultNewPerDay
	}
	return s
}

// IsPack tells whether the document only gathers other modules.
func (d Document) IsPack() bool { return len(d.Modules) > 0 }

// Parse reads and checks a module document. Its errors are in French: they
// are shown to the parent who imports the file.
func Parse(raw []byte) (Document, error) {
	var doc Document
	if len(raw) > MaxDocumentBytes {
		return doc, fmt.Errorf("le module dépasse %d Mo", MaxDocumentBytes>>20)
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return doc, fmt.Errorf("le fichier n'est pas un module lisible : %v", err)
	}
	return doc, doc.Check()
}

// Check tells the first problem of a document, or nil.
func (d Document) Check() error {
	if d.Format != Format {
		return fmt.Errorf("format %q inconnu, attendu %q", d.Format, Format)
	}
	if !idPattern.MatchString(d.ID) {
		return fmt.Errorf("identifiant %q invalide : lettres minuscules, chiffres et tirets", d.ID)
	}
	if contains(ReservedDomains, d.ID) {
		return fmt.Errorf("identifiant %q réservé aux calculs", d.ID)
	}
	if d.ID == ReviewsKey || d.ID == TestsKey {
		return fmt.Errorf("identifiant %q réservé aux révisions du jour et aux contrôles", d.ID)
	}
	if strings.TrimSpace(d.Name) == "" {
		return fmt.Errorf("module %s : nom manquant", d.ID)
	}
	if !contains(Writings, d.Writing) {
		return fmt.Errorf("module %s : écriture %q inconnue (imprimerie, cursive ou cursive_question)", d.ID, d.Writing)
	}
	if strings.TrimSpace(d.Version) == "" {
		return fmt.Errorf("module %s : version manquante", d.ID)
	}
	if len([]rune(d.Icon)) > 8 {
		return fmt.Errorf("module %s : icône trop longue (un seul émoji)", d.ID)
	}
	if !contains(Audiences, d.Audience) {
		return fmt.Errorf("module %s : public %q inconnu (enfant, adulte ou tous)", d.ID, d.Audience)
	}
	if d.IsPack() {
		if len(d.Chapters)+len(d.Cards)+len(d.Generators) > 0 {
			return fmt.Errorf("paquet %s : un paquet ne contient que des modules, pas de fiches", d.ID)
		}
		if len(d.Modules) > maxChildren {
			return fmt.Errorf("paquet %s : %d modules au plus", d.ID, maxChildren)
		}
		seen := map[string]bool{}
		for _, child := range d.Modules {
			if !idPattern.MatchString(child) || child == d.ID || seen[child] {
				return fmt.Errorf("paquet %s : module %q invalide ou en double", d.ID, child)
			}
			seen[child] = true
		}
		return nil
	}
	if len(d.Chapters) == 0 || len(d.Chapters) > maxChapters {
		return fmt.Errorf("module %s : de 1 à %d chapitres", d.ID, maxChapters)
	}
	if len(d.Cards)+len(d.Generators) == 0 {
		return fmt.Errorf("module %s : aucune fiche ni générateur", d.ID)
	}
	if len(d.Cards) > maxCards || len(d.Generators) > maxGenerators {
		return fmt.Errorf("module %s : %d fiches et %d générateurs au plus", d.ID, maxCards, maxGenerators)
	}
	chapters := map[string]bool{}
	for _, chapter := range d.Chapters {
		if chapter.ID == "" || strings.TrimSpace(chapter.Name) == "" || chapters[chapter.ID] {
			return fmt.Errorf("module %s : chapitre %q sans id, sans nom ou en double", d.ID, chapter.ID)
		}
		if chapter.OpenAfter < 0 || chapter.OpenAfter > 100 {
			return fmt.Errorf("chapitre %s : ouvert_apres entre 0 et 100", chapter.ID)
		}
		if utf8.RuneCountInString(chapter.Level) > maxPlaceName || utf8.RuneCountInString(chapter.Group) > maxPlaceName {
			return fmt.Errorf("chapitre %s : niveau et groupe de %d lettres au plus", chapter.ID, maxPlaceName)
		}
		chapters[chapter.ID] = true
	}
	ids, keys := map[string]bool{}, map[string]bool{}
	for _, card := range d.Cards {
		if err := checkKey(card.Key); err != nil {
			return fmt.Errorf("fiche %s : %v", card.ID, err)
		}
		if card.Key != "" && keys[card.Key] {
			return fmt.Errorf("fiche %s : la clé %s sert déjà à une autre fiche du module", card.ID, card.Key)
		}
		keys[card.Key] = true
		switch {
		case card.ID == "" || ids[card.ID]:
			return fmt.Errorf("module %s : fiche %q sans id ou en double", d.ID, card.ID)
		case !chapters[card.Chapter]:
			return fmt.Errorf("fiche %s : chapitre %s inconnu", card.ID, card.Chapter)
		case !contains(CardTypes, card.Type):
			return fmt.Errorf("fiche %s : le type %q n'est pas encore pris en charge", card.ID, card.Type)
		}
		if err := card.checkContent(); err != nil {
			return fmt.Errorf("fiche %s : %v", card.ID, err)
		}
		ids[card.ID] = true
	}
	for _, gen := range d.Generators {
		switch {
		case gen.ID == "" || ids[gen.ID]:
			return fmt.Errorf("module %s : générateur %q sans id ou en double", d.ID, gen.ID)
		case !chapters[gen.Chapter]:
			return fmt.Errorf("générateur %s : chapitre %s inconnu", gen.ID, gen.Chapter)
		case !contains(GeneratorKinds, gen.Operation):
			return fmt.Errorf("générateur %s : l'opération %q n'existe pas", gen.ID, gen.Operation)
		}
		ids[gen.ID] = true
	}
	for _, p := range d.Prerequisites {
		if p.Module == "" || p.Percent < 0 || p.Percent > 100 {
			return fmt.Errorf("module %s : prérequis invalide", d.ID)
		}
	}
	s := d.Settings
	switch {
	case s.Questions < 0 || s.Questions > 40:
		return fmt.Errorf("module %s : de 1 à 40 questions par partie", d.ID)
	case s.New < 0 || s.New > 40:
		return fmt.Errorf("module %s : nouvelles_par_partie entre 0 et 40", d.ID)
	case s.Threshold < 0 || s.Threshold > 100:
		return fmt.Errorf("module %s : seuil entre 0 et 100", d.ID)
	case s.HopsByStar < 0 || s.HopsByStar > 20 || s.DailyCap < 0 || s.DailyCap > 200:
		return fmt.Errorf("module %s : hops par étoile ou plafond hors limites", d.ID)
	case s.Retention != 0 && (s.Retention < MinRetention || s.Retention > MaxRetention):
		return fmt.Errorf("module %s : memorisation entre %d et %d %%", d.ID, MinRetention, MaxRetention)
	case s.MaxInterval != 0 && (s.MaxInterval < MinMaxInterval || s.MaxInterval > MaxMaxInterval):
		return fmt.Errorf("module %s : intervalle_max entre %d et %d jours", d.ID, MinMaxInterval, MaxMaxInterval)
	case s.NewPerDay < 0 || s.NewPerDay > MaxNewPerDay:
		return fmt.Errorf("module %s : nouvelles_par_jour entre 1 et %d", d.ID, MaxNewPerDay)
	}
	return nil
}

func checkKey(key string) error {
	if key == "" {
		return nil
	}
	parts := strings.Split(key, ":")
	switch {
	case len(key) > maxSharedKey || !keyPattern.MatchString(key):
		return fmt.Errorf("clé %q invalide : domaine:compétence:sujet, en minuscules, chiffres et tirets", key)
	case contains(ReservedDomains, parts[0]):
		return fmt.Errorf("clé %q : le domaine %s est réservé aux calculs", key, parts[0])
	case contains(senseSuffixes, parts[len(parts)-1]):
		return fmt.Errorf("clé %q : « %s » est réservé à un autre sens de la fiche", key, parts[len(parts)-1])
	}
	return nil
}

// senseSuffixes end the keys of the other senses of a card.
var senseSuffixes = []string{"inverse", "lire", "dictee", "chiffres", "nommer"}

// SharedKeys lists the answer each shared key of the module expects.
func (d Document) SharedKeys() map[string]string {
	out := map[string]string{}
	for _, card := range d.Cards {
		if card.Key != "" {
			out[card.Key] = card.expected()
		}
	}
	return out
}

// sameAnswer compares two answers as a person would read them.
func sameAnswer(a, b string) bool {
	return strings.EqualFold(strings.Join(strings.Fields(a), " "), strings.Join(strings.Fields(b), " "))
}

// KeyConflict tells the first shared key of doc that another module already
// uses for another answer, or nil. Learning one would move the other.
func KeyConflict(doc Document, others []Document) error {
	mine := doc.SharedKeys()
	for _, other := range others {
		if other.ID == doc.ID {
			continue
		}
		for key, answer := range other.SharedKeys() {
			if own, ok := mine[key]; ok && !sameAnswer(own, answer) {
				return fmt.Errorf("la clé %s attend « %s » dans le module %s, et « %s » ici : change la clé ou la réponse",
					key, answer, other.ID, own)
			}
		}
	}
	return nil
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}
