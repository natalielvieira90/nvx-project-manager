import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { relogioDeTeste, servidorDeTeste } from '../testes/apoio.ts';

const relogio = relogioDeTeste();
let t: Awaited<ReturnType<typeof servidorDeTeste>>;
let projetoFechado = 0; // valor fechado > 0
let projetoPorHora = 0; // valor fechado = 0
let projetoCancelado = 0;

beforeAll(async () => {
  t = await servidorDeTeste(relogio);
  const cliente = (await t.chamar('POST', '/clientes', { nome: 'Cliente' })).corpo.id;
  const criar = async (nome: string, valor: number, status = 'em_andamento') =>
    (await t.chamar('POST', '/projetos', { clienteId: cliente, nome, valorFechadoCentavos: valor, status })).corpo.id;
  projetoFechado = await criar('Site', 500000);
  projetoPorHora = await criar('Consultoria', 0);
  projetoCancelado = await criar('Antigo', 0, 'cancelado');
});
afterAll(() => t.fechar());

describe('cronômetro', () => {
  beforeEach(() => {
    t.db.prepare('DELETE FROM cronometro_ativo').run();
    t.db.prepare('DELETE FROM lancamentos_horas').run();
    relogio.definir('2026-11-24T12:00:00.000Z');
  });

  it('inicia, pausa, retoma e finaliza descontando as pausas', async () => {
    const ini = await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoFechado, categoria: 'desenvolvimento', descricao: 'Home' });
    expect(ini.status).toBe(201);

    relogio.avancar(30 * 60); // 30 min trabalhando
    expect((await t.chamar('GET', '/cronometro')).corpo.segundosDecorridos).toBe(1800);

    await t.chamar('POST', '/cronometro/pausar');
    relogio.avancar(60 * 60); // 1h de pausa (não conta)
    expect((await t.chamar('GET', '/cronometro')).corpo.segundosDecorridos).toBe(1800);

    await t.chamar('POST', '/cronometro/retomar');
    relogio.avancar(15 * 60); // +15 min
    const fim = await t.chamar('POST', '/cronometro/finalizar', {});
    expect(fim.status).toBe(201);
    expect(fim.corpo.duracaoSegundos).toBe(45 * 60);

    const [l] = (await t.chamar('GET', '/lancamentos')).corpo;
    expect(l).toMatchObject({
      origem: 'cronometro',
      categoria: 'desenvolvimento',
      descricao: 'Home',
      inicio: '2026-11-24T12:00:00.000Z',
      fim: '2026-11-24T13:45:00.000Z',
      duracaoSegundos: 2700,
      situacaoCobranca: 'incluido_pacote', // projeto com valor fechado
    });
    expect((await t.chamar('GET', '/cronometro')).corpo).toBeNull();
  });

  it('continua correto após "fechar o programa" (o tempo vem do banco)', async () => {
    await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoPorHora, categoria: 'reuniao' });
    relogio.avancar(3 * 3600 + 7); // programa fechado por 3h
    const c = (await t.chamar('GET', '/cronometro')).corpo;
    expect(c.segundosDecorridos).toBe(3 * 3600 + 7);
    expect(c.projetoNome).toBe('Consultoria');
  });

  it('não permite dois cronômetros simultâneos', async () => {
    await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoFechado, categoria: 'desenvolvimento' });
    const r = await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoPorHora, categoria: 'reuniao' });
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toContain('Site');
  });

  it('finalizado em pausa usa o horário da pausa como fim', async () => {
    await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoPorHora, categoria: 'suporte' });
    relogio.avancar(600);
    await t.chamar('POST', '/cronometro/pausar');
    relogio.avancar(5 * 3600); // esqueceu pausado
    await t.chamar('POST', '/cronometro/finalizar', { descricao: 'Ajuste no servidor', situacaoCobranca: 'faturado' });
    const [l] = (await t.chamar('GET', '/lancamentos')).corpo;
    expect(l).toMatchObject({ fim: '2026-11-24T12:10:00.000Z', duracaoSegundos: 600, descricao: 'Ajuste no servidor', situacaoCobranca: 'faturado' });
  });

  it('sugere cobrança: suporte e projeto por hora são faturáveis', async () => {
    await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoPorHora, categoria: 'desenvolvimento' });
    relogio.avancar(60);
    await t.chamar('POST', '/cronometro/finalizar', {});
    expect((await t.chamar('GET', '/lancamentos')).corpo[0].situacaoCobranca).toBe('faturavel');
  });

  it('permite trocar projeto e descrição sem parar', async () => {
    await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoFechado, categoria: 'desenvolvimento' });
    relogio.avancar(120);
    const r = await t.chamar('PUT', '/cronometro', { projetoId: projetoPorHora, categoria: 'planejamento', descricao: 'Escopo' });
    expect(r.corpo).toMatchObject({ projetoNome: 'Consultoria', categoria: 'planejamento', descricao: 'Escopo', segundosDecorridos: 120 });
  });

  it('valida projeto e estados inválidos', async () => {
    expect((await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoCancelado, categoria: 'desenvolvimento' })).corpo.detalhes.projetoId).toContain('cancelado');
    expect((await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoFechado, categoria: 'xyz' })).status).toBe(400);
    expect((await t.chamar('POST', '/cronometro/pausar')).status).toBe(404);
    await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoFechado, categoria: 'desenvolvimento' });
    expect((await t.chamar('POST', '/cronometro/retomar')).status).toBe(409);
    expect((await t.chamar('POST', '/cronometro/finalizar', {})).status).toBe(400); // 0 segundos
  });

  it('descarta sem gerar lançamento', async () => {
    await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoFechado, categoria: 'desenvolvimento' });
    relogio.avancar(300);
    expect((await t.chamar('DELETE', '/cronometro')).status).toBe(204);
    expect((await t.chamar('GET', '/lancamentos')).corpo).toEqual([]);
  });
});

