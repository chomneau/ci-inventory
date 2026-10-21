import { Menu, type MenuItemConstructorOptions } from 'electron'

/** Production menu: no reload, no DevTools. Keeps Edit roles so copy/paste shortcuts work. */
export function installProductionMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as const] : []),
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
