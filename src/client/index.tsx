/** Browser entry: native sidebar trigger, main-region overlay, and trusted RPC controller. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { DashboardFooterAction, DashboardOverlay } from './Dashboard.tsx'
import { DashboardDataController, DashboardUiController } from './controller.ts'
import { installDashboardStyles } from './styles.ts'

export { DashboardSurface } from './Dashboard.tsx'
export type { DashboardSurfaceProps } from './Dashboard.tsx'
export { DashboardDataController, DashboardUiController } from './controller.ts'
export type { DashboardDataPort, DashboardDataState } from './controller.ts'

/** Browser services required before the trigger and overlay can register. */
export const inject = ['connection', 'sessions', 'slots']

/** Mount both visual surfaces over one visibility store and one RPC projection. */
export function apply(ctx: ClientContext): void {
  // Host and browser Cordis declarations coexist in this package's typecheck.
  // These explicit client-face casts keep the browser entry on the wire API.
  const connection = ctx.connection as unknown as ConnectionHandle
  const sessions = ctx.sessions as unknown as ISessions
  const ui = new DashboardUiController()
  const data = new DashboardDataController(connection.rpc)
  ctx.effect(() => installDashboardStyles(), 'dsh-dashboard: styles')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh-dashboard-entry',
    inject: () => ({ ui }),
  }, DashboardFooterAction))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-dashboard-overlay',
    inject: () => ({
      ui,
      data,
      openSession: (sessionId: string) => {
        sessions.open(sessionId as SessionId)
      },
    }),
  }, DashboardOverlay))
}
