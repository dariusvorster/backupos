'use client'

import { useState, useTransition } from 'react'
import { discoverHypervisorTargets } from '@/app/actions/hypervisors'

export function SyncButton({ integrationId }: { integrationId: string }) {
  const [result, setResult]    = useState<{ ok: boolean; count?: number; error?: string } | null>(null)
  const [pending, startSync]   = useTransition()

  function handleSync() {
    setResult(null)
    startSync(async () => {
      const res = await discoverHypervisorTargets(integrationId)
      setResult(res)
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {result && (
        <span style={{
          fontSize: 12,
          color: result.ok ? 'var(--ok)' : 'var(--err)',
        }}>
          {result.ok ? `✓ Found ${result.count} VMs` : `✗ ${result.error}`}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={pending}
        title="Refresh the VM list and each VM's disk topology from the hypervisor. Click after adding, removing, or resizing disks."
        style={{
          padding: '5px 14px', fontSize: 12, cursor: pending ? 'default' : 'pointer',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          background: 'var(--surf2)', color: 'var(--fg)',
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? 'Scanning…' : 'Sync VMs & disks'}
      </button>
    </div>
  )
}
