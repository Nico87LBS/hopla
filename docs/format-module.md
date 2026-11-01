# Format des modules Apprendre (`hopla-module/1`)

Un module est un fichier JSON. On l'importe dans Gérer › Modules
d'apprentissage › Catalogue › « Importer un module » (fichier ou texte
collé). Les modules fournis avec Hopla sont dans
[`internal/learn/catalogue/`](../internal/learn/catalogue/) et servent
d'exemples.

Le fichier est contrôlé à l'import ; une erreur est expliquée en français
(« fiche colour-red : chapitre colours inconnu ») et rien n'est installé.

## Un exemple complet

```json
{
  "format": "hopla-module/1",
  "id": "nico-capitales",
  "version": "1.0.0",
  "nom": "Capitales d'Europe",
  "auteur": "Nico",
  "description": "Les capitales des pays d'Europe, dans les deux sens.",
  "matiere": "geographie",
  "niveaux": ["CM1"],
  "public": "enfant",
  "langue": "fr",
  "couleur": "#2B63B5",
  "chapitres": [
    { "id": "ouest", "nom": "Europe de l'Ouest" },
    { "id": "est", "nom": "Europe de l'Est", "ouvert_apres": 80 }
  ],
  "fiches": [
    {
      "id": "france",
      "chapitre": "ouest",
      "type": "choix",
      "question": "Quelle est la capitale de la France ?",
      "reponse": "Paris",
      "pieges": ["Lyon", "Marseille", "Bruxelles"]
    },
    {
      "id": "espagne",
      "chapitre": "ouest",
      "type": "saisie",
      "question": "Capitale de l'Espagne ?",
      "reponse": "Madrid",
      "tolerance": "une_faute"
    }
  ],
  "reglages": {
    "questions_par_partie": 8,
    "seuil": 70,
    "hops_par_etoile": 1,
    "plafond_jour": 6
  }
}
```

## En-tête

| Champ | Obligatoire | Rôle |
| --- | --- | --- |
| `format` | oui | Toujours `"hopla-module/1"` |
| `id` | oui | Identifiant unique : lettres minuscules, chiffres et tirets, 2 à 80 caractères. Ne doit jamais changer : la progression y est attachée. Pour un module partagé hors de la famille, préfixez-le par l'auteur (`nico-capitales`). L'`id` d'un module du catalogue est refusé |
| `version` | oui | `X.Y.Z`. Augmentez-la à chaque modification |
| `nom` | oui | Nom affiché |
| `auteur` | non | Affiché « par … » |
| `description` | non | Une ou deux phrases |
| `matiere` | non | `maths`, `francais`, `anglais`… Donne la couleur par défaut |
| `niveaux` | non | Liste libre : `["GS"]`, `["CE1", "CE2"]`, `["OACI 6"]` |
| `public` | non | `enfant`, `adulte` ou `tous` |
| `langue` | non | Langue des consignes (`fr`, `en`) |
| `langue_apprise` | non | Langue enseignée, pour la voix des fiches Écoute (`en`) |
| `couleur` | non | Couleur du module, en `#RRGGBB` |
| `icone`, `sources` | non | Informations, pas encore affichées |
| `modules` | paquet | Fait du fichier un **paquet** : la liste des `id` de ses modules (40 au plus). Un paquet n'a ni chapitres, ni fiches, ni générateurs. Ses modules sont ceux du catalogue (installés avec lui) ou des modules déjà importés |
| `prerequis` | non | Garde le module fermé tant qu'un chapitre d'un autre module n'est pas su : `[{"module": "maths-ce2-multiplication", "chapitre": "tables-2-5", "pourcent": 80}]` |
| `chapitres` | oui | De 1 à 50 chapitres |
| `fiches` | * | Questions écrites (5 000 au plus) |
| `generateurs` | * | Exercices tirés au hasard (200 au plus) |
| `reglages` | non | Réglages par défaut du module |

\* Un module a au moins une fiche ou un générateur.

## Chapitres

```json
{ "id": "tables-6-7", "nom": "Tables de 6 et 7", "ouvert_apres": 80 }
```

