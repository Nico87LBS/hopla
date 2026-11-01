# Développement

## Organisation du dépôt

| Dossier | Contenu |
| --- | --- |
| `main.go` | Démarrage du serveur (injection des dépendances avec `fx`, routes) |
| `config/` | Lecture de la configuration, modèle `selfhosted.yaml.example`, `local.yaml` pour le développement |
| `internal/` | Le serveur Go, un dossier par domaine (voir plus bas) |
| `migrations/` | Migrations de données datées, jouées une fois au démarrage, avec leurs tests |
| `frontend/` | Sert l'application web compilée (`frontend/dist`, embarquée dans le binaire) |
| `web/` | L'application web React (Vite, Joy UI, React Query) |
| `docs/` | Cette documentation, et la description Swagger de l'API |
| `scripts/` | Vérifications lancées par la CI |
| `VERSION` | Le numéro de version, partagé par le serveur et le web |

### Le serveur (`internal/`)

| Paquet | Rôle |
| --- | --- |
| `auth` | Sessions JWT, jetons d'accès, double authentification, agir au nom d'un autre |
| `user`, `family` | Comptes, sous-comptes des enfants, familles, rôles, invitations, fuseau, monnaie |
| `chore` | Tâches : modèle, éditeur, échéances, créneaux, modes, validation, API externe |
| `subtask`, `label` | Étapes et étiquettes |
| `points` | Registre des hops (`points_history`), bonus et pénalités, bonus préparés, journal |
| `reward` | Récompenses et demandes |
| `games` | Séries, tâche surprise, périodes bonus, rangs, quêtes, défis, bonus chrono, routines, présence |
| `learn` | Apprendre : catalogue intégré (`learn/catalogue/*.json`), modules, réglages, parties, corrections, signalements, liens de jeu |
| `calendar` | Flux iCal privé |
| `realtime` | Flux SSE et diffusion des événements |
| `sync` | Synchronisation du mode hors ligne du web |
| `storage` | Pièces jointes et photos sur disque |
| `email` | E-mails SMTP, textes par langue dans `email/locales` |
| `database` | Ouverture de la base et migrations |

### Le web (`web/src/`)

| Dossier | Rôle |
| --- | --- |
| `views/` | Les pages : `Chores` (Aujourd'hui), `ChoreEdit` (éditeur), `Family`, `Games`, `Learn`, `Manage`, `Rewards`, `Settings`… |
| `components/` | Composants partagés |
| `queries/`, `utils/Fetcher.jsx` | Appels à l'API et cache React Query |
| `utils/learn/` | Le moteur d'Apprendre : générateurs, répétition espacée, étoiles, voix, file des parties hors ligne |
| `contexts/RouterContext.jsx` | Les routes |
| `public/locales/<langue>/` | Tous les textes de l'interface, en `fr` et `en` |
| `public/drawings/` | Les dessins des fiches Écoute, fabriqués par `scripts/drawings.mjs` |

## Lancer en local

Serveur (Go, version de `go.mod`) :

```sh
HOPLA_ENV=local go run .
```

Il lit `config/local.yaml`, écoute sur le port 2021 et crée `hopla.db` dans
le dossier courant.

Application web (Node 20 ou plus, voir `web/.nvmrc` ; la CI utilise Node 22), dans `web/` :

```sh
npm install
npm run dev
```

Elle s'ouvre sur `http://localhost:5173` et parle au serveur de
`VITE_APP_API_URL` (`web/.env.development`, `http://localhost:2021` par
défaut).

Pour essayer le binaire complet avec le web embarqué :

```sh
cd web && npx vite build --mode selfhosted && cd ..
rm -rf frontend/dist && cp -r web/dist frontend/dist
HOPLA_ENV=local go run .
```

(Remettez ensuite `frontend/dist` comme il était avec
`git checkout frontend/dist && git clean -fd frontend/dist`.)

## Vérifications

Ce que la CI lance sur chaque pull request :

```sh
bash scripts/check-time-utc.sh
go vet ./...
go test ./...

cd web
npx eslint --quiet src
npm run lint:i18n
node --test tests/*.test.mjs
npx vite build --mode selfhosted
```

## Règles du projet

- **Tout en français** : textes, commentaires de PR, messages de commit.
- **Aucun texte en dur** dans le web : tout passe par les fichiers de
  `web/public/locales/`, en `fr` et en `en`, avec les mêmes clés.
  `npm run lint:i18n` vérifie les deux langues et les clés utilisées. La
  monnaie s'écrit avec les variables `{{unit}}`, `{{units}}`, `{{Units}}`,
  `{{AUnit}}`, `{{ofUnits}}` et l'accord `{{e}}`, jamais « hops » en dur.
- **L'interface web ne parle pas de Home Assistant.** L'intégration est un
  client parmi d'autres de l'API externe.
- **Même style** entre l'application web et les cartes de la tablette :
  photos des membres avec pastilles d'état, couleurs des modes, icônes.
- **Heures** : le serveur utilise `time.Now().UTC()` (vérifié par la CI) ;
  le jour de la famille se calcule dans son fuseau.
- **Base de données** : un changement de données passe par une migration
  datée dans `migrations/`, avec un test.

## Versions et publication

Chaque pull request augmente `VERSION` : `Z` pour une correction, `Y` pour une
nouveauté, `X` pour un changement qui demande une action à la mise à jour. Une
fois fusionnée dans `main` :

- `release.yml` crée la release GitHub `vX.Y.Z` ;
- `image.yml` publie `ghcr.io/nico87lbs/hopla:X.Y.Z` et `latest`.

Le numéro est affiché dans le menu de l'application et renvoyé par
`/api/v1/resource`.

## Ajouter un paquet au catalogue

1. Écrire les fichiers JSON du paquet et de ses modules dans
   `internal/learn/catalogue/` (voir [le format](format-module.md)).
2. Les tests de `internal/learn` vérifient chaque fichier du catalogue :
   `go test ./internal/learn/`.
3. Augmenter `version` d'un module modifié : les familles qui l'ont installé
   reçoivent la mise à jour au prochain chargement, et un module ajouté à un
   paquet s'installe seul.
