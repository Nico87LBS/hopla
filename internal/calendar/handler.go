package calendar

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/config"
	auth "github.com/nico87lbs/hopla/internal/auth"
	calModel "github.com/nico87lbs/hopla/internal/calendar/model"
	calRepo "github.com/nico87lbs/hopla/internal/calendar/repo"
	chModel "github.com/nico87lbs/hopla/internal/chore/model"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
	fModel "github.com/nico87lbs/hopla/internal/family/model"
	"github.com/nico87lbs/hopla/internal/games"
	uRepo "github.com/nico87lbs/hopla/internal/user/repo"
	"github.com/nico87lbs/hopla/internal/utils"
	"github.com/nico87lbs/hopla/internal/zone"
	"github.com/nico87lbs/hopla/logging"
	"github.com/ulule/limiter/v3"
	"gorm.io/gorm"
)

const (
	calendarProdID = "-//Hopla//Chores Calendar//EN"
	// calendarTokenBytes is the entropy of a calendar token. The token is a
	// bearer credential sitting in a URL, so it must be infeasible to guess.
	calendarTokenBytes = 32
)

// Handler handles iCal calendar endpoints
type Handler struct {
	choreRepo *chRepo.ChoreRepository
	userRepo  *uRepo.UserRepository
	calRepo   *calRepo.CalendarRepository
	db        *gorm.DB
	// publicHost is the operator-configured externally reachable base URL. It is
	// preferred over request headers, which a client can forge.
	publicHost string
}

// NewHandler creates a new calendar handler
func NewHandler(cr *chRepo.ChoreRepository, ur *uRepo.UserRepository, calr *calRepo.CalendarRepository, db *gorm.DB, cfg *config.Config) *Handler {
	return &Handler{
		choreRepo:  cr,
		userRepo:   ur,
		calRepo:    calr,
		db:         db,
		publicHost: cfg.Server.PublicHost,
	}
}

// generateCalendarToken returns a fresh random calendar token.
func generateCalendarToken() (string, error) {
	buf := make([]byte, calendarTokenBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	// Raw URL encoding: no padding and no characters needing escaping in a path.
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// calendarURL renders the subscription URL for a token.
func (h *Handler) calendarURL(c *gin.Context, token string) string {
	return fmt.Sprintf("%s/api/v1/chores/calendar/%s.ics", h.baseURL(c), token)
}

// baseURL resolves the public base URL for generated links. The configured
// public_host wins: the Host and X-Forwarded-Proto headers are client
// controlled, and a poisoned value would hand the user a calendar URL -- token
// included -- pointing at someone else's origin. The request is only used as a
// fallback for instances that never configured public_host.
func (h *Handler) baseURL(c *gin.Context) string {
	if h.publicHost != "" {
		base := strings.TrimRight(h.publicHost, "/")
		if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
			base = "https://" + base
		}
		return base
	}

	scheme := "http"
	if c.Request.TLS != nil {
		scheme = "https"
	}
	// Only accept the two values this header is allowed to carry.
	if fwdProto := c.GetHeader("X-Forwarded-Proto"); fwdProto == "http" || fwdProto == "https" {
		scheme = fwdProto
	}
	return fmt.Sprintf("%s://%s", scheme, c.Request.Host)
}

// tokenResponse is the JSON shape returned by the calendar URL endpoints.
func (h *Handler) tokenResponse(c *gin.Context, token *calModel.CalendarToken) gin.H {
	return gin.H{
		"url":        h.calendarURL(c, token.Token),
		"createdAt":  token.CreatedAt,
		"lastUsedAt": token.LastUsedAt,
	}
}

// issueToken generates and persists a new token, replacing any existing one.
func (h *Handler) issueToken(c *gin.Context, userID int) (*calModel.CalendarToken, error) {
	token, err := generateCalendarToken()
	if err != nil {
		return nil, err
	}
	return h.calRepo.Replace(c.Request.Context(), userID, token)
}

// GetCalendarURL godoc
//
//	@Summary		Lire l'adresse de l'agenda
//	@Tags			Agenda
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]string
//	@Router			/api/v1/chores/calendar/url [get]
func (h *Handler) GetCalendarURL(c *gin.Context) {
	logger := logging.FromContext(c)
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		logger.Error("Failed to get current user from authentication context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication failed"})
		return
	}

	token, err := h.calRepo.GetByUserID(c.Request.Context(), currentUser.ID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "No calendar URL has been generated"})
		return
	}
	if err != nil {
		logger.Error("Failed to load calendar token", "error", err, "userID", currentUser.ID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load calendar URL"})
		return
	}

	c.JSON(http.StatusOK, h.tokenResponse(c, token))
}

