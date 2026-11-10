const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('lang', 'pt-BR');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch { /* sem atualizador fora do app instalado */ }
let updateReady = false;

let win = null;
let dataPath = null;
let lastWritten = null;

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return {}; } }
function writeCfg(c) { try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch {} }

function setPath(p) {
  if (dataPath) fs.unwatchFile(dataPath);
  dataPath = p;
  lastWritten = null;
  if (!p) return;
  if (!process.env.CASA_DATA) writeCfg({ ...readCfg(), dataPath: p });
  // Avisa a janela quando o arquivo muda por fora (o outro computador sincronizou).
  fs.watchFile(p, { interval: 2500 }, () => {
    let cur = null;
    try { cur = fs.readFileSync(p, 'utf8'); } catch { return; }
    if (cur !== lastWritten && win && !win.isDestroyed()) win.webContents.send('data:changed');
  });
}

ipcMain.handle('data:status', () => ({ path: dataPath }));

ipcMain.handle('data:pick', async (_e, mode) => {
  const filters = [{ name: 'Casa em Dia', extensions: ['json'] }];
  if (mode === 'new') {
    const r = await dialog.showSaveDialog(win, { title: 'Onde guardar os dados de vocês', defaultPath: path.join(app.getPath('documents'), 'casa-em-dia.json'), filters });
    if (r.canceled || !r.filePath) return { path: dataPath, canceled: true };
    if (!fs.existsSync(r.filePath)) fs.writeFileSync(r.filePath, '{}');
    setPath(r.filePath);
  } else {
    const r = await dialog.showOpenDialog(win, { title: 'Abrir o arquivo de dados', properties: ['openFile'], filters });
    if (r.canceled || !r.filePaths[0]) return { path: dataPath, canceled: true };
    setPath(r.filePaths[0]);
  }
  return { path: dataPath };
});

ipcMain.handle('data:load', () => {
  if (!dataPath) return { path: null, json: null };
  try { return { path: dataPath, json: fs.readFileSync(dataPath, 'utf8') }; }
  catch (e) { return { path: dataPath, json: null, error: e.code === 'ENOENT' ? 'missing' : String(e.message) }; }
});

ipcMain.handle('data:save', (_e, json) => {
  if (!dataPath) throw new Error('sem arquivo');
  const tmp = dataPath + '.tmp';
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, dataPath);
  lastWritten = json;
  return true;
});

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('update:status', () => updateReady);
ipcMain.handle('update:install', () => { if (autoUpdater && updateReady) autoUpdater.quitAndInstall(); });
ipcMain.handle('data:reveal', () => { if (dataPath) shell.showItemInFolder(dataPath); });

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 420, minHeight: 560,
    backgroundColor: '#eef1f6', autoHideMenuBar: true, title: 'Casa em Dia',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(() => {
  const p = process.env.CASA_DATA || readCfg().dataPath;
  if (p && fs.existsSync(p)) setPath(p);
  createWindow();
  // Atualização automática: baixa a versão nova publicada no GitHub e instala ao fechar o app.
  if (app.isPackaged && autoUpdater) {
    autoUpdater.on('update-downloaded', () => { updateReady = true; if (win && !win.isDestroyed()) win.webContents.send('update:ready'); });
    autoUpdater.on('error', () => {});
    const check = () => autoUpdater.checkForUpdates().catch(() => {});
    check();
    setInterval(check, 4 * 3600e3);
  }
});
app.on('window-all-closed', () => app.quit());
