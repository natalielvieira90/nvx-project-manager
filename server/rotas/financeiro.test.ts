import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { relogioDeTeste, servidorDeTeste } from '../testes/apoio.ts';

// 24/11/2026 17:00 no horário de Brasília (o "hoje" usa o fuso local da máquina).
const relogio = relogioDeTeste('2026-11-24T20:00:00.000Z');
let t: Awaited<ReturnType<typeof servidorDeTeste>>;
let clienteId = 0;
let fechado = 0; // R$ 9.000 fechado, R$ 100/h dev, R$ 150/h suporte
let porHora = 0; // sem valor fechado, R$ 120/h dev
let orcamento = 0;

beforeAll(async () => {
  t = await servidorDeTeste(relogio);
  clienteId = (await t.chamar('POST', '/clientes', { nome: 'Loja do Carlos' })).corpo.id;
  fechado = (
    await t.chamar('POST', '/projetos', {
      clienteId, nome: 'Loja virtual', status: 'em_andamento',
      valorFechadoCentavos: 900000, valorHoraDevCentavos: 10000, valorHoraSuporteCentavos: 15000,
    })
  ).corpo.id;
  porHora = (
    await t.chamar('POST', '/projetos', { clienteId, nome: 'Manutenção', status: 'em_andamento', valorHoraDevCentavos: 12000 })
  ).corpo.id;
  orcamento = (await t.chamar('POST', '/projetos', { clienteId, nome: 'App', status: 'orcamento', valorFechadoCentavos: 500000 })).corpo.id;
});
afterAll(() => t.fechar());

beforeEach(() => {
  for (const tabela of ['pagamentos', 'lancamentos_horas', 'atendimentos_suporte', 'servicos_adicionais']) {
    t.db.prepare(`DELETE FROM ${tabela}`).run();
  }
  t.db.prepare('UPDATE projetos SET desconto_centavos = 0').run();
  relogio.definir('2026-11-24T20:00:00.000Z');
});

const projeto = async (id: number) => (await t.chamar('GET', `/projetos/${id}`)).corpo;
const lancar = (projetoId: number, categoria: string, inicio: string, fim: string, situacaoCobranca: string) =>
  t.chamar('POST', '/lancamentos', { projetoId, categoria, inicio, fim, situacaoCobranca });

describe('serviços adicionais', () => {
  it('somam ao total e entram em "a faturar" enquanto faturáveis', async () => {
    const r = await t.chamar('POST', '/servicos', { projetoId: fechado, descricao: 'Integração com ERP', data: '2026-11-10', valorCentavos: 150000 });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ situacao: 'faturavel', valorCentavos: 150000 });
    let f = (await projeto(fechado)).financeiro;
    expect(f.totalCentavos).toBe(1050000);
    expect(f.aFaturarCentavos).toBe(150000);

    await t.chamar('PUT', `/servicos/${r.corpo.id}`, { projetoId: fechado, descricao: 'Integração com ERP', data: '2026-11-10', valorCentavos: 150000, situacao: 'faturado' });
    f = (await projeto(fechado)).financeiro;
    expect(f.totalCentavos).toBe(1050000); // faturado continua no total
    expect(f.aFaturarCentavos).toBe(0);

    await t.chamar('DELETE', `/servicos/${r.corpo.id}`);
    expect((await projeto(fechado)).financeiro.totalCentavos).toBe(900000);
  });

  it('valida campos e recusa serviço repetido', async () => {
    const inv = await t.chamar('POST', '/servicos', { projetoId: fechado, descricao: '', data: '2026-02-31', valorCentavos: 0 });
    expect(inv.status).toBe(400);
    expect(Object.keys(inv.corpo.detalhes).sort()).toEqual(['data', 'descricao', 'valorCentavos']);
    await t.chamar('POST', '/servicos', { projetoId: fechado, descricao: 'Logo', data: '2026-11-10', valorCentavos: 5000 });
    const dup = await t.chamar('POST', '/servicos', { projetoId: fechado, descricao: 'LOGO', data: '2026-11-10', valorCentavos: 7000 });
    expect(dup.status).toBe(409);
    expect(dup.corpo.detalhes.descricao).toContain('10/11/2026');
  });
});

