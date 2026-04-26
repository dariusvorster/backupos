# BackupOS Phase A & B — Spec Index

Two specs, sequential. Phase B is gated on Phase A being green.

| Spec | File | Effort | Branch |
|---|---|---|---|
| Phase A — Host Agent Stabilization | `Phase-A-Host-Agent-Stabilization.md` | 2-3 days | `fix/phase-a-host-agent-stabilization` |
| Phase B — Container Agent + Compose Source | `Phase-B-Container-Agent.md` | 4-5 days | `feat/phase-b-container-agent` |

---

## Why this order

Phase A fixes the foundation. Eight items, each addressing a concrete bug surfaced during the 2026-04-26 debugging session. Together they make the host agent honest, observable, and recoverable. Without these fixes, every Phase B feature would inherit Phase A's ghosts.

Phase B builds the new feature: a container-deployable agent that does compose-stack-aware backups with per-service quiescence and app-aware hooks. This is the Velero-shaped product for the homelab/SMB segment.

---

## The acceptance gate between them

Phase A is green when:

- 5 successful filesystem backup-and-restore cycles in a row on Dockee01 (back up `/etc`, restore to a temp dir, byte-for-byte match)
- 3 failure-mode tests pass:
  - Agent stopped → Run now → marked failed within 10s with `agent_not_connected`
  - Mid-backup Stop click → restic killed, run cancelled within 15s
  - Agent process killed mid-backup → heartbeat-absence sweep marks failed within 65s

If any of these fail, fix in Phase A. Don't start Phase B.

---

## How to feed these to Claude Code

Each spec is self-contained. Recommended prompt:

> "Implement this spec in the BackupOS repo. Read it fully before writing any code. The architecture and decisions in the spec are locked — do not propose alternatives. If anything is ambiguous about the existing codebase, ask before writing code rather than guessing. After each numbered Item in the spec, stop and confirm with me before moving to the next."
>
> Then paste the spec contents.

One spec per Claude Code session. Don't mix.

For Phase A specifically: insist on the Implementation Order at the bottom. Items 1, 8, 2, 3 are critical-path; the others can be reordered if it makes sense. The "after item 3, manually click Run now and verify" gate is non-negotiable.

For Phase B: insist on shipping with quiescence='none' only first (after Item 6), before adding app-hooks. That's the smallest end-to-end slice and proves the architecture before adding complexity.

---

## What's NOT in either spec

Both specs explicitly defer:

- Filesystem-snapshot acceleration (btrfs/ZFS) — V2 optimization
- Storage-driver snapshots (Ceph, TrueNAS) — V2
- Mongo app-hook — V2
- `EXEC=1`-gated in-container hooks — V2
- Cross-host stack backup — V2
- Kubernetes — separate product
- BackupOS Cloud (Solo $9/mo, Teams $29/mo) — separate deployment+billing concern
- Infra OS V3 adapter — separate piece of work after Phase B stable
- Auto-migration of legacy `docker_volume` jobs — manual only

Resist adding any of these to the in-flight specs. Discipline is what gets us to a shipped product instead of a half-finished refactor.

---

## After Phase B

Phase C is the polish layer that makes this feel like a real product:

- Auto-discover stacks on connected agents and surface them in the dashboard
- Stack-level "back up everything on this host" wizard with sensible defaults
- Visual diff between two snapshots of the same stack
- Restore-test scheduling (V2 in skill notes)
- Storage-cost dashboard with backend recommendations (already specced in skill notes)

That's a separate planning conversation, not a spec to write tonight.
