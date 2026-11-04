# Les tâches

## Créer une tâche

Le bouton « Nouvelle tâche » ouvre l'ajout rapide : on tape le nom, et Hopla
comprend la date et la répétition écrites dans le titre, en français comme en
anglais.

| On tape | Hopla comprend |
| --- | --- |
| `Ranger la chambre demain 18h` | Une fois, demain à 18 h |
| `Sortir les poubelles tous les mardis` | Chaque mardi |
| `Arroser les plantes toutes les deux semaines` | Toutes les 2 semaines |
| `Payer la cantine le 5 de chaque mois` | Le 5 de chaque mois |
| `Réunion le premier lundi du mois` | Le 1er lundi de chaque mois |
| `Brossage des dents tous les soirs` | Chaque jour, le soir |

L'éditeur complet s'ouvre depuis l'ajout rapide ou en touchant une tâche. Il
tient en trois blocs, plus des options repliées.

### Pour qui ?

On choisit une ou plusieurs personnes. Sans personne choisie, tout le monde
peut faire la tâche. La case « Retenir pour les nouvelles tâches » garde ce
choix pour la prochaine fois.

À plusieurs, trois modes, reconnaissables partout à leur nom, leur couleur et
leur symbole :

| Mode | Couleur | Fonctionnement |
| --- | --- | --- |
| **Chacun la sienne** | bleu | Une copie de la tâche par personne : chacun coche la sienne et gagne ses hops |
| **Premier arrivé** | orange, éclair | Une seule tâche pour tous : la première personne qui la fait gagne les hops |
| **Un seul à la fois** | gris | Une seule personne a la tâche à la fois, puis elle passe à une autre selon la règle d'attribution |

Les copies de « Chacun la sienne » portent le même nom : les quêtes, défis,
tâche surprise et routines les comptent toutes ensemble. Modifier une copie
indique de qui elle est.

Règles d'attribution pour « Un seul à la fois » : chacun son tour, au hasard,
au hasard sauf la dernière personne, le moins souvent assigné, le moins de
tâches faites, ou toujours la même personne. L'éditeur montre qui l'a
maintenant et qui l'aura ensuite.

### Quand ?

Quatre types :

| Type | Fonctionnement |
| --- | --- |
| **Une fois** | Une échéance (aujourd'hui, demain, autre date), avec ou sans heure. Faite, elle part dans les archives |
| **Répétée** | Revient selon un rythme |
| **Toujours** | Sans échéance, elle reste dans la liste et peut être faite à tout moment |
| **Sur signal** | Sans échéance, elle attend qu'un signal extérieur (une automatisation de la maison, par l'API) la rende à faire |

Rythmes d'une tâche répétée : tous les jours, certains jours de la semaine
(avec, au besoin, seulement certaines semaines du mois : 1er lundi, dernier
vendredi…), toutes les semaines, tous les mois, certains mois, tous les ans,
tous les N jours/semaines/mois, ou « À son rythme » (Hopla apprend l'écart
habituel entre deux fois).

« Compter depuis le jour où elle est faite » : faite en retard, la tâche
revient d'autant plus tard. Sans cette case, elle garde son calendrier.
Faite en retard, elle saute les passages manqués : faite un jour, elle ne
revient pas avant le lendemain, à son heure habituelle (une tâche quotidienne
de 18 h faite le matin ne revient pas le soir même). Une tâche toutes les N
heures saute seulement les passages déjà passés.

### Créneaux

Pour une tâche faite plusieurs fois par jour (se brosser les dents matin, midi
et soir), on ajoute un créneau par fois, avec un nom et une heure.

- La tâche n'a pas besoin d'échéance : elle est due à son prochain créneau.
- Un créneau s'ouvre une heure avant son heure et se ferme quand le suivant
  s'ouvre ; le dernier se ferme à minuit.
- Chaque créneau se coche à part et rapporte les hops de la tâche.
- Un parent peut rattraper un créneau oublié jusqu'à minuit.
- La ligne de la tâche montre chaque créneau : fait, à venir, oublié, en
  attente de validation ou fait par un autre (en « Premier arrivé »).

### Récompense

- **Hops** gagnés à chaque fois (ou à chaque créneau).
- **Un parent valide** : la tâche cochée attend la validation d'un parent
  avant de rapporter ses hops. Les tâches à valider ont leur propre groupe en
  haut de la liste, et un bouton « Tout valider ».
