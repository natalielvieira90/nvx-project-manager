import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { abrirBanco } from './db/conexao.ts';
import { backupDiarioSeNecessario } from './servicos/backup.ts';
import { criarApp } from './app.ts';

export interface OpcoesServidor {
  caminhoBanco: string;
  /** 0 = porta livre escolhida pelo sistema (usado no aplicativo desktop). */
  porta: number;
  /** Pasta da interface compilada; se omitida, só a API é servida. */
  pastaFrontend?: string;
  /** Pasta dos backups automáticos (padrão: pasta "backups" ao lado do banco). */
  pastaBackups?: string;
}

export interface ServidorAtivo {
  porta: number;
  encerrar: () => Promise<void>;
}

/**
 * Abre o banco e inicia o servidor HTTP local (somente 127.0.0.1).
 * Usado tanto pelo aplicativo desktop (Electron) quanto pelo modo de desenvolvimento.
 */
export function iniciarServidor({ caminhoBanco, porta, pastaFrontend, pastaBackups }: OpcoesServidor): Promise<ServidorAtivo> {
  const db = abrirBanco(caminhoBanco);
  const pasta = pastaBackups ?? join(dirname(caminhoBanco), 'backups');
  const app = criarApp({ db, pastaFrontend, pastaBackups: pasta });

  // Backup automático diário: ao abrir e, se o programa ficar aberto, a cada hora (um por dia).
  const backupDiario = () => {
    try {
      backupDiarioSeNecessario(db, pasta, new Date());
    } catch (erro) {
      console.error('[backup automático]', erro);
    }
  };
  backupDiario();
  const intervaloBackup = setInterval(backupDiario, 60 * 60 * 1000);
  intervaloBackup.unref();

  return new Promise((resolve, reject) => {
    const servidor = app.listen(porta, '127.0.0.1', () => {
      const { port } = servidor.address() as AddressInfo;
      resolve({
        porta: port,
        encerrar: () =>
          new Promise<void>((fim) => {
            clearInterval(intervaloBackup);
            servidor.close(() => {
              db.close(); // fecha o banco com segurança, gravando tudo em disco
              fim();
            });
            servidor.closeAllConnections();
          }),
      });
    });
    servidor.on('error', (erro) => {
      clearInterval(intervaloBackup);
      db.close();
      reject(erro);
    });
  });
}