describe('pagamentos', () => {
  it('registra, reduz o pendente e soma no recebido do dashboard', async () => {
    const r = await t.chamar('POST', '/pagamentos', { projetoId: fechado, data: '2026-11-20', valorCentavos: 300000, forma: 'pix' });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ clienteId, projetoNome: 'Loja virtual', forma: 'pix', atendimentoId: null });
    const f = (await projeto(fechado)).financeiro;
    expect(f.recebidoCentavos).toBe(300000);
    expect(f.pendenteCentavos).toBe(600000);
    const d = (await t.chamar('GET', '/dashboard?mes=2026-11')).corpo;
    expect(d.faturamento.recebidoNoMesCentavos).toBe(300000);
  });

  it('pede confirmação para pagamento igual (mesmo projeto, data e valor)', async () => {
    const base = { projetoId: fechado, data: '2026-11-20', valorCentavos: 100000 };
    await t.chamar('POST', '/pagamentos', base);
    const dup = await t.chamar('POST', '/pagamentos', base);
    expect(dup.status).toBe(409);
    expect(dup.corpo.detalhes.duplicado).toContain('R$');
    expect((await t.chamar('POST', '/pagamentos', { ...base, permitirDuplicado: true })).status).toBe(201);
    expect((await projeto(fechado)).financeiro.recebidoCentavos).toBe(200000);
  });

  it('não aceita data futura, valor zero ou forma desconhecida', async () => {
    const r = await t.chamar('POST', '/pagamentos', { projetoId: fechado, data: '2026-11-25', valorCentavos: 0, forma: 'cheque' });
    expect(Object.keys(r.corpo.detalhes).sort()).toEqual(['forma', 'valorCentavos']);
    const fut = await t.chamar('POST', '/pagamentos', { projetoId: fechado, data: '2026-11-25', valorCentavos: 100 });
    expect(fut.corpo.detalhes.data).toContain('futuro');
    expect((await t.chamar('POST', '/pagamentos', { projetoId: fechado, data: '2026-11-24', valorCentavos: 100 })).status).toBe(201);
  });

  it('edita, filtra por período e exclui (vai para a lixeira)', async () => {
    const a = (await t.chamar('POST', '/pagamentos', { projetoId: fechado, data: '2026-10-05', valorCentavos: 100000 })).corpo;
    await t.chamar('POST', '/pagamentos', { projetoId: porHora, data: '2026-11-05', valorCentavos: 50000 });
    const ed = await t.chamar('PUT', `/pagamentos/${a.id}`, { projetoId: fechado, data: '2026-10-06', valorCentavos: 120000, observacoes: 'Sinal' });
    expect(ed.corpo).toMatchObject({ data: '2026-10-06', valorCentavos: 120000, observacoes: 'Sinal' });
    expect((await t.chamar('GET', '/pagamentos?de=2026-11-01&ate=2026-11-30')).corpo).toHaveLength(1);
    expect((await t.chamar('GET', `/pagamentos?projeto=${fechado}`)).corpo).toHaveLength(1);
    expect((await t.chamar('GET', '/pagamentos?de=01/11/2026')).status).toBe(400);
    expect((await t.chamar('DELETE', `/pagamentos/${a.id}`)).status).toBe(204);
    expect((await projeto(fechado)).financeiro.recebidoCentavos).toBe(0);
    expect(t.db.prepare('SELECT excluido_em FROM pagamentos WHERE id = ?').get(a.id)!.excluido_em).not.toBeNull();
  });

  it('pagamento gerado por atendimento não é editado nem excluído pelo financeiro', async () => {
    await t.chamar('POST', '/atendimentos', {
      projetoId: fechado, inicio: '2026-11-24T13:00:00.000Z', fim: '2026-11-24T14:00:00.000Z', problema: 'Pix', valorCentavos: 15000, situacao: 'pago',
    });
    const [pag] = (await t.chamar('GET', '/pagamentos')).corpo;
    expect(pag.atendimentoId).not.toBeNull();
    expect((await t.chamar('PUT', `/pagamentos/${pag.id}`, { projetoId: fechado, data: '2026-11-24', valorCentavos: 1 })).status).toBe(409);
    const del = await t.chamar('DELETE', `/pagamentos/${pag.id}`);
    expect(del.status).toBe(409);
    expect(del.corpo.erro).toContain('Suporte');
  });
});

describe('desconto', () => {
  it('reduz o total e não pode passar do valor bruto', async () => {
    const ok = await t.chamar('PATCH', `/projetos/${fechado}/desconto`, { descontoCentavos: 50000 });
    expect(ok.status).toBe(200);
    let f = (await projeto(fechado)).financeiro;
    expect(f).toMatchObject({ brutoCentavos: 900000, descontoCentavos: 50000, totalCentavos: 850000 });

    const alto = await t.chamar('PATCH', `/projetos/${fechado}/desconto`, { descontoCentavos: 900001 });
    expect(alto.status).toBe(400);
    expect(alto.corpo.detalhes.descontoCentavos).toContain('R$');

    // Editar o projeto não altera o desconto.
    await t.chamar('PUT', `/projetos/${fechado}`, {
      clienteId, nome: 'Loja virtual', status: 'em_andamento', valorFechadoCentavos: 900000, valorHoraDevCentavos: 10000, valorHoraSuporteCentavos: 15000,
    });
    f = (await projeto(fechado)).financeiro;
    expect(f.descontoCentavos).toBe(50000);
  });
});

