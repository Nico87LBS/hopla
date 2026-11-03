# API et intégrations

Hopla a deux API REST :

- `/api/v1/…` : celle de l'application web, avec une session (jeton JWT dans
  l'en-tête `Authorization: Bearer …`) ;
- `/eapi/v1/…` : l'API externe, pour brancher d'autres outils (domotique,
  scripts), avec un jeton d'accès longue durée.

Quand `server.serve_swagger` est actif, une description de l'API est servie
sous `/swagger/index.html`. Elle décrit toutes les adresses, rangées par
thème (Tâches, Famille, Jeux, Apprendre…), et elle est générée depuis les
commentaires `@Summary` / `@Router` placés au-dessus de chaque fonction.

## Jetons d'accès

Gérer › Avancé › Jetons d'accès crée un jeton (`hp_…`), affiché une seule
fois. Il agit avec les droits de la personne qui l'a créé : créez-le avec un
compte de parent pour valider des tâches ou donner des bonus.

Chaque appel le passe dans l'en-tête `secretkey` :

```sh
curl -H "secretkey: hp_xxxxxxxx" https://hopla.example.fr/eapi/v1/chore
```

Un jeton se révoque depuis la même page. Les jetons sont gardés hachés : un
jeton perdu ne se retrouve pas, il se remplace.

## API externe

Toutes les routes demandent l'en-tête `secretkey`. Les actions réservées aux
parents renvoient `403` avec un jeton d'enfant.

### Tâches

| Méthode et route | Rôle |
| --- | --- |
| `GET /eapi/v1/chore` | Toutes les tâches de la famille |
| `POST /eapi/v1/chore` | Créer une tâche |
| `PUT /eapi/v1/chore/:id` | Modifier une tâche (son créateur ou un parent). Donner une échéance à une tâche « Sur signal » la rend à faire |
| `DELETE /eapi/v1/chore/:id` | Supprimer une tâche (son créateur ou un parent) |
| `POST /eapi/v1/chore/:id/complete` | Marquer faite. Une tâche à valider passe en attente |
| `POST /eapi/v1/chore/:id/approve` | Valider (parent) |
| `POST /eapi/v1/chore/:id/reject` | Refuser (parent) |
| `POST /eapi/v1/chore/:id/slots/:slot/approve` | Valider un créneau (parent) |
| `POST /eapi/v1/chore/:id/slots/:slot/reject` | Refuser un créneau (parent) |
| `POST /eapi/v1/chore/:id/slots/:slot/catchup` | Rattraper un créneau oublié, jusqu'à minuit (parent) |

### Famille

| Méthode et route | Rôle |
| --- | --- |
| `GET /eapi/v1/family/members` | Les membres, leur rôle, leur photo et leur présence |
| `PUT /eapi/v1/family/members/:id/away` | `{"away": true}` met un enfant en « Pas là », `false` le fait revenir (parent) |
| `GET /eapi/v1/family/timezone` | Le fuseau de la famille |
| `PUT /eapi/v1/family/timezone` | Changer le fuseau (parent) |

### Hops

| Méthode et route | Rôle |
| --- | --- |
| `GET /eapi/v1/points/history?userId=&before=&limit=` | Historique des hops d'un membre, page par page |
| `GET /eapi/v1/points/journal` | Journal de la famille |
| `POST /eapi/v1/points/adjust` | Bonus ou pénalité (parent) : `{"userId": 12, "points": -3, "reason": "Dispute"}`, ou `presetId` pour un bonus préparé |
| `GET /eapi/v1/points/presets` | Les bonus préparés |

### Récompenses

| Méthode et route | Rôle |
| --- | --- |
| `GET /eapi/v1/rewards` | Les récompenses |
| `POST /eapi/v1/rewards/:id/redeem` | Demander une récompense |
| `GET /eapi/v1/rewards/redemptions` | Les demandes |
| `POST /eapi/v1/rewards/redemptions/:id/approve` | Accepter une demande (parent) |
| `POST /eapi/v1/rewards/redemptions/:id/reject` | Refuser une demande (parent) |

### Jeux

| Méthode et route | Rôle |
| --- | --- |
| `GET /eapi/v1/games/today` | Tout le jeu du jour : séries, tâche surprise, période bonus, bonus chrono, rangs, quêtes, défis, routines, hops du jour de chacun, monnaie, et `nextChangeAt`, la prochaine heure où ces données changent seules |
| `GET /eapi/v1/games/periods` | Les périodes bonus |
| `GET /eapi/v1/games/flashes` | Les bonus chrono en cours |
| `POST /eapi/v1/games/flashes` | Lancer un bonus chrono (parent) |
| `DELETE /eapi/v1/games/flashes/:id` | Arrêter un bonus chrono (parent) |
| `GET /eapi/v1/games/ranks` | Les rangs |
| `GET /eapi/v1/games/quests` | Les quêtes en cours |
| `GET /eapi/v1/games/challenges` | Les défis |
| `GET /eapi/v1/games/routines` | Les routines et où en est chaque enfant |
| `POST /eapi/v1/learn/play-links` | Un lien de jeu Apprendre pour un membre (voir plus bas) |

### Lien de jeu Apprendre

`POST /eapi/v1/learn/play-links` avec `{"userId": 12}` renvoie `code`, `path`
(`/play/<code>`, à ouvrir sur le serveur Hopla) et `expiresAt`. Le lien :

- sert une seule fois, dans la minute ;
- ouvre une session « jeux seulement » de deux heures pour ce membre, sans
  identifiant : elle ne permet que de jouer et d'envoyer ses parties ;
- est fait pour une tablette partagée, ouverte en plein écran.

## Temps réel (SSE)

`GET /api/v1/realtime/sse` est un flux Server-Sent Events. Il s'ouvre avec le
jeton d'accès dans l'en-tête `secretkey`, ou, pour un navigateur qui ne peut
pas envoyer d'en-tête, avec un ticket à usage unique obtenu par
`GET /api/v1/realtime/sse/ticket` puis passé en `?ticket=…`.

| Événement | Quand |
| --- | --- |
| `chore.created`, `chore.updated`, `chore.deleted` | Une tâche change |
| `chore.completed`, `chore.skipped` | Une tâche est faite ou passée |
| `subtask.updated`, `subtask.completed` | Une étape change |
| `rewards.updated` | Les récompenses ou les demandes changent |
| `family.updated` | Les membres changent (présence, photo, rôle) |
| `connection.established`, `heartbeat` | Ouverture du flux, puis signe de vie régulier |

Un client recharge ce qui l'intéresse à chaque événement. Le flux est limité
à 5 connexions par personne (`realtime.max_connections_per_user`).

## Calendrier iCal

Gérer › Avancé › Calendrier crée une adresse privée
`/api/v1/chores/calendar/<jeton>` à ajouter comme abonnement dans un agenda.
Elle ne demande pas de connexion : gardez-la privée, changez-la si elle a
fuité.

## Agir au nom d'un autre membre

Dans l'API de l'application, un parent peut agir pour un autre membre de la
famille avec l'en-tête `X-Impersonate-User-ID: <id>`. C'est ce que fait
l'application quand un parent coche une tâche pour un enfant.
