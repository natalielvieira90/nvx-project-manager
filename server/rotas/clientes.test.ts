import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import { abrirBanco } from '../db/conexao.ts';
import { criarApp } from '../app.ts';

let servidor: Server;
let base: string;
let db: DatabaseSync;

beforeAll(async () => {
  db = abrirBanco(':memory:');
  await new Promise<void>((ok) => {
    servidor = criarApp({ db }).listen(0, '127.0.0.1', () => ok());
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/clientes`;
});
afterAll(() => servidor.close());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamar(metodo: string, caminho = '', envio?: unknown): Promise<{ status: number; corpo: any }> {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: envio === undefined ? undefined : JSON.stringify(envio),
  });
  return { status: r.status, corpo: r.status === 204 ? null : await r.json() };
}

describe('API de clientes', () => {
  let idAna = 0;

  it('cadastra cliente normalizando os dados', async () => {
    const r = await chamar('POST', '', {
      nome: 'Ana Souza',
      empresa: 'Clínica Bem Estar',
      telefone: '(21) 96666-3333',
      email: 'ANA@exemplo.com',
      documento: '529.982.247-25',
    });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ nome: 'Ana Souza', telefone: '21966663333', email: 'ana@exemplo.com', documento: '52998224725' });
    idAna = r.corpo.id;
  });

  it('valida os campos e responde em português', async () => {
    const r = await chamar('POST', '', { nome: '', documento: '111.111.111-11' });
    expect(r.status).toBe(400);
    expect(r.corpo.detalhes).toMatchObject({ nome: 'Informe o nome do cliente.', documento: 'CPF ou CNPJ inválido.' });
  });

  it('impede CPF, e-mail e nome+empresa duplicados', async () => {
    const r = await chamar('POST', '', { nome: 'Ana Souza', empresa: 'clínica bem estar', email: 'ana@EXEMPLO.com', documento: '52998224725' });
    expect(r.status).toBe(409);
    expect(Object.keys(r.corpo.detalhes).sort()).toEqual(['documento', 'email', 'nome']);
  });

  it('permite editar mantendo os próprios dados', async () => {
    const r = await chamar('PUT', `/${idAna}`, { nome: 'Ana Souza', empresa: 'Clínica Bem Estar', email: 'ana@exemplo.com', documento: '52998224725', observacoes: 'Prefere WhatsApp' });
    expect(r.status).toBe(200);
    expect(r.corpo.observacoes).toBe('Prefere WhatsApp');
    expect(r.corpo.telefone).toBeNull();
  });

  it('busca sem acento, por empresa e por dígitos do documento', async () => {
    await chamar('POST', '', { nome: 'Roberto Lima', empresa: 'Lima Contabilidade' });
    expect((await chamar('GET', '?busca=clinica')).corpo.map((c: { nome: string }) => c.nome)).toEqual(['Ana Souza']);
    expect((await chamar('GET', '?busca=529982')).corpo).toHaveLength(1);
    expect((await chamar('GET', '')).corpo.map((c: { nome: string }) => c.nome)).toEqual(['Ana Souza', 'Roberto Lima']);
  });

  it('não exclui cliente com projetos', async () => {
    db.prepare("INSERT INTO projetos (cliente_id, nome, status) VALUES (?, 'Site', 'em_andamento')").run(idAna);
    const detalhe = await chamar('GET', `/${idAna}`);
    expect(detalhe.corpo.projetos).toHaveLength(1);
    expect((await chamar('GET', '')).corpo[0]).toMatchObject({ qtdProjetos: 1, qtdProjetosAtivos: 1 });
    const r = await chamar('DELETE', `/${idAna}`);
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toContain('possui 1 projeto');
  });

  it('exclui (lixeira) e libera os dados para novo cadastro', async () => {
    const roberto = (await chamar('GET', '?busca=roberto')).corpo[0];
    expect((await chamar('DELETE', `/${roberto.id}`)).status).toBe(204);
    expect((await chamar('GET', `/${roberto.id}`)).status).toBe(404);
    expect(db.prepare('SELECT excluido_em FROM clientes WHERE id = ?').get(roberto.id)!.excluido_em).toBeTruthy();
    expect((await chamar('POST', '', { nome: 'Roberto Lima', empresa: 'Lima Contabilidade' })).status).toBe(201);
  });

  it('trata id inválido e JSON malformado', async () => {
    expect((await chamar('GET', '/abc')).status).toBe(400);
    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nome' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toContain('formato inválido');
  });
});
