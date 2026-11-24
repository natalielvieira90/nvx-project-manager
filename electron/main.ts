/**
 * Processo principal do aplicativo desktop NVX Project Manager.
 *
 * - Inicia o servidor interno em 127.0.0.1 numa porta livre (invisível ao usuário).
 * - Abre a janela do aplicativo apontando para esse servidor.
 * - Guarda o banco em %APPDATA%\NVX Project Manager\dados\nvx.db, fora da pasta de
 *   instalação: desinstalar/atualizar o programa NÃO apaga os dados.
 */
import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { extname, join } from 'node:path';
import { iniciarServidor, type ServidorAtivo } from '../server/iniciar.ts';

const pastaApp = join(__dirname, '..'); // raiz do pacote (contém dist/ e dist-electron/)
let servidor: ServidorAtivo | null = null;
let janela: BrowserWindow | null = null;

// Interface sempre em português do Brasil (calendários, datas e números dos campos).
app.commandLine.appendSwitch('lang', 'pt-BR');

// Apenas uma instância aberta por vez (evita dois processos gravando no mesmo banco).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });
  app.whenReady().then(iniciar);
}

async function iniciar() {
  try {
    servidor = await iniciarServidor({
      porta: 0,
      caminhoBanco: join(app.getPath('userData'), 'dados', 'nvx.db'),
      pastaFrontend: join(pastaApp, 'dist'),
    });
  } catch (erro) {
    dialog.showErrorBox(
      'NVX Project Manager',
      `Não foi possível iniciar o banco de dados.\n\n${(erro as Error).message}`,
    );
    app.quit();
    return;
  }
  Menu.setApplicationMenu(criarMenu());
  criarJanela();
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#f5f0e8', // Areia Clara (manual da marca)
    title: 'NVX Project Manager',
    icon: join(pastaApp, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const enderecoInterno = `http://127.0.0.1:${servidor!.porta}`;
  janela.loadURL(enderecoInterno);
  janela.once('ready-to-show', () => {
    janela?.maximize();
    janela?.show();
  });

  // Links externos abrem no navegador padrão; a janela só exibe o próprio sistema.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('mailto:')) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (evento, url) => {
    if (url.startsWith(enderecoInterno)) return;
    evento.preventDefault();
    // Links de e-mail abrem o programa de e-mail padrão.
    if (url.startsWith('mailto:')) shell.openExternal(url);
  });

  // Arquivos gerados pela interface (relatórios PDF/CSV): pergunta onde salvar, começando em Downloads.
  janela.webContents.session.on('will-download', (_evento, item) => {
    const nome = item.getFilename();
    const tipos: Record<string, Electron.FileFilter> = {
      pdf: { name: 'Documento PDF', extensions: ['pdf'] },
      csv: { name: 'Planilha CSV', extensions: ['csv'] },
      db: { name: 'Backup do NVX Project Manager', extensions: ['db'] },
    };
    const filtro = tipos[extname(nome).slice(1).toLowerCase()];
    item.setSaveDialogOptions({
      title: 'Salvar arquivo',
      defaultPath: join(app.getPath('downloads'), nome),
      filters: filtro ? [filtro] : [],
    });
  });

  janela.on('closed', () => {
    janela = null;
  });
}

function criarMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Abrir pasta dos dados',
          click: () => shell.openPath(join(app.getPath('userData'), 'dados')),
        },
        { type: 'separator' },
        { label: 'Sair', role: 'quit' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Desfazer', role: 'undo' },
        { label: 'Refazer', role: 'redo' },
        { type: 'separator' },
        { label: 'Recortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Colar', role: 'paste' },
        { label: 'Selecionar tudo', role: 'selectAll' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { label: 'Recarregar', role: 'reload' },
        { type: 'separator' },
        { label: 'Aumentar zoom', role: 'zoomIn' },
        { label: 'Diminuir zoom', role: 'zoomOut' },
        { label: 'Zoom padrão', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Tela cheia', role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ label: 'Ferramentas do desenvolvedor', role: 'toggleDevTools' as const }]),
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre o NVX Project Manager',
          click: () =>
            dialog.showMessageBox({
              type: 'info',
              title: 'Sobre',
              message: 'NVX Project Manager',
              detail: `Versão ${app.getVersion()}\nNVX Digital — Tecnologia que conecta. Soluções que evoluem.\n\nDados: ${join(app.getPath('userData'), 'dados')}`,
            }),
        },
      ],
    },
  ]);
}

app.on('window-all-closed', () => app.quit());

// Garante o fechamento correto do banco ao sair.
let encerrando = false;
app.on('before-quit', (evento) => {
  if (encerrando || !servidor) return;
  evento.preventDefault();
  encerrando = true;
  servidor.encerrar().finally(() => app.quit());
});
