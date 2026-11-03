package main

// Adresses servies par du code hors des paquets internal/ : leurs
// annotations Swagger sont ici, sur des fonctions vides lues par swag.

// docApiV1HealthGet godoc
//
//	@Summary		État du serveur (prêt ou non)
//	@Tags			Système
//	@Produce		json
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/health [get]
func docApiV1HealthGet() {}

// docApiV1AuthLoginLegacyPost godoc
//
//	@Summary		Se connecter (ancienne méthode)
//	@Tags			Connexion
//	@Produce		json
//	@Accept			json
//	@Param			identifiants	body	object	true	"Nom d'utilisateur et mot de passe"
//	@Success		200	{object}	map[string]interface{}
//	@Router			/api/v1/auth/login/legacy [post]
func docApiV1AuthLoginLegacyPost() {}
