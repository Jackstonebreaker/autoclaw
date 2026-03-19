# CLAUDE.md — AutoClaw Agent Playbook

> Ce fichier est lu automatiquement par l'agent INTENT (Augment Code) à chaque session.
> Il s'applique à TOUS les agents qui travaillent sur ce repo.
>
> Projet : AutoClaw — CLI Node.js/TypeScript pour l'automatisation de l'amélioration du code
> Version : 1.0.0 — Methodologie INTENT
> Dernière mise à jour : 2026-03-19

---

## 1. WORKFLOW ORCHESTRATION

### 1.1 Mode autonome (défaut pour INTENT)

Les agents INTENT executent en **mode autonome** : planifier INTERNEMENT puis exécuter sans attendre de validation humaine.

**Séquence obligatoire (INTERNE — pas besoin de demander à l'utilisateur) :**

1. Lire l'INTENT-PROMPT en entier avant d'écrire la première ligne
2. Identifier les dépendances (fichiers existants, StorageAdapter, client IA)
3. Lister les AC (Acceptance Criteria) et les cocher un par un
4. Si un AC est ambigu → relire le contexte du prompt, ne PAS inventer

**RÈGLE CRITIQUE — NE PAS DEMANDER DE VALIDATION DU PLAN :**

- NE JAMAIS écrire "Je m'arrête ici pour validation" ou "Validez-vous ce plan ?"
- NE JAMAIS attendre une confirmation humaine entre les AC
- Planifier SILENCIEUSEMENT puis exécuter IMMÉDIATEMENT
- Documenter les décisions prises dans les commentaires du code
- Si vraiment bloqué (dépendance manquante, contradiction dans les AC) → logger l'erreur et passer à l'AC suivant

**Quand s'arrêter et demander à l'humain (UNIQUEMENT ces cas) :**

- Suppression de fichiers existants sans instruction explicite dans le prompt
- Contradiction directe entre deux AC du même prompt
- Erreur de build qui persiste après 3 tentatives de correction

### 1.2 Stratégie Subagent

Utiliser des sous-agents pour les tâches parallélisables :

- Recherche de fichiers existants pendant la planification
- Vérification de types TypeScript en parallèle du développement
- Tests unitaires en parallèle de l'écriture de code

### 1.3 Boucle de qualité continue (à CHAQUE AC)

Après chaque AC complété, l'agent exécute cette boucle COMPLETE :

```
ETAPE 1 — VERIFICATION LOCALE
  npx tsc --noEmit          → 0 erreurs TypeScript
  npm run build             → build OK
  npx vitest run            → tous les tests passent
  Si erreur → corriger immédiatement (max 3 tentatives)

ETAPE 2 — COMMIT ATOMIQUE
  git add <fichiers modifiés>   → PAS de git add . (trop risqué)
  git commit -m "feat(module): description (AC X/Y)"
  → Un commit PAR AC (pas un méga-commit à la fin)
  → Message Conventional Commits (voir §2.4)

ETAPE 3 — PUSH + PR REVIEW
  git push
  → Attendre ~30s que le code reviewer IA analyse le push
  gh pr view --json reviews     → vérifier les retours
  → Si problème → corriger, re-commit, re-push

ETAPE 4 — ENCHAINER
  → Marquer l'AC comme terminé
  → Passer à l'AC suivant
```

**RÈGLE ABSOLUE** : Ne JAMAIS enchaîner 5+ AC sans push. Maximum 3 AC entre deux push.

### 1.4 Vérification avant "Done"

JAMAIS marquer un AC comme terminé sans :

- [ ] Build passe (`npm run build`)
- [ ] TypeScript strict passe (`npx tsc --noEmit`)
- [ ] Tests passent (`npx vitest run`)
- [ ] Le module créé/modifié est importable sans erreur
- [ ] Commit effectué avec message clair
- [ ] Push effectué (ou groupé avec max 2 autres AC)
- [ ] Retours du code reviewer vérifiés et traités (si PR ouverte)

### 1.5 Exiger l'élégance

Le code doit être :

- **Typé strictement** — pas de `any`, pas de `as unknown as X`
- **Documenté** — JSDoc sur toutes les fonctions publiques
- **Consistant** — suivre les patterns existants du codebase
- **Nommé clairement** — noms de variables/fonctions explicites en anglais

### 1.6 Correction autonome de bugs

Si un test ou un build échoue :

1. Lire l'erreur COMPLÈTE (pas juste la première ligne)
2. Identifier la cause racine
3. Corriger le code source (pas le test)
4. Relancer build + tests
5. Si 3 tentatives échouent → logger l'erreur complète et continuer si l'AC suivant n'en dépend pas

---

## 2. TASK MANAGEMENT

### 2.1 Planifier d'abord (INTERNE)

Avant chaque AC, l'agent vérifie SILENCIEUSEMENT :
1. Lire l'AC complet
2. Identifier les fichiers à créer/modifier
3. Vérifier que les dépendances existent (`grep`, `find`)
4. **EXÉCUTER immédiatement** — ne PAS présenter le plan à l'utilisateur

### 2.2 Tracker la progression (INTENT-PROGRESS.md)

Le fichier `INTENT-PROGRESS.md` à la racine est la **source de vérité** pour le suivi des ACs.

- **Avant** chaque AC : mettre le status `⏳ in-progress`
- **Après** chaque AC : mettre `✅ done` avec date et notes
- **Si bloqué** : mettre `❌ blocked` avec la raison

### 2.3 Messages de commit

```
feat(cli): add --dry-run flag to run command (AC X/Y)
fix(storage): correct SQLite connection pooling
test(orchestrator): add unit tests for step 5 pipeline
```

### 2.4 Documenter les résultats

À la fin de chaque prompt INTENT, écrire dans `INTENT-PROGRESS.md` :

```markdown
### Session {date} — Résumé
- **ACs traités** : {liste}
- **ACs terminés** : {nombre}
- **Fichiers créés** : {liste}
- **Fichiers modifiés** : {liste}
- **Tests ajoutés** : {nombre}
- **Erreurs rencontrées** : {nombre} — {résolutions}
- **Leçons** : {LESSON si applicable}
```

---

## 3. CORE PRINCIPLES

### 3.1 Simplicité d'abord

- Préférer une solution simple qui marche à une solution élégante qui pourrait casser
- Pas d'abstraction prématurée — abstraire seulement quand un pattern se répète 3x minimum

### 3.2 Pas de paresse

- NE JAMAIS écrire `// TODO: implement later` sans raison documentée
- NE JAMAIS utiliser `console.log` comme mécanisme de debugging permanent
- NE JAMAIS ignorer un warning TypeScript / linter
- NE JAMAIS committer du code commenté
- NE JAMAIS laisser un `catch {}` vide

### 3.3 Impact minimal

- Modifier le MINIMUM de fichiers nécessaires
- Ne pas reformater du code existant qui fonctionne
- Respecter le style du codebase existant

---

## 4. RÈGLES SPÉCIFIQUES AU PROJET

### 4.1 Stack technique

```
Framework    : CLI (Commander.js)
Language     : TypeScript strict
Database     : Supabase PostgreSQL (SupabaseAdapter)
               SQLite (SqliteAdapter — fallback local)
               Markdown (FileAdapter — fallback zero-dep)
ORM          : Aucun — StorageAdapter pattern (abstraction maison)
IA           : @anthropic-ai/sdk — claude-haiku-4-5 (tâches simples)
                                   claude-sonnet-4-6 (analyse complexe)
UI           : Aucune (CLI uniquement)
Tests        : Vitest (168+ tests, tout mocké — aucun appel réseau réel)
Monitoring   : Aucun (v1)
Deploy       : npm publish
```

### 4.2 Patterns architecturaux obligatoires

**Client IA Singleton** :
```typescript
// TOUJOURS utiliser le singleton, JAMAIS instancier un nouveau client
import { aiClient } from '@/ai/client';
import { aiQueue } from '@/ai/queue';

// TOUJOURS passer par la queue pour le rate limiting
const result = await aiQueue.add(() => aiClient.messages.create({...}));
```

**StorageAdapter pattern** :
```typescript
// TOUJOURS utiliser l'interface StorageAdapter, JAMAIS accéder directement à une DB
import type { StorageAdapter } from '@/storage/types';

// Instanciation via factory (jamais en dur)
const storage = createStorageAdapter(config); // → Supabase | SQLite | File
```

**Orchestrateur (pipeline 11 étapes)** :
```typescript
// TOUJOURS exécuter via Orchestrator, JAMAIS appeler les étapes directement
import { Orchestrator } from '@/orchestrator';
const orch = new Orchestrator(config, storage, aiClient);
await orch.run(options);
```

### 4.3 Conventions de nommage

| Type | Convention | Exemple |
|------|-----------|---------|
| Fichier command CLI | `{nom}-command.ts` | `run-command.ts` |
| StorageAdapter | `{backend}-adapter.ts` | `supabase-adapter.ts` |
| Fichier service | `{nom}.ts` | `extractor.ts` |
| Enum | SCREAMING_SNAKE | `PIPELINE_STATUS` |
| Variable | camelCase | `sessionData` |
| Constante | SCREAMING_SNAKE | `MAX_RETRY_COUNT` |
| Type/Interface | PascalCase | `StorageAdapter`, `OrchestratorConfig` |

### 4.4 StorageAdapter — Règles critiques

1. **TOUJOURS** utiliser `StorageAdapter` (interface), jamais la classe concrète directement
2. **TOUJOURS** passer l'adapter par injection de dépendance (constructeur)
3. **JAMAIS** faire d'opérations DB dans les commandes CLI — déléguer à l'orchestrateur
4. **TOUJOURS** gérer les erreurs d'adapter avec try/catch + message descriptif
5. Les 3 adapters doivent implémenter la même interface — aucune méthode adapter-spécifique dans le code métier

### 4.5 Gestion des erreurs

```typescript
// Pattern standard avec retry exponentiel
async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}
```

### 4.6 Tests — Standards minimum

- **Couverture cible** : 60%+ (actuellement 168+ tests)
- **Framework** : Vitest
- **Emplacement** : `__tests__/` ou `*.test.ts` à côté du fichier
- **Priorité de test** : orchestrator pipeline > storage adapters > AI client > CLI commands > utils
- **Mock obligatoire** : `@anthropic-ai/sdk`, tous les adapters storage, toute I/O réseau
- **JAMAIS** de test qui appelle l'API Anthropic réelle
- **JAMAIS** de test qui écrit dans une vraie DB Supabase
- **JAMAIS** de test qui dépend de l'ordre d'exécution des autres tests

---

## 5. CONTEXTE BUSINESS

- **Utilisateur(s)** : Développeurs qui utilisent des agents IA (Claude, Augment Code, Cursor)
- **Objectif** : Automatiser l'extraction de patterns de code et la génération de règles/docs à partir des sessions de développement
- **Type** : CLI open-source (npm package)
- **Revenue model** : Open-source gratuit
- **Langue de l'app** : EN (CLI, code, docs)
- **Langue de travail agent** : FR (conversations), EN (code + commits)

---

## 6. FICHIERS CLÉS À CONNAÎTRE

```
src/types.ts                → Types TypeScript + schemas Zod (source de vérité des types)
src/orchestrator.ts         → Pipeline 11 étapes — logique principale du CLI
src/storage/
  ├── types.ts              → Interface StorageAdapter
  ├── supabase-adapter.ts   → Implémentation Supabase PostgreSQL
  ├── sqlite-adapter.ts     → Implémentation SQLite (fallback)
  └── file-adapter.ts       → Implémentation Markdown (fallback zero-dep)
src/ai/
  ├── client.ts             → Singleton Anthropic SDK
  └── queue.ts              → SimpleQueue (rate limiting)
src/cli/
  ├── index.ts              → Entry point Commander.js
  └── commands/             → Commandes CLI individuelles
```

---

## 7. COMMANDES UTILES

```bash
# Build & Check
npm run build                          # Compile TypeScript → dist/
npx tsc --noEmit                       # TypeScript strict check (sans compiler)
npm run lint                           # ESLint
npx vitest run                         # Tests (tous, sans watch)
npx vitest run --coverage              # Rapport de couverture
npx vitest run --reporter=verbose      # Output détaillé

# CLI — usage local (après build)
node dist/index.js --help
node dist/index.js run --help
node dist/index.js run --dry-run --since="7 days ago"
node dist/index.js run --since="2026-01-01" --output=markdown

# Git
git checkout main && git pull          # Toujours partir de main à jour
git merge --no-ff feat/x              # Merge avec commit
```

---

## 8. STRATÉGIE SUBAGENT AVANCÉE

### 8.1 Délégation efficace

Utiliser des sous-agents spécialisés pour les tâches parallélisables. Chaque sous-agent doit :

- Avoir une tâche UNIQUE et bien définie (< 50% du context window)
- Recevoir TOUT le contexte nécessaire dans son prompt
- Retourner un résultat structuré (JSON ou markdown formaté)

### 8.2 Pattern de délégation recommandé

```
Tâche principale (orchestrateur)
  |-- Sous-agent 1 : Recherche de fichiers existants
  |-- Sous-agent 2 : Vérification de types TypeScript
  |-- Sous-agent 3 : Tests unitaires
  [ATTENDRE tous les résultats]
  → Synthèse et décision dans le contexte principal
```

### 8.3 Règles anti-blocage

- **JAMAIS** de sous-agent qui modifie un fichier qu'un autre sous-agent lit
- **JAMAIS** de chaîne de sous-agents (A lance B qui lance C) — max 1 niveau
- **TOUJOURS** ajouter un timeout (max 5 min par sous-agent)

---

## 9. BOUCLE RPI — RESEARCH → PLAN → IMPLEMENT

### 9.1 Workflow standard pour chaque AC (100% AUTONOME)

```
RESEARCH (silencieux)
  → git pull origin <branche>    ← TOUJOURS partir du code à jour
  → Lire src/types.ts et les fichiers concernés
  → Vérifier que les dépendances existent
  ↓
PLAN (INTERNE — NE PAS demander validation)
  → Lister les modifications à faire
  → Identifier les risques
  → Exécuter immédiatement
  ↓
IMPLEMENT (séquentiel)
  → Écrire le code
  → Écrire/adapter les tests pour cet AC
  → npm run build + npx tsc --noEmit
  → npx vitest run
  → Si erreur → boucle corrective (max 3 tentatives)
  ↓
VERIFY (gate de qualité — TOUT doit être vert)
  → npm run build ✓
  → npx tsc --noEmit ✓
  → npx vitest run ✓
  → Module importable sans erreur ✓
  → Mettre à jour INTENT-PROGRESS.md
  ↓
COMMIT (atomique, 1 commit par AC)
  → git add <fichiers spécifiques>   ← PAS de git add .
  → git commit -m "feat(module): description (AC X/Y)"
  ↓
PUSH + REVIEW (toutes les 1-3 AC)
  → git push
  → Attendre ~30s puis vérifier : gh pr view --json reviews --json comments
  → Si problème → corriger, re-commit, re-push
```

### 9.2 Gates de qualité obligatoires

| Check | Commande | Obligatoire |
|-------|----------|:-----------:|
| Build | `npm run build` | OUI |
| Types | `npx tsc --noEmit` | OUI |
| Tests | `npx vitest run` | OUI |
| Import | Module importable sans erreur | OUI |
| Commit | Commit atomique effectué | OUI |
| Push | Push toutes les 1-3 AC | OUI |

### 9.3 Hygiène Git pendant un sprint

```bash
# DÉBUT de session
git checkout <branche> && git pull

# PENDANT le sprint
git add src/orchestrator.ts
git commit -m "feat(orchestrator): add step 6 deduplication (AC 5/12)"

# Maximum 3 AC entre deux push
git push

# Vérifier le code reviewer
gh pr view --json comments | jq '.comments[-3:]'
```

---

## 10. OPTIMISATION CONTEXT & TOKENS

### 10.1 Règles de gestion du contexte

- Garder les prompts système CONCIS — pas de texte superflu
- Utiliser les fichiers `.claude/rules/` pour le contexte lazy-loaded
- Les sous-agents reçoivent UNIQUEMENT le contexte dont ils ont besoin
- Pas de copier-coller de fichiers entiers dans les prompts — référencer par path

### 10.2 Structure `.claude/rules/` recommandée

| Fichier | Chargé quand... |
|---------|----------------|
| `rules/storage-adapter.md` | Fichiers `src/storage/**` touchés |
| `rules/ai-client.md` | Fichiers `src/ai/**` touchés |
| `rules/orchestrator.md` | Fichier `src/orchestrator.ts` touché |
| `rules/cli-commands.md` | Fichiers `src/cli/**` touchés |
| `rules/testing.md` | Fichiers `*.test.ts` ou `__tests__/**` touchés |
| `rules/error-handling.md` | Fichiers `src/**` touchés (retry, timeout) |
| `rules/quality-gates.md` | Toujours chargé |
| `rules/git-conventions.md` | Toujours chargé |
| `rules/intent-tracking.md` | Fichiers `INTENT-PROMPT*`, `INTENT-PROGRESS*` touchés |
| `rules/repo-cleanliness.md` | Toujours chargé |

---

## 11. ANTI-PATTERNS À ÉVITER

### 11.1 Code

- `any` ou `as unknown as X` → utiliser les types de `src/types.ts`
- `// TODO: implement later` sans raison documentée
- `console.log` comme debugging permanent (utiliser le logger ou supprimer)
- `catch {}` vide — toujours logger l'erreur avec contexte
- Code commenté commité
- Instancier `Anthropic` directement → toujours utiliser `aiClient` singleton
- Accéder directement à Supabase/SQLite → toujours passer par `StorageAdapter`

### 11.2 Workflow

- Commencer à coder sans lire l'INTENT-PROMPT en entier
- Modifier `src/types.ts` sans vérifier tous les utilisateurs en aval
- Appeler les étapes du pipeline directement sans passer par `Orchestrator`
- Tests qui font de vrais appels à l'API Anthropic
- `git add .` — toujours spécifier les fichiers explicitement
- Lancer des sous-agents en chaîne (A → B → C)

### 11.3 StorageAdapter

- Ajouter des méthodes spécifiques à un backend dans le code métier
- Supposer que l'adapter est Supabase dans les tests (toujours mocker)
- Oublier de tester les 3 adapters (Supabase, SQLite, File) pour les nouvelles fonctionnalités

---

## 12. DOCUMENTATION POST-SESSION

### 12.1 Résumé obligatoire

À la fin de chaque prompt INTENT, écrire dans `INTENT-PROGRESS.md` :

```markdown
## Résumé — [NOM DU PROMPT]

### AC terminés : X/Y
### Fichiers créés
- path/to/file1.ts

### Fichiers modifiés
- path/to/existing1.ts (raison)

### Tests ajoutés : N

### Erreurs rencontrées
1. [Erreur] → [Solution appliquée]

### Leçons apprises
- // LESSON: [description pour les futurs agents]
```

### 12.2 Pattern `// LESSON:`

```typescript
// LESSON: [StorageAdapter] L'interface doit être mise à jour dans src/storage/types.ts
// AVANT d'ajouter une méthode dans un adapter concret — sinon TypeScript plante.
```

---

## 13. COMMANDES CUSTOM

> Les commandes suivantes sont dans `.claude/commands/`.

| Commande | Fichier | Description |
|----------|---------|-------------|
| `/verify` | `commands/verify.md` | Chaîne de validation : tsc → eslint → build → vitest |
| `/intent` | `commands/intent.md` | Charger un INTENT-PROMPT et exécuter les waves avec boucle RPI |
| `/status` | `commands/status.md` | Dashboard santé du projet (code, git, tests, INTENT) |
| `/security-review` | `commands/security-review.md` | Audit : secrets en dur, deps vulnérables, permissions |
| `/feedback-loop` | `commands/feedback-loop.md` | Boucle CI + CodeRabbit → corrections automatiques |
| `/pipeline-test` | `commands/pipeline-test.md` | Test du pipeline 11 étapes en mode --dry-run |

### 13.1 Quand utiliser quelle commande

- **Avant chaque commit** : `/verify`
- **Début de sprint** : `/intent INTENT-PROMPT-{nom}.md`
- **À tout moment** : `/status`
- **Avant une release npm** : `/security-review`
- **Après un merge** : `/feedback-loop`
- **Test du pipeline complet** : `/pipeline-test`

---

## 14. HOOKS — Protection automatique

### 14.1 PreToolUse — Avant chaque action

| Trigger | Action | Bloquant |
|---------|--------|:--------:|
| `git commit` | Lance `tsc --noEmit` + `eslint` | OUI — bloque si erreurs |

### 14.2 PostToolUse — Après chaque modification

| Trigger | Action | Bloquant |
|---------|--------|:--------:|
| `Write` ou `Edit` sur `.ts` | Lance `tsc --noEmit` | NON — avertit seulement |

### 14.3 Stop — Fin de session

| Trigger | Action |
|---------|--------|
| Fin de session | Lance `tsc --noEmit` + `npm run build` + rapport final |

---

## 15. GUIDES DE RÉFÉRENCE

### 15.1 Routage IA — Modèle par tâche

| Tâche | Modèle | Justification |
|-------|--------|---------------|
| Analyse complexe de patterns | claude-sonnet-4-6 | Raisonnement profond |
| Extraction simple, résumés | claude-haiku-4-5 | Rapide + économique |
| Architecture, refactoring | claude-sonnet-4-6 | Meilleure qualité |
| Corrections simples | claude-haiku-4-5 | Suffisant |

**Règle** : Ne JAMAIS utiliser un modèle plus puissant que nécessaire — impact coût pour l'utilisateur.

### 15.2 Agents spécialisés (pipeline CLI)

```
Sprint INTENT typique pour AutoClaw :

  Agent ARCHITECTE (Sonnet 4.6)
    → Analyse les AC, planifie les fichiers
    → Vérifie la cohérence avec src/types.ts

  Agent IMPLÉMENTEUR (Sonnet 4.6)
    → Exécute chaque AC séquentiellement
    → Build + tsc + vitest après chaque AC

  Agent TESTEUR (Haiku 4.5 / Sonnet 4.6)
    → Écrit les tests Vitest (tout mocké)
    → Vérifie la couverture 60%+

  Agent REVIEWER (Sonnet 4.6)
    → Revue finale du sprint
    → Détecte les anti-patterns (§11)
    → Génère le résumé post-session
```

**Règle** : Chaque agent reçoit UNIQUEMENT le contexte dont il a besoin.

---

## 16. MÉMOIRE PERSISTANTE — mem0

### 16.1 Session Pattern

```
DÉBUT DE SESSION :
  1. mem0.search("project:autoclaw") → récupérer le contexte
  2. Appliquer les décisions et préférences trouvées

FIN DE SESSION :
  1. mem0.add() → stocker décisions, leçons, patterns validés
  2. Catégoriser : project_decisions | lessons_learned | agent_patterns | tool_config
```

### 16.2 Catégories de mémoire pertinentes pour AutoClaw

| Catégorie | Exemple |
|-----------|---------|
| `project_decisions` | "ADR: SQLite comme fallback par défaut, pas Markdown" |
| `lessons_learned` | "StorageAdapter: toujours mettre à jour l'interface avant les implémentations" |
| `agent_patterns` | "Prompt extraction: ajouter context window = meilleur recall" |
| `tool_config` | "Vitest: utiliser vi.mock('@anthropic-ai/sdk') au niveau module" |

