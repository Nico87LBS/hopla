# Documentation de Hopla

Hopla organise les tâches de la maison en famille et les transforme en jeu :
les enfants gagnent des hops (ou la monnaie choisie par la famille), montent
de rang, réussissent des quêtes et jouent à des jeux éducatifs.

Cette documentation décrit la version présente dans ce dépôt (voir le fichier
[`VERSION`](../VERSION)).

| Page | Pour qui | Contenu |
| --- | --- | --- |
| [Installation et configuration](installation.md) | La personne qui héberge Hopla | Docker, fichier de configuration, variables, e-mails, OpenID Connect, sauvegarde, mise à jour |
| [Premiers pas](premiers-pas.md) | Les parents | Créer la famille, inviter, comptes des enfants, rôles, réglages de la famille, navigation |
| [Les tâches](taches.md) | Les parents | Éditeur, rythmes, créneaux, modes à plusieurs, attribution, validation, présence, page Aujourd'hui |
| [Hops, récompenses et jeux](points-et-jeux.md) | Les parents | Monnaie, journal, bonus et pénalités, Boutique, rangs, séries, tâche surprise, quêtes, défis, périodes bonus, bonus chrono, routines, remise à zéro |
| [Apprendre](apprendre.md) | Les parents | Jeux éducatifs : catalogue, paquets, réglages, étoiles, répétition espacée, statistiques, signalements |
| [Format des modules Apprendre](format-module.md) | Qui écrit des modules | Le format `hopla-module/1` champ par champ, types de fiches, générateurs, exemples |
| [API et intégrations](api.md) | Qui branche Hopla à autre chose | Jetons d'accès, API externe, temps réel, calendrier iCal |
| [Développement](developpement.md) | Qui modifie le code | Organisation du code, lancer en local, tests, traductions, versions |

L'intégration Home Assistant (cartes pour tablette, notifications, annonces)
est un projet à part, documenté dans
[hopla-ha](https://github.com/Nico87LBS/hopla-ha).
