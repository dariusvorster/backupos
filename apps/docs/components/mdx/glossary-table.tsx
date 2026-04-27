import { glossary } from '@backupos/docs-content'

export function GlossaryTable() {
  return (
    <dl style={{ margin: '20px 0' }}>
      {glossary.terms.map(({ term, definition }) => (
        <div key={term} style={{
          padding: '12px 0',
          borderBottom: '1px solid var(--border-subtle, var(--border))',
          display: 'grid',
          gridTemplateColumns: 'minmax(140px, 200px) 1fr',
          gap: 16,
        }}>
          <dt style={{ fontWeight: 600, color: 'var(--fg)', fontSize: 14 }}>{term}</dt>
          <dd style={{ margin: 0, color: 'var(--fg-mute)', fontSize: 14, lineHeight: 1.6 }}>{definition}</dd>
        </div>
      ))}
    </dl>
  )
}
