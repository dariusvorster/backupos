import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@backupos/api'

export function getTRPCClient(baseUrl: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({ url: `${baseUrl}/api/trpc` }),
    ],
  })
}
