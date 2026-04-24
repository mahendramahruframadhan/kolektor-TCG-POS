# ADR-0002: 30-day rolling session cookie

**Status:** Accepted · 2026-04-24

## Context

Cashiers log in once and use the PWA for the duration of a convention (1–3 days) and beyond. Re-auth every day is hostile at a booth where phones are shared and fingers are busy. On the other hand, an infinite session lets a stolen device stay logged in forever.

## Decision

- Session cookie TTL: **30 days, rolling.** Every authenticated request extends the expiry.
- `httpOnly: true`, `sameSite: strict`, `secure: true` in production.
- Session secret is `SESSION_SECRET` env (min 32 chars) validated at boot.
- Logout clears the cookie server-side.

## Consequences

- A logged-in operator stays logged in across a multi-day event without re-auth.
- A device left dormant for > 30 days requires fresh login — acceptable.
- Compromised cookie is valid for up to 30 days; mitigated by `sameSite: strict`, rate-limited login (for reversing the theft), and a small 11-user blast radius.

## Alternatives considered

- **24-hour session** — rejected; cashiers would re-auth mid-event.
- **Refresh-token rotation (access + refresh)** — rejected; complexity not justified for a closed group.
- **JWT** — rejected; revocation requires a denylist anyway, and we're single-server so sticky server-side sessions are simpler.
