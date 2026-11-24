/**
 * Fluxo completo de uso e conferência cruzada: os mesmos números precisam aparecer iguais no
 * projeto, no dashboard, no financeiro, nos relatórios e no fechamento.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { relogioDeTeste, servidorDeTeste } from './apoio.ts';

const relogio = relogioDeTeste('2026-11-02T12:00:00.000Z');
let t: Awaited<ReturnType<typeof servidorDeTeste>>;

beforeAll(async () => {
  t = await servidorDeTeste(relogio);
});
afterAll(() => t.fechar());

const ok = async (metodo: string, caminho: string, corpo?: unknown) => {
  const r = await t.chamar(metodo, caminho, corpo);
  if (r.status >= 400) throw new Error(`${metodo} ${caminho} → ${r.status}: ${JSON.stringify(r.corpo)}`);
  return r.corpo;
};

describe('fluxo completo de um projeto', () => {
  it('do cadastro ao fechamento, com valores consistentes em todas as telas', async () => {
    // 1. Cadastro
    const cliente = await ok('POST', '/clientes', { nome: 'Padaria Pão Quente', documento: '11.222.333/0001-81', email: 'padaria@exemplo.com' });
    const projeto = await ok('POST', '/projetos', {
      clienteId: cliente.id, nome: 'Sistema de pedidos', status: 'em_andamento', dataInicio: '2026-11-01', prazoEntrega: '2026-12-15',
      valorFechadoCentavos: 800000, estimativaSegundos: 40 * 3600, valorHoraDevCentavos: 12000, valorHoraSuporteCentavos: 15000,
    });

    // 2. Cronômetro: 2h de desenvolvimento com 15min de pausa (no pacote, padrão do projeto fechado)
    await ok('POST', '/cronometro/iniciar', { projetoId: projeto.id, categoria: 'desenvolvimento', descricao: 'Cadastro de produtos' });
    relogio.avancar(3600);
    await ok('POST', '/cronometro/pausar');
    relogio.avancar(900);
    await ok('POST', '/cronometro/retomar');
    relogio.avancar(3600);
    const fim = await ok('POST', '/cronometro/finalizar', {});
    expect(fim.duracaoSegundos).toBe(7200);
    expect((await ok('GET', `/lancamentos/${fim.lancamentoId}`)).situacaoCobranca).toBe('incluido_pacote');

    // 3. Hora extra fora do escopo (faturável) e suporte pelo cronômetro convertido em atendimento
    relogio.definir('2026-11-05T18:00:00.000Z');
    await ok('POST', '/lancamentos', {
      projetoId: projeto.id, categoria: 'correcao', descricao: 'Ajuste pedido pelo cliente',
      inicio: '2026-11-04T12:00:00.000Z', fim: '2026-11-04T15:00:00.000Z', situacaoCobranca: 'faturavel',
    }); // 3h × 120 = 360
    await ok('POST', '/cronometro/iniciar', { projetoId: projeto.id, categoria: 'suporte', descricao: 'Impressora não imprime' });
    relogio.avancar(2700);
    const sup = await ok('POST', '/cronometro/finalizar', {});
    await ok('POST', '/atendimentos', { projetoId: projeto.id, lancamentoId: sup.lancamentoId, problema: 'Impressora não imprime', solucao: 'Driver', valorCentavos: 11250 });

    // 4. Financeiro: serviço adicional, desconto, pagamentos
    await ok('POST', '/servicos', { projetoId: projeto.id, descricao: 'Cardápio em PDF', data: '2026-11-05', valorCentavos: 40000 });
    await ok('PATCH', `/projetos/${projeto.id}/desconto`, { descontoCentavos: 21250 });
    await ok('POST', '/pagamentos', { projetoId: projeto.id, data: '2026-11-03', valorCentavos: 400000, forma: 'pix', observacoes: 'Entrada' });

    // Total = 8.000 + 400 (serviço) + 360 (3h) + 112,50 (atendimento) − 212,50 = 8.660
    const TOTAL = 866000;
    const det = await ok('GET', `/projetos/${projeto.id}`);
    expect(det.financeiro).toMatchObject({ totalCentavos: TOTAL, recebidoCentavos: 400000, pendenteCentavos: TOTAL - 400000 });
    expect(det.financeiro.aFaturarCentavos).toBe(40000 + 36000 + 11250);
    expect(det.horas).toEqual({ desenvolvimentoSegundos: 7200 + 10800, suporteSegundos: 2700, totalSegundos: 20700 });

    // 5. Mesmos números no dashboard, financeiro, relatórios e fechamento
    const dash = await ok('GET', '/dashboard?mes=2026-11');
    expect(dash.faturamento).toMatchObject({ previstoCentavos: TOTAL, recebidoCentavos: 400000, pendenteCentavos: TOTAL - 400000, recebidoNoMesCentavos: 400000 });
    expect(dash.horasMes.totalSegundos).toBe(20700);

    const fin = await ok('GET', '/financeiro');
    expect(fin.totais).toEqual({ totalCentavos: TOTAL, recebidoCentavos: 400000, pendenteCentavos: TOTAL - 400000, aFaturarCentavos: 87250 });

    const relProj = await ok('GET', '/relatorios/projetos?de=2026-11-01&ate=2026-11-30');
    expect(relProj.linhas[0].atual).toMatchObject({ totalCentavos: TOTAL, pendenteCentavos: TOTAL - 400000, aFaturarCentavos: 87250 });
    expect(relProj.linhas[0].periodo).toEqual({ desenvolvimentoSegundos: 18000, suporteSegundos: 2700, recebidoCentavos: 400000 });

    const relHoras = await ok('GET', `/relatorios/horas?projeto=${projeto.id}`);
    expect(relHoras.totais.totalSegundos).toBe(20700); // atendimento não conta duas vezes
    expect(relHoras.totais.aFaturarCentavos).toBe(36000 + 11250);

    const fech = await ok('GET', `/relatorios/fechamento/${projeto.id}`);
    expect(fech.projeto.financeiro.totalCentavos).toBe(TOTAL);
    expect(fech.horas).toHaveLength(3);

    // 6. Cobrança emitida e cliente paga o restante
    await ok('POST', `/financeiro/projetos/${projeto.id}/faturar`);
    await ok('POST', '/pagamentos', { projetoId: projeto.id, data: '2026-11-05', valorCentavos: TOTAL - 400000, forma: 'boleto' });
    await ok('PATCH', `/projetos/${projeto.id}/status`, { status: 'concluido' });
    const final = await ok('GET', `/projetos/${projeto.id}`);
    expect(final.financeiro).toMatchObject({ totalCentavos: TOTAL, pendenteCentavos: 0, aFaturarCentavos: 0 });
    const dashFinal = await ok('GET', '/dashboard?mes=2026-11');
    expect(dashFinal.projetos).toEqual({ ativos: 0, concluidos: 1, emOrcamento: 0 });
    expect(dashFinal.naoCobrado).toEqual({ segundos: 0, valorCentavos: 0 });
  });
});

describe('volume de dados', () => {
  it('responde rápido com milhares de registros', async () => {
    const cliente = await ok('POST', '/clientes', { nome: 'Cliente Volume' });
    const ids: number[] = [];
    for (let i = 0; i < 30; i++) {
      ids.push((await ok('POST', '/projetos', { clienteId: cliente.id, nome: `Projeto ${i}`, status: 'em_andamento', valorHoraDevCentavos: 10000 })).id);
    }
    // 15.000 lançamentos de 1h ao longo de ~2 anos (inseridos direto no banco para acelerar o teste).
    const inserir = t.db.prepare(
      `INSERT INTO lancamentos_horas (projeto_id, categoria, inicio, fim, duracao_segundos, origem, situacao_cobranca)
       VALUES (?, 'desenvolvimento', ?, ?, 3600, 'manual', 'faturavel')`,
    );
    const base = Date.parse('2024-01-01T00:00:00.000Z');
    t.db.exec('BEGIN');
    for (let i = 0; i < 15000; i++) {
      const inicio = base + i * 4 * 3600 * 1000;
      inserir.run(ids[i % ids.length], new Date(inicio).toISOString(), new Date(inicio + 3600_000).toISOString());
    }
    t.db.exec('COMMIT');

    const medir = async (caminho: string) => {
      const ini = performance.now();
      await ok('GET', caminho);
      return performance.now() - ini;
    };
    const tempos = {
      dashboard: await medir('/dashboard?mes=2025-06'),
      financeiro: await medir('/financeiro'),
      projetos: await medir('/projetos'),
      horasDoMes: await medir('/lancamentos?de=2025-06-01T00:00:00.000Z&ate=2025-07-01T00:00:00.000Z'),
      relatorioAno: await medir('/relatorios/horas?de=2025-01-01&ate=2025-12-31'),
    };
    if (process.env.MOSTRAR_TEMPOS) console.info(tempos);
    for (const ms of Object.values(tempos)) expect(ms).toBeLessThan(2000);
  }, 60_000);
});
