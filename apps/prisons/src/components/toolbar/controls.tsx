import { DesktopControls } from '@pleadli/shell'
import { m } from '@/paraglide/messages'

/** The window buttons on the screens that come before the workspace, in Prisons' words. */
export const Controls = ({ className }: { className?: string }) => (
  <DesktopControls className={className} labels={{ group: 'Window controls', close: m.ui_close(), minimize: m.ui_minimize(), maximize: m.ui_maximize() }} />
)
