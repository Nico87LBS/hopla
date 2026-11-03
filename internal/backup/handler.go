package backup

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/nico87lbs/hopla/internal/auth"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	"github.com/nico87lbs/hopla/logging"
)

// maxRestoreSize is the largest backup a restore takes in.
const maxRestoreSize = 2 << 30

type Handler struct {
	service *Service
	db      *gorm.DB
}

func NewHandler(s *Service, db *gorm.DB) *Handler {
	return &Handler{service: s, db: db}
}

// parent returns the family of a parent; children get 403.
func (h *Handler) parent(c *gin.Context) (int, bool) {
	user, ok := auth.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return 0, false
	}
	var n int64
	h.db.WithContext(c).Table("user_families").
		Where("user_id = ? AND family_id = ? AND role = ?", user.ID, user.FamilyID, fModel.UserRoleAdmin).Count(&n)
	if n == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "Seuls les parents gèrent les sauvegardes"})
		return 0, false
	}
	return user.FamilyID, true
}

// longRequest lifts the server's short timeouts for a backup's transfer.
func longRequest(c *gin.Context) {
	rc := http.NewResponseController(c.Writer)
	deadline := time.Now().UTC().Add(10 * time.Minute)
	_ = rc.SetReadDeadline(deadline)
	_ = rc.SetWriteDeadline(deadline)
}

var unsafeName = regexp.MustCompile(`[^a-z0-9]+`)

func downloadName(familyName string, day time.Time) string {
	name := strings.Trim(unsafeName.ReplaceAllString(strings.ToLower(familyName), "-"), "-")
	if name == "" {
		name = "famille"
	}
	return fmt.Sprintf("hopla-%s-%s%s", name, day.Format("2006-01-02"), Extension)
}

// download godoc
//
//	@Summary		Télécharger la sauvegarde de la famille
//	@Description	Un fichier .hopla-famille (zip) : toute la famille, ses comptes et ses fichiers. Réservé aux parents.
//	@Tags			Sauvegarde
//	@Produce		application/zip
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{file}	file
//	@Router			/api/v1/families/backup [get]
func (h *Handler) download(c *gin.Context) {
	familyID, ok := h.parent(c)
	if !ok {
		return
	}
	longRequest(c)
	var name string
	h.db.WithContext(c).Table("families").Where("id = ?", familyID).Select("name").Scan(&name)
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, downloadName(name, time.Now().UTC())))
	if _, err := h.service.Write(c, familyID, c.Writer); err != nil {
		logging.FromContext(c).Errorw("Family backup failed", "family", familyID, "error", err)
		c.Status(http.StatusInternalServerError)
	}
}

// list godoc
//
//	@Summary		Sauvegardes de nuit gardées sur le serveur
//	@Tags			Sauvegarde
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/families/backups [get]
func (h *Handler) list(c *gin.Context) {
	familyID, ok := h.parent(c)
	if !ok {
		return
	}
	list, err := h.service.List(familyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Impossible de lire les sauvegardes"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"res": gin.H{
		"backups": list,
		"nightly": !h.service.cfg.Backup.DisableNightly,
		"keep":    h.service.keep(),
	}})
}

// downloadSaved godoc
//
//	@Summary		Télécharger une sauvegarde de nuit
//	@Tags			Sauvegarde
//	@Produce		application/zip
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			name	path	string	true	"Nom du fichier"
//	@Success		200	{file}	file
//	@Router			/api/v1/families/backups/{name} [get]
func (h *Handler) downloadSaved(c *gin.Context) {
	familyID, ok := h.parent(c)
	if !ok {
		return
	}
	path := h.service.Path(familyID, c.Param("name"))
	if path == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sauvegarde introuvable"})
		return
	}
	if _, err := os.Stat(path); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sauvegarde introuvable"})
		return
	}
	longRequest(c)
	c.FileAttachment(path, c.Param("name"))
}

// restore godoc
//
//	@Summary		Restaurer la famille depuis une sauvegarde
//	@Description	Remplace toute la famille par celle du fichier. Tout le monde se reconnecte ensuite avec ses identifiants de la sauvegarde.
//	@Tags			Sauvegarde
//	@Accept			multipart/form-data
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Param			file	formData	file	true	"Fichier .hopla-famille"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/families/restore [post]
func (h *Handler) restore(c *gin.Context) {
	familyID, ok := h.parent(c)
	if !ok {
		return
	}
	longRequest(c)
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxRestoreSize)
	header, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fichier manquant ou trop gros"})
		return
	}
	f, err := header.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fichier illisible"})
		return
	}
	defer f.Close()
	data, z, err := Read(f, header.Size)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	restored, err := h.service.Restore(c, familyID, data, z)
	var taken ErrTaken
	switch {
	case errors.As(err, &taken):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	case err != nil:
		logging.FromContext(c).Errorw("Family restore failed", "family", familyID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "La restauration a échoué, rien n'a changé"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"res": gin.H{
		"familyId":   restored,
		"familyName": data.FamilyName,
		"exportedAt": data.ExportedAt,
	}})
}

func Routes(router *gin.Engine, h *Handler, multiAuthMiddleware *auth.MultiAuthMiddleware) {
	routes := router.Group("api/v1/families")
	routes.Use(multiAuthMiddleware.MiddlewareFunc())
	{
		routes.GET("/backup", h.download)
		routes.GET("/backups", h.list)
		routes.GET("/backups/:name", h.downloadSaved)
		routes.POST("/restore", h.restore)
	}
}
