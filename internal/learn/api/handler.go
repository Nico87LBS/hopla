// Package api serves the learning games: the modules parents install and
// turn on for each person, and the games played with them.
package api

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"strconv"
	"time"

	jwt "github.com/appleboy/gin-jwt/v2"
	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/config"
	auth "github.com/nico87lbs/hopla/internal/auth"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	fRepo "github.com/nico87lbs/hopla/internal/family/repo"
	"github.com/nico87lbs/hopla/internal/games"
	"github.com/nico87lbs/hopla/internal/learn"
	"github.com/nico87lbs/hopla/internal/learn/voice"
	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

type Handler struct {
	db         *gorm.DB
	familyRepo *fRepo.FamilyRepository
	piper      *voice.Piper
}

func NewHandler(cfg *config.Config, db *gorm.DB, familyRepo *fRepo.FamilyRepository) *Handler {
	return &Handler{db: db, familyRepo: familyRepo,
		piper: voice.New(cfg.Voice.Piper, voice.CacheDir(cfg.Voice.CacheDir))}
}

// caller is who sends a request, and whether they are a parent.
type caller struct {
	userID   int
	familyID int
	parent   bool
}

func (h *Handler) caller(c *gin.Context) (caller, bool) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return caller{}, false
	}
	members, err := h.familyRepo.GetFamilyUsers(c, currentUser.FamilyID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking permissions"})
		return caller{}, false
	}
	who := caller{userID: currentUser.ID, familyID: currentUser.FamilyID}
	for _, m := range members {
		if m.UserID == currentUser.ID && (m.Role == fModel.UserRoleAdmin || m.Role == fModel.UserRoleManager) {
			who.parent = true
		}
	}
	return who, true
}

// requireParent answers 403 unless the current user is an admin or manager.
func (h *Handler) requireParent(c *gin.Context) (caller, bool) {
	who, ok := h.caller(c)
	if ok && !who.parent {
		c.JSON(403, gin.H{"error": "Only admins or managers can change the modules"})
		return who, false
	}
	return who, ok
}

// mayPlayFor tells whether the caller plays as userID: themselves, or
// anyone of the family for a parent, such as a child on a parent's tablet.
func mayPlayFor(who caller, userID int) bool {
	return who.userID == userID || who.parent
}

func answerError(c *gin.Context, err error, what string) {
	var invalid learn.InvalidError
	switch {
	case errors.As(err, &invalid):
		c.JSON(400, gin.H{"error": invalid.Reason})
	case errors.Is(err, learn.ErrNotFound):
		c.JSON(404, gin.H{"error": "Module not found"})
	case errors.Is(err, learn.ErrNotActive):
		c.JSON(409, gin.H{"error": "Module not active for this person"})
	case errors.Is(err, learn.ErrCatalogueID):
		c.JSON(409, gin.H{"error": "Cet identifiant est celui d'un module du catalogue"})
	default:
		logging.FromContext(c).Error("Failed to "+what, "error", err)
		c.JSON(500, gin.H{"error": "Error: " + what})
	}
}

// CatalogueEntry is a catalogue module, as the catalogue lists it.
type CatalogueEntry struct {
	ID          string   `json:"id"`
	Version     string   `json:"version"`
	Name        string   `json:"name"`
	Author      string   `json:"author"`
	Description string   `json:"description"`
	Subject     string   `json:"subject"`
	Icon        string   `json:"icon"`
	Levels      []string `json:"levels"`
	Audience    string   `json:"audience"`
	Children    []string `json:"children"`
}

// getCatalogue godoc
//
//	@Summary		Catalogue des modules Apprendre
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/catalogue [get]
func (h *Handler) getCatalogue(c *gin.Context) {
	ids, err := learn.CatalogueIDs()
	if err != nil {
		answerError(c, err, "read the catalogue")
		return
	}
	entries, _ := learn.Catalogue()
	out := make([]CatalogueEntry, 0, len(ids))
	for _, id := range ids {
		doc := entries[id].Doc
		out = append(out, CatalogueEntry{ID: doc.ID, Version: doc.Version, Name: doc.Name, Author: doc.Author, Description: doc.Description,
			Subject: doc.Subject, Icon: doc.Icon, Levels: doc.Levels, Audience: doc.Audience, Children: doc.Modules})
	}
	c.JSON(200, gin.H{"res": out})
}

