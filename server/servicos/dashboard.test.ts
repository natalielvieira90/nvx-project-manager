import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { abrirBanco } from '../db/conexao.ts';
import { calcularIndicadores, limitesDoMes, mesesAte } from './dashboard.ts';
import { calcularFinanceiroProjeto } from '../../shared/financeiro.ts';

const H = 3600;
/** Horário local em novembro/2026 convertido para ISO UTC (como o sistema grava). */
const nov = (dia: number, hora: number, min = 0) => new Date(2026, 10, dia, hora, min).toISOString();

function semear(db: DatabaseSync) {
  const exec = (sql: string, ...p: (string | number | null)[]) => db.prepare(sql).run(...p);
  exec("INSERT INTO clientes (id, nome) VALUES (1, 'Padaria Sol')");

  const projeto = (id: number, nome: string, status: string, valor: number, excluido: string | null = null) =>
    exec(
      `INSERT INTO projetos (id, cliente_id, nome, status, valor_fechado_centavos, valor_hora_dev_centavos,
         valor_hora_suporte_centavos, desconto_centavos, excluido_em) VALUES (?, 1, ?, ?, ?, 10000, 15000, ?, ?)`,
      id, nome, status, valor, id === 1 ? 20000 : 0, excluido,
    );
  projeto(1, 'Site', 'em_andamento', 500000);
  projeto(2, 'App', 'orcamento', 999900);
  projeto(3, 'Loja', 'concluido', 100000);
  projeto(4, 'Cancelado', 'cancelado', 700000);
  projeto(5, 'Excluído', 'em_andamento', 800000, nov(1, 8));

  const lanc = (proj: number, cat: string, ini: string, fim: string, seg: number, sit: string, atend: number | null = null) =>
    exec(
      `INSERT INTO lancamentos_horas (projeto_id, categoria, inicio, fim, duracao_segundos, origem, situacao_cobranca, atendimento_id)
       VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`,
      proj, cat, ini, fim, seg, sit, atend,
    );

  // Atendimento de 1h, R$ 120,00, pendente
  exec(
    `INSERT INTO atendimentos_suporte (id, cliente_id, projeto_id, inicio, fim, duracao_segundos, problema, valor_centavos, situacao)
     VALUES (1, 1, 1, ?, ?, ?, 'Erro no formulário', 12000, 'pendente')`,
    nov(10, 9), nov(10, 10), H,
  );

  lanc(1, 'desenvolvimento', nov(3, 9), nov(3, 11), 2 * H, 'incluido_pacote'); // não cobra
  lanc(1, 'desenvolvimento', nov(4, 9), nov(4, 10, 30), 1.5 * H, 'faturavel'); // R$ 150,00
  lanc(1, 'suporte', nov(5, 9), nov(5, 10), H, 'faturado'); // avulso: R$ 150,00
  lanc(1, 'suporte', nov(10, 9), nov(10, 9, 30), 0.5 * H, 'faturavel', 1); // vinculado: não soma
  lanc(2, 'desenvolvimento', nov(6, 9), nov(6, 10), H, 'faturavel'); // orçamento: só horas
  lanc(5, 'desenvolvimento', nov(6, 9), nov(6, 10), H, 'faturavel'); // projeto excluído: ignora
  lanc(1, 'desenvolvimento', new Date(2026, 9, 31, 22).toISOString(), new Date(2026, 9, 31, 23).toISOString(), H, 'incluido_pacote'); // outubro

  exec("INSERT INTO servicos_adicionais (projeto_id, descricao, data, valor_centavos) VALUES (1, 'Logo', '2026-11-02', 30000)");
  exec("INSERT INTO pagamentos (projeto_id, data, valor_centavos) VALUES (1, '2026-11-20', 200000)");
  exec("INSERT INTO pagamentos (projeto_id, data, valor_centavos) VALUES (1, '2026-10-20', 100000)");
  exec("INSERT INTO pagamentos (projeto_id, data, valor_centavos) VALUES (3, '2026-11-21', 150000)");
  exec("INSERT INTO pagamentos (projeto_id, data, valor_centavos) VALUES (4, '2026-11-21', 999)"); // cancelado
}