// CreateCalendarURL godoc
//
//	@Summary		Créer l'adresse de l'agenda
//	@Tags			Agenda
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]string
//	@Success		201	{object}	map[string]string
//	@Router			/api/v1/chores/calendar/url [post]
func (h *Handler) CreateCalendarURL(c *gin.Context) {
	logger := logging.FromContext(c)
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		logger.Error("Failed to get current user from authentication context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication failed"})
		return
	}

	existing, err := h.calRepo.GetByUserID(c.Request.Context(), currentUser.ID)
	if err == nil {
		c.JSON(http.StatusOK, h.tokenResponse(c, existing))
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		logger.Error("Failed to load calendar token", "error", err, "userID", currentUser.ID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate calendar URL"})
		return
	}

	token, err := h.issueToken(c, currentUser.ID)
	if err != nil {
		logger.Error("Failed to generate calendar token", "error", err, "userID", currentUser.ID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate calendar URL"})
		return
	}

	logger.Info("Generated calendar URL", "userID", currentUser.ID)
	c.JSON(http.StatusCreated, h.tokenResponse(c, token))
}

// RotateCalendarURL godoc
//
//	@Summary		Changer l'adresse de l'agenda
//	@Tags			Agenda
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		200	{object}	map[string]string
//	@Router			/api/v1/chores/calendar/url/rotate [post]
func (h *Handler) RotateCalendarURL(c *gin.Context) {
	logger := logging.FromContext(c)
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		logger.Error("Failed to get current user from authentication context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication failed"})
		return
	}

	token, err := h.issueToken(c, currentUser.ID)
	if err != nil {
		logger.Error("Failed to rotate calendar token", "error", err, "userID", currentUser.ID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to rotate calendar URL"})
		return
	}

	logger.Info("Rotated calendar URL", "userID", currentUser.ID)
	c.JSON(http.StatusOK, h.tokenResponse(c, token))
}

// RevokeCalendarURL godoc
//
//	@Summary		Supprimer l'adresse de l'agenda
//	@Tags			Agenda
//	@Produce		json
//	@Security		JWTKeyAuth
//	@Security		APIKeyAuth
//	@Success		204	{string}	string
//	@Router			/api/v1/chores/calendar/url [delete]
func (h *Handler) RevokeCalendarURL(c *gin.Context) {
	logger := logging.FromContext(c)
	currentUser, ok := auth.CurrentUser(c)
	if !ok {
		logger.Error("Failed to get current user from authentication context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication failed"})
		return
	}

	if err := h.calRepo.DeleteByUserID(c.Request.Context(), currentUser.ID); err != nil {
		logger.Error("Failed to revoke calendar token", "error", err, "userID", currentUser.ID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to revoke calendar URL"})
		return
	}

	logger.Info("Revoked calendar URL", "userID", currentUser.ID)
	c.Status(http.StatusNoContent)
}

