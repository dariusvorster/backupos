import { getDb, oidcConfig, eq } from '@backupos/db'
import { encryptField, decryptField } from './repo-crypto'

export interface OidcConfigDecrypted {
  id:            'singleton'
  enabled:       boolean
  providerLabel: string
  discoveryUrl:  string
  clientId:      string
  clientSecret:  string
  scopes:        string
  buttonLabel:   string
  createdAt:     Date
  updatedAt:     Date
}

export interface OidcConfigPublic {
  enabled:       boolean
  providerLabel: string
  discoveryUrl:  string
  clientId:      string
  scopes:        string
  buttonLabel:   string
}

export function getOidcConfigDecrypted(): OidcConfigDecrypted | null {
  const db = getDb()
  const row = db.select().from(oidcConfig).where(eq(oidcConfig.id, 'singleton')).limit(1).get()
  if (!row) return null
  return {
    id:            'singleton',
    enabled:       row.enabled,
    providerLabel: row.providerLabel,
    discoveryUrl:  row.discoveryUrl,
    clientId:      row.clientId,
    clientSecret:  decryptField(row.clientSecretEnc),
    scopes:        row.scopes,
    buttonLabel:   row.buttonLabel,
    createdAt:     row.createdAt,
    updatedAt:     row.updatedAt,
  }
}

export function getOidcConfigPublic(): OidcConfigPublic | null {
  const db = getDb()
  const row = db.select().from(oidcConfig).where(eq(oidcConfig.id, 'singleton')).limit(1).get()
  if (!row) return null
  return {
    enabled:       row.enabled,
    providerLabel: row.providerLabel,
    discoveryUrl:  row.discoveryUrl,
    clientId:      row.clientId,
    scopes:        row.scopes,
    buttonLabel:   row.buttonLabel,
  }
}

export function isSsoEnabled(): boolean {
  const cfg = getOidcConfigPublic()
  return !!cfg?.enabled
}

export function upsertOidcConfig(input: {
  enabled:       boolean
  providerLabel: string
  discoveryUrl:  string
  clientId:      string
  clientSecret?: string
  scopes:        string
  buttonLabel:   string
}): void {
  const db  = getDb()
  const now = new Date()

  const existing = db.select().from(oidcConfig).where(eq(oidcConfig.id, 'singleton')).limit(1).get()

  const clientSecretEnc = input.clientSecret
    ? encryptField(input.clientSecret)
    : (existing?.clientSecretEnc ?? '')

  if (!clientSecretEnc) throw new Error('Client secret required on first save')

  if (existing) {
    db.update(oidcConfig).set({
      enabled:         input.enabled,
      providerLabel:   input.providerLabel,
      discoveryUrl:    input.discoveryUrl,
      clientId:        input.clientId,
      clientSecretEnc,
      scopes:          input.scopes,
      buttonLabel:     input.buttonLabel,
      updatedAt:       now,
    }).where(eq(oidcConfig.id, 'singleton')).run()
  } else {
    db.insert(oidcConfig).values({
      id:             'singleton',
      enabled:        input.enabled,
      providerLabel:  input.providerLabel,
      discoveryUrl:   input.discoveryUrl,
      clientId:       input.clientId,
      clientSecretEnc,
      scopes:         input.scopes,
      buttonLabel:    input.buttonLabel,
      createdAt:      now,
      updatedAt:      now,
    }).run()
  }
}

export function disableOidc(): void {
  const db = getDb()
  db.update(oidcConfig)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(oidcConfig.id, 'singleton'))
    .run()
}