describe('lançamentos manuais', () => {
  beforeEach(() => {
    t.db.prepare('DELETE FROM cronometro_ativo').run();
    t.db.prepare('DELETE FROM lancamentos_horas').run();
    relogio.definir('2026-11-24T20:00:00.000Z');
  });
  const lanc = (inicio: string, fim: string, extra: object = {}) => ({
    projetoId: projetoFechado,
    categoria: 'desenvolvimento',
    inicio,
    fim,
    ...extra,
  });

  it('cria com duração calculada', async () => {
    const r = await t.chamar('POST', '/lancamentos', lanc('2026-11-24T12:00:00.000Z', '2026-11-24T13:30:00.000Z', { situacaoCobranca: 'faturavel' }));
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ origem: 'manual', duracaoSegundos: 5400, situacaoCobranca: 'faturavel' });
  });

  it('bloqueia horário sobreposto (duplicado)', async () => {
    await t.chamar('POST', '/lancamentos', lanc('2026-11-24T12:00:00.000Z', '2026-11-24T13:00:00.000Z'));
    const r = await t.chamar('POST', '/lancamentos', lanc('2026-11-24T12:30:00.000Z', '2026-11-24T14:00:00.000Z'));
    expect(r.status).toBe(409);
    expect(r.corpo.detalhes.inicio).toContain('Conflita');
    // Encostado (começa quando o outro termina) é permitido
    expect((await t.chamar('POST', '/lancamentos', lanc('2026-11-24T13:00:00.000Z', '2026-11-24T14:00:00.000Z'))).status).toBe(201);
  });

  it('valida horários', async () => {
    const invertido = await t.chamar('POST', '/lancamentos', lanc('2026-11-24T13:00:00.000Z', '2026-11-24T12:00:00.000Z'));
    expect(invertido.corpo.detalhes.fim).toContain('depois');
    const longo = await t.chamar('POST', '/lancamentos', lanc('2026-11-20T12:00:00.000Z', '2026-11-21T12:00:01.000Z'));
    expect(longo.corpo.detalhes.fim).toContain('24 horas');
    const futuro = await t.chamar('POST', '/lancamentos', lanc('2026-11-24T21:00:00.000Z', '2026-11-24T22:00:00.000Z'));
    expect(futuro.corpo.detalhes.fim).toContain('futuro');
    const formato = await t.chamar('POST', '/lancamentos', lanc('24/11/2026 12:00', '2026-11-24T13:00:00.000Z'));
    expect(formato.corpo.detalhes.inicio).toBeTruthy();
  });

  it('edita, filtra, muda situação em lote e exclui', async () => {
    const a = (await t.chamar('POST', '/lancamentos', lanc('2026-11-24T10:00:00.000Z', '2026-11-24T11:00:00.000Z'))).corpo;
    const b = (await t.chamar('POST', '/lancamentos', lanc('2026-11-23T10:00:00.000Z', '2026-11-23T12:00:00.000Z', { categoria: 'suporte', projetoId: projetoPorHora }))).corpo;

    const editado = await t.chamar('PUT', `/lancamentos/${a.id}`, lanc('2026-11-24T10:00:00.000Z', '2026-11-24T11:30:00.000Z', { descricao: 'Ajustado' }));
    expect(editado.corpo).toMatchObject({ duracaoSegundos: 5400, descricao: 'Ajustado' });

    expect((await t.chamar('GET', `/lancamentos?projeto=${projetoPorHora}`)).corpo.map((l: { id: number }) => l.id)).toEqual([b.id]);
    expect((await t.chamar('GET', '/lancamentos?categoria=suporte')).corpo).toHaveLength(1);
    expect((await t.chamar('GET', '/lancamentos?de=2026-11-24T00:00:00.000Z')).corpo).toHaveLength(1);

    const lote = await t.chamar('PATCH', '/lancamentos/situacao', { ids: [a.id, b.id], situacaoCobranca: 'faturado' });
    expect(lote.corpo.alterados).toBe(2);
    expect((await t.chamar('GET', '/lancamentos?situacao=faturado')).corpo).toHaveLength(2);

    expect((await t.chamar('DELETE', `/lancamentos/${a.id}`)).status).toBe(204);
    expect((await t.chamar('GET', '/lancamentos')).corpo).toHaveLength(1);
    // Horário liberado após exclusão
    expect((await t.chamar('POST', '/lancamentos', lanc('2026-11-24T10:00:00.000Z', '2026-11-24T11:00:00.000Z'))).status).toBe(201);
  });

  it('edição de lançamento do cronômetro mantém a duração (com pausas) se os horários não mudam', async () => {
    relogio.definir('2026-11-24T12:00:00.000Z');
    await t.chamar('POST', '/cronometro/iniciar', { projetoId: projetoFechado, categoria: 'desenvolvimento' });
    relogio.avancar(1800);
    await t.chamar('POST', '/cronometro/pausar');
    relogio.avancar(1800);
    await t.chamar('POST', '/cronometro/retomar');
    relogio.avancar(600);
    await t.chamar('POST', '/cronometro/finalizar', {});
    const [l] = (await t.chamar('GET', '/lancamentos')).corpo;
    expect(l.duracaoSegundos).toBe(2400);
    const r = await t.chamar('PUT', `/lancamentos/${l.id}`, { ...lanc(l.inicio, l.fim), descricao: 'Só a descrição' });
    expect(r.corpo.duracaoSegundos).toBe(2400);
  });

  it('as horas lançadas aparecem no dashboard e no projeto', async () => {
    relogio.definir('2026-11-24T20:00:00.000Z');
    await t.chamar('POST', '/lancamentos', lanc('2026-11-24T12:00:00.000Z', '2026-11-24T14:00:00.000Z'));
    const d = (await t.chamar('GET', '/dashboard?mes=2026-11')).corpo;
    expect(d.horasMes.desenvolvimentoSegundos).toBe(7200);
    expect((await t.chamar('GET', `/projetos/${projetoFechado}`)).corpo.horas.totalSegundos).toBe(7200);
  });
});
