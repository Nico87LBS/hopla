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

//	@title			API de Hopla
//	@version		1.0
//	@description	Toutes les adresses du serveur Hopla. Les adresses /api/v1 servent l'interface web, /eapi/v1 les intégrations avec un jeton (en-tête secretkey).

//	@license.name	GNU Affero General Public License v3.0
//	@license.url	https://github.com/Nico87LBS/hopla/blob/main/LICENSE

//	@BasePath	/

//	@securityDefinitions.apikey	JWTKeyAuth
//	@in							header
//	@name						Authorization
//	@description				« Bearer » suivi d'une espace et du jeton de connexion.

//	@securityDefinitions.apikey	APIKeyAuth
//	@in							header
//	@name						secretkey
//	@description				Jeton d'accès longue durée créé dans les réglages du compte.

//	@securityDefinitions.apikey	PlayKeyAuth
//	@in							header
//	@name						X-Hopla-Play
//	@description				Session « jeux seulement » ouverte par un lien de jeu.

func Routes(router *gin.Engine, h *Handler) {
	if h.ServeSwagger {
		router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}
}
