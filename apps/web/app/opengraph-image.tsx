import { ImageResponse } from 'next/og'

export const size        = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt         = 'BackupOS — Unified homelab backup management'

export default function OgImage() {
  const f = 120 / 48
  const r = (v: number) => Math.round(v * f)
  return new ImageResponse(
    <div style={{
      width: 1200, height: 630,
      background: '#0A0A0A',
      display: 'flex', flexDirection: 'column',
      padding: 80, position: 'relative',
    }}>
      {/* Amber gradient top-left */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: 600, height: 400,
        background: 'radial-gradient(ellipse at 0% 0%, rgba(245,166,35,0.15) 0%, transparent 70%)',
      }} />

      {/* Grid Shield mark 120×120 */}
      <div style={{
        width: 120, height: 120, background: '#1A1206',
        borderRadius: r(16), display: 'flex', position: 'relative',
        marginBottom: 48, flexShrink: 0,
      }}>
        <div style={{ position: 'absolute', left: r(6),  top: r(6),  width: r(16), height: r(16), background: '#F5A623', borderRadius: r(2) }} />
        <div style={{ position: 'absolute', left: r(26), top: r(6),  width: r(16), height: r(16), background: '#854F0B', borderRadius: r(2) }} />
        <div style={{ position: 'absolute', left: r(6),  top: r(26), width: r(16), height: r(16), background: '#854F0B', borderRadius: r(2) }} />
        <div style={{ position: 'absolute', left: r(26), top: r(26), width: r(16), height: r(16), background: '#C77A14', borderRadius: r(2) }} />
        <div style={{ position: 'absolute', left: r(18), top: r(18), width: r(12), height: r(12), background: '#FEF5E0', borderRadius: r(2) }} />
      </div>

      {/* Tagline */}
      <div style={{ fontSize: 48, fontWeight: 500, color: '#F5F5F5', lineHeight: 1.2, marginBottom: 20 }}>
        Backups that don&apos;t lie to you.
      </div>
      <div style={{ fontSize: 20, fontWeight: 400, color: '#888888', marginBottom: 'auto' }}>
        Unified homelab backup management.
      </div>

      {/* URL bottom-right */}
      <div style={{
        position: 'absolute', right: 80, bottom: 48,
        fontSize: 14, color: '#555555', fontFamily: 'monospace',
      }}>
        backupos.app
      </div>
    </div>,
    { ...size }
  )
}