- **Bonus chrono** : des hops en plus si la tâche est faite au plus tard N
  minutes après son heure prévue (après chaque créneau, ou après le signal).
  Un parent peut aussi lancer un bonus chrono ponctuel sur n'importe quelle
  tâche (voir [Hops, récompenses et jeux](points-et-jeux.md#bonus-chrono)).

### Plus d'options

| Option | Rôle |
| --- | --- |
| Consignes et fichiers | Un texte mis en forme, des photos et pièces jointes |
| Étapes | Une liste de sous-tâches à cocher |
| Rappels | Quand prévenir, autour de l'échéance. Le serveur n'envoie rien lui-même : les rappels sont transmis à l'intégration de la maison, qui notifie |
| Faisable en avance | Permet de cocher la tâche N heures avant son échéance |
| Étiquettes | Pour classer et filtrer (Gérer › Tâches › Étiquettes) |
| Visible par | Toute la famille, ou seulement les personnes concernées |

## Faire une tâche

Sur la page Aujourd'hui, on coche la tâche. Le menu d'une tâche permet aussi
de la terminer avec une note, à une date passée, de passer à l'échéance
suivante, de voir son historique, de la cloner ou de l'archiver. Sur
téléphone, glisser une ligne donne les actions courantes. Plusieurs tâches se
sélectionnent ensemble pour les traiter d'un coup.

Une tâche faite par erreur s'annule depuis son historique : les hops sont
retirés.

## Les enfants absents : « Pas là »

Quand un enfant n'est pas à la maison (garde partagée, vacances), un parent
touche « À la maison » sur sa carte, dans la page Famille, pour le passer en
« Pas là ». Sa tête devient grise, avec une valise. Tant qu'il est absent :

- ses tâches sont en pause : elles ne passent pas en retard et ne s'affichent
  pas comme à faire ;
- une tâche « Premier arrivé » n'est en pause que si toutes ses personnes
  sont absentes ;
- les jours d'absence ne cassent pas sa série ;
- ses quêtes ne sont pas tirées, et les objectifs de ses quêtes et défis sont
  réduits en proportion des jours d'absence ;
- la tâche surprise est tirée parmi les enfants présents.

À son retour (« De retour à la maison »), les tâches tombées pendant
l'absence reviennent aujourd'hui, à la même heure.

## La page Aujourd'hui

Les tâches sont groupées : à valider, en retard, aujourd'hui, demain, 7
prochains jours, plus tard, n'importe quand. Les filtres et le tri se
règlent en haut de la liste, la recherche trouve une tâche par son nom.

Sur ordinateur, le panneau de droite résume la journée :

- pour chaque enfant : tâches faites sur le total, hops gagnés aujourd'hui,
  routine en cours, « Pas là » s'il est absent ;
- les jeux du jour : tâche surprise, bonus chrono en cours, période bonus ;
- les tâches prévues chaque jour de la semaine.

Les pastilles « Voir les tâches de » montrent la liste d'un autre membre,
comme il la voit.

## Archives et historique

Les tâches uniques faites et les tâches archivées sont dans Gérer › Tâches ›
Archives, d'où on peut les désarchiver. L'historique d'une tâche montre qui
l'a faite, quand, avec quelle note ; un parent peut corriger ou supprimer une
ligne.

## Calendrier

Gérer › Avancé › Calendrier donne une adresse iCal privée à ajouter à un
agenda (téléphone, Google, Outlook). L'agenda montre :

- les 30 prochains jours, un événement à chaque passage d'une tâche répétée
  et un par créneau pour une tâche faite plusieurs fois par jour (« Se
  brosser les dents · Matin ») ;
- les tâches faites des 7 derniers jours, barrées avec ✓ (⏳ si elles
  attendent un parent) ; un créneau fait ne revient pas comme « à faire » ;
- rien des tâches en pause pendant qu'un enfant est « Pas là ».

Deux choix au-dessus de l'adresse la complètent : **les tâches de** (moi ; un
parent peut aussi choisir un membre ou toute la famille, et chaque tâche dit
alors pour qui elle est) et un **rappel** de 5 à 60 minutes avant. Chaque choix
donne son adresse : on peut s'abonner à plusieurs. Les tâches ne marquent pas
l'agenda comme occupé. Le lien est personnel ; en générer un nouveau
désactive toutes ses variantes.
