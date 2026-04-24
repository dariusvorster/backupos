import { NextResponse } from 'next/server'
import { requestDetect } from '@/lib/ws-state'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const resources = await requestDetect(id)
    return NextResponse.json(resources)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Detection failed'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
