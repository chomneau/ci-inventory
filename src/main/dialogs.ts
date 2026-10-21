import { app, BrowserWindow, dialog, type WebContents } from 'electron'

/*
 * Native file dialogs, with one dev-only seam: automated UI tests cannot click
 * through OS dialogs, so an unpackaged build may take paths from environment
 * variables. Packaged builds always show the real dialog.
 */
const testSeam = (name: string): string | undefined => (app.isPackaged ? undefined : process.env[name] || undefined)

export async function chooseSavePath(sender: WebContents, options: Electron.SaveDialogOptions): Promise<string | null> {
  const seam = testSeam('CI_INV_TEST_SAVE_PATH')
  if (seam) return seam
  const win = BrowserWindow.fromWebContents(sender)
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  return result.canceled || !result.filePath ? null : result.filePath
}

export async function chooseOpenPath(sender: WebContents, options: Electron.OpenDialogOptions): Promise<string | null> {
  const seam = testSeam('CI_INV_TEST_OPEN_PATH')
  if (seam) return seam
  const win = BrowserWindow.fromWebContents(sender)
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}
