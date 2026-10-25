package learn

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
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
)

// Settings defaults, used when a module leaves a setting out.
const (
	DefaultQuestions  = 10
	DefaultNew        = 3
	DefaultThreshold  = 70
	DefaultHopsByStar = 1
	DefaultDailyCap   = 10
)

// The question types and generators the game knows. A module using another
// one is refused, rather than shown with questions nobody can answer.
var (
	CardTypes      = []string{"choix", "saisie", "retourner"}
	GeneratorKinds = []string{"addition", "soustraction", "multiplication", "division", "double", "moitie",
		"complement", "comparaison", "position", "lettres", "modele"}
	Audiences = []string{"enfant", "adulte", "tous"}
)

var idPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,79}$`)

// Document is the part of a module document the server reads. The web app
// reads the rest, such as how each generator draws its numbers.
type Document struct {
	Format        string      `json:"format"`
	ID            string      `json:"id"`
	Version       string      `json:"version"`
	Name          string      `json:"nom"`
	Description   string      `json:"description"`
	Subject       string      `json:"matiere"`
	Levels        []string    `json:"niveaux"`
	Audience      string      `json:"public"`
	Language      string      `json:"langue"`
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
}

type CardDef struct {
	ID       string `json:"id"`
	Chapter  string `json:"chapitre"`
	Type     string `json:"type"`
	Question string `json:"question"`
	Answer   string `json:"reponse"`
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
	if strings.TrimSpace(d.Name) == "" {
		return fmt.Errorf("module %s : nom manquant", d.ID)
	}
	if strings.TrimSpace(d.Version) == "" {
		return fmt.Errorf("module %s : version manquante", d.ID)
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
		chapters[chapter.ID] = true
	}
	ids := map[string]bool{}
	for _, card := range d.Cards {
		switch {
		case card.ID == "" || ids[card.ID]:
			return fmt.Errorf("module %s : fiche %q sans id ou en double", d.ID, card.ID)
		case !chapters[card.Chapter]:
			return fmt.Errorf("fiche %s : chapitre %s inconnu", card.ID, card.Chapter)
		case !contains(CardTypes, card.Type):
			return fmt.Errorf("fiche %s : le type %q n'est pas encore pris en charge", card.ID, card.Type)
		case strings.TrimSpace(card.Question) == "" || strings.TrimSpace(card.Answer) == "":
			return fmt.Errorf("fiche %s : question ou réponse manquante", card.ID)
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
