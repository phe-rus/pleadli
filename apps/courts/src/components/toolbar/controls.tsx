import { DesktopControls } from '@pleadli/shell'
import * as m from '@/paraglide/messages'

/** The window buttons on the screens that come before the workspace, . */
export const Controls = ({ className }: { className?: string }) => (
  <DesktopControls className={className} labels={{ group: m["window.controls"](), close: m["window.close"](), minimize: m["window.minimize"](), maximize: m["window.maximize"]() }} />
)
