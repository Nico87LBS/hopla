// Package api serves the learning games: the modules parents install and
// turn on for each person, and the games played with them.
package api

import (
	"errors"
	"io"
	"strconv"
	"time"

	jwt "github.com/appleboy/gin-jwt/v2"
	"github.com/gin-gonic/gin"
	auth "github.com/nico87lbs/hopla/internal/auth"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	fRepo "github.com/nico87lbs/hopla/internal/family/repo"
	"github.com/nico87lbs/hopla/internal/games"
	"github.com/nico87lbs/hopla/internal/learn"
	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

type Handler struct {
	db         *gorm.DB
	familyRepo *fRepo.FamilyRepository
}

func NewHandler(db *gorm.DB, familyRepo *fRepo.FamilyRepository) *Handler {
	return &Handler{db: db, familyRepo: familyRepo}
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
	Levels      []string `json:"levels"`
	Audience    string   `json:"audience"`
	Children    []string `json:"children"`
}

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
			Subject: doc.Subject, Levels: doc.Levels, Audience: doc.Audience, Children: doc.Modules})
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
}

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
	c.JSON(200, gin.H{"res": Installed{Modules: modules, Activations: activations, Settings: settings,
		Defaults: defaults, Applied: applied, Reports: counts}})
}

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

func (h *Handler) remove(c *gin.Context) {
	who, ok := h.requireParent(c)
	if !ok {
		return
	}
	if err := learn.Remove(h.db.WithContext(c), who.familyID, c.Param("key")); err != nil {
		answerError(c, err, "remove the module")
		return
	}
	c.JSON(200, gin.H{"res": "ok"})
}

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

func Routes(r *gin.Engine, h *Handler, auth *jwt.GinJWTMiddleware) {
	routes := r.Group("api/v1/learn")
	routes.Use(auth.MiddlewareFunc())
	{
		routes.GET("/catalogue", h.getCatalogue)
		routes.GET("/modules", h.getModules)
		routes.GET("/modules/:key", h.getDetail)
		routes.POST("/modules/install", h.install)
		routes.POST("/modules/import", h.importModule)
		routes.DELETE("/modules/:key", h.remove)
		routes.PUT("/activations", h.setActivation)
		routes.PUT("/settings", h.setSetting)
		routes.GET("/stats/:key", h.getStats)
		routes.GET("/players/:userId", h.getPlayer)
		routes.POST("/play-links", h.newPlayLink)
		routes.POST("/games", h.recordGame)
		routes.PUT("/cards", h.editCard)
		routes.POST("/reports", h.addReport)
		routes.PUT("/reports/:id/resolve", h.resolveReport)
	}
}
