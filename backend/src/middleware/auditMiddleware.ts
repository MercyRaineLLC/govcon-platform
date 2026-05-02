// =============================================================
// Audit Middleware — global capture of mutating actions on /api/*.
//
// Mounted before route handlers so the response-finish listener
// is registered early, but the actual audit write happens AFTER
// the response is flushed. By that point per-route auth has
// populated req.user (or hasn't, in which case we skip).
//
// This is a thin safety-net: critical actions (login, signup,
// agreement acceptance, AI inferences, decision overrides) call
// `logAudit` directly with richer detail. The middleware catches
// the everything-else mutating traffic with method-level granularity.
// =============================================================
import { Response, NextFunction } from 'express'
import { logAudit, AuditAction } from '../services/auditService'
import { AuthenticatedRequest } from '../types'

const SKIP_PATH_PREFIXES = [
  '/api/auth',          // auth.ts emits explicit logAudit calls with rationale
  '/api/far/clauses',   // read-only catalog
  '/api/jobs',          // poll-heavy
  '/api/analytics',     // read-only by convention
]

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

function shouldSkip(path: string): boolean {
  return SKIP_PATH_PREFIXES.some((p) => path.startsWith(p))
}

function inferEntityType(path: string): string {
  // /api/opportunities/abc123 → "Opportunity"
  const m = path.match(/^\/api\/([\w-]+)/)
  if (!m) return 'Unknown'
  const seg = m[1]
  // dash-case → PascalCase → strip trailing 's'
  const pascal = seg.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  return pascal.endsWith('s') ? pascal.slice(0, -1) : pascal
}

function looksLikeId(s: string): boolean {
  // cuid (~25 chars), cuid2, or uuid (36 chars w/ dashes)
  return /^[a-z0-9]{20,30}$/i.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function inferEntityId(path: string): string | null {
  const segs = path.split('/').filter(Boolean)
  for (let i = segs.length - 1; i >= 0; i--) {
    if (looksLikeId(segs[i])) return segs[i]
  }
  return null
}

function methodToAction(method: string): AuditAction {
  if (method === 'DELETE') return 'DELETE'
  if (method === 'POST') return 'CREATE'
  return 'UPDATE'
}

export function auditMutations(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method) || shouldSkip(req.path)) {
    return next()
  }

  res.on('finish', () => {
    // Skip failed mutations — they didn't change state.
    if (res.statusCode >= 400) return
    // Unauthenticated mutation (rare; usually rejected by route auth before reaching here)
    if (!req.user) return

    void logAudit({
      consultingFirmId: req.user.consultingFirmId,
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: methodToAction(req.method),
      entityType: inferEntityType(req.path),
      entityId: inferEntityId(req.path),
      sourceIp: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    })
  })

  next()
}
