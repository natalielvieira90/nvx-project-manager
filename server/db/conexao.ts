import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migracoes } from './migracoes.ts';

/**
 * Abre o banco SQLite e aplica migrações pendentes.
 * `caminho` pode ser ':memory:' (usado nos testes).
 */
export function abrirBanco(caminho: string): DatabaseSync {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });

  const db = new DatabaseSync(caminho);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);
  aplicarMigracoes(db);
  return db;
}

export function aplicarMigracoes(db: DatabaseSync): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migracoes (
    versao     INTEGER PRIMARY KEY,
    descricao  TEXT NOT NULL,
    aplicada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;`);

  const aplicadas = new Set(
    db.prepare('SELECT versao FROM schema_migracoes').all().map((r) => Number(r.versao)),
  );
  const novas: number[] = [];

  for (const m of [...migracoes].sort((a, b) => a.versao - b.versao)) {
    if (aplicadas.has(m.versao)) continue;
    // Cada migração roda em transação: ou aplica inteira, ou nada.
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migracoes (versao, descricao) VALUES (?, ?)').run(m.versao, m.descricao);
      db.exec('COMMIT');
      novas.push(m.versao);
    } catch (erro) {
      db.exec('ROLLBACK');
      throw new Error(`Falha ao aplicar a migração ${m.versao} (${m.descricao}): ${(erro as Error).message}`);
    }
  }
  return novas;
}

export function versaoAtual(db: DatabaseSync): number {
  const r = db.prepare('SELECT COALESCE(MAX(versao), 0) AS v FROM schema_migracoes').get();
  return Number(r?.v ?? 0);
}
