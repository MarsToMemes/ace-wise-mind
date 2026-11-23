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