describe('calcularFinanceiroProjeto', () => {
  const base = {
    valorFechadoCentavos: 0, descontoCentavos: 0, valorHoraDevCentavos: 10000, valorHoraSuporteCentavos: 15000,
    servicosAdicionaisCentavos: 0, segundosDevCobraveis: 0, segundosSuporteAvulsoCobraveis: 0,
    atendimentosCentavos: 0, recebidoCentavos: 0,
    segundosDevFaturaveis: 0, segundosSuporteAvulsoFaturaveis: 0, servicosFaturaveisCentavos: 0, atendimentosPendentesCentavos: 0,
    segundosDevTrabalhados: 0, segundosSuporteTrabalhados: 0,
  };
  it('desconto nunca deixa o total negativo', () => {
    expect(calcularFinanceiroProjeto({ ...base, valorFechadoCentavos: 100, descontoCentavos: 500 }).totalCentavos).toBe(0);
  });
  it('pagamento a maior não gera pendência negativa', () => {
    expect(calcularFinanceiroProjeto({ ...base, valorFechadoCentavos: 100, recebidoCentavos: 500 }).pendenteCentavos).toBe(0);
  });
  it('custo estimado usa todas as horas; valor/hora efetivo = total / horas', () => {
    // R$ 1.000 fechado, 8h dev (R$ 100/h) + 2h suporte (R$ 150/h) trabalhadas, todas no pacote
    const r = calcularFinanceiroProjeto({ ...base, valorFechadoCentavos: 100000, segundosDevTrabalhados: 8 * 3600, segundosSuporteTrabalhados: 2 * 3600 });
    expect(r.totalCentavos).toBe(100000); // horas do pacote não somam ao total
    expect(r.custoHorasCentavos).toBe(80000 + 30000);
    expect(r.resultadoCentavos).toBe(-10000);
    expect(r.valorHoraEfetivoCentavos).toBe(10000);
    expect(calcularFinanceiroProjeto(base).valorHoraEfetivoCentavos).toBeNull();
  });
  it('a faturar soma só o que ainda não foi faturado', () => {
    const r = calcularFinanceiroProjeto({
      ...base, segundosDevCobraveis: 3 * 3600, segundosDevFaturaveis: 3600, servicosAdicionaisCentavos: 50000,
      servicosFaturaveisCentavos: 20000, atendimentosCentavos: 9000, atendimentosPendentesCentavos: 4000,
    });
    expect(r.aFaturarCentavos).toBe(10000 + 20000 + 4000);
  });
});

describe('indicadores do dashboard', () => {
  const db = abrirBanco(':memory:');
  semear(db);
  const r = calcularIndicadores(db, '2026-11');

  it('conta projetos por situação, ignorando excluídos', () => {
    expect(r.projetos).toEqual({ ativos: 1, concluidos: 1, emOrcamento: 1 });
  });

  it('calcula faturamento previsto, recebido e pendente', () => {
    // Site: 5000 + 300 (serviço) + 150 (1h30 dev) + 150 (1h suporte avulso) + 120 (atendimento) − 200 = 5520
    // Loja: 1000 (pago 1500 → pendente 0). Orçamento, cancelado e excluído não entram.
    expect(r.faturamento.previstoCentavos).toBe(552000 + 100000);
    // Recebido = regime de caixa: inclui os R$ 9,99 recebidos no projeto cancelado.
    expect(r.faturamento.recebidoCentavos).toBe(300000 + 150000 + 999);
    expect(r.faturamento.pendenteCentavos).toBe(252000);
    expect(r.faturamento.recebidoNoMesCentavos).toBe(200000 + 150000 + 999);
  });

  it('separa horas de desenvolvimento e suporte sem contar em dobro', () => {
    // Dev: 2h + 1h30 (Site) + 1h (App). Suporte: 1h avulso + 1h atendimento (os 30min vinculados não somam).
    expect(r.horasMes.desenvolvimentoSegundos).toBe(4.5 * H);
    expect(r.horasMes.suporteSegundos).toBe(2 * H);
    expect(r.horasMes.totalSegundos).toBe(6.5 * H);
    expect(r.horasPorProjeto.map((p) => p.projeto)).toEqual(['Site', 'App']);
  });

  it('soma apenas horas faturáveis ainda não cobradas', () => {
    // 1h30 dev faturável (R$150) + 1h dev faturável no orçamento App (R$100) + atendimento pendente 1h (R$120)
    expect(r.naoCobrado.segundos).toBe(3.5 * H);
    expect(r.naoCobrado.valorCentavos).toBe(15000 + 10000 + 12000);
  });

  it('monta 12 meses de faturamento terminando no mês escolhido', () => {
    expect(r.faturamentoMensal).toHaveLength(12);
    expect(r.faturamentoMensal.at(-1)).toEqual({ mes: '2026-11', recebidoCentavos: 350999 });
    expect(r.faturamentoMensal.at(-2)).toEqual({ mes: '2026-10', recebidoCentavos: 100000 });
    expect(r.faturamentoMensal[0].mes).toBe('2025-12');
  });

  it('banco vazio retorna zeros', () => {
    const vazio = calcularIndicadores(abrirBanco(':memory:'), '2026-11');
    expect(vazio.faturamento.previstoCentavos).toBe(0);
    expect(vazio.horasPorProjeto).toEqual([]);
  });
});

describe('utilitários de mês', () => {
  it('atravessa a virada do ano', () => {
    expect(mesesAte('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    const { inicio, fim } = limitesDoMes('2026-12');
    expect(new Date(inicio).getMonth()).toBe(11);
    expect(new Date(fim).getFullYear()).toBe(2027);
  });
});