// ServeCalendar godoc
//
//	@Summary		Agenda des tâches au format iCalendar
//	@Description	Les 30 prochains jours (un événement par passage et par créneau) et les tâches faites des 7 derniers jours, barrées. Un enfant ne voit que ses tâches ; un parent peut demander celles d'un membre ou de toute la famille.
//	@Tags			Agenda
//	@Produce		plain
//	@Param			token	path	string	true	"Jeton secret de l'agenda"
//	@Param			qui		query	string	false	"moi (par défaut), famille ou le numéro d'un membre"
//	@Param			rappel	query	int		false	"Rappel, en minutes avant chaque tâche (0 à 1440)"
//	@Success		200	{string}	string
//	@Router			/api/v1/chores/calendar/{token} [get]
func (h *Handler) ServeCalendar(c *gin.Context) {
	logger := logging.FromContext(c)
	ctx := c.Request.Context()

	rawToken := strings.TrimSuffix(c.Param("token"), ".ics")
	if rawToken == "" {
		c.String(http.StatusForbidden, "Invalid calendar token")
		return
	}

	// Unauthenticated endpoint: failures here are routine (revoked tokens,
	// scanners) so they are logged below error level to avoid log flooding.
	token, err := h.calRepo.GetByToken(ctx, rawToken)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			logger.Warn("Unknown or revoked calendar token")
		} else {
			logger.Error("Failed to look up calendar token", "error", err)
		}
		c.String(http.StatusForbidden, "Invalid calendar token")
		return
	}

	user, err := h.userRepo.GetUserByID(ctx, token.UserID)
	if err != nil || user.Disabled {
		logger.Warn("Calendar user not found or disabled", "userID", token.UserID, "error", err)
		c.String(http.StatusForbidden, "Invalid calendar token")
		return
	}

	alarm := 0
	if value := c.Query("rappel"); value != "" {
		if _, err := fmt.Sscanf(value, "%d", &alarm); err != nil || alarm < 0 || alarm > maxAlarm {
			c.String(http.StatusBadRequest, "rappel : de 0 à 1440 minutes")
			return
		}
	}

	members, err := h.userRepo.GetAllUsers(ctx, user.FamilyID)
	if err != nil {
		logger.Error("Failed to load the family for calendar", "error", err, "userID", token.UserID)
		c.String(http.StatusInternalServerError, "Failed to generate calendar")
		return
	}
	names := make(map[int]string, len(members))
	for _, m := range members {
		names[m.ID] = m.DisplayName
	}
	var family struct {
		Name     string
		Currency string
	}
	h.db.WithContext(ctx).Table("families").Select("name, currency").Where("id = ?", user.FamilyID).Scan(&family)

	opt := feedOptions{Names: names, Currency: family.Currency, Now: time.Now().UTC(), Location: zone.Of(user.FamilyID)}
	calendarName := "Hopla - " + user.DisplayName
	switch who := c.DefaultQuery("qui", "moi"); who {
	case "moi", "":
		opt.Who = map[int]bool{user.ID: true}
	default:
		if !h.isParent(ctx, user.ID, user.FamilyID) {
			c.String(http.StatusForbidden, "Seul un parent voit les tâches des autres")
			return
		}
		if who == "famille" {
			opt.Several = true
			calendarName = "Hopla - Famille"
			if family.Name != "" {
				calendarName = "Hopla - " + family.Name
			}
			break
		}
		var id int
		if _, err := fmt.Sscanf(who, "%d", &id); err != nil || names[id] == "" {
			c.String(http.StatusNotFound, "Membre inconnu")
			return
		}
		opt.Who = map[int]bool{id: true}
		calendarName = "Hopla - " + names[id]
	}

	chores, err := h.choreRepo.GetChores(ctx, user.FamilyID, token.UserID, false, nil, false)
	if err != nil {
		logger.Error("Failed to retrieve chores for calendar", "error", err, "userID", token.UserID)
		c.String(http.StatusInternalServerError, "Failed to generate calendar")
		return
	}
	if opt.Away, err = games.AwayMembers(h.db.WithContext(ctx), user.FamilyID); err != nil {
		logger.Warn("Failed to load the members away for calendar", "error", err)
	}
	history, err := h.recentHistory(ctx, chores, opt.Now.AddDate(0, 0, -doneDays))
	if err != nil {
		logger.Error("Failed to retrieve history for calendar", "error", err, "userID", token.UserID)
		c.String(http.StatusInternalServerError, "Failed to generate calendar")
		return
	}

	ical := writeCalendar(calendarName, opt.Location.String(), planEvents(ctx, chores, history, opt), alarm, opt.Now)

	// Best effort: a failed bookkeeping write must not fail the feed.
	if err := h.calRepo.TouchLastUsed(ctx, token.ID); err != nil {
		logger.Warn("Failed to update calendar token last used", "error", err, "tokenID", token.ID)
	}

	c.Header("Content-Type", "text/calendar; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=\"hopla.ics\"")
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	c.Header("X-Content-Type-Options", "nosniff")
	c.String(http.StatusOK, ical)
}

