# PRD — AutoClaw v2

> Version : 1.0.0
> Dernière mise à jour : 2026-03-19
> Status : In Development

---

## §1. Vision & Objectif

### 1.1 Mission

AutoClaw automatise l'amélioration continue du code en extrayant les patterns d'erreurs récurrents des sessions de développement et en générant des règles applicables automatiquement par les agents IA (Claude, Augment, Cursor).

### 1.2 Problème résolu

Les développeurs qui utilisent des agents IA commettent les mêmes erreurs entre sessions parce que :
- Les agents n'ont pas de mémoire cross-session
- Les règles sont écrites manuellement (si elles le sont)
- Il n'y a pas de feedback loop automatisé entre les sessions de développement

### 1.3 Proposition de valeur

> "Votre codebase apprend de ses erreurs automatiquement."

- **Extraction automatique** des patterns d'erreurs via analyse de `git diff` / `git log`
- **Génération de règles** avec seuil de confiance (auto-approve ≥ 0.70)
- **Distribution de règles universelles** via starter kit importable
- **Support multi-IDE** : Claude (`.claude/`), Augment (`.augment/`), Cursor (`.cursor/`)

### 1.4 Utilisateurs cibles

| Profil | Besoin |
|--------|--------|
| Développeur solo (agents IA) | Améliorer ses sessions sans effort manuel |
| Équipe technique (INTENT/agent-driven) | Feedback loop automatisé entre sprints |
| Mainteneur open-source | Distribuer des règles partagées via starter kit |

---

## §2. Fonctionnalités

### 2.1 Core Pipeline (Waves 1–3)

| Feature | Status | Priorité | Wave |
|---------|--------|----------|------|
| Analyse de session (`git diff`/`log` → patterns) | 🔨 Planned | P0 | W2 |
| Détection cross-session (Jaccard similarity) | 🔨 Planned | P0 | W2 |
| Suggestion de règles (Claude Sonnet, confidence ≥ 0.7) | 🔨 Planned | P0 | W2 |
| Auto-approve haute confiance (seuil 0.70) | 🔨 Planned | P0 | W2 |
| Application des règles (`.claude/`, `.augment/`, `.cursor/`) | 🔨 Planned | P0 | W2 |
| Score qualité par session | 🔨 Planned | P1 | W2 |
| Injection de contexte (`session-context.md`) | 🔨 Planned | P1 | W2 |
| Vérification de régression | 🔨 Planned | P1 | W2 |
| Notifications (`.learnings/`) | 🔨 Planned | P2 | W2 |
| Doc-syncer (`AGENTS.md` / `CLAUDE.md` sync) | 🔨 Planned | P1 | W2 |
| Linear-sync (commits ↔ tickets) | 🔨 Planned | P2 | W2 |
| CLI — 7 commandes | 🔨 Planned | P0 | W3 |
| Tests Vitest — 168+ | 🔨 Planned | P0 | W3 |

### 2.2 Rules Audit & Generator (Wave 4)

| Feature | Status | Priorité | Wave |
|---------|--------|----------|------|
| Rules reader (lecture récursive du dépôt) | 🔨 Planned | P1 | W4 |
| Rules classifier (catégorie / sévérité via Claude) | 🔨 Planned | P1 | W4 |
| Rules consolidator (fusion doublons, `universalScore`) | 🔨 Planned | P1 | W4 |
| Rules generator (écriture dans `rules/universal/`) | 🔨 Planned | P1 | W4 |
| Rules auditor (gaps, couverture, recommandations) | 🔨 Planned | P1 | W4 |

### 2.3 Starter Kit Import & Distribution (Wave 5)

| Feature | Status | Priorité | Wave |
|---------|--------|----------|------|
| Starter Kit Reader (parse manifeste + checksums SHA-256) | 🔨 Planned | P0 | W5 |
| `init --from-starter-kit` (import & distribution) | 🔨 Planned | P0 | W5 |
| `sync --check` (comparaison template vs dépôt cible) | 🔨 Planned | P0 | W5 |
| `sync --apply` (mise à jour automatique des règles) | 🔨 Planned | P0 | W5 |
| Config extension (6 nouveaux champs `autoclaw.config.ts`) | 🔨 Planned | P0 | W5 |

---

## §3. Architecture

### 3.1 Stack technique

| Composant | Technologie |
|-----------|-------------|
| Runtime | Node.js 20+ / TypeScript strict |
| CLI framework | Commander.js |
| Storage | Supabase PostgreSQL · SQLite (fallback) · Markdown (`FileAdapter`) |
| AI | `@anthropic-ai/sdk` — Claude Haiku (drafts) + Sonnet (validation) |
| Tests | Vitest — 168+ tests |
| Distribution | Package `autoclaw` publié sur npm |

### 3.2 Modules (17+)

