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
	circle "github.com/nico87lbs/hopla/internal/circle/model"
	cRepo "github.com/nico87lbs/hopla/internal/circle/repo"
	"github.com/nico87lbs/hopla/internal/learn"
	"github.com/nico87lbs/hopla/logging"
	"gorm.io/gorm"
)

type Handler struct {
	db         *gorm.DB
	circleRepo *cRepo.CircleRepository
}

func NewHandler(db *gorm.DB, circleRepo *cRepo.CircleRepository) *Handler {
	return &Handler{db: db, circleRepo: circleRepo}
}

// caller is who sends a request, and whether they are a parent.
type caller struct {
	userID   int
	circleID int
	parent   bool
}

func (h *Handler) caller(c *gin.Context) (caller, bool) {
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication failed"})
		return caller{}, false
	}
	members, err := h.circleRepo.GetCircleUsers(c, currentUser.CircleID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Error checking permissions"})
		return caller{}, false
	}
	who := caller{userID: currentUser.ID, circleID: currentUser.CircleID}
	for _, m := range members {
		if m.UserID == currentUser.ID && (m.Role == circle.UserRoleAdmin || m.Role == circle.UserRoleManager) {
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
		out = append(out, CatalogueEntry{ID: doc.ID, Version: doc.Version, Name: doc.Name, Description: doc.Description,
			Subject: doc.Subject, Levels: doc.Levels, Audience: doc.Audience, Children: doc.Modules})
	}
	c.JSON(200, gin.H{"res": out})
}

// Installed is the circle's modules and who plays them.
type Installed struct {
	Modules     []learn.Module        `json:"modules"`
	Activations []learn.Activation    `json:"activations"`
	Settings    []learn.PersonSetting `json:"settings"`
}

func (h *Handler) getModules(c *gin.Context) {
	who, ok := h.caller(c)
	if !ok {
		return
	}
	db := h.db.WithContext(c)
	modules, err := learn.Modules(db, who.circleID, time.Now().UTC())
	if err != nil {
		answerError(c, err, "list the modules")
		return
	}
	activations, err := learn.Activations(db, who.circleID)
	if err != nil {
		answerError(c, err, "list the activations")
		return
	}
	settings, err := learn.PersonSettings(db, who.circleID)
	if err != nil {
		answerError(c, err, "list the settings")
		return
	}
	c.JSON(200, gin.H{"res": Installed{Modules: modules, Activations: activations, Settings: settings}})
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
	if err := learn.Install(h.db.WithContext(c), who.circleID, req.ID, time.Now().UTC()); err != nil {
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
	module, err := learn.Import(h.db.WithContext(c), who.circleID, raw, time.Now().UTC())
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
	if err := learn.Remove(h.db.WithContext(c), who.circleID, c.Param("key")); err != nil {
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
	if err := learn.SetActivation(h.db.WithContext(c), who.circleID, change, time.Now().UTC()); err != nil {
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
	if err := c.ShouldBindJSON(&change); err != nil || change.UserID == 0 || change.Scope == "" {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	if err := learn.SetPersonSetting(h.db.WithContext(c), who.circleID, change, time.Now().UTC()); err != nil {
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
	stats, err := learn.Stats(h.db.WithContext(c), who.circleID, c.Param("key"), time.Now().UTC())
	if err != nil {
		answerError(c, err, "get the statistics")
		return
	}
	c.JSON(200, gin.H{"res": stats})
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
	player, err := learn.PlayerFor(h.db.WithContext(c), who.circleID, userID, time.Now().UTC())
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
	result, err := learn.Record(h.db.WithContext(c), who.circleID, who.userID, game, time.Now().UTC())
	if err != nil {
		answerError(c, err, "record the game")
		return
	}
	c.JSON(200, gin.H{"res": result})
}

func Routes(r *gin.Engine, h *Handler, auth *jwt.GinJWTMiddleware) {
	routes := r.Group("api/v1/learn")
	routes.Use(auth.MiddlewareFunc())
	{
		routes.GET("/catalogue", h.getCatalogue)
		routes.GET("/modules", h.getModules)
		routes.POST("/modules/install", h.install)
		routes.POST("/modules/import", h.importModule)
		routes.DELETE("/modules/:key", h.remove)
		routes.PUT("/activations", h.setActivation)
		routes.PUT("/settings", h.setSetting)
		routes.GET("/stats/:key", h.getStats)
		routes.GET("/players/:userId", h.getPlayer)
		routes.POST("/games", h.recordGame)
	}
}
