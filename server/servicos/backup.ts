/**
 * Backup e restauração do banco.
 *
 * - Cópia consistente com `VACUUM INTO` (funciona com o programa aberto, gera um arquivo único).
 * - Backup automático diário ao abrir o programa (mantém os 14 mais recentes) e um backup
 *   automático antes de toda restauração (mantém os 10 mais recentes).
 * - Restauração validada: cabeçalho SQLite, integridade, tabelas esperadas e versão. Backups de
 *   versões anteriores são atualizados (migrações) antes de entrar. A troca dos dados acontece numa
 *   única transação: se algo falhar, nada muda.
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { aplicarMigracoes, versaoAtual } from '../db/conexao.ts';
import { migracoes } from '../db/migracoes.ts';
import { ErroHttp } from '../http.ts';

/** Tabelas de dados, em ordem de dependência (pais antes dos filhos). */
export const TABELAS_DADOS = [
  'configuracoes',
  'clientes',
  'projetos',
  'atendimentos_suporte',
  'lancamentos_horas',
  'servicos_adicionais',
  'pagamentos',
  'cronometro_ativo',
] as const;

export type TipoBackup = 'diario' | 'antes-restauracao';
const LIMITE: Record<TipoBackup, number> = { diario: 14, 'antes-restauracao': 10 };

export interface InfoBackup {
  nome: string;
  tipo: TipoBackup;
  criadoEm: string;
  tamanhoBytes: number;
}

const doisDig = (n: number) => String(n).padStart(2, '0');
/** "2026-11-24-1530" no horário local. */
export function carimbo(agora: Date, comSegundos = false): string {
  const base = `${agora.getFullYear()}-${doisDig(agora.getMonth() + 1)}-${doisDig(agora.getDate())}-${doisDig(agora.getHours())}${doisDig(agora.getMinutes())}`;
  return comSegundos ? `${base}${doisDig(agora.getSeconds())}` : base;
}

/** Grava uma cópia consistente do banco em `destino` (o arquivo não pode existir). */
export function copiarBanco(db: DatabaseSync, destino: string) {
  db.prepare('VACUUM INTO ?').run(destino);
}

export function arquivoTemporario(extensao = '.db') {
  return join(tmpdir(), `nvx-${randomUUID()}${extensao}`);
}

const NOME_VALIDO = /^(diario|antes-restauracao)-(\d{4}-\d{2}-\d{2}-\d{6})\.db$/;

export function listarBackups(pasta: string | null): InfoBackup[] {
  if (!pasta || !existsSync(pasta)) return [];
  return readdirSync(pasta)
    .map((nome) => ({ nome, m: NOME_VALIDO.exec(nome) }))
    .filter((x): x is { nome: string; m: RegExpExecArray } => Boolean(x.m))
    .map(({ nome, m }) => {
      const st = statSync(join(pasta, nome));
      return { nome, tipo: m[1] as TipoBackup, criadoEm: st.mtime.toISOString(), tamanhoBytes: st.size };
    })
    .sort((a, b) => b.nome.slice(-20).localeCompare(a.nome.slice(-20)));
}

/** Caminho de um backup automático pelo nome (impede caminhos fora da pasta). */
export function caminhoDoBackup(pasta: string | null, nome: string): string {
  if (!pasta || !NOME_VALIDO.test(nome) || !existsSync(join(pasta, nome))) throw new ErroHttp(404, 'Backup não encontrado.');
  return join(pasta, nome);
}

export function criarBackupAutomatico(db: DatabaseSync, pasta: string, tipo: TipoBackup, agora: Date): InfoBackup {
  mkdirSync(pasta, { recursive: true });
  let nome = `${tipo}-${carimbo(agora, true)}.db`;
  // Dois backups no mesmo segundo: não sobrescreve.
  for (let i = 1; existsSync(join(pasta, nome)); i++) nome = `${tipo}-${carimbo(new Date(agora.getTime() + i * 1000), true)}.db`;
  copiarBanco(db, join(pasta, nome));
  // Mantém só os mais recentes de cada tipo.
  for (const antigo of listarBackups(pasta).filter((b) => b.tipo === tipo).slice(LIMITE[tipo])) {
    rmSync(join(pasta, antigo.nome), { force: true });
  }
  return listarBackups(pasta).find((b) => b.nome === nome)!;
}

