package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
	uRepo "github.com/nico87lbs/hopla/internal/user/repo"
)

// APITokenMiddleware provides authentication via API tokens
func APITokenMiddleware(userRepo *uRepo.UserRepository) gin.HandlerFunc {
	return gin.HandlerFunc(func(c *gin.Context) {
		apiToken := c.GetHeader("secretkey")
		if apiToken == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "API token required"})
			c.Abort()
			return
		}

		user, err := userRepo.GetUserByToken(c, apiToken)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid API token"})
			c.Abort()
			return
		}

		if user.Disabled {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User account is disabled"})
			c.Abort()
			return
		}

		// Set the user in context
		c.Set(identityKey, user)
		c.Next()
	})
}
