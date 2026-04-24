# Docs Index

Agent-facing map of `docs/`. Start here to pick the right file.

## Top-level living specs
These are the current sources of truth. Update these when behaviour changes.

| File | What it covers |
|------|----------------|
| [`01-prd.md`](01-prd.md) | Consolidated PRD v1.0. Non-negotiable rules, data model, feature list, phasing. |
| [`02-implementation-plan.md`](02-implementation-plan.md) | Milestone-by-milestone build plan (M1–M9). |
| [`03-runbook.md`](03-runbook.md) | Operational runbook for the first event (deploy, day-of, recovery). |

## Plans
Forward-looking specs that drive future work. Each plan is dated and scoped.

- [`plans/`](plans/) — active and historical multi-task implementation plans. Latest: [`plans/2026-04-24-mvp-hardening-phase-1.md`](plans/2026-04-24-mvp-hardening-phase-1.md).

## Progress
Frozen-in-time progress reports. Historical artefacts — don't edit after the fact.

| Folder | Contents |
|--------|----------|
| [`progress/milestones/`](progress/milestones/) | `m1-progress.md` through `m9-progress.md` — original MVP build milestones. |
| [`progress/mvp-hardening/`](progress/mvp-hardening/) | `phase-1-progress.md` through `phase-5-progress.md` — post-MVP hardening sprint (see matching plan in `plans/`). |

## Reviews
Code-review and accessibility-audit artefacts. Reviews are frozen once produced; follow-up work is tracked in `plans/` or `progress/`.

| Folder | Contents |
|--------|----------|
| [`reviews/code/`](reviews/code/) | `2026-04-24-merged.md` (authoritative merged review), with raw agent inputs in `2026-04-24-inputs/` (`kimi.md`, `glm.md`, `claude.md`, `codex.md`). |
| [`reviews/a11y/`](reviews/a11y/) | `2026-04-24-wcag-aa-audit.md` (WCAG 2.2 AA audit) + `2026-04-24-implementation-report.md` (fixes shipped). |

## Conventions

- **File-naming:** `YYYY-MM-DD-<slug>.md` for dated artefacts (plans, reviews). Milestone/phase files keep their sequence prefix (`m1-progress.md`, `phase-1-progress.md`).
- **Frozen vs living:** top-level specs + `plans/*.md` are living (edit in place); everything under `progress/` and `reviews/` is frozen after initial creation. Create new dated artefacts rather than rewriting old ones.
- **Cross-references:** internal links use relative paths. If you move a file, fix the links at move time.
- **For AI agents:** when a user asks about "the code review", default to `reviews/code/2026-04-24-merged.md` (the authoritative merged version), not the raw inputs. When they ask about "the hardening plan", default to `plans/2026-04-24-mvp-hardening-phase-1.md`.
