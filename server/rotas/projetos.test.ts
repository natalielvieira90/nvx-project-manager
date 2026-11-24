import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { servidorDeTeste } from '../testes/apoio.ts';

let t: Awaited<ReturnType<typeof servidorDeTeste>>;
let clienteId = 0;
let outroClienteId = 0;

beforeAll(async () => {
  t = await servidorDeTeste();
  clienteId = (await t.chamar('POST', '/clientes', { nome: 'Padaria Sol' })).corpo.id;
  outroClienteId = (await t.chamar('POST', '/clientes', { nome: 'Lima Contabilidade' })).corpo.id;
});
afterAll(() => t.fechar());

const base = () => ({
  clienteId,
  nome: 'Site institucional',
  dataInicio: '2026-11-01',
  prazoEntrega: '2026-12-15',
  valorFechadoCentavos: 500000,
  estimativaSegundos: 40 * 3600,
  valorHoraDevCentavos: 12000,
  valorHoraSuporteCentavos: 15000,
  status: 'em_andamento',
});

describe('API de projetos', () => {
  let id = 0;

  it('cadastra projeto com cliente', async () => {
    const r = await t.chamar('POST', '/projetos', base());
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ nome: 'Site institucional', clienteNome: 'Padaria Sol', status: 'em_andamento' });
    id = r.corpo.id;
  });

  it('valida campos, datas e cliente', async () => {
    const r = await t.chamar('POST', '/projetos', {
      ...base(),
      nome: '',
      prazoEntrega: '2026-10-01',
      valorFechadoCentavos: -1,
      status: 'qualquer',
    });
    expect(r.status).toBe(400);
    expect(Object.keys(r.corpo.detalhes).sort()).toEqual(['nome', 'status', 'valorFechadoCentavos']);

    const prazo = await t.chamar('POST', '/projetos', { ...base(), nome: 'X', prazoEntrega: '2026-10-01' });
    expect(prazo.corpo.detalhes.prazoEntrega).toContain('anterior');

    const dataInexistente = await t.chamar('POST', '/projetos', { ...base(), nome: 'X', dataInicio: '2026-02-31' });
    expect(dataInexistente.corpo.detalhes.dataInicio).toBe('Data inválida.');

    const semCliente = await t.chamar('POST', '/projetos', { ...base(), nome: 'X', clienteId: 999 });
    expect(semCliente.corpo.detalhes.clienteId).toBe('Cliente não encontrado.');
  });

  it('impede nome repetido no mesmo cliente, mas permite em outro', async () => {
    expect((await t.chamar('POST', '/projetos', { ...base(), nome: 'SITE INSTITUCIONAL' })).status).toBe(409);
    expect((await t.chamar('POST', '/projetos', { ...base(), clienteId: outroClienteId })).status).toBe(201);
  });

  it('calcula horas e financeiro no detalhe', async () => {
    const lanc = (cat: string, seg: number, sit: string) =>
      t.db
        .prepare(
          `INSERT INTO lancamentos_horas (projeto_id, categoria, inicio, fim, duracao_segundos, origem, situacao_cobranca)
           VALUES (?, ?, '2026-11-10T12:00:00.000Z', '2026-11-10T20:00:00.000Z', ?, 'manual', ?)`,
        )
        .run(id, cat, seg, sit);
    lanc('desenvolvimento', 3 * 3600, 'incluido_pacote');
    lanc('desenvolvimento', 2 * 3600, 'faturavel');
    lanc('suporte', 3600, 'faturado');
    t.db.prepare("INSERT INTO pagamentos (projeto_id, data, valor_centavos) VALUES (?, '2026-11-20', 100000)").run(id);

    const d = (await t.chamar('GET', `/projetos/${id}`)).corpo;
    expect(d.horas).toEqual({ desenvolvimentoSegundos: 5 * 3600, suporteSegundos: 3600, totalSegundos: 6 * 3600 });
    expect(d.cobranca).toEqual({ incluidoPacoteSegundos: 3 * 3600, faturavelSegundos: 2 * 3600, faturadoSegundos: 3600 });
    // 5000 + 2h × 120 + 1h × 150 = 5390; recebido 1000
    expect(d.financeiro).toMatchObject({ totalCentavos: 539000, recebidoCentavos: 100000, pendenteCentavos: 439000 });
    expect(d.contagem).toEqual({ lancamentos: 3, atendimentos: 0, pagamentos: 1, servicos: 0 });
  });

  it('filtra a lista por status, cliente e busca sem acento', async () => {
    await t.chamar('POST', '/projetos', { ...base(), nome: 'Cardápio digital', status: 'orcamento' });
    const nomes = async (q: string) => (await t.chamar('GET', `/projetos${q}`)).corpo.map((p: { nome: string }) => p.nome);
    expect(await nomes('?status=orcamento')).toEqual(['Cardápio digital']);
    expect(await nomes(`?cliente=${outroClienteId}`)).toEqual(['Site institucional']);
    expect(await nomes('?busca=cardapio')).toEqual(['Cardápio digital']);
    expect(await nomes('?busca=lima')).toEqual(['Site institucional']);
    expect((await t.chamar('GET', '/projetos?status=xyz')).status).toBe(400);
  });

  it('edita (inclusive trocando o cliente) sem alterar o desconto', async () => {
    t.db.prepare('UPDATE projetos SET desconto_centavos = 5000 WHERE id = ?').run(id);
    const r = await t.chamar('PUT', `/projetos/${id}`, { ...base(), nome: 'Site novo', clienteId: outroClienteId });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ nome: 'Site novo', clienteNome: 'Lima Contabilidade' });
    expect(t.db.prepare('SELECT desconto_centavos AS d FROM projetos WHERE id = ?').get(id)!.d).toBe(5000);
  });

  it('troca o status rapidamente', async () => {
    const r = await t.chamar('PATCH', `/projetos/${id}/status`, { status: 'pausado' });
    expect(r.corpo.status).toBe('pausado');
    expect((await t.chamar('PATCH', `/projetos/${id}/status`, { status: 'x' })).status).toBe(400);
  });

  it('não exclui com cronômetro ativo; exclui para a lixeira', async () => {
    t.db
      .prepare("INSERT INTO cronometro_ativo (id, projeto_id, categoria, iniciado_em) VALUES (1, ?, 'desenvolvimento', '2026-11-24T10:00:00Z')")
      .run(id);
    expect((await t.chamar('DELETE', `/projetos/${id}`)).status).toBe(409);
    t.db.prepare('DELETE FROM cronometro_ativo').run();
    expect((await t.chamar('DELETE', `/projetos/${id}`)).status).toBe(204);
    expect((await t.chamar('GET', `/projetos/${id}`)).status).toBe(404);
    // Cliente fica livre para ser excluído quando não tem mais projetos ativos
    expect((await t.chamar('GET', `/clientes/${outroClienteId}`)).corpo.projetos).toHaveLength(1);
  });
});
