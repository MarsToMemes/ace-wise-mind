# Décisions de conception — moteur cash multiway 100 bb

Chaque choix tranché est noté ici : la décision, sa raison, les alternatives écartées et les tests qui la vérifient.
Une décision « provisoire » attend une confirmation ; une décision « ouverte » n'est pas encore prise.

Format : **D-numéro — titre** · statut · date.

---

## D1 — Un seul moteur de règles pour la main · adoptée · 2026-11-23

**Décision.** `src/core/handState.ts` (rejouer la main, actions légales, pots) et `src/core/settle.ts` (régler la main)
sont la seule source de vérité sur l'état d'une main : sièges, tapis, contributions par street, pots, qui doit parler,
actions légales, règlement. Les panneaux du site (décision, détails du calcul, tapis suivis) devront tous le lire.

**Raison.** Le site tient aujourd'hui plusieurs états parallèles (folds saisis contre bouton « Couché », pot calculé
contre champs « pot » et « à payer », trois modèles de ranges), source de conseils contradictoires. `handState.ts`
existait déjà (lot 1, 25 tests, 15 mains d'exemple) et reproduisait exactement la fixture du cahier des charges.

**Alternatives écartées.** Réécrire un moteur neuf (perte des tests existants, risque de régression) ; étendre
`lib/potTracker.ts` (ne connaît ni les tapis, ni les all-in, ni les pots annexes).

**Conséquence.** `lib/potTracker.ts` et le règlement de `lib/tableStacks.ts` seront remplacés par le moteur, panneau
par panneau, avec un aperçu à chaque fois.

---

## D2 — Réouverture des enchères après un all-in court (règle A) · adoptée · 2026-11-23

**Décision.** La réouverture est suivie **par joueur** :
- un joueur qui n'a pas encore parlé sur le tour d'enchères peut toujours relancer ;
- un joueur qui a déjà parlé ne peut relancer que si la mise a augmenté, **depuis sa dernière action**, d'au moins une
  relance complète (la taille de relance complète en vigueur quand il a parlé) ;
- les all-in courts successifs **s'additionnent** pour atteindre ce seuil ;
- sinon il ne peut que payer ou se coucher. Une relance saisie dans ce cas est l'erreur `RAISE_NOT_REOPENED`.

**Raison.** C'est la règle du no-limit appliquée par les salles et les sites (règles TDA) ; elle empêche un joueur de
profiter d'un all-in court pour relancer à nouveau une action qu'il a déjà close.

**Alternatives écartées.** Réouverture globale dès qu'un all-in dépasse la mise (comportement d'avant, faux) ; ne
jamais additionner les all-in courts (plus simple, mais rarement la règle appliquée).

**Tests.** `src/test/reopening.test.ts` (7 cas, dont +3 puis +7 qui rouvre et +3 puis +5 qui ne rouvre pas).

---

## D3 — Relance minimale après un all-in court · adoptée · 2026-11-23

**Décision.** La relance minimale reste calculée sur la **dernière relance complète** : un all-in court ne change pas
la taille de relance de référence. Relance minimale « à » = mise en cours + dernière relance complète.

**Raison.** Règle standard du no-limit ; cohérente avec D2.

**Tests.** `reopening.test.ts` (BTN relance à 10, SB à tapis à 13 : la BB peut relancer à 22 au moins).

---

## D4 — Pots principaux, annexes et mise rendue · adoptée · 2026-11-23

**Décision.** Le moteur découpe le pot **à tout moment** de la main (`HandState.pots`) par niveaux de mise :
- chaque pot : montant, joueurs éligibles, nature (`main`, `side`, `refund`) ;
- l'argent des joueurs couchés (« argent mort ») reste dans les pots auxquels il a contribué ;
- éligibles : les joueurs non couchés qui ont couvert ce niveau ; tant que les enchères sont ouvertes, un joueur qui
  peut encore parler est éligible à tout (il peut encore payer) ; un joueur à tapis seulement à ce qu'il a couvert ;
- **mise rendue** (`refund`) : la partie d'une mise que personne n'a payée ; elle revient à son auteur ;
- deux niveaux consécutifs aux mêmes éligibles sont fusionnés en un seul pot.

**Raison.** Le cahier des charges exige les pots annexes et la mise rendue ; la version précédente ne calculait les pots
annexes qu'en fin de main et marquait la situation « non prise en charge ».

**Tests.** `src/test/pots.test.ts` (30/80/150 → 90 + 100 contestés, 70 rendus ; fold général → 2,5 gagnés, 1,5 rendus ;
all-in court qui paie → 27 + 7 rendus ; pot unique en cours de main ; tapis au préflop puis mises au flop), invariant
« la somme des pots fait le pot » dans `checkInvariants`.

---

## D5 — Rake (règle B) · provisoire · 2026-11-23

**Décision.**
- Paramètres par défaut : **5 % plafonné à 3 bb, pas de rake si le flop n'est pas vu** (`CASH_RAKE`, `src/core/rake.ts`).
  C'est la convention affichée par le conseiller actuel du site et utilisée pour calculer la table préflop cash 100 bb ;
  **ce n'est pas le rake vérifié des tables Betclic** : à confirmer, et il reste réglable (`RakeRule`).
- Avec plusieurs pots : le rake est calculé sur le **total des pots contestés**, avec le plafond appliqué **une seule
  fois**, puis réparti **au prorata** de chaque pot.
- La **mise rendue n'est jamais rakée**.
- Option `noFlopNoDrop: false` : rake même sans flop.

**Alternatives écartées.** Tout le rake pris dans le pot principal (pénalise les petits tapis ; pratique non documentée
de façon uniforme par les salles) ; plafond appliqué pot par pot (dépasserait le plafond annoncé).

**À confirmer.** Le pourcentage et le plafond réels de Betclic à la limite jouée.

**Tests.** `src/test/settle.test.ts` (3 bb sur 190 : 1,42 et 1,58 ; 0 sur les 70 rendus ; pas de rake sans flop).

---

## D6 — Partage d'un pot à égalité · adoptée · 2026-11-23

**Décision.** Un pot partagé est divisé **exactement** entre les gagnants (montants en bb, décimales gardées).

**Raison.** Le site compte en blindes, pas en jetons : il n'y a pas de « jeton impair » à attribuer.

**Limite connue.** Dans une vraie salle, le jeton impair va au premier joueur à gauche du bouton ; l'écart est d'au plus
un jeton et n'a pas d'effet sur les conseils.

---

## D7 — Gagnant inconnu à l'abattage · adoptée · 2026-11-23

**Décision.** `settleHand` attribue un pot quand son gagnant est connu : un seul éligible, ou les mains de tous les
éligibles connues (force fournie). Sinon le pot reste **« à attribuer »** (`unresolved`) ; le site demandera le gagnant
pot par pot. Des gagnants peuvent être imposés pour chaque pot (choix du joueur), prioritaires sur les forces de main.

**Raison.** Le site ne voit pas toujours les cartes adverses ; mieux vaut demander que deviner.

**Tests.** `settle.test.ts` (pots à attribuer quand une main manque ; gagnants imposés).

---

## D8 — Conservation des jetons, vérifiée en continu · adoptée · 2026-11-23

**Décision.** Toute modification du moteur doit garder vrai, sur un échantillon reproductible de mains aléatoires
(2 à 6 joueurs, tapis différents, actions légales tirées par le moteur) : aucune erreur, invariants respectés, gains +
rake = pot, tapis après + rake = tapis avant, aucun tapis négatif, rake au plus 3 bb.

**Tests.** `src/test/settleFuzz.test.ts` (500 mains ; couverture constatée : 206 mains à pots annexes, 364 avec mise
rendue, 360 abattages).

---

## D9 — Distribution des mains adverses (phase 2) · proposée · 2026-11-23

**Proposition.** Si chaque joueur agit selon ses seules cartes et l'historique public, la distribution jointe exacte
des mains encore dans le coup est :

> P(mains de tous | historique, board) ∝ Π_joueurs P(ligne jouée | sa main) × 1[aucune carte partagée entre eux ni avec le board]

Les corrélations entre adversaires ne viennent alors que des **bloqueurs**. Le moteur représentera cette distribution
exactement (pas de tirage séquentiel biaisé).

**Alternative écartée.** Tirer une main par adversaire, l'un après l'autre, en rejetant les cartes déjà prises
(`handEquityMulti` actuel) : approximation non pondérée de la distribution jointe.

