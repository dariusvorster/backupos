export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}.sk{background:var(--border);border-radius:var(--radius-sm);animation:pulse 1.5s ease-in-out infinite}`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="sk" style={{ height: 24, width: 120 }} />
        <div className="sk" style={{ height: 32, width: 100 }} />
      </div>
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 16, alignItems: "center" }}>
            <div className="sk" style={{ height: 14, width: 160, animationDelay: `${i*60}ms` }} />
            <div className="sk" style={{ height: 14, width: 80, animationDelay: `${i*60+30}ms` }} />
            <div className="sk" style={{ height: 14, width: 100, marginLeft: "auto", animationDelay: `${i*60+60}ms` }} />
          </div>
        ))}
      </div>
    </div>
  )
}
