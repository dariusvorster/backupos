export default function DashboardLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        height: 32, width: 200, borderRadius: 'var(--radius-sm)',
        background: 'var(--border)', animation: 'pulse 1.5s ease-in-out infinite',
      }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 80, borderRadius: 'var(--radius)',
            background: 'var(--border)', animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 100}ms`,
          }} />
        ))}
      </div>
      <div style={{
        height: 240, borderRadius: 'var(--radius)',
        background: 'var(--border)', animation: 'pulse 1.5s ease-in-out infinite',
        animationDelay: '200ms',
      }} />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
