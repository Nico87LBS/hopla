# Hops, récompenses et jeux

Les exemples parlent de hops, la monnaie par défaut. Si la famille a choisi
une autre monnaie (points, étoiles, carottes, pièces, jetons), tous les
textes de l'application la suivent.

## Deux compteurs par personne

| Compteur | Ce qu'il compte | À quoi il sert |
| --- | --- | --- |
| **Hops gagnés** | Tout ce qui a été gagné depuis le début (ou depuis la dernière remise à zéro), pénalités déduites | Le rang et le podium. Une dépense ne le fait jamais baisser |
| **Hops à dépenser** (le solde) | Les hops gagnés moins ceux dépensés à la Boutique | Les récompenses |

Une pénalité baisse les hops gagnés, donc elle peut faire perdre un rang, mais
le solde ne passe jamais sous zéro.

## Où gagner des hops

- Une tâche faite (et validée, si elle doit l'être), à chaque fois ou à
  chaque créneau.
- Les bonus des jeux : série, tâche surprise, quête, défi, bonus chrono,
  routine finie, période bonus qui multiplie les hops des tâches.
- Les parties d'Apprendre (voir [Apprendre](apprendre.md)).
- Un bonus donné par un parent.

Tout est écrit au **journal** (page Famille › Journal) : qui, combien,
pourquoi, et qui l'a donné. Le journal se filtre par personne et par type
(tâches, bonus et pénalités, récompenses, jeux).

## Bonus et pénalités

Un parent donne ou retire des hops depuis la carte d'un enfant, sur la page
Famille : bonus ou pénalité, un montant (ou un bonus préparé) et une raison
facultative.

Les **bonus préparés** (Gérer › Récompenses › Bonus préparés) sont les
montants habituels, à donner d'une touche : « Chambre rangée +5 », « Dispute
-3 ». Un nombre positif est un bonus, un négatif une pénalité.

## Récompenses et Boutique

Gérer › Récompenses liste ce qu'on peut s'offrir : un nom, une description,
un coût et, au besoin, une limite par membre (par jour, par semaine à partir
du lundi, ou par mois). Une récompense inactive est cachée.

Dans Famille › Boutique, un enfant demande une récompense. La demande attend
qu'un parent l'accepte ; elle est acceptée tout de suite si c'est un parent
qui la fait pour lui. Accepter retire les hops du solde ; refuser ne coûte
rien.

## Rangs

Le rang suit les hops gagnés. Les rangs par défaut sont ceux de la tribu des
lapins Hopla :

| Rang | À partir de |
| --- | --- |
| Lapineau | 0 |
| Petit bondisseur | 100 |
| Cueilleur de carottes | 250 |
| Sauteur des prés | 450 |
| Gardien du terrier | 700 |
| Sage de la clairière | 1 000 |
| Grand chef de la tribu des Hopla | 1 500 |

Les noms, images et paliers se changent dans Gérer › Rangs et règles › Rangs ;
« Remettre les rangs Hopla » revient à cette liste.

Après le dernier rang, l'enfant continue : le dernier rang dure autant de hops
que l'écart avec le rang d'avant (500 ici), puis il gagne une étoile ⭐ et
repart du premier rang pour un nouveau tour. Les étoiles s'affichent à côté de
son rang.

## Podium

La page Famille ouvre sur le podium : les enfants classés par hops gagnés,
avec leur photo, leur rang et la barre vers le rang suivant. Le réglage
« Parents sur le podium » (Gérer › Famille › Réglages) y ajoute les parents.

L'onglet Progrès montre, pour chacun, les hops de la semaine (tâches, jeux,
bonus), les tâches et parties faites et les jours d'absence.

## Règles du jeu

Gérer › Rangs et règles › Règles :

- **Série** : chaque jour où l'enfant fait au moins une tâche allonge sa
  série. Tous les N jours de série, il gagne un bonus. Un jour « Pas là » ne
  casse pas la série. Mettre 0 jour ou 0 hop coupe le bonus ; les séries
  restent comptées.
- **Tâche surprise** : chaque jour, une tâche du jour visible par tous est
  tirée au sort et rapporte des hops en plus. Pour une tâche « Chacun la
  sienne », toutes les copies rapportent le bonus.
- **Quêtes tirées chaque lundi** : combien de quêtes de la semaine chaque
  enfant reçoit.

## Missions

Gérer › Missions, avec trois onglets.

### Quêtes

Des objectifs récurrents, préparés dans une liste :

- les quêtes **de la semaine** sont tirées au hasard chaque lundi, autant que
  le réglage le dit, pour chaque enfant ;
- les quêtes **du mois** sont données le 1er à tous ceux qui peuvent les
  faire.

Une quête ajoutée en cours de semaine ou de mois est distribuée tout de suite.

### Défis

Un objectif entre deux dates, pour une partie ou toute la famille :

- **Chacun pour soi** : chaque enfant qui atteint l'objectif gagne la
  récompense ;
- **En famille** : les résultats de chacun s'additionnent pour un objectif
  commun, avec une récompense commune écrite (« Sortie piscine ») en plus des
  hops.

### Objectifs possibles

Quêtes et défis utilisent les mêmes objectifs :

| Objectif | Exemple |
| --- | --- |
| Faire des tâches (toutes, ou une tâche précise) | « Mettre la table » 5 fois |
| Gagner des hops de tâches | 50 hops de tâches |
| Tenir une série | Série de 7 jours |
| Jouer à Apprendre (tous les jeux, ou un module) | 5 parties de « Multiplication CE2 » |
| Gagner des étoiles à Apprendre (tous les jeux, ou un module) | 10 étoiles |

Un enfant « Pas là » une partie de la période a un objectif réduit d'autant.

### Périodes bonus

Entre deux dates, les hops des tâches sont multipliés (×2 à ×5) : « Week-end
double ». Si deux périodes se chevauchent, la plus forte compte. Les bonus des
jeux et les récompenses ne sont jamais multipliés.

## Bonus chrono

Des hops en plus pour qui fait une tâche à temps, une fois par enfant.

- **Réglé sur la tâche** (éditeur, bloc Récompense) : chaque fois, si la
  tâche est faite au plus tard N minutes après son heure prévue, après chaque
  créneau ou après le signal.
- **Lancé par un parent** : depuis le menu d'une tâche, « Lancer un bonus
  chrono » pour X hops pendant N minutes. Le relancer remplace celui en cours ;
  on peut aussi l'arrêter.

Un bonus chrono en cours s'affiche sur la tâche avec le temps restant.

## Routines

Une routine enchaîne des tâches existantes dans l'ordre, une étape à la fois :
habillage, petit-déjeuner, dents, cartable. Gérer › Tâches › Routines (parents).

- Chaque enfant ne voit que l'étape à faire ; la suivante apparaît quand elle
  est faite.
- Une tâche qui n'est pas la sienne ce jour-là est sautée.
- Une étape peut être une tâche « Chacun la sienne » : chaque enfant avance
  avec sa copie.
- Le bonus de fin est donné une fois par jour, quand toutes les étapes sont
  faites.

## Remise à zéro

Gérer › Avancé › Remise à zéro remet les hops d'un membre, ou de tout le
monde, à zéro, donc au premier rang (une fois par an, après une période
d'essai…).

- Sans cocher, l'historique est gardé et une ligne « Remise à zéro » y est
  ajoutée. On peut aussi effacer l'historique des hops.
- « Remettre aussi les tâches faites à faire » efface l'historique des tâches
  et remet chaque tâche à son échéance d'avant.
- Les séries repartent de zéro. Les quêtes réussies et les défis gagnés
  restent acquis.
