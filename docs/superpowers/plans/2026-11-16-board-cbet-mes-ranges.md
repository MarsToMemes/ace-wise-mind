# Board & C-bet + Mes ranges Implementation Plan

> Exécution inline (executing-plans), TDD, une tâche = un commit.

**Goal:** bloc Board & C-bet calculé range contre range + éditeur « Mes ranges » local.
**Architecture:** moteurs purs dans `src/engines/` testés par vitest ; composants React (shadcn) branchés dans `src/pages/Index.tsx`.
**Tech Stack:** Vite, React, TypeScript, shadcn/ui, vitest.

### Task 1 — `handEval7.ts` : `rank7(cards: string[]): number`
Test `src/test/handEval7.test.ts` : quinte flush > carré > full > couleur > quinte (y compris roue A-5) > brelan > deux paires > paire > hauteur ; kicker départage ; égalité exacte.

### Task 2 — `boardTexture.ts` : `analyzeBoard(board)` → `{height, pairing, suits, straightsPossible, dynamic, tags}`
Test : As7d2c = A-high, arc-en-ciel, statique ; 9h8h7c = médian, bicolore, dynamique ; KhKd4h = pairé ; 8s6s2s = monocolore, dynamique.

### Task 3 — `myRanges.ts` : `parseRangeText`, `rangeToText`, `countCombos`, `loadMyRanges`/`saveMyRange`/`clearMyRange`, `exportMyRanges`/`importMyRanges`
Test : `22+` = 13 paires ; `A2s+` = 12 mains ; `KTo+` = KTo,KJo,KQo ; `AK` = AKs+AKo ; `77-55` ; `AKo:50` poids 0,5 ; combos de `AA,AKs` = 10 ; aller-retour texte.

### Task 4 — `matchupRanges.ts` : `getRange(slot, potType…)` → `{weights, source: "user"|"base"|"estimated", label}`, `slotsFor(pfr, caller, potType)`, `actsFirstPostflop(a,b)`
Test : open UTG = base ; call BB vs BTN = base ; call3bet estimé sans AA/KK ; range utilisateur prioritaire.

### Task 5 — `rangeVsRange.ts` : `expandRange`, `boardAdvantage(pfr, caller, board, {samples, seed})` → `{pfrEquity, pfrStrongPct, callerStrongPct}`
Test : AA vs 72o sur K83 → équité > 85 % ; board haut UTG open vs BB défense → équité PFR > 50 ; déterministe à graine égale.

### Task 6 — `cbetAdvisor.ts` : `adviseCbet({texture, adv, pfrInPosition, potType, callerActsFirst})`
Test : avantage fort + statique + IP → fréquence ≥ 70, taille 25-33 % ; avantage négatif + dynamique + OOP → check majoritaire ; donk seulement si conditions ; pot 3-betté taille plus petite.

### Task 7 — `BoardCbetPanel.tsx` + branchement `Index.tsx` + coach (`coachEngine.ts` utilise `analyzeBoard`/`adviseCbet`) ; `classifyTexture` corrigé (bicolore).
### Task 8 — `MyRangesDialog.tsx` + bouton dans le bloc C-bet et le Range Explorer (onglet Open, badge « Ma range »).
### Task 9 — `vitest`, `tsc`, `vite build`, vérification navigateur (desktop + mobile), console propre.
