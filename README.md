# <img src="assets/icon.png" alt="" width="40"/> Hopla

**Les tâches de la famille, en jeu.**

Hopla est une application auto-hébergée pour organiser les tâches de la maison
en famille : tâches récurrentes, tours de rôle, points et récompenses pour les
enfants. Elle est pensée pour fonctionner avec Home Assistant, qui se charge
des notifications et de l'affichage sur une tablette murale.

## Fonctionnalités

- Tâches ponctuelles ou récurrentes (quotidiennes, hebdomadaires, mensuelles,
  jours précis, planification adaptative), avec sous-tâches et étiquettes.
- Créneaux : une tâche faite plusieurs fois par jour (se laver les dents le
  matin, à midi et le soir), chaque créneau coché et validé à part ; un parent
  peut rattraper un créneau oublié jusqu'à minuit.
- Attribution par rotation, au hasard ou à tour de rôle.
- Comptes enfants gérés par les parents.
- Points, récompenses et demandes de récompense validées par un parent.
- Pièces jointes et photos sur les tâches (stockage local ou S3).
- Tâches « déclenchées de l'extérieur » : sans échéance, elles attendent
  qu'une automatisation Home Assistant (`hopla.update_task`) les rende à faire.
- Synchronisation en temps réel (SSE) entre tous les appareils.
- Abonnement calendrier iCal privé.
- Connexion par compte local ou OpenID Connect, double authentification TOTP.
- API REST avec jetons d'accès longue durée.
- Interface en français et en anglais.

Les notifications ne sont pas envoyées par le serveur : c'est l'intégration
Home Assistant [hopla-ha](https://github.com/Nico87LBS/hopla-ha) qui les gère,
à partir des rappels définis sur chaque tâche.

## Installation avec Docker

```yaml
services:
  hopla:
    image: ghcr.io/nico87lbs/hopla:latest
    container_name: hopla
    restart: unless-stopped
    ports:
      - "2021:2021"
    volumes:
      - ./data:/data
      - ./config:/config
    environment:
      - HOPLA_ENV=selfhosted
      - HOPLA_SQLITE_PATH=/data/hopla.db
      - TZ=Europe/Paris
```

L'image est aussi publiée avec son numéro de version
(`ghcr.io/nico87lbs/hopla:1.0.0`) pour rester sur une version précise. Le
numéro est affiché en bas du menu de l'application.

Au premier démarrage, Hopla crée `config/selfhosted.yaml` à partir de
[ce modèle](config/selfhosted.yaml.example), avec un secret JWT aléatoire.
Modifiez ce fichier puis redémarrez le conteneur.

Chaque réglage du fichier peut aussi être donné par une variable
d'environnement préfixée par `HOPLA_`, en remplaçant les points par des
tirets bas. Par exemple `jwt.secret` devient `HOPLA_JWT_SECRET` et
`server.port` devient `HOPLA_SERVER_PORT`.

| Variable | Rôle |
| --- | --- |
| `HOPLA_ENV` | Fichier de configuration à charger (`selfhosted`, `local`, `prod`) |
| `HOPLA_SQLITE_PATH` | Chemin de la base SQLite (par défaut `hopla.db`) |
| `HOPLA_DISABLE_SIGNUP` | `true` pour interdire la création de comptes |
| `HOPLA_LOG_LEVEL` | Niveau de journalisation (`debug`, `info`, `warn`, `error`) |

## Développement

Serveur (Go 1.24) :

```sh
HOPLA_ENV=local go run .
```

Application web (Node 20 ou plus), dans `web/` :

```sh
npm install
npm run dev
```

Les textes de l'interface sont dans `web/public/locales/<langue>/`. Aucun
texte ne doit être écrit en dur dans le code.

### Versions

Le numéro de version, `X.Y.Z`, est dans le fichier `VERSION` à la racine,
partagé par le serveur et l'application web. Chaque pull request l'augmente :
`Z` pour une correction, `Y` pour une nouveauté, `X` pour un changement qui
demande une action à la mise à jour. Une fois fusionnée dans `main`, la
nouvelle version devient une release GitHub `vX.Y.Z` et une image Docker du
même numéro.

Tests et vérifications :

```sh
go vet ./... && go test ./...
cd web && npx eslint --quiet src && npm run lint:i18n && npx vite build --mode selfhosted
```

## Licence

Hopla est une version modifiée d'un logiciel libre distribué sous licence
GNU Affero General Public License v3.0. Hopla est distribué sous la même
licence : voir le fichier [LICENSE](LICENSE).
