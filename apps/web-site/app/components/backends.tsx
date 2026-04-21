const backends = [
  { name: 'Local filesystem', note: 'path:/backup'     },
  { name: 'SFTP / SSH',       note: 'sftp:user@host'   },
  { name: 'Amazon S3',        note: 's3:s3.amazonaws…' },
  { name: 'Backblaze B2',     note: 'b2:bucket'        },
  { name: 'Wasabi',           note: 's3-compatible'    },
  { name: 'Cloudflare R2',    note: 's3-compatible'    },
  { name: 'Azure Blob',       note: 'azure:container'  },
  { name: 'Google Cloud',     note: 'gs:bucket'        },
  { name: 'rclone',           note: 'any rclone remote'},
]

export function Backends() {
  return (
    <section id="backends" style={{ padding: '80px 0' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Any backend Restic supports
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 48 }}>
          Configure the repository URL in BackupOS — the rest is Restic.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {backends.map(b => (
            <div key={b.name} style={{
              background: 'var(--surf)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '10px 18px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 130,
            }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>{b.name}</span>
              <span style={{ fontSize: 11, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>{b.note}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
