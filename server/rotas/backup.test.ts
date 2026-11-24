import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { relogioDeTeste, servidorDeTeste } from '../testes/apoio.ts';
import { backupDiarioSeNecessario, criarBackupAutomatico, listarBackups } from '../servicos/backup.ts';

const relogio = relogioDeTeste('2026-11-24T20:00:00.000Z');
const pasta = mkdtempSync(join(tmpdir(), 'nvx-teste-backup-'));
let t: Awaited<ReturnType<typeof servidorDeTeste>>;

beforeAll(async () => {
  t = await servidorDeTeste(relogio, pasta);
});
afterAll(() => {
  t.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

const baixar = async (caminho: string) => {
  const r = await fetch(t.base + caminho);
  return { status: r.status, nome: r.headers.get('content-disposition') ?? '', bytes: Buffer.from(await r.arrayBuffer()) };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const enviar = (caminho: string, bytes: Buffer): Promise<{ status: number; corpo: any }> =>
  fetch(t.base + caminho, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes }).then(
    async (r) => ({ status: r.status, corpo: await r.json() }),
  );
const clientes = async () => (await t.chamar('GET', '/clientes')).corpo.map((c: { nome: string }) => c.nome);

describe('backup e restauração', () => {
  it('baixa uma cópia completa e restaura o estado salvo', async () => {
    await t.chamar('POST', '/clientes', { nome: 'Carlos Mendes' });
    const p = (await t.chamar('POST', '/projetos', { clienteId: 1, nome: 'Loja', status: 'em_andamento', valorFechadoCentavos: 500000 })).corpo;
    await t.chamar('POST', '/pagamentos', { projetoId: p.id, data: '2026-11-20', valorCentavos: 100000 });

    const copia = await baixar('/backup/baixar');
    expect(copia.status).toBe(200);
    expect(copia.nome).toMatch(/nvx-backup-\d{4}-\d{2}-\d{2}-\d{4}\.db/);
    expect(copia.bytes.subarray(0, 15).toString()).toBe('SQLite format 3');

    // Depois do backup, o usuário cadastra mais coisas e exclui o pagamento.
    await t.chamar('POST', '/clientes', { nome: 'Ana Souza' });
    const [pag] = (await t.chamar('GET', '/pagamentos')).corpo;
    await t.chamar('DELETE', `/pagamentos/${pag.id}`);
    expect(await clientes()).toEqual(['Ana Souza', 'Carlos Mendes']);

    const r = await enviar('/backup/restaurar', copia.bytes);
    expect(r.status).toBe(200);
    expect(r.corpo.registros).toMatchObject({ clientes: 1, projetos: 1, pagamentos: 1 });
    expect(await clientes()).toEqual(['Carlos Mendes']);
    expect((await t.chamar('GET', `/projetos/${p.id}`)).corpo.financeiro.recebidoCentavos).toBe(100000);

    // Antes de restaurar, o estado atual foi guardado e pode voltar.
    expect(r.corpo.backupAnterior.tipo).toBe('antes-restauracao');
    const volta = await t.chamar('POST', `/backup/automaticos/${r.corpo.backupAnterior.nome}/restaurar`);
    expect(volta.status).toBe(200);
    expect(await clientes()).toEqual(['Ana Souza', 'Carlos Mendes']);
  });

  it('recusa arquivos que não são backup do sistema, sem alterar nada', async () => {
    const antes = await clientes();
    expect((await enviar('/backup/restaurar', Buffer.from('não sou um banco'))).corpo.erro).toContain('inválido');

    // Banco SQLite de outro programa.
    const outro = join(pasta, 'outro.sqlite');
    const db = new DatabaseSync(outro);
    db.exec('CREATE TABLE coisas (id INTEGER)');
    db.close();
    const r = await enviar('/backup/restaurar', (await import('node:fs')).readFileSync(outro));
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toContain('não foi gerado pelo NVX');
    expect(await clientes()).toEqual(antes);
  });

  it('recusa backup de versão mais nova do programa', async () => {
    const copia = await baixar('/backup/baixar');
    const arq = join(pasta, 'futuro.db');
    writeFileSync(arq, copia.bytes);
    const db = new DatabaseSync(arq);
    db.exec("INSERT INTO schema_migracoes (versao, descricao) VALUES (999, 'futura')");
    db.close();
    const r = await enviar('/backup/restaurar', (await import('node:fs')).readFileSync(arq));
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toContain('versão mais nova');
  });

  it('atualiza backup de versão anterior (migrações) ao restaurar', async () => {
    // Banco na versão 1 (sem as colunas das migrações 2 e 3).
    const arq = join(pasta, 'antigo.db');
    const { migracoes } = await import('../db/migracoes.ts');
    const db = new DatabaseSync(arq);
    db.exec(`CREATE TABLE schema_migracoes (versao INTEGER PRIMARY KEY, descricao TEXT NOT NULL, aplicada_em TEXT NOT NULL DEFAULT 'x') STRICT;`);
    db.exec(migracoes[0].sql);
    db.exec("INSERT INTO schema_migracoes (versao, descricao) VALUES (1, 'Estrutura inicial')");
    db.exec("INSERT INTO clientes (nome) VALUES ('Cliente Antigo')");
    db.close();
    const r = await enviar('/backup/restaurar', (await import('node:fs')).readFileSync(arq));
    expect(r.status).toBe(200);
    expect(await clientes()).toEqual(['Cliente Antigo']);
    expect((await t.chamar('GET', '/saude')).corpo.versaoBanco).toBe(3);
  });

  it('lista e baixa backups automáticos; nome inválido não acessa outros arquivos', async () => {
    const estado = (await t.chamar('GET', '/backup')).corpo;
    expect(estado.automaticos.length).toBeGreaterThan(0);
    const nome = estado.automaticos[0].nome;
    expect((await baixar(`/backup/automaticos/${nome}`)).status).toBe(200);
    expect((await baixar('/backup/automaticos/..%2F..%2Fnvx.db')).status).toBe(404);
    expect((await baixar('/backup/automaticos/outro.sqlite')).status).toBe(404);
  });
});

describe('backup automático', () => {
  it('faz um backup diário por dia e mantém só os mais recentes', () => {
    const p = mkdtempSync(join(tmpdir(), 'nvx-teste-diario-'));
    try {
      expect(backupDiarioSeNecessario(t.db, p, new Date(2026, 10, 24, 9, 0, 0))).not.toBeNull();
      expect(backupDiarioSeNecessario(t.db, p, new Date(2026, 10, 24, 18, 0, 0))).toBeNull(); // mesmo dia
      for (let d = 1; d <= 20; d++) criarBackupAutomatico(t.db, p, 'diario', new Date(2026, 11, d, 9, 0, 0));
      const lista = listarBackups(p);
      expect(lista).toHaveLength(14);
      expect(lista[0].nome).toBe('diario-2026-12-20-090000.db'); // mais recente primeiro
      expect(readdirSync(p)).toHaveLength(14);
    } finally {
      rmSync(p, { recursive: true, force: true });
    }
  });
});
