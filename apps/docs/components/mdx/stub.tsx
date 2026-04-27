export function makeStub(componentName: string) {
  return function Stub() {
    return (
      <div style={{
        margin: '20px 0',
        padding: '14px 18px',
        backgroundColor: 'var(--surf2)',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius)',
        fontSize: 13,
        color: 'var(--fg-mute)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-dim)', marginBottom: 4 }}>
          Coming soon
        </div>
        <code style={{ fontSize: 12, color: 'var(--fg)' }}>{componentName}</code>
      </div>
    )
  }
}
