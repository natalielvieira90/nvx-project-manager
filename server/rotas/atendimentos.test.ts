import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { relogioDeTeste, servidorDeTeste } from '../testes/apoio.ts';

const relogio = relogioDeTeste('2026-11-24T20:00:00.000Z');
let t: Awaited<ReturnType<typeof servidorDeTeste>>;
let clienteId = 0;
let projetoId = 0;
let outroProjeto = 0;

beforeAll(async () => {
  t = await servidorDeTeste(relogio);
  clienteId = (await t.chamar('POST', '/clientes', { nome: 'Loja do Carlos' })).corpo.id;
  projetoId = (
    await t.chamar('POST', '/projetos', {
      clienteId, nome: 'Loja virtual', status: 'concluido', valorFechadoCentavos: 900000, valorHoraSuporteCentavos: 15000,
    })
  ).corpo.id;
  outroProjeto = (await t.chamar('POST', '/projetos', { clienteId, nome: 'App', status: 'em_andamento' })).corpo.id;
});
afterAll(() => t.fechar());

beforeEach(() => {
  for (const tabela of ['pagamentos', 'lancamentos_horas', 'atendimentos_suporte', 'cronometro_ativo']) t.db.prepare(`DELETE FROM ${tabela}`).run();
  relogio.definir('2026-11-24T20:00:00.000Z');
});

const novo = (extra: object = {}) => ({
  projetoId,
  inicio: '2026-11-24T13:00:00.000Z',
  fim: '2026-11-24T14:30:00.000Z',
  problema: 'Pix não confirmava',
  solucao: 'Webhook reconfigurado',
  valorCentavos: 22500,
  situacao: 'pendente',
  ...extra,
});

