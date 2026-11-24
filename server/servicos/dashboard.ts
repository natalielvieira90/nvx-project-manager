import type { DatabaseSync } from 'node:sqlite';
import { STATUS_ATIVOS, STATUS_CONTRATADOS } from '../../shared/financeiro.ts';
import { resumirProjetos } from './financeiro.ts';
import { valorPorTempo } from '../../shared/formatacao.ts';
import type { IndicadoresDashboard } from '../../shared/tipos.ts';

/** Limites de um mês no horário LOCAL do computador, convertidos para ISO UTC. */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split('-').map(Number);
  return {
    inicio: new Date(ano, m - 1, 1).toISOString(),
    fim: new Date(ano, m, 1).toISOString(),
  };
}

export function mesAtual(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

/** Lista dos `quantidade` meses terminando em `mes` (inclusive), em ordem cronológica. */
export function mesesAte(mes: string, quantidade: number): string[] {
  const [ano, m] = mes.split('-').map(Number);
  return Array.from({ length: quantidade }, (_, i) => {
    const d = new Date(ano, m - 1 - (quantidade - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

const lista = (valores: readonly string[]) => valores.map((v) => `'${v}'`).join(',');

export function calcularIndicadores(db: DatabaseSync, mes: string): IndicadoresDashboard {
  const { inicio, fim } = limitesDoMes(mes);
  const n = (v: unknown) => Number(v ?? 0);

  // ---- Projetos ----
  const contagem = db
    .prepare(
      `SELECT
         SUM(status IN (${lista(STATUS_ATIVOS)})) AS ativos,
         SUM(status = 'concluido') AS concluidos,
         SUM(status IN ('orcamento','aguardando_aprovacao')) AS orcamento
       FROM projetos WHERE excluido_em IS NULL`,
    )
    .get()!;

  // ---- Faturamento (projetos contratados) ----
  let previsto = 0;
  let pendente = 0;
  for (const { financeiro } of resumirProjetos(db, `p.status IN (${lista(STATUS_CONTRATADOS)})`).values()) {
    previsto += financeiro.totalCentavos;
    pendente += financeiro.pendenteCentavos;
  }
  // Recebido segue o regime de caixa: todo dinheiro que entrou conta, inclusive de
  // projeto cancelado (ex.: sinal retido). Assim bate com o gráfico mensal.
  const recebido = n(
    db
      .prepare(
        `SELECT COALESCE(SUM(g.valor_centavos),0) AS total
         FROM pagamentos g JOIN projetos p ON p.id = g.projeto_id
         WHERE g.excluido_em IS NULL AND p.excluido_em IS NULL`,
      )
      .get()!.total,
  );

  // ---- Horas faturáveis ainda não cobradas (todas as épocas) ----
  const naoCobradoLanc = db
    .prepare(
      `SELECT l.categoria = 'suporte' AS suporte, SUM(l.duracao_segundos) AS seg,
              p.valor_hora_dev_centavos AS vdev, p.valor_hora_suporte_centavos AS vsup
       FROM lancamentos_horas l JOIN projetos p ON p.id = l.projeto_id
       WHERE l.excluido_em IS NULL AND p.excluido_em IS NULL AND p.status <> 'cancelado'
         AND l.atendimento_id IS NULL AND l.situacao_cobranca = 'faturavel'
       GROUP BY p.id, l.categoria = 'suporte'`,
    )
    .all();
  const naoCobradoAtend = db
    .prepare(
      `SELECT COALESCE(SUM(a.duracao_segundos),0) AS seg, COALESCE(SUM(a.valor_centavos),0) AS valor
       FROM atendimentos_suporte a JOIN projetos p ON p.id = a.projeto_id
       WHERE a.excluido_em IS NULL AND p.excluido_em IS NULL AND a.situacao = 'pendente'`,
    )
    .get()!;
  let naoCobradoSeg = n(naoCobradoAtend.seg);
  let naoCobradoValor = n(naoCobradoAtend.valor);
  for (const l of naoCobradoLanc) {
    naoCobradoSeg += n(l.seg);
    naoCobradoValor += valorPorTempo(n(l.seg), n(l.suporte) ? n(l.vsup) : n(l.vdev));
  }

  // ---- Horas do mês, por projeto ----
  // Suporte = atendimentos + lançamentos de categoria "suporte" sem atendimento vinculado
  // (os vinculados já estão contados no atendimento — evita contar duas vezes).
  const horasProjeto = db
    .prepare(
      `SELECT h.projeto_id, p.nome AS projeto, c.nome AS cliente,
              SUM(h.dev) AS dev, SUM(h.sup) AS sup
       FROM (
         SELECT projeto_id,
                CASE WHEN categoria <> 'suporte' THEN duracao_segundos ELSE 0 END AS dev,
                CASE WHEN categoria = 'suporte' AND atendimento_id IS NULL THEN duracao_segundos ELSE 0 END AS sup
         FROM lancamentos_horas
         WHERE excluido_em IS NULL AND inicio >= ? AND inicio < ?
         UNION ALL
         SELECT projeto_id, 0, duracao_segundos
         FROM atendimentos_suporte
         WHERE excluido_em IS NULL AND inicio >= ? AND inicio < ?
       ) h
       JOIN projetos p ON p.id = h.projeto_id AND p.excluido_em IS NULL
       JOIN clientes c ON c.id = p.cliente_id
       GROUP BY h.projeto_id
       HAVING SUM(h.dev) + SUM(h.sup) > 0
       ORDER BY SUM(h.dev) + SUM(h.sup) DESC`,
    )
    .all(inicio, fim, inicio, fim);

  const horasPorProjeto = horasProjeto.map((h) => ({
    projetoId: n(h.projeto_id),
    projeto: String(h.projeto),
    cliente: String(h.cliente),
    desenvolvimentoSegundos: n(h.dev),
    suporteSegundos: n(h.sup),
  }));
  const desenvolvimentoSegundos = horasPorProjeto.reduce((s, h) => s + h.desenvolvimentoSegundos, 0);
  const suporteSegundos = horasPorProjeto.reduce((s, h) => s + h.suporteSegundos, 0);

  // ---- Faturamento mensal (recebimentos dos últimos 12 meses) ----
  const meses = mesesAte(mes, 12);
  const porMes = new Map(
    db
      .prepare(
        `SELECT substr(data, 1, 7) AS mes, SUM(valor_centavos) AS total
         FROM pagamentos g JOIN projetos p ON p.id = g.projeto_id
         WHERE g.excluido_em IS NULL AND p.excluido_em IS NULL AND substr(data, 1, 7) BETWEEN ? AND ?
         GROUP BY substr(data, 1, 7)`,
      )
      .all(meses[0], meses[meses.length - 1])
      .map((r) => [String(r.mes), n(r.total)]),
  );
  const faturamentoMensal = meses.map((m) => ({ mes: m, recebidoCentavos: porMes.get(m) ?? 0 }));

  return {
    mes,
    projetos: { ativos: n(contagem.ativos), concluidos: n(contagem.concluidos), emOrcamento: n(contagem.orcamento) },
    horasMes: { totalSegundos: desenvolvimentoSegundos + suporteSegundos, desenvolvimentoSegundos, suporteSegundos },
    faturamento: {
      previstoCentavos: previsto,
      recebidoCentavos: recebido,
      pendenteCentavos: pendente,
      recebidoNoMesCentavos: porMes.get(mes) ?? 0,
    },
    naoCobrado: { segundos: naoCobradoSeg, valorCentavos: naoCobradoValor },
    faturamentoMensal,
    horasPorProjeto,
  };
}
