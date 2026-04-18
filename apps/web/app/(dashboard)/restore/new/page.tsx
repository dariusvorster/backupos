const EXAMPLE_YAML = `name: my-service-full
description: Full restore of my-service
version: "1.0"
repository: homelab-r2

steps:
  - name: Restore database
    type: database_restore
    app: postgres
    snapshot_path: /tmp/backupos-pg-myservice.sql.gz
    target:
      container: myservice-db
      database: myservice
      username: myservice
    on_failure: abort

  - name: Restore data volume
    type: filesystem_restore
    snapshot_path: /data/myservice
    target_path: /data/myservice
    on_failure: abort

  - name: Restart service
    type: shell
    command: docker compose -f /opt/myservice/docker-compose.yml up -d
    on_failure: abort

  - name: Health check
    type: http_check
    url: http://localhost:8080/health
    expected_status: 200
    timeout_seconds: 30
    retry_count: 5
    on_failure: notify_only`

import { Button } from '@/components/ui/button'

export default function NewRestoreSpecPage() {
  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>New restore spec</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>
        Define your restore procedure as YAML. This file lives in your repo and can be tested on demand.
      </p>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
            Name
          </label>
          <input
            type="text"
            placeholder="my-service-full"
            style={{
              width: '100%', padding: '8px 12px',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
            YAML spec
          </label>
          <textarea
            defaultValue={EXAMPLE_YAML}
            rows={28}
            style={{
              width: '100%', padding: '12px',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 12,
              fontFamily: 'var(--font-mono)', lineHeight: 1.6, outline: 'none',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="secondary" size="md">Validate</Button>
          <Button variant="primary" size="md">Save spec</Button>
        </div>
      </div>
    </div>
  )
}
