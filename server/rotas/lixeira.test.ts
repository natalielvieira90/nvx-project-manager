import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { relogioDeTeste, servidorDeTeste } from '../testes/apoio.ts';

const relogio = relogioDeTeste('2026-11-24T20:00:00.000Z');
let t: Awaited<ReturnType<typeof servidorDeTeste>>;
let cliente = 0;
let projeto = 0;

beforeAll(async () => {
  t = await servidorDeTeste(relogio);
  cliente = (await t.chamar('POST', '/clientes', { nome: 'Carlos Mendes', email: 'carlos@exemplo.com' })).corpo.id;
  projeto = (await t.chamar('POST', '/projetos', {
    clienteId: cliente, nome: 'Loja', status: 'em_andamento', valorFechadoCentavos: 500000, valorHoraSuporteCentavos: 15000,
  })).corpo.id;
});
afterAll(() => t.fechar());

const lixeira = async () => (await t.chamar('GET', '/lixeira')).corpo as { tipo: string; id: number; bloqueio: string | null }[];
const restaurar = (tipo: string, id: number) => t.chamar('POST', `/lixeira/${tipo}/${id}/restaurar`);

describe('lixeira', () => {
  it('lista e restaura pagamento e serviço excluídos', async () => {
    const pag = (await t.chamar('POST', '/pagamentos', { projetoId: projeto, data: '2026-11-20', valorCentavos: 100000 })).corpo;
    const serv = (await t.chamar('POST', '/servicos', { projetoId: projeto, descricao: 'Banner', data: '2026-11-20', valorCentavos: 30000 })).corpo;
    await t.chamar('DELETE', `/pagamentos/${pag.id}`);
    await t.chamar('DELETE', `/servicos/${serv.id}`);
    expect((await lixeira()).map((i) => i.tipo).sort()).toEqual(['pagamento', 'servico']);

    expect((await restaurar('pagamento', pag.id)).status).toBe(200);
    expect((await restaurar('servico', serv.id)).status).toBe(200);
    const f = (await t.chamar('GET', `/projetos/${projeto}`)).corpo.financeiro;
    expect(f.recebidoCentavos).toBe(100000);
    expect(f.servicosAdicionaisCentavos).toBe(30000);
    expect(await lixeira()).toEqual([]);
    expect((await restaurar('pagamento', pag.id)).status).toBe(404); // já restaurado
  });

  it('projeto volta com todos os seus registros; filhos de projeto excluído ficam bloqueados', async () => {
    const lanc = (await t.chamar('POST', '/lancamentos', {
      projetoId: projeto, categoria: 'desenvolvimento', inicio: '2026-11-23T12:00:00.000Z', fim: '2026-11-23T14:00:00.000Z',
    })).corpo;
    await t.chamar('DELETE', `/lancamentos/${lanc.id}`);
    await t.chamar('DELETE', `/projetos/${projeto}`);
    const itens = await lixeira();
    expect(itens.find((i) => i.tipo === 'lancamento')!.bloqueio).toContain('projeto');
    expect((await restaurar('lancamento', lanc.id)).status).toBe(409);

    expect((await restaurar('projeto', projeto)).status).toBe(200);
    expect((await t.chamar('GET', `/projetos/${projeto}`)).corpo.financeiro.recebidoCentavos).toBe(100000);
    expect((await restaurar('lancamento', lanc.id)).status).toBe(200);
  });

  it('não restaura se criar horário sobreposto', async () => {
    const a = (await t.chamar('POST', '/lancamentos', {
      projetoId: projeto, categoria: 'reuniao', inicio: '2026-11-22T12:00:00.000Z', fim: '2026-11-22T13:00:00.000Z',
    })).corpo;
    await t.chamar('DELETE', `/lancamentos/${a.id}`);
    await t.chamar('POST', '/lancamentos', {
      projetoId: projeto, categoria: 'desenvolvimento', inicio: '2026-11-22T12:30:00.000Z', fim: '2026-11-22T14:00:00.000Z',
    });
    const r = await restaurar('lancamento', a.id);
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toContain('conflita');
  });

  it('restaurar atendimento pago recria o pagamento automático', async () => {
    const at = (await t.chamar('POST', '/atendimentos', {
      projetoId: projeto, inicio: '2026-11-21T12:00:00.000Z', fim: '2026-11-21T13:00:00.000Z', problema: 'Pix', valorCentavos: 15000, situacao: 'pago',
    })).corpo;
    const recebido = async () => (await t.chamar('GET', `/projetos/${projeto}`)).corpo.financeiro.recebidoCentavos;
    const antes = await recebido();
    await t.chamar('DELETE', `/atendimentos/${at.id}`);
    expect(await recebido()).toBe(antes - 15000);
    // O pagamento automático não aparece sozinho na lixeira.
    expect((await lixeira()).filter((i) => i.tipo === 'pagamento')).toEqual([]);
    expect((await restaurar('atendimento', at.id)).status).toBe(200);
    expect(await recebido()).toBe(antes);
  });

  it('cliente não volta se outro ativo já usa o mesmo e-mail', async () => {
    const c = (await t.chamar('POST', '/clientes', { nome: 'Ana', email: 'ana@exemplo.com' })).corpo;
    await t.chamar('DELETE', `/clientes/${c.id}`);
    await t.chamar('POST', '/clientes', { nome: 'Ana Souza', email: 'ana@exemplo.com' });
    const r = await restaurar('cliente', c.id);
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toContain('Ana Souza');
    expect((await restaurar('xyz', 1)).status).toBe(400);
  });
});
