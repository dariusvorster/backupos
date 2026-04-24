export default function SettingsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .sk { background:var(--border); border-radius:var(--radius-sm); animation:pulse 1.5s ease-in-out infinite; }
      `}</style>
      <div className="sk" style={{ height: 24, width: 160 }} />
      <div style={{
        background: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24,
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {[180, 240, 140, 200].map((w, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="sk" style={{ height: 12, width: 100, animationDelay: `${i * 80}ms` }} />
            <div className="sk" style={{ height: 36, width: '100%', animationDelay: `${i * 80 + 40}ms` }} />
          </div>
        ))}
        <div className="sk" style={{ height: 36, width: 120, marginTop: 8 }} />
      </div>
    </div>
  )
}