| Module | Rôle |
|--------|------|
| `session-analyzer` | Extrait les patterns depuis `git diff` / `git log` |
| `pattern-detector` | Détecte les patterns cross-session (Jaccard similarity) |
| `rule-suggester` | Génère les règles candidates via Claude |
| `rule-applier` | Écrit les règles dans `.claude/`, `.augment/`, `.cursor/` |
| `confidence-scorer` | Calcule le score de confiance et décide l'auto-approve |
| `quality-scorer` | Calcule le score qualité par session |
| `context-injector` | Injecte le contexte dans `session-context.md` |
| `regression-checker` | Vérifie qu'une règle ne réintroduit pas d'anciens patterns |
| `notification-writer` | Écrit les notifications dans `.learnings/` |
| `doc-syncer` | Synchronise `AGENTS.md` / `CLAUDE.md` |
| `linear-syncer` | Lie les commits aux tickets Linear |
| `rules-reader` | Lecture récursive des règles existantes |
| `rules-classifier` | Classifie par catégorie et sévérité |
| `rules-consolidator` | Fusionne les doublons et calcule `universalScore` |
| `rules-generator` | Génère les règles universelles |
| `rules-auditor` | Analyse les gaps et la couverture |
| `starter-kit-reader` | Parse le manifeste du starter kit |
| `starter-kit-syncer` | Synchronise les règles du kit avec le dépôt cible |

### 3.3 Pipeline — 11 étapes

```
1. git log / git diff  →  SessionAnalyzer
2. SessionAnalyzer     →  PatternDetector (cross-session)
3. PatternDetector     →  ConfidenceScorer
4. ConfidenceScorer    →  RuleSuggester (Claude Sonnet)
5. RuleSuggester       →  [auto-approve si score ≥ 0.70 | queue manuelle]
6. Approved rules      →  RegressionChecker
7. RegressionChecker   →  RuleApplier (.claude/ .augment/ .cursor/)
8. RuleApplier         →  QualityScorer
9. QualityScorer       →  ContextInjector (session-context.md)
10. ContextInjector    →  NotificationWriter (.learnings/)
11. NotificationWriter →  DocSyncer + LinearSyncer (optionnel)
```

### 3.4 CLI — 7 commandes

| Commande | Description |
|----------|-------------|
| `autoclaw analyze` | Lance l'analyse de la session courante |
| `autoclaw rules list` | Liste les règles actives avec score |
| `autoclaw rules apply` | Applique les règles en attente |
| `autoclaw audit` | Audit complet des règles (Wave 4) |
| `autoclaw init` | Initialise AutoClaw dans un projet |
| `autoclaw init --from-starter-kit` | Importe un starter kit de règles |
| `autoclaw sync --check / --apply` | Synchronise les règles depuis le template |

---

## §4. Roadmap

| Wave | Contenu principal | Dépendances | Estimation |
|------|-------------------|-------------|------------|
| **W1** | Fondations — scaffold, types, storage adapters, AI client, SimpleQueue | — | 2–3 h |
| **W2** | Modules métier — 11 modules du pipeline complet | W1 | 4–5 h |
| **W3** | CLI (7 commandes) + Tests Vitest (168+) | W2 | 3–4 h |
| **W4** | Rules Audit & Generator (5 modules) | W1 partiel | 2–3 h |
| **W5** | Starter Kit Import & Distribution | W1 partiel | 2–3 h |

---

## §5. Métriques de succès

| Métrique | Cible |
|----------|-------|
| Tests Vitest | ≥ 168, 0 échec |
| Pipeline complet | 11 étapes sans erreur |
| Auto-approve accuracy | ≥ 80 % (règles pertinentes) |
| Distribution starter kit | ≤ 30 secondes |
| Détection règles obsolètes | 100 % par `sync --check` |
| Couverture TypeScript | strict, 0 `any` |

---

## §6. Non-goals (v1)

- UI web / dashboard
- GitHub Actions cron workflow (documenté, non implémenté)
- Publication npm automatisée (manuelle en v1)
- Multi-language (TypeScript uniquement)
- Analyse de code statique (AST) — utilisation de `git diff`/`log` uniquement

---

## §7. Risques

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Coût API Claude élevé | Moyen | `SimpleQueue` avec rate limiting ; Claude Haiku par défaut pour les drafts |
| Faux positifs (patterns incorrects) | Haut | Seuil confidence ≥ 0.7 ; revue manuelle en dessous |
| Conflits lors du sync | Moyen | Préservation des règles custom locales ; flag `--dry-run` disponible |
| Régression après application d'une règle | Haut | `RegressionChecker` avant écriture ; rollback possible |

---

## §8. CHANGELOG

| Date | Version | Changement |
|------|---------|------------|
| 2026-03-19 | 1.0.0 | Création du PRD — Waves 1–5, pipeline complet, starter kit |

