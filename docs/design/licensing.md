# BackupOS Licensing Model

**Status**: Design  
**Date**: 2026-04-29  
**Author**: Darius Vorster  
**Context**: Pre-launch design; no implementation yet

---

## Goal

Define how BackupOS distinguishes free vs paid customers, generates and validates license keys, and gates features by tier. Self-hosted product — no internet phone-home requirement.

## Non-goals (V1)

- Online license validation / phone-home
- Per-user seat licensing (license is per-instance, not per-user)
- License sharing or multi-instance licensing
- Trial licenses with expiration (covered by Pro tier with short expiration)
- Free-tier registration / account creation in BackupOS itself (Free is unlicensed)
- License analytics / usage telemetry phoning home

## Tiers

Two tiers. Keep simple.

### Free (Homelab)

No license key required. BackupOS works out of the box with these limits:

- Max 3 agents connected concurrently
- Max 1 admin user (no role management UI; everyone is admin)
- Max 5 repositories
- Single alert channel
- 30-day audit log retention (configurable down, not up)
- No SSO
- No API tokens for human users (existing apiTokens table)
- No integration tokens (no InfraOS federation, no /api/v1/integration/*)
- Verification engine: yes
- Backup scheduling: yes
- All restore features: yes
- Email support only (community Discord)

### Pro (Small team / SMB)

Requires valid license key. All Free features plus:

- Unlimited agents
- Unlimited users with full RBAC (admin / viewer)
- Unlimited repositories
- Multiple alert channels
- Configurable audit log retention (up to 7 years)
- OIDC SSO (Authentik, Okta, Duo)
- API tokens for human users
- Integration tokens (InfraOS federation, /api/v1/integration/*)
- Priority email support

Pricing: $TBD/year (set with Lemon Squeezy). Single-instance license.

## Architecture

Three systems:

1. **License issuer** (homelabos.app account portal — separate codebase from BackupOS)
   - Holds the signing **private key** (RSA-2048 or Ed25519)
   - Generates signed JWT licenses on purchase
   - Stores license records in a database (license_id, customer_email, lemon_order_id, expires_at, revoked_at)
   - Webhook receiver for Lemon Squeezy purchase events
   - Customer-facing dashboard: list licenses, regenerate, copy
   - Sends license emails on purchase

2. **Lemon Squeezy** (storefront)
   - Existing: homelabos.lemonsqueezy.com
   - Configure webhook to license issuer on `order_created` event
   - Pass customer email and order metadata in webhook

3. **BackupOS install** (customer's server)
   - Holds the validation **public key** embedded in the binary/source
   - Validates JWT licenses offline
   - Stores active license in DB (singleton `license` table)
   - Reads license on startup and on every server-action/API call (cached for performance)
   - Gates features per tier

## License JWT structure

Standard JWT with these claims:

```json
{
  "iss": "homelabos.app",
  "sub": "license:<uuid>",
  "iat": 1745000000,
  "exp": 1776536000,
  "aud": "backupos",
  "tier": "pro",
  "customer_email": "user@example.com",
  "order_id": "lemon_order_abc123",
  "instance_id": null,
  "features": {
    "max_agents": -1,
    "max_users": -1,
    "max_repositories": -1,
    "sso": true,
    "integration_tokens": true,
    "audit_retention_days": 2555
  }
}
```

Signed with RS256 or EdDSA. Public key embedded in BackupOS source at `apps/web/lib/license-public-key.ts` (constant string).

`-1` means "unlimited". `instance_id` is reserved for V2 (instance-locked licenses).

## License storage on the customer's BackupOS instance

New singleton table:

```sql
CREATE TABLE license (
  id            text PRIMARY KEY DEFAULT 'singleton',
  jwt           text NOT NULL,
  applied_at    integer NOT NULL,
  applied_by    text REFERENCES user(id),
  cached_claims text NOT NULL  -- JSON, parsed once on apply for fast reads
);
```

Two ways to apply the license:

- **DB (preferred)**: admin pastes the JWT in `/settings/license` UI. BackupOS validates signature, parses claims, persists.
- **Env var (fallback)**: `LICENSE_JWT=<jwt>` in `/etc/backupos/server.env`. Used on first boot if no DB row exists. DB takes precedence if both are set.

## Validation logic

```
function validateLicense(jwt: string): License | null {
  Verify signature against embedded public key
  Verify exp claim — return null if expired
  Verify aud === 'backupos' — return null if not
  Parse and return claims
}

function getActiveLicense(): License | null {
  Read from DB singleton (cached for 60s)
  If DB empty, read from LICENSE_JWT env var
  Validate
  Return parsed claims, or null if invalid/expired/missing
}

function getTier(): 'free' | 'pro' {
  License = getActiveLicense()
  If null → 'free'
  If valid → license.tier
}
```

## Feature gating implementation

A new helper module `apps/web/lib/license.ts`:

```typescript
export async function requireProTier(): Promise<void> {
  const tier = await getTier()
  if (tier !== 'pro') throw new Error('This feature requires a Pro license')
}

export async function checkLimit(
  resource: 'agents' | 'users' | 'repositories',
  currentCount: number,
): Promise<{ allowed: boolean; limit: number; reason?: string }> {
  const license = await getActiveLicense()
  const tier = license?.tier ?? 'free'
  
  const limits = tier === 'pro'
    ? { agents: -1, users: -1, repositories: -1 }
    : { agents: 3, users: 1, repositories: 5 }
  
  const limit = limits[resource]
  if (limit === -1) return { allowed: true, limit: -1 }
  if (currentCount >= limit) {
    return { allowed: false, limit, reason: `Free tier limited to ${limit} ${resource}` }
  }
  return { allowed: true, limit }
}
```

Usage examples:

- `enrollAgent()` server action: call `checkLimit('agents', existingCount)` before insert. Return error if exceeded.
- `createUserDirect()`: same pattern with users.
- `createRepository()`: same with repositories.
- SSO config page: `requireProTier()` at top of action; redirect to /settings/license with upgrade message if Free.
- Integration token creation: `requireProTier()` (already covered via RBAC, but additional gate).

## UI surface

### `/settings/license` page

Admin only. Shows:

- **Current tier** (Free / Pro) with badge
- **License details** (if applied): customer email, expiration, features summary
- **Apply / change license** form: textarea for JWT paste + Apply button
- **Remove license** button (downgrades to Free)
- **Upgrade to Pro** link (goes to homelabos.lemonsqueezy.com)

### Settings landing nav

Add "License" entry in the Backup defaults (or new "Subscription" section) of `/settings/page.tsx`.

### Free tier badge in header

Small "Free" pill near the user avatar in the topbar. Clicking goes to `/settings/license` with a friendly upgrade prompt.

### Limit-reached UX

When a Free user hits a limit (e.g. trying to add 4th agent):

- Server action returns clear error: "Free tier is limited to 3 agents. Upgrade to Pro for unlimited agents."
- UI shows error inline AND links to `/settings/license`

## Public key management

The validation public key is embedded in BackupOS source. This means:

- **Pre-launch**: generate the keypair (private + public). Public goes into `apps/web/lib/license-public-key.ts` as a string constant. Private goes into the license issuer service (homelabos.app account portal — never touches BackupOS).
- **Key rotation**: if the private key is compromised, every existing BackupOS install needs to be updated with a new public key. This is a major event. Mitigations: store private key in a hardware HSM if possible, restrict access tightly.
- **Key versioning**: support multiple public keys (current + previous) so license JWTs signed with the old key still validate during a transition period. Implement as an array of public keys in the embedded constant; try each until one validates.

## License-by-email flow

1. Customer purchases on homelabos.lemonsqueezy.com
2. Lemon Squeezy fires `order_created` webhook to license issuer service
3. Issuer service:
   - Generates UUID for license_id
   - Builds JWT with claims (tier=pro, exp=now+1year, customer_email from webhook)
   - Signs with private key
   - Persists license record to issuer DB
   - Sends email to customer with the JWT and instructions ("paste this in /settings/license")
4. Customer logs in to homelabos.app account portal — license also visible there for self-serve recovery
5. Customer pastes JWT into their BackupOS instance at `/settings/license`

## Customer account portal (homelabos.app)

**Out of scope for this design doc** — covered in a separate design later. Brief outline:

- New web app at homelabos.app/account (could be Next.js, separate repo)
- Better-auth for auth
- Integrates with Lemon Squeezy via webhooks
- Stores license records, reissues, sends emails
- Customer self-service: log in, see all licenses across all Homelab OS products, copy keys, regenerate

This is the long-term answer to "what if customer loses email." For pre-launch V1, email-only delivery is acceptable; the account portal can ship as V1.1.

## Implementation rollout

Three phases, roughly in order:

### Phase 1: BackupOS license validation + storage
- Schema migration for `license` table
- License helper module: validate, getTier, checkLimit, requireProTier
- Public key embedded as constant
- /settings/license UI with paste form, current state display, remove
- Apply gating to: enrollAgent, createUserDirect, createRepository, SSO config, integration_tokens

### Phase 2: License issuer service (separate codebase, homelabos.app)
- New repo, Next.js app
- Better-auth for customer accounts
- Lemon Squeezy webhook receiver
- License generation (signs JWT)
- Email delivery via SMTP (transactional)
- Customer license dashboard

### Phase 3: BackupOS feature parity for Pro
- Audit log retention configurable
- Multiple alert channels
- (Most Pro features already exist code-wise; just need to be gated)

## Decision log

- **Two tiers, not three**: simpler product story, less code. Enterprise wants can be discussed individually.
- **Offline JWT, not phone-home**: customers running airgapped/private networks won't accept phone-home. Industry norm for this market.
- **Email + account portal both**: email for immediate delivery, portal for recovery. Industry norm.
- **Per-instance license, not per-user**: simpler licensing model. SMB customers find per-seat licensing painful.
- **Public key embedded in source**: simplest to deploy; updating requires version bump but that's acceptable.
- **Tier in JWT claim, not feature flags**: tier is the single source of truth; features are derived from tier locally. Simpler than per-feature toggles.

## Out of scope explicitly

- Per-feature license toggles (`{ "sso": true, "audit": false }` separately licensed) — too complex for SMB market
- Trial keys with custom expiration — handled by Pro tier with short exp
- Floating licenses (license server)
- Concurrent-user limits (we license per-instance, not per-seat)
- Phone-home telemetry
- License revocation by ID (would require online lookup; offline can only revoke by changing the public key, which is a major event)