describe('atendimentos de suporte', () => {
  it('registra com cliente do projeto e tempo calculado', async () => {
    const r = await t.chamar('POST', '/atendimentos', novo());
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ clienteId, clienteNome: 'Loja do Carlos', duracaoSegundos: 5400, situacao: 'pendente', lancamentoId: null });
  });

  it('valida campos obrigatórios e horários', async () => {
    const r = await t.chamar('POST', '/atendimentos', { projetoId, problema: ' ', valorCentavos: -1 });
    expect(Object.keys(r.corpo.detalhes).sort()).toEqual(['fim', 'inicio', 'problema', 'valorCentavos']);
    const inv = await t.chamar('POST', '/atendimentos', novo({ fim: '2026-11-24T12:00:00.000Z' }));
    expect(inv.corpo.detalhes.fim).toContain('depois');
    const fut = await t.chamar('POST', '/atendimentos', novo({ inicio: '2026-11-24T21:00:00.000Z', fim: '2026-11-24T22:00:00.000Z' }));
    expect(fut.corpo.detalhes.fim).toContain('futuro');
  });

  it('impede horários sobrepostos com atendimentos e com lançamentos', async () => {
    await t.chamar('POST', '/atendimentos', novo());
    expect((await t.chamar('POST', '/atendimentos', novo({ inicio: '2026-11-24T14:00:00.000Z', fim: '2026-11-24T15:00:00.000Z' }))).status).toBe(409);
    // lançamento manual também não pode cair em cima do atendimento
    const l = await t.chamar('POST', '/lancamentos', {
      projetoId: outroProjeto, categoria: 'desenvolvimento', inicio: '2026-11-24T13:30:00.000Z', fim: '2026-11-24T13:45:00.000Z',
    });
    expect(l.status).toBe(409);
    expect(l.corpo.detalhes.inicio).toContain('atendimento');
  });

  it('marcar como pago registra o pagamento; desmarcar remove', async () => {
    const a = (await t.chamar('POST', '/atendimentos', novo({ situacao: 'pago' }))).corpo;
    const pagos = () => t.db.prepare('SELECT valor_centavos AS v FROM pagamentos WHERE atendimento_id = ? AND excluido_em IS NULL').all(a.id);
    expect(pagos()).toEqual([{ v: 22500 }]);
    expect((await t.chamar('GET', `/projetos/${projetoId}`)).corpo.financeiro.recebidoCentavos).toBe(22500);

    await t.chamar('PUT', `/atendimentos/${a.id}`, novo({ situacao: 'pago', valorCentavos: 30000 }));
    expect(pagos()).toEqual([{ v: 30000 }]); // valor atualizado, sem duplicar

    await t.chamar('PATCH', '/atendimentos/situacao', { ids: [a.id], situacao: 'faturado' });
    expect(pagos()).toEqual([]);

    await t.chamar('PATCH', '/atendimentos/situacao', { ids: [a.id], situacao: 'pago' });
    await t.chamar('DELETE', `/atendimentos/${a.id}`);
    expect(pagos()).toEqual([]);
  });

  it('entra no total do projeto e nas horas de suporte', async () => {
    await t.chamar('POST', '/atendimentos', novo());
    const p = (await t.chamar('GET', `/projetos/${projetoId}`)).corpo;
    expect(p.financeiro.atendimentosCentavos).toBe(22500);
    expect(p.financeiro.totalCentavos).toBe(900000 + 22500);
    expect(p.horas.suporteSegundos).toBe(5400);
    const d = (await t.chamar('GET', '/dashboard?mes=2026-11')).corpo;
    expect(d.naoCobrado).toEqual({ segundos: 5400, valorCentavos: 22500 });
  });

  it('converte lançamento de suporte (cronômetro) sem contar em dobro', async () => {
    relogio.definir('2026-11-24T15:00:00.000Z');
    await t.chamar('POST', '/cronometro/iniciar', { projetoId, categoria: 'suporte', descricao: 'Erro no frete' });
    relogio.avancar(1200);
    await t.chamar('POST', '/cronometro/pausar');
    relogio.avancar(600);
    await t.chamar('POST', '/cronometro/retomar');
    relogio.avancar(600);
    await t.chamar('POST', '/cronometro/finalizar', {});
    const [lanc] = (await t.chamar('GET', '/lancamentos')).corpo;
    expect(lanc.duracaoSegundos).toBe(1800);

    // antes: 30min de suporte avulso faturável (R$ 75,00)
    expect((await t.chamar('GET', `/projetos/${projetoId}`)).corpo.financeiro.horasSuporteCentavos).toBe(7500);

    const r = await t.chamar('POST', '/atendimentos', { projetoId, lancamentoId: lanc.id, problema: 'Erro no frete', valorCentavos: 7500 });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ duracaoSegundos: 1800, inicio: lanc.inicio, fim: lanc.fim, lancamentoId: lanc.id });

    const p = (await t.chamar('GET', `/projetos/${projetoId}`)).corpo;
    expect(p.horas.suporteSegundos).toBe(1800); // não dobrou
    expect(p.financeiro.horasSuporteCentavos).toBe(0); // o valor agora é do atendimento
    expect(p.financeiro.atendimentosCentavos).toBe(7500);

    // não converte duas vezes; lançamento vinculado não é editado pela tela de horas
    expect((await t.chamar('POST', '/atendimentos', { projetoId, lancamentoId: lanc.id, problema: 'x', valorCentavos: 0 })).status).toBe(409);
    expect((await t.chamar('DELETE', `/lancamentos/${lanc.id}`)).status).toBe(409);

    // horários travados na edição; excluir o atendimento devolve o lançamento como avulso
    const ed = await t.chamar('PUT', `/atendimentos/${r.corpo.id}`, {
      projetoId, inicio: '2026-11-24T10:00:00.000Z', fim: '2026-11-24T18:00:00.000Z', problema: 'Erro no frete (Correios)', valorCentavos: 7500,
    });
    expect(ed.corpo).toMatchObject({ inicio: lanc.inicio, duracaoSegundos: 1800, problema: 'Erro no frete (Correios)' });
    await t.chamar('DELETE', `/atendimentos/${r.corpo.id}`);
    expect((await t.chamar('GET', `/lancamentos/${lanc.id}`)).corpo.atendimentoId).toBeNull();
  });

  it('só converte lançamentos de suporte do mesmo projeto', async () => {
    const l = (
      await t.chamar('POST', '/lancamentos', {
        projetoId, categoria: 'desenvolvimento', inicio: '2026-11-24T08:00:00.000Z', fim: '2026-11-24T09:00:00.000Z',
      })
    ).corpo;
    expect((await t.chamar('POST', '/atendimentos', { projetoId, lancamentoId: l.id, problema: 'x', valorCentavos: 0 })).corpo.erro).toContain('Suporte');
  });

  it('filtra por situação, cliente e período', async () => {
    await t.chamar('POST', '/atendimentos', novo());
    await t.chamar('POST', '/atendimentos', novo({ inicio: '2026-10-10T13:00:00.000Z', fim: '2026-10-10T14:00:00.000Z', situacao: 'pago' }));
    expect((await t.chamar('GET', '/atendimentos?situacao=pago')).corpo).toHaveLength(1);
    expect((await t.chamar('GET', `/atendimentos?cliente=${clienteId}`)).corpo).toHaveLength(2);
    expect((await t.chamar('GET', '/atendimentos?de=2026-11-01T00:00:00.000Z')).corpo).toHaveLength(1);
    expect((await t.chamar('GET', '/atendimentos?situacao=xyz')).status).toBe(400);
  });
});