**À confirmer.** Toute autre forme de corrélation (adversaires qui s'adaptent l'un à l'autre) est une hypothèse de
modèle différente, à écrire explicitement avant d'être utilisée.

---

## D10 — Usage : étude après coup ou réponse instantanée · ouverte

Deux architectures possibles (voir le rapport de phase 0) ; le code reste structuré pour ne fermer aucune des deux :
moteur de règles commun, format de solution versionné (hypothèses, abstraction, métriques et leur nature), et deux
fournisseurs interchangeables (calcul à la demande ou lecture de solutions précalculées). **À trancher par l'utilisateur.**

---

## D11 — Métriques de qualité : deux familles jamais mélangées · adoptée · 2026-11-23

**Décision.** Les rapports séparent toujours :
1. les **mesures exactes dans un jeu réduit fini** (meilleures réponses exactes, NashConv = somme des gains de déviation
   de chaque joueur) : preuves valables **uniquement** pour ce jeu réduit ;
2. les **bornes et comparaisons** : meilleures réponses approchées (borne inférieure de l'exploitabilité) et winrates
   version contre version (progrès relatif, pas une preuve de proximité d'un équilibre).

Chaque solution est versionnée avec ses hypothèses (ranges, tailles, rake, profondeur d'arbre) et la nature de chaque
métrique. Au-delà de deux joueurs, aucune garantie de convergence n'est supposée : toute affirmation de force est
adossée à une mesure.

---

## D12 — Algorithme du solveur multiway : CFR+ à mises à jour alternées · adoptée · 2026-11-23

**Décision.** `src/engines/multiway/cfr.ts` : CFR+ (regrets positifs gardés, moyenne pondérée par l'itération), un
parcours par joueur à chaque itération. **La stratégie reste fixe pendant tout le parcours** : les regrets d'un
ensemble d'information visité plusieurs fois (plusieurs distributions de cartes) sont cumulés puis appliqués à la fin.

**Raison.** Méthode standard, simple, vérifiable. La première version mettait les regrets à jour à la première visite :
sur le Kuhn à 2 joueurs, la NashConv stagnait à 0,0022 après 20 000 itérations ; corrigée, 0,000013.

**Limite assumée.** Au-delà de 2 joueurs, CFR n'est **pas garanti** de converger vers un équilibre : la qualité se
mesure (D11, D13), elle ne se suppose pas.

**Alternatives écartées pour l'instant.** CFR échantillonné (Monte-Carlo) : utile pour les gros arbres (étapes 4 à 6),
inutile et moins précis sur les petits jeux de validation.

## D13 — Meilleure réponse exacte et NashConv · adoptée · 2026-11-23

**Décision.** `src/engines/multiway/bestResponse.ts` : pour chaque joueur, les autres fixés, la meilleure réponse est
choisie par **ensemble d'information** (le joueur ne voit pas les cartes adverses), en pesant chaque nœud par la
probabilité d'y arriver due au hasard et aux autres joueurs ; NashConv = somme sur les joueurs du gain de la meilleure
réponse moins la valeur actuelle. Mesure exacte dans le jeu fini décrit, rien de plus (D11).

**Tests.** Petit jeu à information cachée fait à la main (valeurs 0,4 et 0,2 calculées à la main), NashConv nulle à
l'équilibre connu.

## D14 — Seuils de validation de l'étape 1 · proposés · 2026-11-23

| Jeu | Critère dur | Constaté |
|---|---|---|
| Kuhn à 2 joueurs | valeur du joueur 1 à ±0,001 de −1/18 ; NashConv < 0,001 jeton par main | −0,05556 ; 0,000013 (20 000 itérations) |
| Kuhn à 3 joueurs | NashConv < 0,001 jeton par main | 0,0000018 (5 000 itérations) ; 0,00000036 (20 000). Comparaisons : J1 ne mise jamais en premier ; J2 = −1,000/48 ; J1 et J3 expliqués par un même β = 0,14 |
| River à 3 miniature (60 distributions) | NashConv < 0,1 % du pot (0,03 bb), en baisse avec les itérations | tapis égaux, rake cash : 0,00005 bb (5 000 itérations) ✓ ; tapis court 15, sans rake : 0,00001 ✓ ; **tapis court 15 + rake : ne converge pas** (voir D15) ✗ |

Les propriétés publiées de l'équilibre (Kuhn à 2 : mise du valet à α ≤ 1/3, du roi à 3α, check de la dame ; Kuhn à
3 : joueur 1 qui checke, valeur −1/48 du joueur 2) sont des **comparaisons**, pas des critères durs : un équilibre
trouvé peut être hors de la famille publiée.

## D15 — Non-convergence constatée : tapis court + rake, à 3 joueurs · constat · 2026-11-23

**Constat.** River à 3 miniature avec tapis 15 / 100 / 100 et rake cash : la NashConv exacte oscille au lieu de
baisser (CFR+ : 0,006 à 1 000 itérations, 0,036 à 5 000, 0,017 à 20 000 ; CFR classique : entre 0,02 et 0,05). Le
même jeu **sans rake** converge (0,00000 à 20 000), et **tapis égaux avec rake** aussi (0,00005).

**Lecture.** Le rake dépend du déroulé de la main : le jeu n'est plus à somme constante. À 3 joueurs, CFR n'a alors
aucune garantie et peut tourner en rond ; c'est ce qu'on observe. Ce n'est pas un défaut du code (même jeu sans rake :
convergence parfaite).

**Conséquence.** Dans cette configuration, aucune stratégie n'est présentée comme un équilibre ; on ne publie que la
mesure (NashConv, ici 0,02 à 0,16 % du pot). Pistes à évaluer plus tard, chacune mesurée : autres variantes (CFR
escompté, moyennes différentes), plus d'itérations avec arrêt sur la meilleure NashConv, ou un rake traité à part.

**Autre limite notée.** Une situation que la stratégie n'atteint jamais (ex. J2 après une mise de J0 payée par J1,
alors que J1 ne paie jamais) garde une stratégie peu entraînée : sans effet sur la NashConv, mais à ne pas lire comme un
conseil.

## D16 — River à 3 « par vecteurs de mains » · retenu · 2026-11-23

**Choix.** Étape 2 : un seul arbre d'enchères public ; à chaque nœud, une stratégie par main du joueur qui parle ; aux
fins de main, valeur exacte sur la distribution jointe (D9 : produit des poids, aucune carte partagée), en bouclant
sur les paires de mains adverses compatibles. CFR+ alterné comme en D12. Règles d'enchères : plusieurs tailles de
mise (fraction du pot), relance au pot, tapis, nombre maximal de mises et relances par street, réouverture suivie par
joueur (règle A), pots annexes, mise rendue et rake au prorata via le moteur de règles (D4-D5).

**Pourquoi.** L'arbre explicite de l'étape 1 crée un nœud par distribution de mains : il grossit trop vite dès que les
ranges dépassent quelques mains. Ici, l'arbre ne dépend que des enchères ; les mains sont des vecteurs.

**Preuve d'équivalence.** Sur la river miniature, le nouveau solveur donne les mêmes ensembles d'information, les mêmes
valeurs (à 10⁻⁸ près) avec une stratégie uniforme, et sa stratégie, rejouée dans l'arbre explicite de l'étape 1, y
donne la même valeur et la même NashConv (src/test/multiway2a.test.ts). Sur un arbre riche (3 tailles, relance, tapis,
tapis 40/100/100, rake), on vérifie sur toutes les fins de main et toutes les distributions que les gains ne créent
pas de jetons et que le rake ne dépasse pas le plafond.

**Écartés.** Échantillonnage (Monte-Carlo CFR) : plus rapide par itération, mais mesure bruitée ; on garde l'exact tant
que le temps le permet. Calcul accéléré des fins de main par tri des forces (comme à 2 joueurs) : à faire plus tard
si la mesure montre que c'est le goulot, avec le même test d'équivalence.

## D17 — Calcul rapide des fins de main à 3 joueurs · retenu · 2026-11-23

**Choix.** Pour une main x du joueur i, toute fin de main s'écrit comme une combinaison de sommes F(x ; Sa, Sb) sur les
mains des deux adversaires, chacune prise parmi « toutes », « plus faibles que x » ou « pas plus fortes que x » (la part
de pot en cas d'égalité à trois vaut ⅓·LL + ⅙·(EL + LE) + ⅓·EE). Chaque F se calcule en O(52) par main grâce à
l'inclusion-exclusion sur les cartes partagées, en parcourant les mains par force croissante. Le solveur choisit seul :
calcul exact « toutes les combinaisons » quand les ranges sont minuscules (moins de 150 paires d'adversaires), calcul
rapide sinon.

**Preuve.** Sur 3 boards (pairé, full au board, quinte et couleur possibles), plus de 300 fins de main par board et des
probabilités tirées au hasard, le calcul rapide égale le calcul exact à 10⁻⁷ près (src/test/multiway2b.test.ts). Avec
CFR, les deux atteignent la même précision (les stratégies peuvent différer : avec des regrets à égalité à zéro, un
écart de 10⁻¹³ suffit à changer la stratégie du moment).

**Mesuré (arbre riche + rake, pot 30 bb, 1 000 itérations).** 40 mains : 37 s (131 s avant) ; 100 mains : 81 s ;
200 mains : 150 s ; 400 mains : 317 s, NashConv 0,027 bb (sous le seuil de 0,03 bb).

**Écartés.** Échantillonnage Monte-Carlo (mesure bruitée) ; un calcul « par tri » sans inclusion-exclusion (faux dès
que des cartes sont partagées).

## D18 — Discounted CFR pour le solveur multiway · retenu (validé par l'utilisateur) · 2026-11-23

**Quoi.** Option `algo: "dcfr"` de VRiver3 : Discounted CFR (thèse de N. Brown, §3.1) avec α = 1,5, β = 0, γ = 2,
exactement comme le solveur tête-à-tête (src/engines/endgame/cfr.ts). Testé dans src/test/multiway2c.test.ts.

**Mesuré (NashConv en bb, pot 30 bb, seuil 0,03 bb).**

| Situation | Itérations | CFR+ | DCFR |
|---|---|---|---|
| Micro, tapis égaux, rake | 200 | 0,0054 | 0,0023 |
| Micro, tapis 15/100/100 + rake (cas D15) | 2 000 / 5 000 / 20 000 | 0,0153 / 0,0185 / 0,0100 | 0,00007 / 0,00045 / 0,00034 |
| Arbre riche, tapis égaux | 500 | 0,035 | 0,011 |
| Arbre riche, 40/100/100 + rake | 500 / 2 000 | 0,036 / 0,0027 | 0,0081 / 0,0086 |
| 100 mains, arbre riche + rake | 500 / 1 000 | 0,059 / 0,020 | 0,026 / 0,0084 |

**Lecture.** DCFR atteint le seuil environ deux fois plus tôt sur tous les cas, et rend le cas D15 (tapis court +
rake) 30 à 50 fois plus précis, sans le faire converger proprement pour autant : la NashConv remonte un peu après
2 000 itérations (0,00007 → 0,00045). Sur de longs calculs, DCFR n'est pas toujours meilleur (cas 40/100/100 à 2 000
itérations). Conforme à la thèse : DCFR est le plus utile entre 100 et 1 000 itérations, la zone qu'on utilise.

**Décision.** DCFR est le calcul par défaut ; CFR+ reste disponible (`algo: "cfr+"`). La méthode `solve(n, every)`
mesure la NashConv exacte toutes les `every` itérations et garde la stratégie la meilleure (la thèse le fait quand la
convergence est bruitée) : on ne publie jamais moins bien que le meilleur point atteint. Coût des contrôles : environ
2 % du temps de calcul. Mesuré : tapis 15/100/100 + rake, 0,00034 bb en fin de calcul mais 0,00007 bb gardé (atteint
à 2 000 itérations) ; arbre riche 40/100/100 + rake, 0,0086 en fin, 0,0046 gardé ; 100 mains, la dernière est la
meilleure (0,0084).

**Écartés.** Garder CFR+ (deux fois plus lent pour la même précision) ; Linear CFR (meilleur avec échantillonnage
Monte-Carlo, qu'on n'utilise pas) ; mesurer à chaque itération (trop cher).

## D19 — River à 3 sur de vraies ranges, sans abstraction des combos · retenu · 2026-11-23

**Choix.** `riverSpot3` (src/engines/multiway/riverSpot3.ts) construit le spot : ranges préflop de la ligne jouée
(lineRanges sur la table du site), étendues en combos hors cartes du board, resserrées au flop et à la turn par les
filtres du site (filterByLine), joueurs rangés dans l'ordre de parole après le flop, rake cash. Tests :
src/test/multiway2d.test.ts.

**Mesuré.** CO ouvre, BTN et BB paient, board Kh 9d 4c 7s 2h : 864 / 335 / 50 combos (BB / CO / BTN).
Tout checké, pot 8 bb : NashConv 0,88 % du pot à 250 itérations, 0,29 % à 500, **0,10 % à 1 000 (≈ 5 min)**,
0,04 % à 2 000 (≈ 10 min), en baisse régulière.

**Abstraction écartée.** Retirer les combos de poids faible (sous 10 % ou 25 % du plus gros poids) ne retire que 0 à
14 % du poids, mais change le résultat bien au-delà du bruit du calcul : fréquence de mise de la BB 5,6 % → 9,2 %
(seuil 25 %) ; écart de valeur jusqu'à 0,39 bb (pot 8) et 2,3 bb (pot 17,6, ligne c-bet payée). Ces combos rares
comptent (bloqueurs, mains qui paient). L'option `minWeight` reste pour les tests mais vaut 0 par défaut.

**Limites connues.** (1) Les filtres du flop et de la turn sont des règles pensées pour le tête-à-tête : à 3, c'est
une approximation. Pluribus déduit les ranges de la street suivante de la stratégie calculée (règle de Bayes) : à
faire quand le solveur de turn existera (étape 4). (2) 5 minutes pour 0,1 % du pot : trop lent pour un conseil en
direct, assez pour un banc d'essai ou un calcul hors ligne. Pistes mesurables : ignorer les mains de probabilité
nulle (Pluribus : ×4), mettre en cache les spots déjà résolus.

## D20 — Accélérations du solveur river à 3, calcul réparti sur plusieurs cœurs · retenu · 2026-11-24

**Demande.** Une river à 3 sur de vraies ranges doit se résoudre en 20 à 30 secondes au plus (au lieu de 5 minutes),
« comme Pluribus ».

**Ce qui a été fait, et la preuve de chaque étape.**
1. Réécriture du parcours sans tableaux intermédiaires et saut des fins de main qu'un adversaire n'atteint jamais :
   mêmes opérations, **mêmes résultats au bit près** (référence figée, src/test/multiway2e.test.ts). 9,1 s → 5,2 s pour
   30 itérations sur un cœur.
2. Fins de main : par terme, sommes par carte V, U, D tenues à jour à chaque main ajoutée pendant le balayage ; il ne
   reste qu'une boucle de 52 cartes par main. 5,2 s → 3,5 s. Juste par rapport au calcul exact (multiway2b). L'ordre
   des additions change (écart ~1e-13 en relatif), ce qui suffit à faire diverger la trajectoire de CFR : mesuré,
   l'ancien calcul perturbé de 1e-12 finit lui-même entre 0,0072 et 0,0090 à 400 itérations ; le nouveau, 0,0085. Le
   test exige donc la même précision (marge ×1,3), pas les mêmes bits.
3. Calcul réparti (src/engines/multiway/vparallel.ts) : le haut de l'arbre reste sur le fil principal, les sous-arbres
   vont aux ouvriers, qui gardent leurs regrets. Mêmes opérations dans le même ordre : **mêmes résultats au bit près**
   que le calcul d'un seul tenant (testé avec des ouvriers simulés). Dans le navigateur : Web Workers ; sous Node :
   worker_threads.

**Mesuré de bout en bout** (CO ouvre, BTN et BB paient, board Kh 9d 4c 7s 2h, tout checké ; 864/335/50 combos ;
objectif 0,1 % du pot) : **10 cœurs (M5) : 26 s** (1 000 itérations, 0,088 % du pot) ; **4 cœurs : 47 s**.
Avant : environ 5 minutes. Sur un ordinateur à 4 cœurs, l'objectif de 30 s n'est pas tenu.

**Ignorer les mains impossibles.** Le gain ×4 cité par Pluribus vient des mains couchées au préflop : nos ranges les
excluent déjà (lineRanges). Les mains de poids nul en cours de calcul sont sautées dans les fins de main.

**Écartés.** Retirer les combos de faible poids (D19 : fausse le résultat). Mises à jour simultanées des 3 joueurs
(plus parallèles, mais convergence moins bonne et résultats différents du calcul validé). Réseaux de neurones (GPU).

## D21 — Mémoire des spots déjà calculés · retenu · 2026-11-24

**Choix.** src/engines/multiway/spotCache.ts. Empreinte du spot (board, ranges et poids, pot, tapis, tailles, rake,
méthode). Si la mémoire a déjà ce spot à la précision demandée : réponse immédiate (mesuré : 0 à 1 ms). Sinon, si elle
l'a moins précis : le calcul reprend là où il s'était arrêté (regrets et moyennes gardés), avec exactement les mêmes
chiffres qu'un calcul jamais interrompu (testé, calcul simple et réparti). On garde la meilleure stratégie mesurée.
Mémoire vive limitée aux 20 derniers spots utilisés.

**À faire plus tard (avec accord).** Garder la mémoire entre deux visites du site (stockage du navigateur) : un spot
réel pèse plusieurs mégaoctets, il faudra le compresser et en limiter le nombre.

## D22 — Arbre d'enchères de la river pour 2 à 6 joueurs · retenu (menu de mises : à décider) · 2026-11-24

**Choix.** src/engines/multiway/betTree.ts : l'arbre du solveur à 3 joueurs, généralisé à n joueurs, mêmes règles
(tailles en fraction du pot, relance au pot, tapis, plafond de mises, réouverture par joueur, pots annexes, mise
rendue, rake au prorata). Tests (src/test/multiway3a.test.ts) : à 3 joueurs, exactement l'arbre actuel ; de 4 à 6
joueurs, aucun jeton créé ni perdu et rake au plus le plafond sur toutes les fins de main et tous les classements ;
gains identiques à ceux du moteur de règles du site (5 joueurs, tapis 100/12/45/100/30) ; règle de réouverture ;
recoupement avec l'arbre explicite à 4 joueurs (mêmes décisions, mêmes gains pour chaque distribution).

**Taille de l'arbre (pot 8, tapis 97,5)** — fins de main :

| Menu | 3 j | 4 j | 5 j | 6 j |
|---|---|---|---|---|
| Complet (⅓, ¾, 1¼ pot + relance + tapis, 3 relances) | 517 | 3 401 | 18 941 | 95 893 |
| Pluribus (½, 1 pot + relance + tapis, 2 relances) | 157 | 705 | 2 841 | 10 705 |
| Réduit (¾ pot + relance + tapis, 2 relances) | 85 | 369 | 1 461 | 5 449 |
| Minimal (¾ pot + tapis, 1 mise) | 25 | 65 | 161 | 385 |

Repère : 517 fins de main à 3 joueurs = 26 s sur 10 cœurs (D20). À décider avec l'utilisateur après la mesure des
temps (3d) : quel menu à partir de 4 joueurs. Proposition : celui de Pluribus.

## D23 — Fins de main à n joueurs : approximation « adversaires indépendants » · mesurée, insuffisante seule · 2026-11-24

**Quoi.** src/engines/multiway/nTerminal.ts. `exactCfvN` : toutes les combinaisons compatibles (référence, lente :
O(N^(n−1)) par main). `indepCfvN` : cartes de ta main et du board retirées des ranges adverses, adversaires supposés
indépendants entre eux ; O(n²) par main. Tests (src/test/multiway3b.test.ts) : l'approché est exact quand les
adversaires ne peuvent pas partager de carte, et à 2 joueurs ; le calcul exact à n joueurs égale celui du solveur à 3.

**Mesuré.**
- Ranges réduites aux combos les plus lourds (paires et As, beaucoup de cartes partagées) : écart moyen 32 % à 4
  joueurs, 124 % à 5. Cas défavorable, peu représentatif.
- Ranges complètes, valeur exacte estimée par tirage (sans partage de carte), abattage à n : le gain moyen sachant ta
  main est bien estimé (écart 0,03 à 0,06 bb sur un pot de 9,5 bb, de 3 à 5 joueurs), mais la probabilité d'arriver
  dans la situation est surestimée de 11 % (3 joueurs), 28 % (4), 52 % (5).
- **Qualité du jeu à 3 joueurs** (vrai spot D19, jugée avec le calcul exact) : stratégie calculée avec
  l'approximation, NashConv 1,05 % du pot à 500 itérations et **0,85 % à 1 000** (plafonne), contre 0,24 % et
  **0,088 %** avec le calcul exact. Valeur de chaque joueur très proche (écart ≤ 0,014 bb). Plus rapide : 41 s contre
  99 s sur un cœur.

**Lecture.** Seule, l'approximation plafonne à environ 10 fois l'objectif de précision (0,1 % du pot) dès 3 joueurs,
et l'erreur de masse grandit avec le nombre de joueurs. Pistes, à mesurer de la même façon (stratégie jugée avec le
calcul exact à 3 joueurs) : (A) correction de la masse par paires d'adversaires (probabilité que chaque paire ne
partage aucune carte, calculable exactement en O(52) par main) ; (C) tirage des mains adverses à chaque itération
(Monte-Carlo, exact en moyenne, comme les solveurs de Pluribus). Décision à prendre avec l'utilisateur.

**Piste A mesurée (2026-11-24) : correction par paires d'adversaires.** `pairMass` (masse exacte d'une paire, testée
contre l'énumération) et `indepCfvN(…, pairs = true)` (mode `terminal: "pair"`). Erreur sur la probabilité des
situations, ranges complètes, tirage exact : 3 joueurs +12 % → 0,6 % (bruit du tirage) ; 4 joueurs +39 % → 0,8 % ;
5 joueurs +109 % → 1,6 % ; 6 joueurs +280 % → 8 %. **Mais la qualité du jeu à 3 joueurs ne bouge pas** : NashConv
exacte 0,968 % du pot à 500 itérations, 0,853 % à 1 000 (sans correction : 1,05 % et 0,85 %), et le calcul est deux
fois plus lent (76 s contre 41 s sur un cœur). Lecture : à 3 joueurs, la masse est exacte avec la correction ; le
plafond vient donc du lien entre cartes bloquées et force des mains (le gain moyen sachant ta main), que
l'indépendance ne capte pas. **Piste A écartée comme solution** ; le code reste pour les mesures.

## D24 — Piste C : tirage des mains adverses (Monte-Carlo) · mesurée, insuffisante pour un calcul en direct · 2026-11-24

**Quoi.** src/engines/multiway/vmc.ts : à chaque parcours, K jeux de mains adverses tirés selon leurs poids, sans carte
partagée ; le joueur qui apprend garde le vecteur de toutes ses mains. Tests (src/test/multiway3c.test.ts) : sans biais
(moyenne des tirages proportionnelle à la valeur exacte, 4 joueurs), aucune carte partagée, reproductible.
Vérification du code : après une itération, regrets du tirage (K = 200 000) proportionnels aux regrets exacts
(rapport constant 125 à 0,5 % près).

**Mesuré.** Vrai spot à 3 joueurs (D19), stratégie jugée avec le calcul exact : 64 tirages + DCFR, 2,06 % du pot à
1 000 itérations et 1,17 % à 4 000 (6 min sur un cœur) ; Linear CFR moins bon. Petit spot (15 mains par joueur,
pot 20) : calcul exact 0,014 à 400 itérations ; tirages fixes, plafond 0,76 (4 096 tirages) et 0,38 (20 000) ; tirages
renouvelés, 0,42 à 0,82 selon la graine. L'erreur ne baisse qu'avec la racine du nombre de tirages : il en faudrait
des millions pour 0,1 % du pot. Pluribus s'en accommode parce qu'il calcule pendant des jours, ce qui n'est pas notre cas.

**Lecture.** Exact en moyenne mais trop bruité pour 30 secondes. Moins bon que l'approximation « indépendants »
(0,85 % du pot à 1 000 itérations en 41 s). Piste possible, à mesurer : ne tirer que n−2 adversaires et calculer le
dernier exactement (masses par force et par carte, comme à 2 joueurs) — bruit bien plus faible, coût O(K·N) par fin
de main. Décision à prendre avec l'utilisateur.

## D25 — Solveur EXACT de la river à n joueurs (4, 5, 6) · retenu (demande de l'utilisateur) · 2026-11-24

**Demande.** « Le solveur exact au-delà de 3 joueurs, même s'il faut des millions de calculs. » Ni approximation (D23)
ni tirage (D24).

**Méthode.** src/engines/multiway/nExact.ts : pour le joueur qui apprend, deux adversaires (les deux plus grosses
ranges) sont calculés par la méthode rapide du solveur à 3 joueurs, généralisée (part de pot selon le nombre d'ex
aequo parmi les joueurs énumérés : ⅟(1+c), ⅟(2+c), ⅟(3+c)) ; tous les autres adversaires sont énumérés main par main
(toutes les combinaisons sans carte partagée, pondérées par leurs probabilités). Exact : testé contre l'énumération
complète à 4 et 5 joueurs (pots annexes, égalités), égal au calcul rapide à 3 joueurs. Solveur
src/engines/multiway/vriverN.ts (DCFR, même méthode que vriver3) : à 3 joueurs mêmes valeurs et NashConv que vriver3
pour une même stratégie ; à 4 joueurs valeurs et NashConv identiques à l'arbre explicite. Calcul réparti et mémoire
des spots : mêmes résultats au bit près (tests src/test/multiway3d.test.ts).

**Coût.** Proportionnel au produit des ranges énumérées : 4 joueurs = une range énumérée (la plus petite), 5 joueurs =
deux, 6 joueurs = trois. Vrai spot à 4 joueurs (CO ouvre, BTN, SB, BB paient ; 183/762/335/50 combos ; menu Pluribus,
705 fins de main) : 9,2 s par itération sur un cœur.
**Mesuré de bout en bout (10 cœurs, M5).** NashConv (exacte) en % du pot : 8,66 % à 100 itérations, 0,75 % à 400,
0,17 % à 1 000, **0,091 % à 1 400 itérations, en 26,5 minutes** ; baisse régulière à chaque contrôle. Objectif de
0,1 % du pot atteint, sans approximation. Rappel : au-delà de 2 joueurs, aucune garantie théorique de convergence ;
c'est la mesure qui fait foi.

**À venir.** 5 et 6 joueurs : même solveur, mais deux puis trois ranges énumérées ; coût à mesurer, probablement des
heures puis des jours par spot. Pistes d'accélération à mesurer : ne recalculer, d'une main énumérée à l'autre, que
les mains adverses qui partagent ses cartes ; choisir les ranges énumérées qui minimisent le coût.

**Accélération (2026-11-24).** Par terme, table M[c][e] = Σd Pb[c,d]·Pa[e,d] tenue à jour à chaque main ajoutée : plus
de boucle de 52 cartes par main du joueur qui apprend (utilisée quand il a plus de 120 mains). Un oubli dans la
première version (mise à jour manquante d'un côté) a été attrapé par un test exerçant ce chemin ; test ajouté qui le
force sur tous les types de pots à 4 et 5 joueurs, contre l'énumération complète.

**Coût mesuré, vrais spots (menu Pluribus, ranges de la ligne, tout checké, 10 cœurs) :**
- 4 joueurs (SB/BB/CO/BTN, 183/762/335/50 combos, 705 fins) : 3,3 s par itération au départ ; calcul complet 26 min.
- 5 joueurs (SB/BB/UTG/MP/BTN, 275/763/275/60/6, 2 841 fins) : 254 s par itération au départ (les suivantes sont plus
  rapides : stratégies plus tranchées) → **de l'ordre de 1 à 4 jours** pour 1 400 itérations.
- 6 joueurs (564/826/275/60/3/52, 9 937 fins) : borne haute 25 000 min par itération sur un cœur → **des mois** :
  hors de portée de cette machine avec cette méthode.

**Pistes pour 5 et 6 joueurs (à décider avec l'utilisateur).** (1) Lancer le calcul à 5 joueurs en tâche de fond
(jours, Mac allumé). (2) Méthode rapide exacte pour TROIS adversaires à la fois (inclusion-exclusion à trois mains) :
diviserait le coût par la taille d'une range (×50 à ×800), effort important et résultat incertain. (3) Menu de mises
plus petit à partir de 5 joueurs (161 et 385 fins au lieu de 2 841 et 9 937). (4) Calcul dans le cloud : payant,
interdit sans accord écrit.

**Piste « trois adversaires à la fois » étudiée puis écartée (2026-11-24).** Calcul : l'inclusion-exclusion à trois
mains fait apparaître des contractions de tables 52×52 dépendant de la main x (retrait de ses cartes), pour chacune
des 27 combinaisons de seuils « plus faibles / égales / toutes » des trois adversaires : au moins 27 × 2 704
opérations par main. Mesuré : borne basse 38 ms par appel (800 mains), contre 1 ms par main énumérée avec la méthode
actuelle (deux adversaires libres de 760 et 560 mains). Elle ne paie que si la range qu'elle évite d'énumérer dépasse
~40 combos (borne basse ; plutôt 100 à 400 en pratique) ; dans les vrais spots multiway, les ranges énumérées sont
justement les petites (3, 6, 52, 60). Gain au mieux ×1,6 à 5 et 6 joueurs. **L'estimation « ×50 à ×800 » annoncée
avant cette étude était fausse.** Restent pour 5 et 6 joueurs exacts : calcul long (5 joueurs : 1 à 4 jours sur cette
machine) ; 6 joueurs hors de portée ici (des mois) ; calcul dans le cloud seulement avec accord écrit (payant).

## D26 — Calcul réparti par fin de main, au fil de l'eau · retenu · 2026-11-24

**Constat.** À 5 joueurs, le découpage par sous-arbres (D20) mettait 1 137 des 2 841 fins de main sur un même ouvrier
(la ligne « tout le monde checke » n'était pas coupée) : un seul cœur travaillait. **Choix.** `VRiverNTerminalParallel`
: le fil principal parcourt tout l'arbre et garde tous les regrets ; chaque fin de main de chaque parcours est confiée
aux ouvriers, par petits paquets repris au fil de l'eau (les cœurs rapides en font plus). Mêmes opérations dans le même
ordre : mêmes résultats au bit près que le calcul d'un seul tenant (testé à 4 et 5 joueurs). Tableaux de travail
réutilisés d'un appel à l'autre (moins de mémoire à nettoyer).

**Mesuré (vrai spot à 4 joueurs, 4 itérations après mise en route).** 1 cœur 65 s ; 4 ouvriers 29 s ; 6 ouvriers 25 s ;
10 ouvriers 25 s. Le gain plafonne vers ×2,6 sur cette puce (4 cœurs rapides, 6 cœurs économes, fréquence qui baisse
quand tous travaillent) : la limite est matérielle. Conséquence : 5 joueurs estimé à **3 à 10 jours** sur cette machine
(au lieu de 1 à 4), les itérations suivantes étant plus rapides que les premières.

## D27 — Étape A1 : du spot saisi sur le site au spot river multiway (2 à 4 joueurs) · retenu · 2026-11-24

**Contexte.** Décision de l'utilisateur : arrêter le calcul à 5 joueurs et concentrer l'effort sur les mains à 2, 3 et
4 joueurs (river, puis turn et flop). Première brique : construire, à partir de la main saisie, le spot que le solveur
exact calcule.

**Choix.** `riverSpotFromHand` (handSpot.ts) :
- **Joueurs, pot, tapis** : la main est rejouée jusqu'à la fin de la turn par le moteur de règles du site (`replayLive`).
  Chaque joueur garde **ce qu'il a vraiment mis** (`invested0`) ; l'argent des joueurs couchés reste au pot **à son
  niveau** (`dead`, sièges couchés fictifs pour les pots annexes) ; un joueur déjà à tapis reste dans le coup sans
  parler. Avant, l'arbre supposait des mises égales (pot ÷ n), ce qui faussait les pots annexes.
- **Ordre de parole** : SB, BB, UTG… BTN (distance au bouton), comme sur une vraie table.
- **Ranges** : ligne préflop jouée (`lineRanges`), puis le filtre de chaque street (`filterByLine`) ; un check qui
  ferme la street est un « check derrière ». Mêmes règles que le conseil tête-à-tête. Si ta main n'est pas dans ta
  range, elle est ajoutée avec un petit poids et c'est signalé.
- **Actions déjà jouées sur la river** : insérées dans l'arbre avec leur **vraie taille** (`path`) ; une taille à 5 %
  du pot près d'une taille de l'arbre lui est rattachée, un tapis au tapis. Le solveur calcule toute la river depuis
  son début (les ranges se resserrent par la stratégie elle-même, règle de Bayes), et on lit ta décision au nœud atteint.
- **Menus** : complet (33 / 75 / 125 %, relance au pot, tapis, 3 agressions) à 2 et 3 joueurs ; celui de Pluribus
  (50 / 100 %, relance au pot, tapis, 2 agressions) à 4 joueurs (D22).
- **Refus clairs** : pas encore la river, plus de 4 joueurs, ce n'est pas à toi de parler, action impossible.
- **Un seul arbre** : le moteur rapide à 3 joueurs utilise désormais l'arbre de betTree.ts au lieu de sa copie (mêmes
  gains que le moteur général, testé) ; l'empreinte de la mémoire des spots tient compte des trois nouveaux champs.

**Écarté.** Arrondir la vraie taille à la plus proche de l'arbre (erreur de prix pouvant dépasser 20 % du pot) ;
partir des ranges resserrées par les actions de la river (double comptage : la stratégie calculée les resserre déjà) ;
garder deux constructeurs d'arbre (risque de divergence, déjà constatée : 14 fins de main contre 19 sur un spot à tapis
court et argent mort).

**Tests.** multiwayA1.test.ts (10 tests) : gains contre le moteur de règles du site (70 cas), vraie taille insérée,
rattachement, chemin impossible, mains réelles à 3 et 4 joueurs, tapis court, refus, moteur rapide = moteur général,
empreintes distinctes. Toute la suite multiway passe (références au bit près comprises).

## D28 — Étape A2 : calcul multiway dans le navigateur, au fil de l'eau · retenu · 2026-11-24

**Choix.**
- **Au fil de l'eau** (`liveSolve.ts`) : le calcul avance par morceaux de `every` itérations (50 à 2-3 joueurs, 10 à 4) ;
  après chaque morceau, la précision (NashConv) est mesurée, la meilleure stratégie gardée, le conseil de ta main envoyé
  à l'écran et l'état sauvé. Arrêt à 0,1 % du pot, à 60 s, ou sur demande. Mêmes opérations, même ordre : même résultat
  au bit près qu'un calcul d'un seul tenant, avec ou sans ouvriers, à 3 et 4 joueurs ; un calcul interrompu puis repris
  donne le même résultat qu'un calcul jamais interrompu (testé).
- **Web Workers** (`chefWorker.ts`, `coreWorker.ts`, `liveClient.ts`, `portPool.ts`) : la page crée un chef (qui mène
  le calcul) et des ouvriers (un par cœur moins un, 8 au plus), reliés deux à deux par des canaux de messages. La page
  ne calcule rien : elle ne se fige jamais. Écarté : le chef dans la page (le parcours de l'arbre et les regrets du haut
  de l'arbre la figeraient) ; des ouvriers créés par le chef (Workers dans un Worker, moins bien pris en charge).
- **Mémoire qui survit au rechargement** (`idbStore.ts`, IndexedDB) : 20 derniers spots, ≈ 6 Mo chacun à 3 joueurs
  (état du calcul 4,3 Mo + meilleure stratégie 2,1 Mo). Toute erreur (navigation privée, quota) la rend inopérante
  sans casser le calcul.
- **Rien de chargé d'interface dans les Workers** : le découpage en pots sort de handState.ts (qui importe le composant
  PokerTable.tsx) vers `core/pots.ts`, réexporté par handState (le site ne change pas). Un test vérifie qu'aucun .tsx
  n'est chargé par le chef ni les ouvriers. Défaut trouvé dans l'aperçu : « window is not defined » dans le Worker.
- **Correction** : à 4 joueurs, la mesure de précision du calcul réparti additionnait dans un autre ordre que le calcul
  d'un seul tenant (dernier chiffre différent ; stratégies identiques).

**Mesuré (8 ouvriers, Mac M5, board K♥9♦4♣7♠2♥, rake cash).**

| Spot | Mains calculées | Précision atteinte | Temps |
|---|---|---|---|
| 2 joueurs (CO mise 6 bb, BTN avec K♣Q♣) | 335 / 51 | 0,086 % du pot | ≈ 1 s |
| 3 joueurs (CO mise 12 bb, BTN avec A♥K♦), Node | 864 / 335 / 51 | 0,095 % | 18 s |
| 3 joueurs, même spot, **dans le navigateur** | idem | 0,09 % | **14,8 s** (premier conseil à 2 s) |
| 3 joueurs, rechargé depuis la mémoire | idem | 0,09 % | 0,2 s |
| 4 joueurs (QQ en SB, checks jusqu'à la river) | 184 / 762 / 335 / 50 | **33 %** du pot | 127 s (limite) |

**Mains rares retirées (méthode Pluribus) : écarté à 2 et 3 joueurs.** Gain de 1 à 2 s seulement, pour un conseil
qui bouge : écart moyen sur tes mains 0,9 / 2,9 / 5,2 points aux seuils 2 / 5 / 10 %, pire écart 8 à 21 points.
L'option (`minWeight`) reste disponible, désactivée.

**4 joueurs : le calcul exact en direct n'est pas utilisable.** Une itération coûte ≈ 4 s (0,03 s à 3 joueurs) ; après
2 min, la précision est de 33 % du pot (21 % et 29 % en retirant les mains sous 5 et 10 %). Le conseil affiché à ce
stade n'est pas fiable. Il faut une autre approche (arbre plus petit, à mesurer) avant de l'afficher sur le site.

## D29 — Étape A3 : le solveur multiway dans la Décision synthétique (river à 3 joueurs) · retenu · 2026-11-24

**Choix.**
- **Quel solveur** (`route.ts`) : tête-à-tête → le solveur de fin de main actuel (turn et river, inchangé) ; river à 3
  joueurs → le solveur multiway exact ; turn à 3 joueurs, 4 joueurs et plus, pas de ranges de la ligne (tournoi) ou
  refus de A1 → conseil maison avec la raison écrite. Pas à toi de parler → rien à calculer.
- **Affichage** : même forme que le solveur tête-à-tête (`EndgameResult`) : action conseillée et fréquences, ce que
  rapporte chaque action avec ta main (se coucher = 0), toute ta range ici par catégorie ; en détail : précision,
  itérations, mains calculées par joueur, temps (« déjà calculé » quand la mémoire le rend). Badge « Solveur multiway
  (3 joueurs) ».
- **Pendant le calcul** : le conseil maison reste affiché ; l'en-tête montre la précision qui s'affine (« Solveur
  multiway : précision 5,6 % du pot · 2 s »). Le conseil du solveur remplace le conseil maison à 0,1 % du pot ; si les
  60 s passent au-dessus de 1 % du pot, le conseil maison reste, avec la précision atteinte.
- **Ce que rapporte chaque action** (`nodeValues.ts`) : probabilités d'arrivée des adversaires le long de la ligne,
  valeur exacte de chaque action dans son sous-arbre, divisée par la masse des mains adverses compatibles ; plus ce que
  tu as déjà mis (se coucher = 0). Une passe de plus à la fin du calcul (≈ 1 s).
- **Pas de garde-fou contre les bluffs à 3 joueurs** : il est fait pour un seul adversaire dont on a la fiche.

**Écarté.** Remplacer le solveur tête-à-tête par le moteur multiway (il marche, il couvre la turn ; rien à gagner
maintenant). Afficher le conseil du solveur dès le premier contrôle (6 % du pot à 2 s : pas fiable).

**Tests.** multiwayA3.test.ts (7 tests) : valeur de chaque action égale au calcul complet sur toutes les distributions
de mains ; traduction (montants, 100 %, se coucher = 0, range) ; choix du solveur (2 joueurs, river à 3, turn à 3,
4 joueurs, mode tournoi, pas à toi de parler). Suite complète du site : 541 tests.

**Aperçu (site lancé depuis la copie de travail, main rouverte depuis l'historique).** CO ouvre, BTN et BB paient, BB
checke la river, CO mise 10 bb, toi au BTN avec Q♣Q♦ : conseil maison (call / fold) et « précision 5,6 % du pot · 2 s »
pendant le calcul, puis « Solveur multiway (3 joueurs) » : fold (call −4,6 bb, relance −5,1 bb, tapis −5,6 bb),
précision 0,09 % du pot en 15,7 s ; même spot rouvert : rendu par la mémoire.

## D30 — Turn à 3 joueurs : méthode « turn seule » mesurée contre le vrai jeu turn + river · mesures · 2026-11-24

**Le calcul exact turn + river ne tient pas dans un navigateur.** Turn type à 3 (K♥9♦4♣7♠, CO ouvre, BTN et BB paient,
checks au flop) : 886 / 339 / 50 mains ; 112 à 358 lignes de mise de la turn vont à la river, chacune suivie de 48
rivers : 5 000 à 17 000 parties de river à garder en mémoire (1,6 à 5 Go), 80 à 260 s par itération complète.

**Méthode testée : « turn seule »** (profondeur limitée, comme Pluribus) : CFR sur les mises de la turn ; au bout de la
turn, abattage moyen sur toutes les rivers (`vturn.ts`, feuilles « showdown »). Référence : le vrai jeu turn + river
(`vturn.ts`, feuilles « exact », chaque river avec ses mises), résolu hors navigateur. Un joueur couché à la turn garde
ses cartes dans le paquet (joueurs « déjà couchés » dans l'arbre de mises, `out`).

**Mesure** (ranges réduites aux 120 mains les plus fréquentes, turn 50 / 100 % + tapis, river 66 % + tapis, référence
à 0,17-0,19 % du pot) : ce que coûte, dans le vrai jeu, de suivre le conseil « turn seule » au nœud de la décision.

| Décision | Perte moyenne | Pire main | Même action principale |
|---|---|---|---|
| BB parle en premier (K♥9♦4♣7♠ et J♠T♠5♦8♣) | 0 bb | 0 | 100 % (check) |
| BTN face à une mise de 50 % de CO (sans relance) | 0,008 bb (0,10 % du pot) | 0,37 bb | 74 % |
| CO décide de miser après le check de la BB | 0,013 bb (0,16 %) | 0,27 bb | 86 % |
| BTN décide de miser après deux checks (J♠T♠5♦8♣) | 0,013 bb (0,17 %) | 1,02 bb | 62 % |
| BTN face à une mise de 50 %, relance possible | non mesurable : CO ne mise jamais 50 % ici (0,00 %) | — | — |

**Vitesse** (vraies ranges 886 / 339 / 50, BTN face à une mise avec relance possible, 1 cœur, contrôles de précision
toutes les 25 itérations compris) : 1 % du pot en 478 s (48 rivers) ou 200 s (16 rivers tirées par itération) ; 0,5 %
en 622 s ou 327 s. Avec des ranges réduites, le tirage ralentissait au contraire. Calcul réparti pas encore écrit :
gain attendu ×3 à ×6 (non mesuré).

**Limite trouvée (vaut aussi pour la river en ligne).** Quand la ligne jouée n'arrive presque jamais dans le jeu
calculé (une mise qu'aucune main ne fait), résoudre depuis le début de la street ne dit rien de fiable à ce nœud : la
stratégie n'y apprend rien (ici, la référence perdait 0,35 bb par main à ce nœud, sans bouger d'une itération à
l'autre). Il faut le détecter (probabilité d'arriver au nœud) et le dire, ou résoudre à partir du nœud.

## D31 — La turn « turn seule » sur tous les cœurs · retenu · 2026-11-24

Demande de l'utilisateur : utiliser tous les cœurs de la machine. `vturnParallel.ts` : le fil principal parcourt l'arbre
de la turn et garde les regrets ; la valeur « abattage » de chaque fin de turn (moyenne sur les rivers) est calculée
par les ouvriers, par petits paquets repris au fil de l'eau. Mêmes résultats au bit près que le calcul d'un seul
tenant (ouvriers simulés et vrais canaux de messages, testé).

**Mesuré** (vraies ranges 886 / 339 / 50, BTN face à une mise de 50 % avec relance possible, chef + 9 ouvriers, Mac M5,
contrôles de précision toutes les 25 itérations compris) :

| Rivers par itération | 1 % du pot | 0,5 % du pot |
|---|---|---|
| 16 tirées | 54 s (1 cœur : 200 s) | 90 s (1 cœur : 327 s) |
| 48 (toutes) | 128 s (1 cœur : 478 s) | 165 s (1 cœur : 622 s) |

Gain ≈ ×3,7 (plafond matériel de cette puce, D26). Avec les vraies ranges, tirer 16 rivers par itération est le bon
réglage (avec des ranges réduites, le tirage ralentissait : D30).

## D32 — Turn à 3 joueurs dans la Décision synthétique, et garde-fou des lignes rares · retenu · 2026-11-24

**Choix.**
- **Turn à 3 joueurs** (`turnSpotFromHand`, `route.ts`) : spot construit à partir de la main saisie comme à la river
  (D27), ranges de la ligne préflop puis du flop ; menu de la turn 50 / 100 % du pot, relance au pot, tapis (celui
  qui a été mesuré, D30). Calcul « turn seule » au fil de l'eau sur tous les cœurs, 16 rivers tirées par itération,
  mémoire des spots (le tirage des rivers est sauvé avec l'état : un calcul repris tire les mêmes rivers). Temps
  maximum 90 s (60 s à la river) ; un contrôle toutes les 25 itérations pour afficher vite la précision.
- **Précision à ta décision** (`localPct`), à la turn et à la river : ce que perd en moyenne ta range au nœud où tu
  joues en suivant la stratégie, par rapport à la meilleure action. Au-delà de 1 % du pot, la ligne jouée est jugée
  rare (le calcul n'y apprend rien, D30) : conseil maison, avec la raison.
- **Action mise en avant** (`display.ts`, multiway seulement) : la plus jouée, sauf si elle rapporte nettement moins
  que la meilleure (plus de 0,1 bb ou 0,5 % du pot) : le calcul n'a pas fini de régler ta main, la plus rentable est
  mise en avant avec l'explication ; « presque indifférent » quand les deux meilleures se valent.

**Aperçu** (site local, CO ouvre, BTN et BB paient, checks au flop ; turn : BB checke, CO mise 4 bb dans 12 ; BTN avec
J♣T♣) : précision 9,2 % du pot à 17 s, 0,98 % à 52 s, 0,48 % à 90 s ; premier affichage « Tapis 65 % » alors que la
relance rapportait plus (+0,8 contre +0,5 bb) : d'où l'action mise en avant. Calcul repris : 0,26 % du pot, précision
à ta décision 0,11 %, tapis 91 % et le plus rentable (+1,3 bb), en 98 s.

**Écarté.** Une turn à 4 joueurs et plus (non mesurée) ; le calcul exact turn + river dans le navigateur (D30).

## D33 — Tables cash préflop à 20, 30, 50, 75 et 150 bb, et table la plus proche du tapis · retenu · 2026-11-25

**Demande.** « Calculer les tables à 20, 30, 50, 75 et 150 bb avec GTOpen en préflop pour agrandir la bibliothèque du
solveur, avec les 10 cœurs. »

**Calcul.** Même jeu que la table 100 bb (6-max, ouverture 2,5 bb, 3-bet ×3, 4-bet ×2,3, tapis au-delà de 35 % du
tapis, rake 5 % plafonné à 3 bb, pas de rake sans flop) ; seul le tapis change. Deux serveurs GTOpen en parallèle
(un serveur n'occupe qu'environ 4,6 cœurs : à deux, 9,7 cœurs). Export complet, sans élagage, comme cash100.

| Tapis | Modèle d'après-flop | Itérations | Écart (bb par main) | Lignes |
|---|---|---|---|---|
| 20 bb | balanced | 100 | 0,0024 (visé 0,003) | 290 |
| 30 bb | balanced | 200 | 0,0019 | 837 |
| 50 bb | leafnet v2 | 1 022 | 0,0065 (arrêt à 2 h 30) | 1 919 |
| 75 bb | leafnet v2 | 1 383 | 0,0064 (arrêt à 4 h) | 1 919 |
| 150 bb | leafnet v2 | 1 898 | 0,0038 (arrêt à 7 h) | 2 625 |

**Modèle à 20 et 30 bb : balanced (choix de l'utilisateur).** Leafnet a été appris sur des flops à 100 bb. Face à
l'ouverture du BTN, il fait jeter à la BB 61 % de ses mains à 100 bb, 66 % à 30 bb et 70 % à 20 bb : la défense se
resserre quand le tapis raccourcit, à l'inverse du sens attendu (moins de jeu après le flop, l'équité de la BB se
réalise mieux). Balanced suit ce sens : 49 %, 45 %, 40 %. Les deux modèles diffèrent de 7 points de fréquence en
moyenne à 20 et 30 bb. Conséquence assumée : une marche entre 30 bb (balanced) et 50 bb (leafnet) ; à 100 bb, les
deux modèles diffèrent déjà de 12 points sur ce spot.

**Choix de la table.** La table la plus proche du tapis effectif, si l'écart ne dépasse pas 25 % du tapis de cette
table (62 bb → table 50 bb, 40 bb → 50 bb, 125 bb → 100 bb, à égalité la moins profonde) ; le conseil dit alors
« Conseil calculé à N bb ». Au-delà (12 bb, 200 bb) : pas de conseil solveur, avec un message. Les ranges du site
(lignes préflop, c-bet, Mes ranges, multiway) viennent de la même table, ou de la plus proche hors tolérance.
L'ancienne tolérance fixe de 10 bb autour de 100 bb laissait des trous entre les nouvelles tables (62 bb).

**Aperçu** (site local, BB avec Q♠8♦, BTN ouvre à 2,5 bb) : « Solveur GTOpen · Cash · 30 bb », Q8o : 100 % call ;
même main au tapis 100 bb : « Cash · 100 bb », 100 % fold.

**Écarté.** Leafnet à 20 et 30 bb (sens de la défense de la BB inversé) ; prolonger 50 et 75 bb jusqu'à 0,003
(2 à 3 h de plus, possible plus tard) ; une tolérance fixe en bb (trous entre tables) ; garder la table 100 bb pour
les ranges à tous les tapis.

**Incident.** La première nuit de calcul a été perdue : sur batterie, le Mac s'est mis en veille forcée à 1 %
(`caffeinate` n'empêche pas la veille quand la batterie est vide). Les tables à 150 et 75 bb ont été recalculées.

## D34 — Banc de test du moteur de table (partie A) · retenu · 2026-11-25

**Demande.** Un banc automatique, séparé du code du site, qui dit si le moteur de table est juste (A) avant toute
mesure de la stratégie (B). Commande : `npm run test:solveur` (rapport daté dans `tests-solveur/rapports/`, non suivi
par git) ; `npm run test:solveur -- rejouer GRAINE MAIN` rejoue une main.

**Choix.**
- **Arbitre indépendant** (`tests-solveur/oracle/`) : règles et évaluateur de mains réécrits sans aucun import du site
  (vérifié à chaque lancement), montants en centièmes de bb. Règles écrites en tête du fichier ; deux points tranchés
  à part : BB à tapis pour moins d'une blinde → on paie la blinde entière (règle TDA) ; pas de relance quand tous les
  autres sont à tapis. Les écarts du site sur ces deux points sont rangés en « convention » (à trancher), pas en bug.
- **Saisie comme la table du site** : un call enregistre le montant affiché par le menu, le bouton « Tapis » le
  montant de la page. C'est ce qui fait apparaître le pot faux (241,5 au lieu de 191,5).
- **Extraction sans changement de calcul** (accord de l'utilisateur) : le pot, le montant à payer et le tapis effectif
  de la page (`lib/siteView.ts`, ex-`pages/Index.tsx`) et les bornes du menu (`actionBounds`, ex-`ActionMenu.tsx`).
- Valeurs propres au héros (à payer, pot jouable, tapis effectif) comparées à son tour seulement : entre-temps, la page
  suppose couchés ceux qui n'ont pas encore parlé (convention de saisie, D1).
- Conseillers : seule la légalité est contrôlée (action permise, montant dans le tapis, rien quand tu ne peux plus agir).

**Premiers résultats** (graine 20261125, 20 000 mains, 154 008 actions) : aucun écart du moteur de règles ni du
règlement des pots ; 8 bugs classés (pot de la table avec un call à tapis, relance minimale du menu, conseils après la
fin de la main, relance conseillée impossible ou trop petite, mise de 0,5 bb) ; 3 cas figés sur 12 réussis.

**Écarté.** Comparer au moteur lui-même (l'ancien `settleFuzz` ne le faisait que contre lui) ; recopier les formules de
la page dans le banc (elles auraient pu diverger du site sans le voir).

## D35 — Corrections des bugs trouvés par le banc (A3 : 12 / 12) · retenu · 2026-11-25

**Demande.** « Oui, corrige-les » (bugs 1 à 6 du rapport du banc, D34). Les deux conventions (BB à tapis pour moins
d'une blinde, relance face à des joueurs tous à tapis) restent à trancher.

**Corrections.**
1. **Pot avec un call à tapis** : le menu propose un « à payer » plafonné au tapis du siège (`menuToCall`) ; le pot de
   la table vient du moteur de règles quand toute la main est saisie (`siteView.tablePot`), ce qui corrige aussi les
   mains déjà enregistrées avec la mise entière. Écarté : corriger seulement le menu (les anciennes saisies resteraient
   fausses), ou seulement le pot (le siège afficherait toujours la mise entière).
2. **Relance minimale du menu** : mise en cours + plus grande relance de la street, d'après le moteur de règles
   (`siteView.minRaiseTo`) ; l'ancienne approximation (2 × la mise) ne sert plus que sans bouton placé.
3. **Pas de conseil quand tu ne peux plus agir** : main finie (river close, tout le monde couché, plus personne pour
   payer), tu t'es couché ou tu es à tapis → la décision synthétique affiche la raison (`siteView.done`). Calculé sur les
   seules actions saisies : un joueur qui n'a pas encore parlé n'est pas couché d'office (sinon « main terminée » dès
   qu'UTG ouvre).
4. **Conseil préflop** : `canRaise` ; une main de relance paie quand plus aucune relance n'est possible.
5. **Relance conseillée** : relance « à » = max(3 × la mise de l'adversaire, relance minimale) au lieu de 3 × le montant à
   payer (entrées `betLevel`, `minRaiseTo`).
6. **Mise minimale** : jamais sous 1 bb ; le libellé donne la part du pot vraiment misée ; tapis = ce qu'il te reste au
   centième (plus d'arrondi à la demi-bb au-dessus du tapis) ; un « block bet » qui met l'adversaire à tapis s'appelle
   « Tapis ».

**Mesures.** Banc : A1 28 / 28, A3 12 / 12 ; A2 sur 20 000 mains (graines 20261125 et 7) : 0 écart du moteur, de la
page et des conseils ; il ne reste que les deux conventions. Suite du site : 601 tests (6 ajoutés, `siteView.test.ts`).
Aperçu (site local, tapis 80 / 150 / 30) : pot 191,5 bb.

**Reste.** La dictée enregistre « Tapis 100 » sans regarder les tapis saisis (étiquettes des sièges) ; l'historique ne
garde qu'un tapis pour tous (main revue).

## D36 — Banc, partie A4 : équité multiway sans biais · mesures · 2026-11-25

**Méthode.** Référence exacte (`tests-solveur/oracle/equite.ts`) : toutes les combinaisons de mains adverses compatibles,
pondérées (distribution jointe de D9), et tous les boards restants, avec l'évaluateur de l'arbitre. Site :
`handEquityMulti` (conseiller postflop) sur 20 graines × 4 000 tirages, dans plusieurs ordres d'adversaires ;
erreur d'échantillonnage = écart-type des graines / √20 ; biais si |écart| ≥ 4 erreurs types.

**Résultats** (`npm run test:solveur`, section A4) : 3 cas sur 16 sans biais détectable.
- Cas connu à 3 joueurs : 75,2 % ou 50,0 % selon l'ordre, pour 66,67 % exacts.
- Cas où les adversaires se gênent beaucoup : jusqu'à 42 points d'écart entre deux ordres.
- Ranges réalistes (top 8 à 40 %) : biais de 0,5 à 0,9 point (z de 5 à 12), sans écart détectable à la river à 3 joueurs.
- Évaluateur : `rank7` d'accord avec l'arbitre sur 20 000 abattages ; celui du moteur de base (`evaluateBest` +
  `tieScore`, `evaluateHandVsRange`) se trompe dans 5,46 % des cas.

**Cause et corrections proposées (non appliquées).** Tirage des mains adverses l'une après l'autre (D9 l'annonçait) →
tirer toute la combinaison d'un coup et la rejeter en entier en cas de carte partagée. Moteur de base → `rank7`, partage
des égalités entre les seuls joueurs à égalité, simulations abandonnées non comptées.
## D37 — Tables cash 50 et 75 bb prolongées jusqu'à l'écart visé · retenu · 2026-11-25

**Demande.** « Prolonge 50 et 75 bb cette nuit », puis « Oui, mets-les ».

**Calcul.** Reprise des sauvegardes GTOpen (DCFR continue où il s'était arrêté, `gtopen-batch/run_resume.py`), un
serveur par table : 50 bb de 1 022 à 1 472 itérations (+52 min), écart 0,0065 → 0,00297 ; 75 bb de 1 383 à
2 183 itérations (+88 min), écart 0,0064 → 0,00298. Export complet (1 919 lignes chacune). Mises en service par
`npm run promote` (anciennes tables archivées dans `solver-archive/`, remise en service possible avec `rollback`).

**Comparaison aux tables remplacées.** Aucune ligne gagnée ni perdue ; action principale changée pour 0,4 % (50 bb)
et 0,5 % (75 bb) des mains ; les gros écarts de fréquence sont tous dans des pots 4-bettés multiway (lignes rares,
peu entraînées par le calcul court). Cinq des six tables cash sont maintenant à l'écart visé ; seule 150 bb reste au-dessus (0,0038).

## D38 — Équité multiway corrigée (A4 : 16 / 16 et 8 / 8 sans biais) · retenu · 2026-11-25

**Demande.** « Oui, corrige-les » (les deux bugs mesurés en D36).

**Corrections.**
- `handEquityMulti` (conseiller postflop) : toute la combinaison de mains adverses est tirée d'un coup, chaque main selon
  son poids, et rejetée en entier dès que deux mains partagent une carte (jusqu'à 1 000 essais ; sinon le tirage ne
  compte pas). C'est la distribution jointe exacte de D9. Écarté : garder le tirage main par main en mélangeant l'ordre
  des adversaires à chaque tirage (le biais se moyenne mais la distribution reste fausse).
- `evaluateHandVsRange` (moteur de base) : abattage avec `rank7` (l'ancien départage par l'ordre des 5 cartes se
  trompait dans 5,46 % des abattages) ; égalité partagée entre les seuls joueurs à égalité ; seules les simulations
  menées à bout comptent ; même tirage joint. Nouvelle entrée facultative `combos` (mains adverses données directement)
  pour le banc de test.

**Mesures après correction** (banc, A4, 20 graines × 4 000 tirages par ordre) : conseiller 16 / 16 cas sans biais
détectable (cas connu : 66,77 % et 66,52 % pour 66,67 % exacts) ; moteur de base 8 / 8 (66,74 % et 66,57 %) ; écart
entre ordres au plus 0,5 point, dans l'erreur d'échantillonnage. Suite du site : 604 tests (3 ajoutés, `equityOrder.test.ts`).

**Conséquence.** Les équités affichées et les seuils du conseiller changent légèrement dans les pots à plusieurs
adversaires (moins d'un point sur des ranges réalistes, beaucoup plus quand les ranges se gênent).

## D39 — Banc, partie B1 : petits jeux à solution connue · mesures · 2026-11-25

**Méthode.** Jeux écrits à part (`tests-solveur/oracle/jeux.ts` : Kuhn, Leduc) et meilleures réponses exactes écrites
à part (`tests-solveur/oracle/meilleureReponse.ts` : jeu explicite par ensembles d'information ; river en tête-à-tête
avec ses propres gains, retraits de cartes et abattage, sur l'arbre de mises du solveur mesuré). Exploitabilité et
valeur du jeu après 10, 30, 100, 300, 1 000 et 3 000 itérations.

**Choix.** Le solveur de la décision synthétique en tête-à-tête (`endgame/cfr.ts`) ne joue que le hold'em : Kuhn lui est
donné déguisé en river (trois mains TT < QQ < KK, une mise de la taille du pot de départ), ce qui reproduit exactement
le jeu. Leduc (deux tours, carte commune) ne se déguise pas : il est joué par le CFR générique du site
(`multiway/cfr.ts`), qui ne sert pas à la décision synthétique. Écarté : installer OpenSpiel (dépendance Python) ; les
valeurs de référence publiées suffisent (Kuhn −1/18, Leduc ≈ −0,0856).

**Résultats** (5 / 5 convergent) : à 3 000 itérations, Kuhn 0,00004 jeton par main (valeur −0,0556), Leduc 0,00009
(valeur −0,0856), Kuhn par le solveur de fin de main 0,004 % du pot (valeur exactement −1/18), river polarisée 0,006 %
(IP paie 50,0 %, bluffs 33,3 % : la théorie), petite river avec le menu complet 0,0002 %. L'exploitabilité indépendante
et celle que mesure le site sont égales à 5 décimales.

**Limites.** Rien sur les vrais spots, le préflop (GTOpen), le conseiller maison ni le multiway : B2 à B5.

## D40 — Banc, partie B2 : tête-à-tête réel, turn et river · mesures · 2026-11-26

**Méthode.** 12 spots (8 river, 4 turn ; boards secs, mouillés, pairés, à couleur, pots 3-bettés ; ranges plausibles
de 50 à 310 mains par joueur ; rake cash). Stratégie affichée = solveur de fin de main avec la boucle d'arrêt de la
décision synthétique (0,3 % du pot visé ; 1 500 itérations / 3 s à la river, 500 / 15 s à la turn), recopiée et
contrôlée contre `solveEndgame` (mêmes itérations, même précision, à la variation du temps près). Exploitabilité exacte
écrite à part (`tests-solveur/oracle/hu.ts` : abattage trié, retraits de cartes, rake, turn avec les 44 rivers) ;
solveur de référence CFR+ écrit à part, même arbre (2 000 itérations river, 400 turn).

**Résultats** (Mac sur secteur, éveillé) : river 8 / 8 sous 0,3 % (0,08 à 0,30 %, soit 0,02 à 0,06 bb) ; turn 1 / 4 :
T1 0,66 %, T2 0,68 %, T3 0,95 % (arrêts sur la limite de 15 s, ≈ 125-133 itérations, ranges de 240 à 300 mains),
T4 (pot 3-betté, 50-60 mains) 0,13 %. L'exploitabilité indépendante et celle du site sont égales (3 décimales) ; la
valeur du jeu du site et de la référence diffèrent de 0,02 bb au plus ; à la première décision, les fréquences diffèrent
de quelques points (8 points au plus, R8), pour des EV par action proches.

**Conclusion.** La mesure passée (« sous 0,3 % du pot ») tient à la river ; pas à la turn avec des ranges de taille
réelle, où la limite de temps arrête le calcul à 0,7 à 1 % du pot (0,08 à 0,11 bb par main dans ces spots). Correction
possible (non appliquée) : plus de temps à la turn, calcul sur tous les cœurs, ou afficher la précision atteinte.

**Limites.** Spots choisis à la main, ranges plausibles et non celles que la page déduit ; référence non poussée à zéro
(0,27 à 0,40 % à la turn) ; flop non résolu par le site ; temps dépendants de la machine (une première passe faite
pendant la veille du Mac sur batterie a été jetée).

## D41 — Solveur de fin de main à la turn sur tous les cœurs · retenu (en cours) · 2026-11-26

**Demande.** « Corrige la turn » (B2, D40 : la limite de 15 s arrêtait la turn à 0,66-0,95 % du pot), « sur 10 cœurs ».

**Choix.** Les 48 cartes de river sont réparties entre des ouvriers (Web Workers, un par cœur moins un, 8 au plus) ;
le chef garde la turn. Le parcours de l'arbre est écrit une seule fois (`gen`, générateur) : à un nœud de hasard, il
demande les valeurs des 48 sous-arbres de river, que le pilote calcule lui-même (`walk`, un cœur) ou fait calculer par
les ouvriers (`walkAsync`). Toutes les demandes d'un parcours partent ensemble (ce qui arrive à une river ne dépend que
des stratégies au-dessus), et le chef additionne dans l'ordre des cartes : même résultat au bit près qu'un calcul sur un
cœur (testé : stratégies, précision, fréquences et EV identiques). Écarté : copier la logique du parcours pour la
version répartie (risque d'écart), ou répartir par nœud de la turn (trop peu de nœuds).

**Mesures.** Hors navigateur (fils Node, même code) : 95 → 28 ms par itération à la turn avec 8 ouvriers (×3,4,
plafond de ce Mac, D31). B2 : T1 0,246 % en 9,6 s, T2 0,292 % en 7,5 s, T3 0,246 % en 12 s, T4 0,129 % (avant : 0,66 /
0,68 / 0,95 / 0,13 %). Site local, vraie main à la turn (ranges de la page : 394 contre 514 mains, plus grandes que
celles de B2), navigateur affiché : 228 itérations en 15,4 s, 0,67 % du pot (masqué : 196 itérations, 0,82 %).

**Reste.** Avec les ranges de la page, 15 s ne suffisent pas encore pour 0,3 % : à trancher (plus de temps, ranges
allégées des mains presque impossibles, ou résultat affiché au fil de l'eau).