`ouvert_apres` : pourcentage du chapitre précédent à savoir pour ouvrir
celui-ci (0 ou absent : ouvert d'emblée). Les parents peuvent changer ce
seuil par personne.

## Fiches

Champs communs :

| Champ | Rôle |
| --- | --- |
| `id` | Unique dans le module |
| `chapitre` | `id` d'un chapitre du module |
| `type` | `choix`, `saisie`, `ecoute` ou `retourner` |
| `question`, `reponse` | Obligatoires |
| `explication` | Texte montré après la réponse (un exemple, une règle) |
| `sens` | Sens posés, par défaut `["direct"]` (voir chaque type) |
| `cle` | Clé partagée avec d'autres modules (voir plus bas) |

### `choix` : choisir parmi quatre

| Champ | Rôle |
| --- | --- |
| `pieges` | Mauvaises réponses proposées. Absent : tirées parmi les réponses des autres fiches du chapitre |
| `sens` | `direct` (question → réponse) et/ou `inverse` (réponse → question) |

### `saisie` : taper la réponse

| Champ | Rôle |
| --- | --- |
| `autres_reponses` | Autres réponses acceptées (« le chat », « chat ») |
| `tolerance` | `accents` (par défaut : majuscules, accents et espaces ignorés), `une_faute` (une lettre de travers acceptée) ou `exacte` |
| `sens` | `direct` et/ou `inverse` |

### `ecoute` : entendre, puis répondre

La `question` est dite à voix haute par l'appareil, dans `langue_apprise`. La
`reponse` est son sens.

| Sens | L'enfant… |
| --- | --- |
| `direct` | entend le mot et touche son sens, ou son dessin si les fiches ont une `image` |
| `lire` | lit le mot et touche son sens ; le mot est dit une fois répondu |
| `inverse` | voit le sens (ou le dessin) et touche le mot |
| `dictee` | entend le mot et l'écrit (`tolerance` par défaut : `une_faute`) |
| `chiffres` | entend un message et tape ses chiffres (niveaux, codes à collationner) |

`image` : nom d'un dessin du dossier
[`web/public/drawings/`](../web/public/drawings/), sans `.svg` (`cat`,
`colour-red`, `number-3`…). Avec des dessins, trois choix seulement sont
proposés, pour les plus petits qui ne lisent pas.

### `retourner` : carte à retourner

Pour une question ouverte (réciter, expliquer, dire à l'oral). L'enfant
réfléchit, retourne la carte pour voir la `reponse` et dit lui-même :
« Je savais », « Presque » ou « Pas encore ».

## Générateurs

Un générateur fabrique des questions au hasard dans des bornes. Les nombres se
donnent ainsi :

| Forme | Exemple | Sens |
| --- | --- | --- |
| `[min, max]` | `[1, 10]` | Tous les entiers de 1 à 10 |
| `[min, max, pas]` | `[10, 90, 10]` | 10, 20, … 90 |
| `{"valeurs": [...]}` | `{"valeurs": [6, 7]}` | Seulement ces valeurs |

Champs communs : `id`, `chapitre`, `operation`.

| `operation` | Champs | Question |
| --- | --- | --- |
| `addition`, `soustraction` | `a`, `b`, `formes` (`normal`, `trou`), `retenue` (`avec`, `sans`), `resultat_min`, `resultat_max` | `47 + 25`, ou `47 + ? = 72` |
| `multiplication` | `tables` (ou `a`), `b`, `formes`, `resultat_min`, `resultat_max` | `7 × 8`, ou `7 × ? = 56` |
| `division` | `tables` (diviseurs), `b` (quotients), `formes` | `56 ÷ 7`, ou `56 ÷ ? = 8` |
| `double`, `moitie` | `a` | Le double de 35 ; la moitié de 48 |
| `complement` | `a`, `cible` (`dizaine`, `centaine`, `millier` ou un nombre) | De 67 pour aller à 70, il manque… |
| `comparaison` | `a` | `345 … 354` : choisir `<`, `=` ou `>` |
| `position` | `a`, `rangs` (`unites`, `dizaines`, `centaines`, `milliers`), `formes` (`chiffre`, `nombre`) | Le chiffre des dizaines de 4 582 ; combien de dizaines en tout |
| `lettres` | `a`, `formes` (`chiffres`, `mots`) | Écrire en chiffres « mille deux cent trois », ou choisir l'écriture en lettres |
| `modele` | `texte`, `variables`, `calculs`, `si`, `reponse`, `unite` | Un problème à trous (voir plus bas) |

### Problèmes : `modele`

```json
{
  "id": "partage",
  "chapitre": "partager",
  "operation": "modele",
  "texte": "{p} partage {n} bonbons entre {k} amis. Combien chacun en a-t-il ?",
  "variables": {
    "p": { "valeurs": ["Léo", "Inès", "Jade"] },
    "k": [2, 9],
    "q": [2, 10]
  },
  "calculs": { "n": "k*q" },
  "reponse": "q",
  "unite": "bonbons"
}
```

- `variables` : les valeurs tirées, nombres ou mots.
- `calculs` : des valeurs déduites des variables.
- `si` : une condition à respecter, sinon le tirage recommence (`"a>b"`).
- `reponse` : la formule du résultat.
- Les formules connaissent `+ - * /`, les parenthèses, `< > <= >= == !=`,
  `&&` et `||`. Rien d'autre n'est exécuté.

## Réglages

| Champ | Par défaut | Limites |
| --- | --- | --- |
| `questions_par_partie` | 10 | 1 à 40 |
| `nouvelles_par_partie` | 3 | Questions jamais vues par partie, 0 à 40 |
| `seuil` | 70 | % pour la 1re étoile |
| `hops_par_etoile` | 1 | 0 à 20 |
| `plafond_jour` | 10 | Hops par jour et par personne, 0 à 200 |

Les parents peuvent changer ces valeurs pour la famille ou par personne sans
toucher au fichier.

## Clés partagées

Sans `cle`, une fiche est propre à son module (`id-du-module:id-de-fiche`).
Avec une `cle`, ce qu'une personne sait de la fiche est partagé avec toutes
les fiches qui ont la même clé, dans d'autres modules : un mot d'anglais appris
en GS reste su en CE2.

- Forme : `domaine:compétence:sujet`, de 2 à 6 parties en minuscules, chiffres
  et tirets (`en:mot:red`, `en:def:altimeter`).
- Même clé, même réponse attendue. L'import refuse un module dont une clé
  existe ailleurs avec une autre réponse, ou deux fois dans le module.
- Les domaines `add`, `sub`, `mul`, `div`, `cmp`, `pos`, `num`, `pb`, `dbl`,
  `half` et `cpl` sont réservés aux générateurs, qui fabriquent eux-mêmes des
  clés comme `mul:7x8`. Un module ne peut pas non plus prendre l'un de ces mots
  comme `id`.

## Mettre à jour un module

Gardez le même `id` et augmentez `version`, puis réimportez le fichier : il
remplace l'ancien. Les
`id` de fiches et les clés qui ne changent pas gardent ce que chacun a appris.
Une fiche dont l'`id` change repart de zéro.
