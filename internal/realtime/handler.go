package realtime

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/config"
	uModel "github.com/nico87lbs/hopla/internal/user/model"
	"github.com/nico87lbs/hopla/logging"
	"go.uber.org/zap"
)

// WebSocketHandler handles WebSocket connections
type WebSocketHandler struct {
	realTimeService *RealTimeService
	authMiddleware  *AuthMiddleware
	config          *config.Config
	logger          *zap.SugaredLogger
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler(
	rts *RealTimeService,
	authMiddleware *AuthMiddleware,
	config *config.Config,
) *WebSocketHandler {
	return &WebSocketHandler{
		realTimeService: rts,
		authMiddleware:  authMiddleware,
		config:          config,
	}
}

// HandleWebSocket handles WebSocket upgrade and connection management
func (h *WebSocketHandler) HandleWebSocket(c *gin.Context) {
	h.logger = logging.FromContext(c.Request.Context())

	// Check if WebSocket is enabled
	if !h.config.RealTimeConfig.Enabled || !h.config.RealTimeConfig.WebSocketEnabled {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "WebSocket service is not available",
			"code":  "SERVICE_UNAVAILABLE",
		})
		return
	}

	// Get authenticated user and family ID from middleware
	userInterface, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Authentication required",
			"code":  "AUTH_REQUIRED",
		})
		return
	}

	familyIDInterface, exists := c.Get("familyId")
	if !exists {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Family ID required",
			"code":  "FAMILY_ID_REQUIRED",
		})
		return
	}

	user := userInterface.(*uModel.User)
	familyID := familyIDInterface.(int)

	// Upgrade HTTP connection to WebSocket
	conn, err := WebSocketUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.logger.Errorw("Failed to upgrade WebSocket connection",
			"error", err,
			"userId", user.ID,
			"familyId", familyID)
		return
	}

	// Generate unique connection ID
	connectionID := h.generateConnectionID()

	// Create connection object
	wsConn := NewConnection(connectionID, familyID, user.ID, user, conn, h.logger)

	// Add connection to the real-time service
	if err := h.realTimeService.AddConnection(wsConn); err != nil {
		h.logger.Errorw("Failed to add connection to service",
			"error", err,
			"connectionId", connectionID,
			"userId", user.ID,
			"familyId", familyID)

		conn.WriteJSON(NewErrorEvent(familyID, "CONNECTION_FAILED", err.Error()))
		conn.Close()
		return
	}

	h.logger.Infow("WebSocket connection established",
		"connectionId", connectionID,
		"userId", user.ID,
		"username", user.Username,
		"familyId", familyID)

	// Send connection established event
	establishedEvent := NewConnectionEstablishedEvent(connectionID, familyID, user.ID)
	wsConn.SendEvent(establishedEvent)

	// Get connection pool for this family
	pool := h.realTimeService.GetConnectionPool(familyID)

	// Start read and write pumps in separate goroutines
	go wsConn.StartWritePump()
	go wsConn.StartReadPump(pool) // This will block until connection closes
}

// generateConnectionID generates a unique connection identifier
func (h *WebSocketHandler) generateConnectionID() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// HandleHealthCheck provides health check endpoint for the real-time service
func (h *WebSocketHandler) HandleHealthCheck(c *gin.Context) {
	stats := h.realTimeService.GetStats()

	c.JSON(http.StatusOK, gin.H{
		"status": "healthy",
		"service": gin.H{
			"enabled":   h.config.RealTimeConfig.Enabled,
			"websocket": h.config.RealTimeConfig.WebSocketEnabled,
		},
		"stats": gin.H{
			"activeConnections": stats.ActiveConnections,
			"eventsPublished":   stats.EventsPublished,
			"eventsDelivered":   stats.EventsDelivered,
			"familiesActive":    stats.FamiliesActive,
		},
	})
}

// HandleConnectionStats provides connection statistics for a specific family
func (h *WebSocketHandler) HandleConnectionStats(c *gin.Context) {
	familyIDStr := c.Param("familyId")
	if familyIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Family ID required",
			"code":  "FAMILY_ID_REQUIRED",
		})
		return
	}

	// Parse family ID
	var familyID int
	if _, err := fmt.Sscanf(familyIDStr, "%d", &familyID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid family ID",
			"code":  "INVALID_FAMILY_ID",
		})
		return
	}

	// Get authenticated user from middleware
	userInterface, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Authentication required",
			"code":  "AUTH_REQUIRED",
		})
		return
	}

	user := userInterface.(*uModel.User)

	// Verify user has access to this family
	if user.FamilyID != familyID {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "Access denied to family",
			"code":  "ACCESS_DENIED",
		})
		return
	}

	// Get connection pool stats
	pool := h.realTimeService.GetConnectionPool(familyID)
	poolStats := pool.GetStats()

	c.JSON(http.StatusOK, gin.H{
		"familyId": familyID,
		"connections": gin.H{
			"active":        poolStats.ActiveConnections,
			"totalMessages": poolStats.TotalMessages,
			"uniqueUsers":   pool.GetUserCount(),
		},
	})
}
