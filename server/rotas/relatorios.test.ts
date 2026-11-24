import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { relogioDeTeste, servidorDeTeste } from '../testes/apoio.ts';

// Horários ao meio-dia UTC para o dia não mudar em nenhum fuso do Brasil.
const relogio = relogioDeTeste('2026-11-24T20:00:00.000Z');
let t: Awaited<ReturnType<typeof servidorDeTeste>>;
let carlos = 0;
let ana = 0;
let loja = 0; // Carlos: R$ 9.000 fechado, R$ 100/h dev, R$ 150/h suporte
let app = 0; // Carlos: por hora, R$ 120/h dev
let site = 0; // Ana: orçamento

const lancar = (projetoId: number, categoria: string, inicio: string, fim: string, situacaoCobranca: string) =>
  t.chamar('POST', '/lancamentos', { projetoId, categoria, inicio, fim, situacaoCobranca });

beforeAll(async () => {
  t = await servidorDeTeste(relogio);
  carlos = (await t.chamar('POST', '/clientes', { nome: 'Carlos Mendes' })).corpo.id;
  ana = (await t.chamar('POST', '/clientes', { nome: 'Ana Souza' })).corpo.id;
  loja = (await t.chamar('POST', '/projetos', {
    clienteId: carlos, nome: 'Loja virtual', status: 'em_andamento',
    valorFechadoCentavos: 900000, valorHoraDevCentavos: 10000, valorHoraSuporteCentavos: 15000,
  })).corpo.id;
  app = (await t.chamar('POST', '/projetos', { clienteId: carlos, nome: 'App', status: 'em_andamento', valorHoraDevCentavos: 12000 })).corpo.id;
  site = (await t.chamar('POST', '/projetos', { clienteId: ana, nome: 'Site', status: 'orcamento', valorFechadoCentavos: 300000 })).corpo.id;

  // Outubro
  await lancar(loja, 'desenvolvimento', '2026-10-10T11:00:00.000Z', '2026-10-10T15:00:00.000Z', 'incluido_pacote'); // 4h pacote
  await t.chamar('POST', '/pagamentos', { projetoId: loja, data: '2026-10-15', valorCentavos: 300000 });
  // Novembro
  await lancar(loja, 'correcao', '2026-11-10T11:00:00.000Z', '2026-11-10T13:00:00.000Z', 'faturavel'); // 2h × 100
  await lancar(app, 'desenvolvimento', '2026-11-11T11:00:00.000Z', '2026-11-11T14:00:00.000Z', 'faturado'); // 3h × 120
  await lancar(loja, 'suporte', '2026-11-12T11:00:00.000Z', '2026-11-12T11:30:00.000Z', 'faturavel'); // 30min × 150 (avulso)
  // Suporte do cronômetro convertido em atendimento: aparece uma vez só (como atendimento).
  const sup = (await lancar(loja, 'suporte', '2026-11-13T11:00:00.000Z', '2026-11-13T12:00:00.000Z', 'faturavel')).corpo;
  await t.chamar('POST', '/atendimentos', { projetoId: loja, lancamentoId: sup.id, problema: 'Frete', valorCentavos: 15000, situacao: 'pago' });
  await t.chamar('POST', '/servicos', { projetoId: loja, descricao: 'Banner', data: '2026-11-05', valorCentavos: 50000, situacao: 'faturado' });
  await t.chamar('POST', '/pagamentos', { projetoId: app, data: '2026-11-20', valorCentavos: 36000 });
});
afterAll(() => t.fechar());

