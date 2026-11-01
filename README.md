# <img src="assets/icon.png" alt="" width="40"/> Hopla

**Les tâches de la famille, en jeu.**

Hopla est une application auto-hébergée pour organiser les tâches de la maison
en famille. Les enfants gagnent des hops en faisant leurs tâches, montent de
rang, réussissent des quêtes et des défis, s'offrent des récompenses et
apprennent en jouant. Les parents règlent tout, depuis un ordinateur, un
téléphone ou la tablette de la maison.

Hopla est pensé pour fonctionner avec Home Assistant : l'intégration
[hopla-ha](https://github.com/Nico87LBS/hopla-ha) affiche la famille sur une
tablette murale, envoie les notifications et fait les annonces.

## Fonctionnalités

**Tâches**

- Tâches uniques, répétées (tous les jours, certains jours, toutes les N
  semaines, le 1er lundi du mois…, ou « à son rythme »), toujours disponibles,
  ou déclenchées par un signal extérieur.
- Ajout rapide qui comprend « Ranger la chambre demain 18h » ou « tous les
  mardis ».
- Créneaux : une tâche faite plusieurs fois par jour (les dents matin, midi et
  soir), chaque créneau coché et validé à part.
- À plusieurs, trois modes : **Chacun la sienne**, **Premier arrivé**, **Un
  seul à la fois** (avec rotation, hasard ou tour de rôle).
- Validation par un parent, étapes, étiquettes, consignes, photos et pièces
  jointes, rappels.
- Routines : des tâches enchaînées, une étape à la fois.
- Mode « Pas là » : les tâches d'un enfant absent (garde partagée, vacances)
  se mettent en pause, sans casser sa série.
- Page Aujourd'hui avec le résumé de la journée de chaque enfant.

**Jeu**

- Une monnaie réglable : hops par défaut, ou points, étoiles, carottes,
  pièces, jetons.
- Rangs illustrés de la tribu des lapins Hopla, podium, étoiles de prestige.
- Séries de jours, tâche surprise, quêtes de la semaine et du mois, défis
  chacun pour soi ou en famille, périodes bonus (×2 à ×5), bonus chrono.
- Bonus et pénalités des parents, bonus préparés, journal de tout ce qui est
  gagné et dépensé.
- Boutique de récompenses, avec limites par jour, semaine ou mois et demandes
  validées par un parent.

**Apprendre**

- Jeux éducatifs intégrés, sans publicité, jouables hors ligne.
- Catalogue fourni : Apprendre à lire (GS et CP, méthode syllabique), Grande
  section (Langage, Maths, Explorer le monde, avec dessins et voix), Maths
  CE2 (8 modules), Anglais GS et CE2, Anglais aéronautique niveau 6 OACI.
- Calculs et problèmes tirés au hasard, questions à choix, à taper, à
  écouter, cartes à retourner, collections à compter, paires à relier,
  étiquettes à remettre dans l'ordre ou à classer, zones d'une carte ou d'une
  image à toucher ; lecture à voix haute pour ceux qui ne lisent pas encore ;
  répétition espacée ; chapitres qui s'ouvrent au fil des progrès.
- Étoiles et hops par partie, avec plafonds par jour réglables par la famille,
  le paquet, le module ou la personne ; statistiques détaillées.
- Signalement d'une question en jeu, correction des fiches par la famille,
  import de modules écrits à la main.

**Famille et technique**

- Comptes des enfants gérés par les parents, rôles, invitations par code.
- Fuseau horaire de la famille, indépendant de l'appareil.
- Synchronisation en temps réel entre tous les appareils, mode hors ligne,
  application installable sur l'écran d'accueil.
- Calendrier iCal privé, API REST avec jetons d'accès.
- Connexion par compte local ou OpenID Connect, double authentification.
- Interface en français et en anglais.

## Installation

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

Au premier démarrage, Hopla crée `config/selfhosted.yaml` avec un secret
aléatoire ; modifiez-le puis redémarrez. Tout le
détail (proxy HTTPS, e-mails, OpenID Connect, sauvegarde, mise à jour) est
dans [la documentation d'installation](docs/installation.md).

## Documentation

| Page | Contenu |
| --- | --- |
| [Installation et configuration](docs/installation.md) | Docker, réglages, e-mails, OpenID Connect, sauvegarde, mise à jour |
| [Premiers pas](docs/premiers-pas.md) | Famille, comptes des enfants, rôles, réglages, navigation |
| [Les tâches](docs/taches.md) | Éditeur, rythmes, créneaux, modes, validation, « Pas là » |
| [Hops, récompenses et jeux](docs/points-et-jeux.md) | Rangs, séries, quêtes, défis, bonus, routines, Boutique |
| [Apprendre](docs/apprendre.md) | Catalogue, réglages, étoiles, progrès |
| [Format des modules](docs/format-module.md) | Écrire ses propres modules Apprendre |
| [API et intégrations](docs/api.md) | Jetons, API externe, temps réel, iCal |
| [Développement](docs/developpement.md) | Code, tests, traductions, versions |

## Développement

```sh
HOPLA_ENV=local go run .          # serveur, port 2021
cd web && npm install && npm run dev   # application web, port 5173
```

Chaque pull request augmente le fichier `VERSION` ; une fois fusionnée, elle
devient une release `vX.Y.Z` et une image Docker du même numéro. Les règles du
projet et les vérifications sont dans [Développement](docs/developpement.md).

## Licence

Hopla est une version modifiée d'un logiciel libre distribué sous licence
GNU Affero General Public License v3.0. Hopla est distribué sous la même
licence : voir le fichier [LICENSE](LICENSE).
