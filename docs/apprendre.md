# Apprendre

Apprendre, ce sont des jeux éducatifs intégrés à Hopla, sans publicité ni
compte extérieur. Chaque partie rapporte des étoiles et des hops, dans les
limites que les parents fixent. Les jeux marchent hors ligne : une partie
jouée sans réseau est envoyée au retour de la connexion.

## Paquets, modules, chapitres, fiches

| Niveau | Exemple | Rôle |
| --- | --- | --- |
| **Paquet** | Maths CE2 | Regroupe des modules ; l'installer installe tous ses modules |
| **Module** | Multiplication CE2 | Une notion. C'est lui qu'on active pour une personne et qu'on joue |
| **Chapitre** | Tables de 6 et 7 | Une étape du module. Il peut rester fermé tant que le chapitre d'avant n'est pas assez su |
| **Fiche** ou **générateur** | « 7 × 8 », ou « tables de 6 et 7, dans les deux formes » | Une question écrite, ou une sorte d'exercice tiré au hasard |

Une notion n'est écrite qu'une fois : si deux paquets contiennent le même
module, ce que l'enfant sait est commun. Des fiches de modules différents
peuvent aussi partager ce qui est appris grâce à leur clé (voir
[le format des modules](format-module.md#clés-partagées)).

## Le catalogue fourni

| Paquet | Modules | Public |
| --- | --- | --- |
| **Langage GS** | Les rimes, Les syllabes, Le son du début, Les lettres (avec « Mon prénom »), Les mots en images | Enfant, GS |
| **Maths GS** | Compter des quantités, La suite des nombres, Lire les nombres, Comparer, Composer 5 et 10, Formes et positions | Enfant, GS |
| **Explorer le monde GS** | Le temps qui passe, Les saisons, Les animaux, Mon corps, Les plantes, Objets et matières | Enfant, GS |
| **Maths CE2** | Nombres jusqu'à 10 000, Calcul mental, Addition et soustraction, Multiplication, Division, Mesures, Problèmes, Géométrie | Enfant, CE2 |
| **Anglais à l'école** | Anglais GS : mes premiers mots (à l'oreille, avec dessins, sans lire) ; Anglais CE2 | Enfant, GS et CE2 |
| **Anglais aéronautique** | Bases radio, Phraséo et au-delà, Systèmes de l'avion, Météo, Aérodrome, Situations anormales, Anglais idiomatique, Compréhension orale, Oral | Adulte, niveau 6 OACI |

## Installer et choisir qui joue

Gérer › Modules d'apprentissage, en deux onglets :

- **Catalogue** : les paquets fournis, à installer, avec le détail de chacun
  (modules, chapitres, exemples de fiches). On y importe aussi un module écrit
  à la main (fichier ou texte collé, format `hopla-module/1`).
- **Par personne** : on choisit une personne en haut, puis on coche les
  modules auxquels elle joue. La case à droite du nom d'un paquet coche tous
  ses modules.

Retirer un paquet retire aussi ses modules, sauf ceux qu'un autre paquet
installé contient. Par défaut, ce que chacun a appris est gardé et revient si
on le réinstalle ; la case « Effacer aussi ce que chacun a appris et les
stats » efface tout pour de bon.

### Mises à jour du catalogue

Les paquets fournis se mettent à jour avec Hopla. Quand une mise à jour ajoute
un module à un paquet installé, il est installé tout seul, activé pour
personne, avec un badge « Nouveau » : il reste à le cocher pour ceux qui
doivent y jouer.

## Les réglages

| Réglage | Par défaut | Rôle |
| --- | --- | --- |
| Questions par partie | 10 | Longueur d'une partie |
| 1re étoile à (%) | 70 | Seuil de réussite pour la première étoile |
| Hops par étoile | 1 | Ce que rapporte chaque étoile |
| Hops par jour | 10 | Plafond du module, par personne et par jour |
| Ouverture (%) | celle du module, souvent 80 | Ce qu'il faut savoir d'un chapitre pour ouvrir le suivant |
| Plafond total | aucun | Hops par jour pour tous les jeux ensemble, par personne |

Un réglage peut être donné à quatre endroits ; le plus précis l'emporte :

1. le **module de la personne** (Par personne › réglages du module) ;
2. le **paquet de la personne** (Par personne › réglages du paquet) ;
3. la **famille** (Catalogue › réglages de la famille du paquet ou du module),
   pour tout le monde ;
4. le **module** lui-même, tel qu'il est écrit.

Un champ laissé vide garde la valeur du niveau d'en dessous, affichée en gris.
Les pastilles de couleur disent d'où vient chaque valeur : gris pour le
module, violet clair pour la famille, violet plein pour la personne.

## Une partie

Une partie mélange des questions nouvelles et des révisions. Les types de
questions :

| Type | L'enfant… |
| --- | --- |
| Calcul et problèmes | tape le résultat |
| Choix | touche la bonne réponse parmi quatre (ou trois dessins pour les plus petits) |
| Réponse à taper | écrit la réponse ; les accents ou une petite faute peuvent être tolérés |
| Écoute | entend un mot (voix de l'appareil) et choisit son sens ou son dessin, ou l'écrit (dictée) |
| Carte à retourner | réfléchit, retourne la carte et dit s'il savait : « Je savais », « Presque », « Pas encore » |
| Compter | compte une collection dessinée ou les points d'un dé, et touche le nombre (ou le tape au-delà de 10) |
| Relier | touche une étiquette à gauche puis sa paire à droite, jusqu'à toutes les relier |
| Remettre dans l'ordre | touche les étiquettes dans l'ordre pour les placer, puis « Valider » |
| Classer | met chaque étiquette dans la bonne boîte |
| Zones | touche une région, une partie du corps ou de la plante, ou nomme celle qui est en couleur |

### Lire à voix haute

Dans les modules faits pour ceux qui ne lisent pas encore, l'appareil dit la
question à son ouverture, et chaque réponse au premier toucher ; un second
toucher la choisit. Le haut-parleur de la question la redit. C'est activé
pour tout le monde ; Gérer › Modules d'apprentissage › Par personne permet de
l'éteindre pour une personne (« Lire à voix haute »).

### Prénom

Certains modules posent des questions sur le prénom de l'enfant (« Mon
prénom » dans Langage GS : sa première lettre, le retrouver parmi d'autres,
remettre ses lettres dans l'ordre, compter ses lettres). Par défaut, c'est le
premier mot de son nom dans Hopla ; Gérer › Modules d'apprentissage › Par
personne › « Prénom dans les jeux » permet d'en écrire un autre (20 lettres au
plus), par exemple sans surnom ni nom de famille.

Une question ratée est remontrée avec sa réponse, et revient en fin de partie
dans « À revoir ».

### Étoiles et hops

| Résultat | Étoiles |
| --- | --- |
| Au moins le seuil (70 % par défaut) | ★ |
| Au moins 90 % | ★★ |
| Sans faute | ★★★ |

Les hops gagnés valent étoiles × hops par étoile, dans la limite du plafond du
module et du plafond total du jour. Une partie de moins de 5 réponses ne
rapporte rien. Plafond atteint, l'enfant peut continuer à jouer pour
s'entraîner.

Les parties et les étoiles comptent pour les quêtes et défis qui ont un
objectif « Jouer à Apprendre » ou « Gagner des étoiles ».

### Répétition espacée

Chaque question vit dans une boîte, de 1 à 5. Une bonne réponse la fait
monter, une erreur la fait redescendre. Elle revient après 1, 2, 4, 8 puis 16
jours selon sa boîte. Une question en boîte 4 ou 5 est **sue** : c'est ce
pourcentage qui ouvre les chapitres suivants.

## Suivre les progrès

Les statistiques d'une personne (Gérer › Modules d'apprentissage › Par
personne) montrent, pour chaque module : chapitres et leur avancée, parties
sur 90 jours et cette semaine, réussite, étoiles moyennes, hops gagnés, temps
de jeu, questions sues, questions à réviser aujourd'hui, ce qui coince (avec
la réponse donnée) et les dernières parties.

## Signaler et corriger une question

En jeu, le drapeau permet de signaler une question : pas claire, réponse
fausse, faute d'orthographe, ou autre, avec un commentaire. Les signalements
s'affichent dans le détail du module, où un parent les marque comme traités.

Dans le détail d'un module du catalogue, le crayon d'une fiche permet de la
corriger pour la famille : question, réponse, exemple montré après la réponse,
mauvaises réponses proposées, autres réponses acceptées, et « poser aussi dans
l'autre sens ». La correction se pose par-dessus le catalogue (« Modifiée par
la famille ») et survit aux mises à jour ; « Revenir à l'original » l'annule.
Ce que les enfants savaient déjà de la fiche est gardé.

## Jouer sur une tablette partagée

Un lien de jeu ouvre les jeux d'une personne sans se connecter. Il est
demandé par l'intégration de la maison (API externe `play-links`), sert une
seule fois dans la minute, et ouvre une session « jeux seulement » de deux
heures : impossible d'en sortir vers les tâches ou les réglages.