describe('horas no financeiro', () => {
  it('horas do pacote não são cobradas; faturáveis sim; custo estimado usa todas', async () => {
    // 10h no pacote + 2h faturáveis de desenvolvimento
    await lancar(fechado, 'desenvolvimento', '2026-11-23T08:00:00.000Z', '2026-11-23T18:00:00.000Z', 'incluido_pacote');
    await lancar(fechado, 'correcao', '2026-11-24T08:00:00.000Z', '2026-11-24T10:00:00.000Z', 'faturavel');
    const f = (await projeto(fechado)).financeiro;
    expect(f.horasDevCentavos).toBe(20000); // só as 2h faturáveis
    expect(f.totalCentavos).toBe(920000);
    expect(f.aFaturarCentavos).toBe(20000);
    expect(f.custoHorasCentavos).toBe(120000); // 12h × R$ 100
    expect(f.resultadoCentavos).toBe(800000);
    expect(f.valorHoraEfetivoCentavos).toBe(Math.round((920000 * 3600) / (12 * 3600)));
  });

  it('"faturar extras" marca horas, serviços e atendimentos pendentes, sem tocar no pacote', async () => {
    await lancar(fechado, 'desenvolvimento', '2026-11-23T08:00:00.000Z', '2026-11-23T10:00:00.000Z', 'incluido_pacote');
    await lancar(fechado, 'correcao', '2026-11-23T10:00:00.000Z', '2026-11-23T11:00:00.000Z', 'faturavel');
    await t.chamar('POST', '/servicos', { projetoId: fechado, descricao: 'Banner', data: '2026-11-20', valorCentavos: 30000 });
    await t.chamar('POST', '/atendimentos', {
      projetoId: fechado, inicio: '2026-11-24T13:00:00.000Z', fim: '2026-11-24T14:00:00.000Z', problema: 'Frete', valorCentavos: 15000,
    });
    await t.chamar('POST', '/atendimentos', {
      projetoId: fechado, inicio: '2026-11-24T15:00:00.000Z', fim: '2026-11-24T16:00:00.000Z', problema: 'Pix', valorCentavos: 15000, situacao: 'pago',
    });
    const antes = (await projeto(fechado)).financeiro;
    expect(antes.aFaturarCentavos).toBe(10000 + 30000 + 15000);

    const r = await t.chamar('POST', `/financeiro/projetos/${fechado}/faturar`);
    expect(r.corpo).toEqual({ lancamentos: 1, servicos: 1, atendimentos: 1 });
    const depois = (await projeto(fechado)).financeiro;
    expect(depois.aFaturarCentavos).toBe(0);
    expect(depois.totalCentavos).toBe(antes.totalCentavos); // faturar não muda o total
    expect(depois.recebidoCentavos).toBe(15000); // atendimento pago continua pago
    const situacoes = t.db.prepare('SELECT situacao_cobranca AS s FROM lancamentos_horas ORDER BY inicio').all().map((l) => l.s);
    expect(situacoes).toEqual(['incluido_pacote', 'faturado']);
  });
});

describe('visão geral', () => {
  it('lista projetos contratados com totais; orçamento só aparece em "todos"', async () => {
    await t.chamar('POST', '/pagamentos', { projetoId: fechado, data: '2026-11-20', valorCentavos: 400000 });
    await lancar(porHora, 'desenvolvimento', '2026-11-23T08:00:00.000Z', '2026-11-23T13:00:00.000Z', 'faturavel'); // 5h × 120

    const r = (await t.chamar('GET', '/financeiro')).corpo;
    expect(r.projetos.map((p: { id: number }) => p.id)).toEqual([fechado, porHora]); // maior pendente primeiro
    expect(r.totais).toEqual({ totalCentavos: 960000, recebidoCentavos: 400000, pendenteCentavos: 560000, aFaturarCentavos: 60000 });

    const todos = (await t.chamar('GET', '/financeiro?status=todos')).corpo;
    expect(todos.projetos).toHaveLength(3);
    expect(todos.totais.pendenteCentavos).toBe(560000); // orçamento não gera pendência
    expect((await t.chamar('GET', '/financeiro?busca=manutencao')).corpo.projetos).toHaveLength(1);
    expect((await t.chamar('GET', '/financeiro?status=xyz')).status).toBe(400);
    expect(orcamento).toBeGreaterThan(0);
  });
});