// maxAlarm is the longest reminder, a day.
const maxAlarm = 24 * 60

// isParent reports whether a member is a parent of the family.
func (h *Handler) isParent(ctx context.Context, userID, familyID int) bool {
	var n int64
	h.db.WithContext(ctx).Table("user_families").
		Where("user_id = ? AND family_id = ? AND role IN ?", userID, familyID,
			[]fModel.UserRole{fModel.UserRoleAdmin, fModel.UserRoleManager}).Count(&n)
	return n > 0
}

// recentHistory returns the tasks done or waiting for a parent since a time.
func (h *Handler) recentHistory(ctx context.Context, chores []*chModel.Chore, since time.Time) ([]*chModel.ChoreHistory, error) {
	ids := make([]int, 0, len(chores))
	for _, ch := range chores {
		ids = append(ids, ch.ID)
	}
	var history []*chModel.ChoreHistory
	if len(ids) == 0 {
		return history, nil
	}
	err := h.db.WithContext(ctx).Where("chore_id IN ? AND performed_at >= ? AND status IN ?", ids, since,
		[]chModel.ChoreHistoryStatus{chModel.ChoreHistoryStatusCompleted, chModel.ChoreHistoryStatusPendingApproval}).
		Find(&history).Error
	return history, err
}

// buildChoreDescription creates a plain-text description for the calendar
// event, in French like the rest of Hopla.
func buildChoreDescription(ch *chModel.Chore, currency string) string {
	var parts []string

	if ch.Description != nil && *ch.Description != "" {
		parts = append(parts, strings.TrimSpace(stripHTMLTags(*ch.Description)))
	}

	if repeat := frequencyName(ch.FrequencyType); repeat != "" {
		parts = append(parts, "Répétition : "+repeat)
	}

	if ch.Points != nil && *ch.Points > 0 {
		parts = append(parts, fmt.Sprintf("%d %s", *ch.Points, currencyName(currency)))
	}

	pName := priorityName(ch.Priority)
	if pName != "" {
		parts = append(parts, "Priorité : "+pName)
	}

	// Real newlines: escapeICalText turns these into the RFC 5545 "\n" escape.
	// Pre-escaping here would get double-escaped into a literal backslash-n.
	return strings.Join(parts, "\n")
}

// frequencyName says how a task repeats; nothing for a task done once.
func frequencyName(f chModel.FrequencyType) string {
	switch f {
	case chModel.FrequencyTypeDaily:
		return "tous les jours"
	case chModel.FrequencyTypeWeekly:
		return "chaque semaine"
	case chModel.FrequencyTypeMonthly:
		return "chaque mois"
	case chModel.FrequencyTypeYearly:
		return "chaque année"
	case chModel.FrequencyTypeInterval:
		return "à intervalle régulier"
	case chModel.FrequencyTypeDayOfTheWeek:
		return "certains jours de la semaine"
	case chModel.FrequencyTypeDayOfTheMonth:
		return "certains jours du mois"
	case chModel.FrequencyTypeAdaptive:
		return "selon le rythme"
	}
	return ""
}

