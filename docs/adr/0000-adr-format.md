# ADR-0000: ADR format

**Status:** Accepted · 2026-04-24

## Context

We need a lightweight, file-based record of architectural decisions so future contributors (and AI agents) can answer "why did we do it this way?" without spelunking Git history. Most of the decisions worth recording already landed during MVP build and hardening; we're backfilling them now.

## Decision

- One ADR per decision. One file per ADR, numbered `NNNN-kebab-slug.md`, never renumbered.
- Required sections: **Status** (Proposed / Accepted / Superseded), **Context**, **Decision**, **Consequences**.
- Optional: **Alternatives considered**, **Revisited**.
- Supersession is recorded in both directions: the new ADR references the old one; the old one's Status line flips to `Superseded by ADR-NNNN` but the file stays.
- No `docs/adr/README.md` index — `ls docs/adr/` + clear filenames is enough at this scale.

## Consequences

- Cheap to write, zero tooling.
- Hard to "archive" outdated entries by design — old decisions stay visible as historical context.
- If the ADR log grows past ~50 entries we'll reconsider indexing.
