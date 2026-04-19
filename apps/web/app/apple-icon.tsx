import { ImageResponse } from 'next/og'

export const size        = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  const f = 180 / 48
  const r = (v: number) => Math.round(v * f)
  return new ImageResponse(
    <div style={{
      width: 180, height: 180, background: '#1A1206',
      borderRadius: r(16), display: 'flex', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', left: r(6),  top: r(6),  width: r(16), height: r(16), background: '#F5A623', borderRadius: r(2) }} />
      <div style={{ position: 'absolute', left: r(26), top: r(6),  width: r(16), height: r(16), background: '#854F0B', borderRadius: r(2) }} />
      <div style={{ position: 'absolute', left: r(6),  top: r(26), width: r(16), height: r(16), background: '#854F0B', borderRadius: r(2) }} />
      <div style={{ position: 'absolute', left: r(26), top: r(26), width: r(16), height: r(16), background: '#C77A14', borderRadius: r(2) }} />
      <div style={{ position: 'absolute', left: r(18), top: r(18), width: r(12), height: r(12), background: '#FEF5E0', borderRadius: r(2) }} />
    </div>,
    { ...size }
  )
}
