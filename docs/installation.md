# Installation et configuration

Hopla est un seul programme : un serveur qui sert aussi l'application web.
Il garde ses données dans une base SQLite (un seul fichier) et les pièces
jointes dans un dossier à côté.

## Avec Docker Compose

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

Lancez `docker compose up -d`, puis ouvrez `http://<serveur>:2021`.

- `./data` contient la base `hopla.db` et le dossier `files/` (photos, pièces
  jointes).
- `./config` contient `selfhosted.yaml`, créé au premier démarrage.
- `TZ` ne sert qu'aux journaux du serveur : le jour de la famille (minuit,
  séries, quêtes) suit le fuseau réglé dans Gérer › Famille › Réglages.

### Choisir une version

`latest` suit la dernière version. Chaque version est aussi publiée sous son
numéro, par exemple `ghcr.io/nico87lbs/hopla:1.30.1`, pour rester sur une
version précise. Le numéro en service est affiché en bas du menu de
l'application. La liste des versions et de leurs changements est sur la page
[Releases](https://github.com/Nico87LBS/hopla/releases) du dépôt.

### Derrière un proxy HTTPS

Hopla écoute en HTTP. Pour l'ouvrir hors de la maison, placez-le derrière un
proxy (Caddy, Nginx Proxy Manager, Traefik…) qui fournit le HTTPS, et
renseignez l'adresse publique :

```yaml
server:
  public_host: "https://hopla.example.fr"
email:
  app_host: "https://hopla.example.fr"
```

`public_host` sert aux liens que le serveur fabrique (calendrier iCal, liens
de jeu) et `app_host` aux liens des e-mails. Le proxy doit laisser passer les
connexions longues de `/api/v1/realtime/sse` (temps réel) : coupez la mise en
mémoire tampon pour cette adresse si votre proxy en fait une.

L'application web s'installe comme une application sur un téléphone ou une
tablette (menu « Ajouter à l'écran d'accueil ») et marche hors ligne une fois
ouverte au moins une fois.

`GET /health` répond sans connexion, avec la version : de quoi brancher la
surveillance du conteneur.

## Le fichier de configuration

Au premier démarrage avec `HOPLA_ENV=selfhosted`, Hopla écrit
`config/selfhosted.yaml` à partir de
[`config/selfhosted.yaml.example`](../config/selfhosted.yaml.example), avec un
secret JWT tiré au hasard. Modifiez ce fichier puis redémarrez le conteneur.

Chaque réglage peut aussi être donné par une variable d'environnement
`HOPLA_` suivie du chemin du réglage en majuscules, les points remplacés par
des tirets bas : `jwt.secret` devient `HOPLA_JWT_SECRET`, `server.port`
devient `HOPLA_SERVER_PORT`. La variable l'emporte sur le fichier.

### Réglages principaux

| Réglage | Par défaut | Rôle |
| --- | --- | --- |
| `jwt.secret` | tiré au hasard | Signe les sessions. Le changer déconnecte tout le monde |
| `jwt.session_time` | `168h` | Durée d'une session sans activité |
| `jwt.max_refresh` | `1440h` | Durée maximale d'une session prolongée |
| `server.port` | `2021` | Port d'écoute |
| `server.public_host` | `http://localhost:2021` | Adresse publique (voir plus haut) |
| `server.rate_limit` / `rate_period` | `300` / `60s` | Requêtes permises par adresse et par période |
| `server.cors_allow_origins` | | Origines autorisées pour un client web servi ailleurs |
| `server.serve_frontend` | `true` | Sert l'application web |
| `server.serve_swagger` | `true` | Sert la description de l'API sous `/swagger/` |
| `is_user_creation_disabled` | `false` | `true` interdit la création de nouveaux comptes |
| `single_family_instance` | `false` | Une seule famille sur le serveur : on ne peut plus en rejoindre ni en quitter une, et chaque nouveau compte OpenID entre dans la famille commune |
| `disable_password_auth` | `false` | Seulement OpenID Connect : la connexion par mot de passe disparaît |
| `database.type` | `sqlite` | `sqlite` ou `postgres` (avec `host`, `port`, `user`, `password`, `name`) |
| `database.migration` | `true` | Met la base à jour au démarrage |
| `logging.level` | `info` | `debug`, `info`, `warn` ou `error` |
| `mfa.enabled` | `true` | Double authentification par application (TOTP) |

### Fichiers et photos

| Réglage | Rôle |
| --- | --- |
| `storage.base_path` | Dossier des pièces jointes et photos. Vide : `files/` à côté de la base |
| `storage.max_file_size` | Taille maximale d'un fichier, en octets (par défaut 20 Mo) |
| `storage.max_user_storage` | Place totale de la famille, en octets (par défaut 10 Go) |

Par exemple, pour des fichiers jusqu'à 50 Mo et 20 Go pour la famille :

```yaml
storage:
  max_file_size: 52428800
  max_user_storage: 21474836480
```

### Voix naturelle des jeux

Par défaut, chaque appareil lit les questions d'Apprendre avec sa propre voix.
Pour une voix plus naturelle, Hopla peut demander les phrases à un serveur
[Piper](https://github.com/rhasspy/wyoming-piper) qui parle le protocole
Wyoming. Chaque phrase est fabriquée une seule fois, puis gardée sur le disque.

| Réglage | Rôle |
| --- | --- |
| `voice.piper` (`HOPLA_VOICE_PIPER`) | Adresse du serveur Piper, par exemple `tcp://piper:10200`. Vide : voix de l'appareil |
| `voice.cache_dir` (`HOPLA_VOICE_CACHE_DIR`) | Dossier des phrases gardées. Vide : `voix/` à côté de la base |

Par exemple, avec un conteneur Piper à côté de Hopla :

```yaml
services:
  piper:
    image: rhasspy/wyoming-piper:latest
    container_name: piper
    restart: unless-stopped
    command: --voice fr_FR-siwis-medium
    volumes:
      - ./piper:/data
  hopla:
    # … comme plus haut, avec en plus :
    environment:
      - HOPLA_VOICE_PIPER=tcp://piper:10200
```

Piper télécharge une voix la première fois qu'on la demande. Le choix de la
voix, langue par langue, se fait dans Gérer › Modules d'apprentissage › Voix.
Si le serveur ne répond pas, l'appareil reprend sa propre voix.

### Variables d'environnement propres

| Variable | Rôle |
| --- | --- |
| `HOPLA_ENV` | Fichier de configuration à lire dans `config/` : `selfhosted`, `local` ou `prod` |
| `HOPLA_SQLITE_PATH` | Chemin de la base SQLite (par défaut `hopla.db`) |
| `HOPLA_DISABLE_SIGNUP` | `true` pour interdire la création de comptes |
| `HOPLA_LOG_LEVEL` | Niveau des journaux |
| `HOPLA_LOG_ENCODING` | `json` ou `console` |

## E-mails

Les e-mails servent à vérifier une adresse et à réinitialiser un mot de passe.
Ils partent par SMTP, dans la langue de la personne.

```yaml
email:
  host: smtp.example.fr
  port: 587
  email: hopla@example.fr   # expéditeur
  user: hopla@example.fr    # identifiant SMTP, l'expéditeur si vide
  key: "mot-de-passe-smtp"
  app_host: https://hopla.example.fr
  log_raw_url: true
```

Sans serveur SMTP, laissez `log_raw_url: true` : le lien de réinitialisation
s'affiche dans les journaux du conteneur (`docker logs hopla`).

Le serveur n'envoie aucune autre notification. Les rappels des tâches sont
transmis à l'intégration Home Assistant
([hopla-ha](https://github.com/Nico87LBS/hopla-ha)), qui les envoie.

## Connexion OpenID Connect

Pour se connecter avec un fournisseur d'identité (Authentik, Authelia,
Keycloak, Pocket ID…) :

```yaml
oauth2:
  name: "Authentik"            # texte du bouton
  client_id: "hopla"
  client_secret: "…"
  auth_url: "https://auth.example.fr/application/o/authorize/"
  token_url: "https://auth.example.fr/application/o/token/"
  user_info_url: "https://auth.example.fr/application/o/userinfo/"
  redirect_url: "https://hopla.example.fr/auth/oauth2"
  scopes: ["openid", "profile", "email"]
  pkce: true
  admin_groups: ["hopla-parents"]   # facultatif
  manager_groups: []                # facultatif
```

`admin_groups` et `manager_groups` donnent le rôle correspondant dans la
famille à chaque connexion des membres de ces groupes.

## Sauvegarde

Tout ce qui compte est dans le volume `data` :

- `hopla.db`, la base : familles, tâches, historique, hops, jeux, progrès
  d'Apprendre ;
- `files/`, les photos et pièces jointes.

Pour une copie fiable, arrêtez le conteneur le temps de copier, ou utilisez
`sqlite3 hopla.db ".backup hopla-copie.db"` pendant qu'il tourne. Gardez aussi
`config/selfhosted.yaml` : sans le même `jwt.secret`, tout le monde devra se
reconnecter.

Gérer › Avancé › Modèle d'instance exporte autre chose : un modèle de tâches,
récompenses, bonus préparés et jeux, sans personnes ni historique, pour
démarrer une autre famille. Ce n'est pas une sauvegarde.

## Mise à jour

```sh
docker compose pull
docker compose up -d
```

La base est mise à jour au démarrage. Lisez la note de la version dans
[Releases](https://github.com/Nico87LBS/hopla/releases) avant de sauter
plusieurs versions : un changement du premier chiffre (`2.0.0`) demande une
action, décrite dans la note. Quand une version de Hopla va avec une version
de l'intégration Home Assistant, la note dit laquelle installer d'abord.
