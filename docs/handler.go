package docs

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/nico87lbs/hopla/config"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

type Handler struct {
	ServeSwagger bool
	ServerPort   int
}

func NewHandler(config *config.Config) *Handler {
	handler := &Handler{
		ServeSwagger: config.Server.ServeSwagger,
		ServerPort:   config.Server.Port,
	}
	host := strings.TrimPrefix(config.Server.PublicHost, "https://")
	SwaggerInfo.Host = strings.TrimPrefix(host, "http://")

	if strings.HasPrefix(config.Server.PublicHost, "https") {
		SwaggerInfo.Schemes = []string{"https"}
	} else {
		SwaggerInfo.Schemes = []string{"http"}
	}

	return handler
}

//	@title			Hopla Swagger API
//	@version		1.0
//	@description	Hopla swagger documentation.

//	@license.name	GNU Affero General Public License v3.0
//	@license.url	https://github.com/Nico87LBS/hopla/blob/main/LICENSE

//	@BasePath	/api/v1

//	@securityDefinitions.apikey	JWTKeyAuth
//	@in							header
//	@name						Authorization
//	@description				Type "Bearer" followed by a space and JWT token.

//	@securityDefinitions.apikey	APIKeyAuth
//	@in							header
//	@name						secretkey
//	@description				hopla issued apikey

func Routes(router *gin.Engine, h *Handler) {
	if h.ServeSwagger {
		router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}
}
