import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

const ALLOWED = new Set([
  'backupos-agent-windows-x64.exe',
  'bundle.js',
])

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ binary: string }> },
) {
  const { binary } = await params

  if (!ALLOWED.has(binary)) {
    return new Response('Not found', { status: 404 })
  }

  const base = process.env['AGENT_DOWNLOAD_BASE_URL']
  if (base) {
    return NextResponse.redirect(`${base.replace(/\/$/, '')}/${binary}`)
  }

  // Fall back to public/agent/ (populated at deploy time from CI artifacts)
  try {
    const data = await readFile(join(process.cwd(), 'public', 'agent', binary))
    const contentType = binary.endsWith('.js') ? 'application/javascript' : 'application/octet-stream'
    return new Response(data, {
      headers: { 'Content-Type': contentType },
    })
  } catch {
    return new Response(
      'Agent binary not available. Deploy with binaries in public/agent/ or set AGENT_DOWNLOAD_BASE_URL.',
      { status: 404 },
    )
  }
}