/** Faz o backup diário se ainda não houver um de hoje. Devolve o backup criado (ou null). */
export function backupDiarioSeNecessario(db: DatabaseSync, pasta: string, agora: Date): InfoBackup | null {
  const hoje = carimbo(agora).slice(0, 10);
  if (listarBackups(pasta).some((b) => b.tipo === 'diario' && b.nome.startsWith(`diario-${hoje}`))) return null;
  return criarBackupAutomatico(db, pasta, 'diario', agora);
}

/** Confere se o arquivo é um backup válido do NVX Project Manager. Devolve a versão do banco do arquivo. */
export function validarBackup(caminho: string): number {
  const invalido = (motivo: string) => new ErroHttp(400, `Arquivo de backup inválido: ${motivo}`);
  const cabecalho = Buffer.alloc(16);
  const fd = openSync(caminho, 'r');
  try {
    readSync(fd, cabecalho, 0, 16, 0);
  } finally {
    closeSync(fd);
  }
  if (cabecalho.toString('latin1') !== 'SQLite format 3\u0000') throw invalido('não é um banco de dados do sistema.');

  let banco: DatabaseSync | null = null;
  try {
    banco = new DatabaseSync(caminho, { readOnly: true });
    const integridade = banco.prepare('PRAGMA integrity_check').get();
    if (String(Object.values(integridade ?? {})[0]) !== 'ok') throw invalido('o arquivo está corrompido.');
    const tabelas = new Set(
      banco.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => String(t.name)),
    );
    if (!tabelas.has('schema_migracoes') || !TABELAS_DADOS.every((t) => tabelas.has(t))) {
      throw invalido('não foi gerado pelo NVX Project Manager.');
    }
    const versao = versaoAtual(banco);
    const maxima = Math.max(...migracoes.map((m) => m.versao));
    if (versao > maxima) {
      throw new ErroHttp(400, 'Este backup foi gerado por uma versão mais nova do programa. Atualize o NVX Project Manager antes de restaurar.');
    }
    return versao;
  } catch (erro) {
    if (erro instanceof ErroHttp) throw erro;
    throw invalido('não foi possível ler o arquivo.');
  } finally {
    banco?.close();
  }
}

export interface ResultadoRestauracao {
  /** Backup automático feito antes de restaurar (null quando não há pasta de backups). */
  backupAnterior: InfoBackup | null;
  registros: Record<string, number>;
}

/**
 * Substitui todos os dados do banco aberto pelos do arquivo de backup.
 * Faz antes um backup automático do estado atual.
 */
export function restaurarBackup(db: DatabaseSync, arquivo: string, pasta: string | null, agora: Date): ResultadoRestauracao {
  validarBackup(arquivo);

  // Trabalha numa cópia: o arquivo original do usuário nunca é alterado.
  const copia = arquivoTemporario();
  copyFileSync(arquivo, copia);
  try {
    const temp = new DatabaseSync(copia);
    try {
      aplicarMigracoes(temp); // backup de versão anterior: atualiza a estrutura
    } finally {
      temp.close();
    }

    const backupAnterior = pasta ? criarBackupAutomatico(db, pasta, 'antes-restauracao', agora) : null;

    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare('ATTACH DATABASE ? AS origem').run(copia);
    const registros: Record<string, number> = {};
    try {
      db.exec('BEGIN');
      try {
        for (const tabela of [...TABELAS_DADOS].reverse()) db.exec(`DELETE FROM main.${tabela}`);
        for (const tabela of TABELAS_DADOS) {
          const colunas = (alias: string) =>
            new Set(db.prepare(`PRAGMA ${alias}.table_info(${tabela})`).all().map((c) => String(c.name)));
          const destino = colunas('main');
          const lista = [...colunas('origem')].filter((c) => destino.has(c)).map((c) => `"${c}"`).join(', ');
          db.exec(`INSERT INTO main.${tabela} (${lista}) SELECT ${lista} FROM origem.${tabela}`);
          // Conta só registros ativos (os da lixeira também são restaurados, mas não entram no resumo).
          const ativos = destino.has('excluido_em') ? ' WHERE excluido_em IS NULL' : '';
          registros[tabela] = Number(db.prepare(`SELECT COUNT(*) AS n FROM main.${tabela}${ativos}`).get()!.n);
        }
        const falhas = db.prepare('PRAGMA main.foreign_key_check').all();
        if (falhas.length) throw new ErroHttp(400, 'Arquivo de backup inválido: há registros sem vínculo (ex.: projeto sem cliente).');
        db.exec('COMMIT');
      } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
      }
    } finally {
      db.exec('DETACH DATABASE origem');
      db.exec('PRAGMA foreign_keys = ON');
    }
    return { backupAnterior, registros };
  } finally {
    rmSync(copia, { force: true });
  }
}