describe('relatório de horas', () => {
  it('junta lançamentos e atendimentos sem contar a conversão duas vezes', async () => {
    const r = (await t.chamar('GET', '/relatorios/horas?de=2026-11-01&ate=2026-11-30')).corpo;
    expect(r.linhas.map((l: { origem: string; categoria: string }) => `${l.origem}:${l.categoria}`)).toEqual([
      'lancamento:correcao', 'lancamento:desenvolvimento', 'lancamento:suporte', 'atendimento:atendimento',
    ]);
    expect(r.totais).toEqual({
      desenvolvimentoSegundos: 5 * 3600,
      suporteSegundos: 1800 + 3600,
      totalSegundos: 5 * 3600 + 5400,
      pacoteSegundos: 0,
      aFaturarCentavos: 20000 + 7500,
      faturadoCentavos: 36000 + 15000,
      valorCentavos: 20000 + 7500 + 36000 + 15000,
    });
  });

  it('horas do pacote aparecem com valor zero', async () => {
    const r = (await t.chamar('GET', '/relatorios/horas?de=2026-10-01&ate=2026-10-31')).corpo;
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ cobranca: 'pacote', valorCentavos: 0, duracaoSegundos: 4 * 3600 });
    expect(r.totais.pacoteSegundos).toBe(4 * 3600);
  });

  it('filtra por tipo, cobrança, cliente e projeto', async () => {
    const suporte = (await t.chamar('GET', '/relatorios/horas?tipo=suporte')).corpo;
    expect(suporte.totais.suporteSegundos).toBe(5400);
    expect(suporte.totais.desenvolvimentoSegundos).toBe(0);
    const faturado = (await t.chamar('GET', '/relatorios/horas?cobranca=faturado')).corpo;
    expect(faturado.linhas).toHaveLength(2);
    expect((await t.chamar('GET', `/relatorios/horas?projeto=${app}`)).corpo.linhas).toHaveLength(1);
    expect((await t.chamar('GET', `/relatorios/horas?cliente=${ana}`)).corpo.linhas).toHaveLength(0);
  });

  it('valida os filtros', async () => {
    expect((await t.chamar('GET', '/relatorios/horas?de=01/11/2026')).status).toBe(400);
    expect((await t.chamar('GET', '/relatorios/horas?de=2026-11-30&ate=2026-11-01')).status).toBe(400);
    expect((await t.chamar('GET', '/relatorios/horas?tipo=reuniao')).status).toBe(400);
  });
});

describe('resumo por projeto e por cliente', () => {
  it('mostra horas e recebido do período e a posição atual', async () => {
    const r = (await t.chamar('GET', '/relatorios/projetos?de=2026-11-01&ate=2026-11-30')).corpo;
    const l = r.linhas.find((x: { projetoId: number }) => x.projetoId === loja);
    expect(l.periodo).toEqual({ desenvolvimentoSegundos: 2 * 3600, suporteSegundos: 5400, recebidoCentavos: 15000 });
    // Total: 9.000 + banner 500 + 2h × 100 + 30min × 150 + atendimento 150
    expect(l.atual.totalCentavos).toBe(900000 + 50000 + 20000 + 7500 + 15000);
    expect(l.atual.recebidoCentavos).toBe(300000 + 15000); // inclui outubro
    expect(l.atual.aFaturarCentavos).toBe(20000 + 7500);
    expect(l.atual.extrasFaturadosCentavos).toBe(50000 + 15000);
    expect(l.atual.pendenteCentavos).toBe(992500 - 315000);
    expect(r.linhas).toHaveLength(2); // orçamento fica fora do padrão "contratados"
    expect(r.totais.periodo.recebidoCentavos).toBe(15000 + 36000);
  });

  it('agrupa por cliente; orçamento entra em "todos" sem pendência', async () => {
    const r = (await t.chamar('GET', '/relatorios/clientes?status=todos')).corpo;
    expect(r.linhas.map((c: { cliente: string; projetos: number }) => [c.cliente, c.projetos])).toEqual([
      ['Ana Souza', 1],
      ['Carlos Mendes', 2],
    ]);
    const anaLinha = r.linhas[0];
    expect(anaLinha.atual.totalCentavos).toBe(300000);
    expect(anaLinha.atual.pendenteCentavos).toBe(0);
    expect(r.linhas[1].periodo.desenvolvimentoSegundos).toBe(9 * 3600); // sem período: tudo
    expect(site).toBeGreaterThan(0);
  });
});

describe('fechamento de projeto', () => {
  it('traz o projeto, todas as horas, serviços e pagamentos', async () => {
    const r = (await t.chamar('GET', `/relatorios/fechamento/${loja}`)).corpo;
    expect(r.projeto.nome).toBe('Loja virtual');
    expect(r.horas).toHaveLength(4); // 4h pacote, 2h correção, 30min suporte, atendimento
    expect(r.porCategoria[0]).toEqual({ categoria: 'desenvolvimento', segundos: 4 * 3600 });
    expect(r.servicos.map((s: { descricao: string }) => s.descricao)).toEqual(['Banner']);
    expect(r.pagamentos.map((p: { valorCentavos: number }) => p.valorCentavos)).toEqual([300000, 15000]);
    expect(r.projeto.financeiro.totalCentavos).toBe(992500);
    expect((await t.chamar('GET', '/relatorios/fechamento/9999')).status).toBe(404);
  });
});
