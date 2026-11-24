import type { DatabaseSync } from 'node:sqlite';
import {
  calcularFinanceiroProjeto,
  type DadosFinanceirosProjeto,
  type ResultadoFinanceiroProjeto,
} from '../../shared/financeiro.ts';
import type { FinanceiroProjeto } from '../../shared/tipos.ts';

export interface ResumoProjeto {
  dados: DadosFinanceirosProjeto;
  financeiro: ResultadoFinanceiroProjeto;
  /** Horas trabalhadas em todo o projeto. */
  horas: { desenvolvimentoSegundos: number; suporteSegundos: number; totalSegundos: number };
}

/**
 * Agrega, por projeto, tudo o que entra no cálculo financeiro e nas horas trabalhadas.
 * Fonte única para dashboard, lista/detalhe de projetos, financeiro e relatórios.
 *
 * @param filtroSql condição extra sobre `p` (ex.: "p.status IN (...)"). Nunca use entrada do usuário aqui.
 */
export function resumirProjetos(db: DatabaseSync, filtroSql = '1 = 1', parametros: (string | number)[] = []) {
  const linhas = db
    .prepare(
      `SELECT p.id,
         p.valor_fechado_centavos, p.desconto_centavos,
         p.valor_hora_dev_centavos, p.valor_hora_suporte_centavos,
         (SELECT COALESCE(SUM(valor_centavos),0) FROM servicos_adicionais s
            WHERE s.projeto_id = p.id AND s.excluido_em IS NULL) AS servicos,
         (SELECT COALESCE(SUM(duracao_segundos),0) FROM lancamentos_horas l
            WHERE l.projeto_id = p.id AND l.excluido_em IS NULL AND l.atendimento_id IS NULL
              AND l.situacao_cobranca IN ('faturavel','faturado') AND l.categoria <> 'suporte') AS seg_dev_cobravel,
         (SELECT COALESCE(SUM(duracao_segundos),0) FROM lancamentos_horas l
            WHERE l.projeto_id = p.id AND l.excluido_em IS NULL AND l.atendimento_id IS NULL
              AND l.situacao_cobranca IN ('faturavel','faturado') AND l.categoria = 'suporte') AS seg_sup_cobravel,
         (SELECT COALESCE(SUM(valor_centavos),0) FROM atendimentos_suporte a
            WHERE a.projeto_id = p.id AND a.excluido_em IS NULL) AS atendimentos,
         (SELECT COALESCE(SUM(valor_centavos),0) FROM pagamentos g
            WHERE g.projeto_id = p.id AND g.excluido_em IS NULL) AS recebido,
         (SELECT COALESCE(SUM(duracao_segundos),0) FROM lancamentos_horas l
            WHERE l.projeto_id = p.id AND l.excluido_em IS NULL AND l.atendimento_id IS NULL
              AND l.situacao_cobranca = 'faturavel' AND l.categoria <> 'suporte') AS seg_dev_faturavel,
         (SELECT COALESCE(SUM(duracao_segundos),0) FROM lancamentos_horas l
            WHERE l.projeto_id = p.id AND l.excluido_em IS NULL AND l.atendimento_id IS NULL
              AND l.situacao_cobranca = 'faturavel' AND l.categoria = 'suporte') AS seg_sup_faturavel,
         (SELECT COALESCE(SUM(valor_centavos),0) FROM servicos_adicionais s
            WHERE s.projeto_id = p.id AND s.excluido_em IS NULL AND s.situacao = 'faturavel') AS servicos_faturaveis,
         (SELECT COALESCE(SUM(valor_centavos),0) FROM atendimentos_suporte a
            WHERE a.projeto_id = p.id AND a.excluido_em IS NULL AND a.situacao = 'pendente') AS atendimentos_pendentes,
         (SELECT COALESCE(SUM(duracao_segundos),0) FROM lancamentos_horas l
            WHERE l.projeto_id = p.id AND l.excluido_em IS NULL AND l.categoria <> 'suporte') AS seg_dev,
         (SELECT COALESCE(SUM(duracao_segundos),0) FROM lancamentos_horas l
            WHERE l.projeto_id = p.id AND l.excluido_em IS NULL AND l.categoria = 'suporte'
              AND l.atendimento_id IS NULL)
         + (SELECT COALESCE(SUM(duracao_segundos),0) FROM atendimentos_suporte a
            WHERE a.projeto_id = p.id AND a.excluido_em IS NULL) AS seg_sup
       FROM projetos p
       WHERE p.excluido_em IS NULL AND (${filtroSql})`,
    )
    .all(...parametros);

  const n = (v: unknown) => Number(v ?? 0);
  const mapa = new Map<number, ResumoProjeto>();
  for (const p of linhas) {
    const dados: DadosFinanceirosProjeto = {
      valorFechadoCentavos: n(p.valor_fechado_centavos),
      descontoCentavos: n(p.desconto_centavos),
      valorHoraDevCentavos: n(p.valor_hora_dev_centavos),
      valorHoraSuporteCentavos: n(p.valor_hora_suporte_centavos),
      servicosAdicionaisCentavos: n(p.servicos),
      segundosDevCobraveis: n(p.seg_dev_cobravel),
      segundosSuporteAvulsoCobraveis: n(p.seg_sup_cobravel),
      atendimentosCentavos: n(p.atendimentos),
      recebidoCentavos: n(p.recebido),
      segundosDevFaturaveis: n(p.seg_dev_faturavel),
      segundosSuporteAvulsoFaturaveis: n(p.seg_sup_faturavel),
      servicosFaturaveisCentavos: n(p.servicos_faturaveis),
      atendimentosPendentesCentavos: n(p.atendimentos_pendentes),
      segundosDevTrabalhados: n(p.seg_dev),
      segundosSuporteTrabalhados: n(p.seg_sup),
    };
    const dev = n(p.seg_dev);
    const sup = n(p.seg_sup);
    mapa.set(n(p.id), {
      dados,
      financeiro: calcularFinanceiroProjeto(dados),
      horas: { desenvolvimentoSegundos: dev, suporteSegundos: sup, totalSegundos: dev + sup },
    });
  }
  return mapa;
}

/** Monta o bloco `financeiro` enviado à interface (mesma forma em projetos e no módulo Financeiro). */
export function financeiroParaTela(valorFechadoCentavos: number, r: ResumoProjeto | undefined): FinanceiroProjeto {
  const f = r?.financeiro;
  return {
    valorFechadoCentavos,
    servicosAdicionaisCentavos: r?.dados.servicosAdicionaisCentavos ?? 0,
    horasDevCentavos: f?.horasDevCentavos ?? 0,
    horasSuporteCentavos: f?.horasSuporteCentavos ?? 0,
    atendimentosCentavos: r?.dados.atendimentosCentavos ?? 0,
    descontoCentavos: r?.dados.descontoCentavos ?? 0,
    brutoCentavos: f?.brutoCentavos ?? valorFechadoCentavos,
    totalCentavos: f?.totalCentavos ?? 0,
    recebidoCentavos: f?.recebidoCentavos ?? 0,
    pendenteCentavos: f?.pendenteCentavos ?? 0,
    aFaturarCentavos: f?.aFaturarCentavos ?? 0,
    custoHorasCentavos: f?.custoHorasCentavos ?? 0,
    resultadoCentavos: f?.resultadoCentavos ?? 0,
    valorHoraEfetivoCentavos: f?.valorHoraEfetivoCentavos ?? null,
  };
}
