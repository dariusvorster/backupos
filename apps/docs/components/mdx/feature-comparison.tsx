import type { ReactNode } from 'react'
import { featureComparison, type FeatureComparisonRow } from '@backupos/docs-content'

export function FeatureComparison() {
  const { columns, rows } = featureComparison

  function renderCell(value: boolean | string | undefined): ReactNode {
    if (value === true) return <span style={{ color: 'var(--success)' }}>✓</span>
    if (value === false || value === undefined) return <span style={{ color: 'var(--fg-dim)' }}>—</span>
    return <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>{value}</span>
  }

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>Feature</th>
            {columns.map(col => (
              <th key={col.key} style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows as FeatureComparisonRow[]).map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle, var(--border))' }}>
              <td style={{ padding: '10px 12px', color: 'var(--fg)' }}>{row.feature}</td>
              {columns.map(col => (
                <td key={col.key} style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {renderCell(row[col.key] as boolean | string | undefined)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