// Installed is the family's modules and who plays them.
type Installed struct {
	Modules     []learn.Module        `json:"modules"`
	Activations []learn.Activation    `json:"activations"`
	Settings    []learn.PersonSetting `json:"settings"`
	// Defaults are each module's own settings, shown when a person has none.
	Defaults map[string]learn.Settings `json:"defaults"`
	// Applied are the settings that apply to each module, for each person
	// and for the family (user 0), with where they come from.
	Applied map[int]map[string]learn.Applied `json:"applied"`
	// Reports counts the questions reported and not looked at, by module.
	Reports map[string]int `json:"reports"`
	// LastPlayed is the day of each person's last game of each module, and
	// Day the family's today, to tell the modules played lately.
	LastPlayed map[int]map[string]string `json:"lastPlayed"`
	Day        string                    `json:"day"`
	// Placements are the placement tests of each person.
	Placements []learn.Placement `json:"placements"`
	// PackPlayers are the packs each person plays, their levels open and
	// what is set aside.
	PackPlayers []learn.PackPlayer `json:"packPlayers"`
}

// getModules godoc
//
//	@Summary		Modules installés, activations et réglages
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/modules [get]
func (h *Handler) getModules(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	db := h.db.WithContext(c)
	modules, err := learn.Modules(db, who.familyID, time.Now().UTC())
	if err != nil {
		answerError(c, err, "list the modules")
		return
	}
	activations, err := learn.Activations(db, who.familyID)
	if err != nil {
		answerError(c, err, "list the activations")
		return
	}
	settings, err := learn.PersonSettings(db, who.familyID)
	if err != nil {
		answerError(c, err, "list the settings")
		return
	}
	defaults := map[string]learn.Settings{}
	for _, module := range modules {
		if doc, err := learn.Parse([]byte(module.Content)); err == nil && !module.IsPack() {
			defaults[module.Key] = doc.Settings.WithDefaults()
		}
	}
	people, err := learn.Members(db, who.familyID)
	if err != nil {
		answerError(c, err, "list the members")
		return
	}
	applied, err := learn.AppliedSettings(db, who.familyID, append([]int{learn.Family}, people...))
	if err != nil {
		answerError(c, err, "read the settings")
		return
	}
	reports, err := learn.OpenReports(db, who.familyID, nil)
	if err != nil {
		answerError(c, err, "list the reports")
		return
	}
	counts := map[string]int{}
	for _, report := range reports {
		counts[report.ModuleKey]++
	}
	lastPlayed, err := learn.LastPlayed(db, who.familyID)
	if err != nil {
		answerError(c, err, "list the games")
		return
	}
	placements, err := learn.Placements(db, who.familyID, nil)
	if err != nil {
		answerError(c, err, "list the placement tests")
		return
	}
	packPlayers, err := learn.PackPlayers(db, who.familyID, nil)
	if err != nil {
		answerError(c, err, "list who plays the packs")
		return
	}
	c.JSON(200, gin.H{"res": Installed{Modules: modules, Activations: activations, Settings: settings,
		Defaults: defaults, Applied: applied, Reports: counts, LastPlayed: lastPlayed,
		Day: learn.Day(who.familyID, time.Now().UTC()), Placements: placements, PackPlayers: packPlayers}})
}