// currencyName is what the family earns, as the web app says it in French.
func currencyName(currency string) string {
	switch currency {
	case "points":
		return "points"
	case "stars":
		return "étoiles"
	case "carrots":
		return "carottes"
	case "coins":
		return "pièces"
	case "tokens":
		return "jetons"
	}
	return "hops"
}

// escapeICalText escapes special characters per RFC 5545.
func escapeICalText(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, ";", "\\;")
	s = strings.ReplaceAll(s, ",", "\\,")
	s = strings.ReplaceAll(s, "\r\n", "\\n")
	s = strings.ReplaceAll(s, "\n", "\\n")
	s = strings.ReplaceAll(s, "\r", "")
	return s
}

// foldLine implements RFC 5545 line folding (content lines must be <= 75
// octets). Folds land on UTF-8 boundaries: RFC 5545 forbids splitting a
// multi-octet character across a fold.
func foldLine(line string) string {
	const maxLen = 75
	const contLen = 74 // continuation lines start with a space

	line = strings.TrimRight(line, "\r\n")
	if len(line) <= maxLen {
		return line + "\r\n"
	}

	var b strings.Builder
	cut := foldBoundary(line, maxLen)
	b.WriteString(line[:cut])
	b.WriteString("\r\n")
	remaining := line[cut:]

	for len(remaining) > 0 {
		cut = foldBoundary(remaining, contLen)
		b.WriteByte(' ')
		b.WriteString(remaining[:cut])
		b.WriteString("\r\n")
		remaining = remaining[cut:]
	}

	return b.String()
}

// foldBoundary returns the largest cut index <= max that does not fall inside a
// UTF-8 sequence.
func foldBoundary(s string, max int) int {
	if len(s) <= max {
		return len(s)
	}
	cut := max
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	if cut == 0 {
		// A single rune wider than the limit; cut at the limit rather than loop.
		return max
	}
	return cut
}

// mapPriority converts Hopla priority (0-4) to iCal priority (1-9).
func mapPriority(p int) int {
	switch p {
	case 4:
		return 1 // urgent -> highest
	case 3:
		return 3 // high
	case 2:
		return 5 // medium
	case 1:
		return 7 // low
	default:
		return 0 // undefined
	}
}

// priorityName returns a human-readable priority name.
func priorityName(p int) string {
	switch p {
	case 4:
		return "urgente"
	case 3:
		return "haute"
	case 2:
		return "moyenne"
	case 1:
		return "basse"
	default:
		return ""
	}
}

// stripHTMLTags removes HTML tags from a string for plain-text output.
func stripHTMLTags(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Routes registers calendar-specific routes
func Routes(router *gin.Engine, h *Handler, multiAuthMiddleware *auth.MultiAuthMiddleware, limiter *limiter.Limiter) {
	// Authenticated endpoints to manage the user's personal calendar URL.
	calRoutes := router.Group("api/v1/chores/calendar")
	calRoutes.Use(
		multiAuthMiddleware.MiddlewareFunc(),
		utils.RateLimitMiddleware(limiter),
	)
	{
		calRoutes.GET("/url", h.GetCalendarURL)
		calRoutes.POST("/url", h.CreateCalendarURL)
		calRoutes.POST("/url/rotate", h.RotateCalendarURL)
		calRoutes.DELETE("/url", h.RevokeCalendarURL)
	}

	// Public endpoint (token-authenticated) to serve the .ics file. Calendar
	// apps cannot send auth headers, so this uses token-in-URL auth; it is rate
	// limited because it is reachable without credentials.
	publicRoutes := router.Group("api/v1/chores/calendar")
	publicRoutes.Use(utils.RateLimitMiddleware(limiter))
	{
		publicRoutes.GET("/:token", h.ServeCalendar)
	}
}
