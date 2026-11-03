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
| **Apprendre à lire** | Lettres et sons, Syllabes simples, Sons complexes, Mots outils, Lire des mots, Comprendre une phrase, Mots sans dessin (méthode syllabique) | Enfant, GS et CP |
| **Apprendre à lire en cursif** | Lettres cursives (la lettre en cursif, la réponse en imprimerie), puis les six autres modules d'Apprendre à lire écrits en cursif, avec leur propre progression, et Tracer en cursif (lettres et petits mots à repasser au doigt) | Enfant, CP |
| **Langage GS** | Les rimes, Les syllabes, Le son du début, Les lettres (avec « Mon prénom »), Les mots en images, Tracer les lettres (capitales à repasser au doigt) | Enfant, GS |
| **Maths GS** | Compter des quantités, La suite des nombres, Lire les nombres, Comparer, Composer 5 et 10, Formes et positions, Tracer les chiffres | Enfant, GS |
| **Explorer le monde GS** | Le temps qui passe, Les saisons, Les animaux, Mon corps, Les plantes, Objets et matières | Enfant, GS |
| **Français CP** | Les sept modules d'Apprendre à lire (mêmes progrès), puis Écrire des mots (dictée, accents ignorés), La phrase au CP, Un, une, des | Enfant, CP |
| **Maths CP** | Les nombres jusqu'à 100, Comparer et ranger, Additions et soustractions, Calcul mental, Problèmes, Monnaie et heures (horloge à aiguilles à lire, puis à régler), Formes et repérage | Enfant, CP |
| **Questionner le monde CP** | Vivant ou non vivant, Animaux et plantes, Mon corps et ma santé, La matière, Le temps qui passe, L'espace autour de moi | Enfant, CP |
| **Français CE1** | Lire et comprendre, Les sons et leur écriture, La phrase et les mots, Les accords, Conjuguer au CE1, Le vocabulaire, Dictée CE1 (les accents comptent, une lettre de travers acceptée) | Enfant, CE1 |
| **Maths CE1** | Les nombres jusqu'à 1 000, Comparer, ranger, encadrer, Additions et soustractions, Calcul mental, La multiplication (tables de 2, 3, 4, 5 et 10), Problèmes, Mesures et heures (horloge avec demies et quarts, à lire puis à régler, règle graduée), Géométrie | Enfant, CE1 |
| **Questionner le monde CE1** | Le vivant, Mon corps, La matière, Objets et électricité, Le temps, L'espace | Enfant, CE1 |
| **Français CE2** | Conjugaison (présent, futur, imparfait, passé composé, puis le verbe à écrire soi-même), La phrase, Les accords (avec un chapitre à écrire), Les homophones, Le vocabulaire, Comprendre un texte | Enfant, CE2 |
| **Questionner le monde CE2** | Le vivant, Mon corps (squelette à toucher), La matière, L'électricité, Se repérer dans l'espace (régions, fleuves, montagnes et villes de France, continents et océans), Se repérer dans le temps | Enfant, CE2 |
| **Maths CE2** | Nombres jusqu'à 10 000, Calcul mental, Addition et soustraction, Multiplication, Division, Mesures, Problèmes, Géométrie | Enfant, CE2 |
| **Anglais à l'école** | Anglais GS : mes premiers mots (à l'oreille, avec dessins, sans lire) ; Anglais CP (se présenter, émotions, école, maison, à table, sans lire) ; Anglais CE1 (jours, nombres jusqu'à 20, corps, vêtements, météo, petites phrases) ; Anglais CE2 | Enfant, GS, CP, CE1 et CE2 |
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
| Zones | touche une région, un fleuve, une ville, un continent, un os ou une partie du corps ou de la plante, ou nomme celui qui est en couleur |
| Texte à trous | glisse (ou touche) le bon mot dans le trou de la phrase, puis « Valider » ; toutes les questions à choix qui ont un trou `___` (homophones, accords, conjugaison) se jouent ainsi |
| Régler l'horloge | fait tourner les aiguilles au doigt jusqu'à l'heure demandée, puis « Valider » |
| Tracer | repasse au doigt sur une lettre, un chiffre ou un petit mot dessiné en pâle, puis « J'ai fini » ; l'appareil juge si le modèle est couvert sans trop déborder (pas l'ordre des traits) |

### Lire à voix haute

Dans les modules faits pour être lus à voix haute, l'appareil dit la question
à son ouverture, et chaque réponse au premier toucher ; un second toucher la
choisit. Le haut-parleur de la question la redit. Gérer › Modules
d'apprentissage › Par personne règle, pour chaque personne, ce que dit
l'appareil (« Lire à voix haute ») :

| Choix | L'appareil dit… |
| --- | --- |
| Tout (par défaut) | la question, puis chaque réponse touchée |
| La consigne seulement | la consigne de la question (« Choisis le verbe aller au futur »), puis la phrase complète une fois répondu ; un toucher choisit tout de suite |
| Rien | rien |

Dans les modules d'Apprendre à lire, l'appareil ne dit jamais plus que la
consigne (« Lis le mot, puis touche son dessin ») : ni les mots à lire ni les
réponses, qu'il dit une fois que l'enfant a répondu.

### La voix

Les questions sont dites par la voix choisie dans Gérer › Modules
d'apprentissage › Voix, langue par langue et appareil par appareil : une
voix de l'appareil, ou une voix naturelle fabriquée par le serveur quand un
serveur Piper est réglé (voir [Installation](installation.md#voix-naturelle-des-jeux)).
En automatique, la voix du serveur passe en premier. Hors ligne, ou si le
serveur ne répond pas, l'appareil reprend sa propre voix.

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

## La récré

Toutes les X parties réussies (au moins 2 étoiles), l'enfant a droit à une
partie d'un petit jeu. Une carte verte « Récré ! » apparaît en haut de ses
modules et à la fin de la partie qui l'ouvre. Avant, la même carte compte les
parties qui restent. La récré ne rapporte aucun hop.

Cinq jeux, faits pour le doigt comme pour la souris :

- **Le train des lapereaux** : le lapin mange les carottes et une file de
  lapereaux grandit derrière lui ; il ne faut toucher ni la haie ni la file.
  Il part au premier glissement de doigt ou à la première flèche.
- **Bulles de couleur** : viser et tirer une bulle ; 3 bulles de la même
  couleur qui se touchent éclatent, avec celles qu'elles retenaient. Une
  rangée descend tous les 7 tirs ; une bulle sous la ligne finit la partie.
- **Le panier à carottes** : attraper les carottes qui tombent (la dorée vaut
  5) et éviter les cailloux ; trois cœurs.
- **Coucou les lapins** : toucher les lapins qui sortent des terriers avant
  qu'ils se cachent ; la partie finit au cinquième lapin manqué.
- **La séquence des couleurs** : retenir l'ordre des couleurs montré, puis le
  rejouer ; il s'allonge à chaque tour.

Une partie commencée compte, même arrêtée en route ou quittée. Chaque jeu
garde les records de la famille, que la page de la récré affiche sous chaque
jeu, même quand la récré n'est pas encore là.

Les parties qui comptent sont celles jouées depuis la dernière récré, ou
depuis le début de la journée avant la première.

Dans Gérer › Modules d'apprentissage › Par personne, la carte « Récré » règle
pour chacun :

- la récré elle-même (coupée ou non) ;
- toutes les combien de parties (1 à 10, 3 par défaut) ;
- un minuteur (sans, 1, 2, 3 ou 5 minutes) qui arrête la partie et garde le
  score atteint ;
- les jeux permis (au moins un).

## Jouer sur une tablette partagée

Un lien de jeu ouvre les jeux d'une personne sans se connecter. Il est
demandé par l'intégration de la maison (API externe `play-links`), sert une
seule fois dans la minute, et ouvre une session « jeux seulement » de deux
heures : impossible d'en sortir vers les tâches ou les réglages.