// install godoc
//
//	@Summary		Installer un module du catalogue
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/modules/install [post]
func (h *Handler) install(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	var req struct {
		ID string `json:"id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if err := learn.Install(h.db.WithContext(c), who.familyID, req.ID, time.Now().UTC()); err != nil {
		answerError(c, err, "install the module")
		return
	}
	h.getModules(c)
}

// importModule takes a module document written by the family, as the body.
//
//	@Summary		Importer un fichier de module
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/modules/import [post]
func (h *Handler) importModule(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, learn.MaxDocumentBytes+1))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	module, err := learn.Import(h.db.WithContext(c), who.familyID, raw, time.Now().UTC())
	if err != nil {
		answerError(c, err, "import the module")
		return
	}
	c.JSON(200, gin.H{"res": module})
}

// exportModule godoc
//
//	@Summary		Exporter un module de la famille
//	@Description	Le fichier du module, tel qu'importé ou enregistré depuis l'éditeur.
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			key	path	string	true	"Clé du module"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/modules/{key}/file [get]
func (h *Handler) exportModule(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	content, err := learn.ModuleFile(h.db.WithContext(c), who.familyID, c.Param("key"))
	if err != nil {
		answerError(c, err, "export the module")
		return
	}
	c.Data(200, "application/json; charset=utf-8", []byte(content))
}

// remove godoc
//
//	@Summary		Désinstaller un module
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			key	path	string	true	"Clé du module"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/modules/{key} [delete]
func (h *Handler) remove(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	if err := learn.Remove(h.db.WithContext(c), who.familyID, c.Param("key"), c.Query("forget") == "1"); err != nil {
		answerError(c, err, "remove the module")
		return
	}
	c.JSON(200, gin.H{"res": "ok"})
}

// setActivation godoc
//
//	@Summary		Activer ou couper un module pour une personne
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/activations [put]
func (h *Handler) setActivation(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	var change learn.ActivationChange
	if err := c.ShouldBindJSON(&change); err != nil || change.UserID == 0 || len(change.Modules) == 0 {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if err := learn.SetActivation(h.db.WithContext(c), who.familyID, change, time.Now().UTC()); err != nil {
		answerError(c, err, "change the activation")
		return
	}
	h.getModules(c)
}

// PackChange ticks a pack for a person, or sets a level or a module of it
// aside.
type PackChange struct {
	UserID int    `json:"userId" binding:"required"`
	Pack   string `json:"pack" binding:"required"`
	On     bool   `json:"on"`
	// Key, Aside: the level or module set aside, or brought back.
	Key   string `json:"key"`
	Aside bool   `json:"aside"`
	Mode  string `json:"mode"`
	// Chapters, with Mode, are the chapters opened or closed by hand, each
	// "module/chapitre".
	Chapters []string `json:"chapters"`
}

// setPackPlayer godoc
//
//	@Summary		Cocher un paquet pour une personne (ses niveaux s'ouvrent seuls)
//	@Tags			Apprendre
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			paquet	body	PackChange	true	"Corps de la requête"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/packs [put]
func (h *Handler) setPackPlayer(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	var change PackChange
	if err := c.ShouldBindJSON(&change); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if err := learn.SetPackPlayer(h.db.WithContext(c), who.familyID, change.UserID, change.Pack, change.On, time.Now().UTC()); err != nil {
		answerError(c, err, "change the pack")
		return
	}
	h.getModules(c)
}

// setAside godoc
//
//	@Summary		Écarter, ouvrir ou fermer à la main un niveau, un module ou des chapitres d'un paquet
//	@Tags			Apprendre
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			ecart	body	PackChange	true	"Corps de la requête"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/packs/aside [put]
func (h *Handler) setAside(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	var change PackChange
	if err := c.ShouldBindJSON(&change); err != nil || (change.Key == "" && len(change.Chapters) == 0) {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if len(change.Chapters) > 0 {
		err := learn.SetChapterAccess(h.db.WithContext(c), who.familyID, change.UserID, change.Pack, change.Chapters, change.Mode, time.Now().UTC())
		if err != nil {
			answerError(c, err, "change chapter access")
			return
		}
		h.getModules(c)
		return
	}
	if change.Mode != "" {
		err := learn.SetPackAccess(h.db.WithContext(c), who.familyID, change.UserID, change.Pack, change.Key, change.Mode, time.Now().UTC())
		if err != nil {
			answerError(c, err, "change level access")
			return
		}
		h.getModules(c)
		return
	}
	if err := learn.SetAside(h.db.WithContext(c), who.familyID, change.UserID, change.Pack, change.Key, change.Aside, time.Now().UTC()); err != nil {
		answerError(c, err, "set aside")
		return
	}
	h.getModules(c)
}

// openNextLevel godoc
//
//	@Summary		Ouvrir le niveau suivant d'un paquet, celui d'avant étant su
//	@Description	Même traitement pour : POST /api/v1/learn/play/packs/next
//	@Tags			Apprendre,Session de jeu
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Security		PlayKeyAuth
//	@Param			paquet	body	PackChange	true	"Corps de la requête"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/packs/next [post]
//	@Router			/api/v1/learn/play/packs/next [post]
func (h *Handler) openNextLevel(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	var change PackChange
	if err := c.ShouldBindJSON(&change); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if !mayPlayFor(who, change.UserID) {
		c.JSON(403, gin.H{"error": "You can only play as yourself"})
		return
	}
	player, err := learn.OpenNextLevel(h.db.WithContext(c), who.familyID, change.UserID, change.Pack, time.Now().UTC())
	if err != nil {
		answerError(c, err, "open the next level")
		return
	}
	c.JSON(200, gin.H{"res": player})
}

// setSetting godoc
//
//	@Summary		Changer un réglage Apprendre
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/settings [put]
func (h *Handler) setSetting(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	var change learn.SettingChange
	if err := c.ShouldBindJSON(&change); err != nil || (change.UserID == 0 && !change.Family) || change.Scope == "" {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if err := learn.SetPersonSetting(h.db.WithContext(c), who.familyID, change, time.Now().UTC()); err != nil {
		answerError(c, err, "change the settings")
		return
	}
	h.getModules(c)
}

// getStats godoc
//
//	@Summary		Statistiques d'un module
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			key	path	string	true	"Clé du module"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/stats/{key} [get]
func (h *Handler) getStats(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	stats, err := learn.Stats(h.db.WithContext(c), who.familyID, c.Param("key"), time.Now().UTC())
	if err != nil {
		answerError(c, err, "get the statistics")
		return
	}
	c.JSON(200, gin.H{"res": stats})
}

// getDetail godoc
//
//	@Summary		Détail d'un module (chapitres et fiches)
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			key	path	string	true	"Clé du module"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/modules/{key} [get]
func (h *Handler) getDetail(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	detail, err := learn.ModuleDetail(h.db.WithContext(c), who.familyID, c.Param("key"), time.Now().UTC())
	if err != nil {
		answerError(c, err, "read the module")
		return
	}
	c.JSON(200, gin.H{"res": detail})
}

// createTest godoc
//
//	@Summary		Préparer un contrôle (date et chapitres)
//	@Tags			Apprendre
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			controle	body	learn.TestChange	true	"Corps de la requête"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/tests [post]
func (h *Handler) createTest(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	var change learn.TestChange
	if err := c.ShouldBindJSON(&change); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if !mayPlayFor(who, change.UserID) {
		c.JSON(403, gin.H{"error": "You can only prepare your own tests"})
		return
	}
	test, err := learn.CreateTest(h.db.WithContext(c), who.familyID, who.userID, change, time.Now().UTC())
	if err != nil {
		answerError(c, err, "create the test")
		return
	}
	c.JSON(200, gin.H{"res": test})
}

// deleteTest godoc
//
//	@Summary		Supprimer un contrôle
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			id	path	int	true	"Identifiant du contrôle"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/tests/{id} [delete]
func (h *Handler) deleteTest(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	test, err := learn.TestByID(h.db.WithContext(c), who.familyID, id)
	if err != nil {
		answerError(c, err, "read the test")
		return
	}
	if !mayPlayFor(who, test.UserID) {
		c.JSON(403, gin.H{"error": "You can only remove your own tests"})
		return
	}
	if err := learn.DeleteTest(h.db.WithContext(c), who.familyID, id); err != nil {
		answerError(c, err, "remove the test")
		return
	}
	c.JSON(200, gin.H{"res": "ok"})
}

// editCard godoc
//
//	@Summary		Corriger une fiche pour la famille
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/cards [put]
func (h *Handler) editCard(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	var change learn.CardChange
	if err := c.ShouldBindJSON(&change); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	db := h.db.WithContext(c)
	if err := learn.SetCardEdit(db, who.familyID, who.userID, change, time.Now().UTC()); err != nil {
		answerError(c, err, "change the card")
		return
	}
	detail, err := learn.ModuleDetail(db, who.familyID, change.Module, time.Now().UTC())
	if err != nil {
		answerError(c, err, "read the module")
		return
	}
	c.JSON(200, gin.H{"res": detail})
}

// addReport godoc
//
//	@Summary		Signaler une fiche
//	@Description	Même traitement pour : POST /api/v1/learn/play/reports
//	@Tags			Apprendre,Session de jeu
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Security		PlayKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/reports [post]
//	@Router			/api/v1/learn/play/reports [post]
func (h *Handler) addReport(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	var report learn.Report
	if err := c.ShouldBindJSON(&report); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if !mayPlayFor(who, report.UserID) {
		c.JSON(403, gin.H{"error": "You can only play as yourself"})
		return
	}
	if err := learn.AddReport(h.db.WithContext(c), who.familyID, who.userID, report, time.Now().UTC()); err != nil {
		answerError(c, err, "keep the report")
		return
	}
	c.JSON(200, gin.H{"res": "ok"})
}

// exportReports godoc
//
//	@Summary		Exporter les signalements
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/reports/export [get]
func (h *Handler) exportReports(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	reports, err := learn.ExportReports(h.db.WithContext(c), who.familyID, time.Now().UTC())
	if err != nil {
		answerError(c, err, "list the reports")
		return
	}
	c.JSON(200, gin.H{"res": reports})
}

// resolveReport godoc
//
//	@Summary		Marquer un signalement comme traité
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			id	path	integer	true	"Identifiant"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/reports/{id}/resolve [put]
func (h *Handler) resolveReport(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid report"})
		return
	}
	if err := learn.ResolveReport(h.db.WithContext(c), who.familyID, who.userID, id, time.Now().UTC()); err != nil {
		answerError(c, err, "resolve the report")
		return
	}
	c.JSON(200, gin.H{"res": "ok"})
}

// getPlayer godoc
//
//	@Summary		Modules, réglages et progrès d'une personne
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			userId	path	integer	true	"Identifiant de la personne"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/players/{userId} [get]
func (h *Handler) getPlayer(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	userID, err := strconv.Atoi(c.Param("userId"))
	if err != nil || !mayPlayFor(who, userID) {
		c.JSON(403, gin.H{"error": "You can only play as yourself"})
		return
	}
	player, err := learn.PlayerFor(h.db.WithContext(c), who.familyID, userID, time.Now().UTC())
	if err != nil {
		answerError(c, err, "get the player")
		return
	}
	c.JSON(200, gin.H{"res": player})
}

// recordGame godoc
//
//	@Summary		Enregistrer une partie
//	@Description	Même traitement pour : POST /api/v1/learn/play/games
//	@Tags			Apprendre,Session de jeu
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Security		PlayKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/games [post]
//	@Router			/api/v1/learn/play/games [post]
func (h *Handler) recordGame(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	var game learn.Game
	if err := c.ShouldBindJSON(&game); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if !mayPlayFor(who, game.UserID) {
		c.JSON(403, gin.H{"error": "You can only play as yourself"})
		return
	}
	now := time.Now().UTC()
	result, err := learn.Record(h.db.WithContext(c), who.familyID, who.userID, game, now)
	if err != nil {
		answerError(c, err, "record the game")
		return
	}
	// A game can reach a quest or a challenge on learning games.
	if err := games.Settle(h.db.WithContext(c), who.familyID, []int{game.UserID}, now); err != nil {
		logging.FromContext(c).Error("Failed to settle the quests after a game", "error", err)
	}
	c.JSON(200, gin.H{"res": result})
}

// getPlacementTest godoc
//
//	@Summary		Test de placement d'un paquet pour une personne
//	@Description	Même traitement pour : GET /api/v1/learn/play/placements/{userId}/{pack}
//	@Tags			Apprendre,Session de jeu
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Security		PlayKeyAuth
//	@Param			userId	path	int		true	"Personne"
//	@Param			pack	path	string	true	"Clé du paquet"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/placements/{userId}/{pack} [get]
//	@Router			/api/v1/learn/play/placements/{userId}/{pack} [get]
func (h *Handler) getPlacementTest(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	userID, err := strconv.Atoi(c.Param("userId"))
	if err != nil || !mayPlayFor(who, userID) {
		c.JSON(403, gin.H{"error": "You can only play as yourself"})
		return
	}
	test, err := learn.PlacementTestFor(h.db.WithContext(c), who.familyID, userID, c.Param("pack"), time.Now().UTC())
	if err != nil {
		answerError(c, err, "get the placement test")
		return
	}
	c.JSON(200, gin.H{"res": test})
}

// savePlacement godoc
//
//	@Summary		Enregistrer un test de placement, fait ou passé
//	@Description	Ouvre les chapitres réussis et active les niveaux jusqu'au niveau atteint. Même traitement pour : POST /api/v1/learn/play/placements
//	@Tags			Apprendre,Session de jeu
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Security		PlayKeyAuth
//	@Param			test	body	learn.PlacementResult	true	"Corps de la requête"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/placements [post]
//	@Router			/api/v1/learn/play/placements [post]
func (h *Handler) savePlacement(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	var result learn.PlacementResult
	if err := c.ShouldBindJSON(&result); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if !mayPlayFor(who, result.UserID) {
		c.JSON(403, gin.H{"error": "You can only play as yourself"})
		return
	}
	saved, err := learn.SavePlacement(h.db.WithContext(c), who.familyID, result, time.Now().UTC())
	if err != nil {
		answerError(c, err, "save the placement test")
		return
	}
	c.JSON(200, gin.H{"res": saved})
}

// setPlacementKeep godoc
//
//	@Summary		Choisir les niveaux gardés après un test de placement (parent)
//	@Tags			Apprendre
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/placements/keep [put]
func (h *Handler) setPlacementKeep(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	var req struct {
		UserID int    `json:"userId" binding:"required"`
		Pack   string `json:"pack" binding:"required"`
		Keep   string `json:"keep"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if _, err := learn.SetPlacementKeep(h.db.WithContext(c), who.familyID, req.UserID, req.Pack, req.Keep, time.Now().UTC()); err != nil {
		answerError(c, err, "change the placement test")
		return
	}
	h.getModules(c)
}

// setRecre godoc
//
//	@Summary		Régler la récré d'une personne (parent)
//	@Tags			Apprendre
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			reglage	body	learn.RecreChange	true	"Corps de la requête"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/recre/settings [put]
func (h *Handler) setRecre(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	var change learn.RecreChange
	if err := c.ShouldBindJSON(&change); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	now := time.Now().UTC()
	if err := learn.SetRecre(h.db.WithContext(c), who.familyID, change, now); err != nil {
		answerError(c, err, "set the récré")
		return
	}
	recre, err := learn.RecreFor(h.db.WithContext(c), who.familyID, change.UserID, now)
	if err != nil {
		answerError(c, err, "get the récré")
		return
	}
	c.JSON(200, gin.H{"res": recre})
}

// recordRecre godoc
//
//	@Summary		Enregistrer une partie de récré (score et records)
//	@Description	Même traitement pour : POST /api/v1/learn/play/recre
//	@Tags			Apprendre,Session de jeu
//	@Accept			json
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Security		PlayKeyAuth
//	@Param			partie	body	learn.RecreGame	true	"Corps de la requête"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/recre [post]
//	@Router			/api/v1/learn/play/recre [post]
func (h *Handler) recordRecre(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	var game learn.RecreGame
	if err := c.ShouldBindJSON(&game); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if !mayPlayFor(who, game.UserID) {
		c.JSON(403, gin.H{"error": "You can only play as yourself"})
		return
	}
	recre, err := learn.RecordRecre(h.db.WithContext(c), who.familyID, game, time.Now().UTC())
	if errors.Is(err, learn.ErrNoRecre) {
		c.JSON(409, gin.H{"error": "Pas de récré pour l'instant"})
		return
	}
	if err != nil {
		answerError(c, err, "record the récré")
		return
	}
	c.JSON(200, gin.H{"res": recre})
}

func Routes(r *gin.Engine, h *Handler, auth *jwt.GinJWTMiddleware) {
	routes := r.Group("api/v1/learn")
	routes.Use(auth.MiddlewareFunc())
	{
		routes.GET("/catalogue", h.getCatalogue)
		routes.GET("/modules", h.getModules)
		routes.GET("/modules/:key", h.getDetail)
		routes.GET("/modules/:key/file", h.exportModule)
		routes.POST("/modules/install", h.install)
		routes.POST("/modules/import", h.importModule)
		routes.DELETE("/modules/:key", h.remove)
		routes.PUT("/activations", h.setActivation)
		routes.PUT("/packs", h.setPackPlayer)
		routes.PUT("/packs/aside", h.setAside)
		routes.POST("/packs/next", h.openNextLevel)
		routes.PUT("/settings", h.setSetting)
		routes.GET("/stats/:key", h.getStats)
		routes.GET("/players/:userId", h.getPlayer)
		routes.POST("/play-links", h.newPlayLink)
		routes.POST("/games", h.recordGame)
		routes.GET("/placements/:userId/:pack", h.getPlacementTest)
		routes.POST("/placements", h.savePlacement)
		routes.PUT("/placements/keep", h.setPlacementKeep)
		routes.PUT("/recre/settings", h.setRecre)
		routes.POST("/recre", h.recordRecre)
		routes.PUT("/cards", h.editCard)
		routes.POST("/tests", h.createTest)
		routes.DELETE("/tests/:id", h.deleteTest)
		routes.POST("/reports", h.addReport)
		routes.PUT("/reports/:id/resolve", h.resolveReport)
		routes.GET("/reports/export", h.exportReports)
		routes.GET("/voices", h.getVoices)
		routes.GET("/speak", h.speak)
		routes.DELETE("/speak", h.forgetSpeech)
	}
}

// getVoices lists the voices of the speech server; none when no server is
// set or it does not answer, and the devices use their own.
//
//	@Summary		Voix du serveur
//	@Description	Même traitement pour : GET /api/v1/learn/play/voices
//	@Tags			Apprendre,Session de jeu
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Security		PlayKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/voices [get]
//	@Router			/api/v1/learn/play/voices [get]
func (h *Handler) getVoices(c *gin.Context) {
	if _, ok := h.caller(c); !ok {
		return
	}
	voices, err := h.piper.Voices(c)
	if err != nil {
		if !errors.Is(err, voice.ErrOff) {
			logging.FromContext(c).Warnw("The speech server does not answer", "error", err)
		}
		voices = []voice.Voice{}
	}
	c.JSON(200, gin.H{"res": voices})
}

// speak answers with a sentence said by a voice of the speech server, as a
// WAV sound the devices keep.
//
//	@Summary		Lire un texte avec la voix du serveur
//	@Description	Même traitement pour : GET /api/v1/learn/play/speak
//	@Tags			Apprendre,Session de jeu
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Security		PlayKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/speak [get]
//	@Router			/api/v1/learn/play/speak [get]
func (h *Handler) speak(c *gin.Context) {
	if _, ok := h.caller(c); !ok {
		return
	}
	sound, err := h.piper.Speak(c, c.Query("text"), c.Query("voice"))
	switch {
	case errors.Is(err, voice.ErrOff):
		c.JSON(404, gin.H{"error": "No speech server"})
	case errors.Is(err, voice.ErrInvalid):
		c.JSON(400, gin.H{"error": "Invalid text or voice"})
	case err != nil:
		logging.FromContext(c).Warnw("The speech server does not answer", "error", err)
		c.JSON(502, gin.H{"error": "The speech server does not answer"})
	default:
		// The device asks again each time, and gets the sound only when it
		// changed: a sentence made again reaches every device.
		sum := sha256.Sum256(sound)
		tag := `"` + hex.EncodeToString(sum[:8]) + `"`
		c.Header("Cache-Control", "private, no-cache")
		c.Header("ETag", tag)
		if c.GetHeader("If-None-Match") == tag {
			c.Status(304)
			return
		}
		c.Data(200, "audio/wav", sound)
	}
}

// forgetSpeech throws away a sentence kept by the server, which makes it
// again the next time it is said.
//
//	@Summary		Refaire un son de la voix du serveur
//	@Tags			Apprendre
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			text	query	string	true	"Texte dit"
//	@Param			voice	query	string	true	"Voix du serveur"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/learn/speak [delete]
func (h *Handler) forgetSpeech(c *gin.Context) {
	if _, ok := h.requireParent(c); !ok {
		return
	}
	err := h.piper.Forget(c.Query("text"), c.Query("voice"))
	switch {
	case errors.Is(err, voice.ErrOff):
		c.JSON(404, gin.H{"error": "No speech server"})
	case errors.Is(err, voice.ErrInvalid):
		c.JSON(400, gin.H{"error": "Invalid text or voice"})
	case err != nil:
		answerError(c, err, "forget the sound")
	default:
		c.JSON(200, gin.H{"res": "ok"})
	}
}
