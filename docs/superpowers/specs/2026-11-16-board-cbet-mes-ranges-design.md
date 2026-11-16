# Board & C-bet + Mes ranges — design

Validé par l'utilisateur le 2026-11-16. Aucun tableau ni chiffre de solveur n'est recopié d'un livre : tout est calculé par le site ou saisi par l'utilisateur.

## 1. Bloc « Board & C-bet »

Entrées : flop (3 cartes du sélecteur), relanceur préflop (PFR), payeur, type de pot (simple / 3-betté).

1. **Texture** (`boardTexture.ts`) : hauteur (A-high, K/Q-high, médian, bas), pairé/brelan, couleurs (arc-en-ciel, bicolore, monocolore), connexion (nombre de suites possibles), verdict statique/dynamique. Corrige le bug de `classifyTexture` (bicolore jamais compté comme tirage couleur).
2. **Avantages** (`rangeVsRange.ts`) :
   - équité du PFR contre le payeur : simulation Monte-Carlo à graine fixe (turn + river tirées, cartes bloquées retirées) ;
   - part de « mains fortes » de chaque range sur le flop, calculée exactement : brelan ou mieux, ou deux paires si le board n'est pas pairé.
3. **Conseil** (`cbetAdvisor.ts`), règles de principe :
   - fréquence = 50 + 2,2 × avantage d'équité, +10 en position, −8 hors position, +8 board statique / −8 dynamique, +5 en pot 3-betté ; bornée entre 20 et 90, arrondie à 5 ;
   - taille : avantage de nuts ≥ 4 pts et board dynamique → 66-75 % ; avantage d'équité ≥ 0 et board statique → 25-33 % ; avantage de nuts ≥ 4 → 50-66 % ; sinon 33-50 %. En pot 3-betté, un cran plus petit ;
   - fréquence ≤ 35 % → « check majoritaire » ;
   - donk bet proposé seulement si le payeur joue avant, a l'avantage de nuts (≤ −2 pts) et que le board est médian ou bas.
4. **UI** (`BoardCbetPanel.tsx`) : étiquettes de texture, barres d'équité et de nuts, conseil pour la position réelle du PFR (IP ou OOP), donk, « Comprendre ce calcul », badge « estimée » ou « Ma range » sur chaque range.
5. Le coach (`coachEngine.ts`) utilise le nouveau conseil (PFR = position du héros, payeur = BB, ou BTN si le héros est BB).

## 2. Ranges par situation (`matchupRanges.ts`)

Situations : `open:POS`, `call:POS:vs:OPENER`, `3bet:POS:vs:OPENER`, `call3bet:OPENER:vs:3BETTOR`.

- Priorité : range de l'utilisateur > range de base du site > range estimée (marquée).
- Base : opens du catalogue ; défense BB (call) ; call/3-bet tirés des 3 ranges « face à open » existantes.
- Estimée : l'ouvreur qui paie un 3-bet garde le haut de sa range d'ouverture (hors AA/KK, 4-bet), selon un score de force préflop.

## 3. Éditeur « Mes ranges » (`myRanges.ts`, `MyRangesDialog.tsx`)

- Choix de la situation, grille 13×13 (clic : 100 % → 50 % → 0 %), collage de texte (`22+`, `A2s+`, `KTo+`, `AK`, `77-55`, `AKo:50`), compteur de combos et de %.
- Stockage `localStorage` (`ace:myRanges:v1`), jamais dans le code. Export/Import JSON, « Revenir à la range de base ».
- Utilisé par le bloc c-bet et par l'onglet Open du Range Explorer (badge « Ma range »).

## Tests (vitest)

Textures de flops connus ; évaluateur 7 cartes ; board haut → avantage au PFR ; board bas connecté vs BB → c-bet réduit ; parseur de texte ; comptage des combos ; priorité de la range utilisateur.
