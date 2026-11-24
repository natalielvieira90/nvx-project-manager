/**
 * Regras de cálculo financeiro de um projeto (fonte única, usada por dashboard,
 * financeiro e relatórios). Todos os valores em centavos; tempos em segundos.
 *
 * Total do projeto = valor fechado
 *                  + serviços adicionais
 *                  + horas de desenvolvimento cobráveis × valor/hora dev
 *                  + horas de suporte avulsas cobráveis × valor/hora suporte
 *                  + valor dos atendimentos de suporte
 *                  − desconto            (nunca negativo)
 *
 * "Cobráveis" = lançamentos marcados como FATURÁVEL ou FATURADO. Lançamentos
 * INCLUÍDOS NO PACOTE já estão cobertos pelo valor fechado e não somam nada.
 * Lançamentos vinculados a um atendimento não somam: o atendimento já tem seu valor.
 *
 * Custo estimado das horas = TODAS as horas trabalhadas (inclusive as do pacote) × valor/hora.
 * Compará-lo com o total mostra se o projeto rendeu acima ou abaixo do valor/hora combinado.
 */
import { valorPorTempo } from './formatacao.ts';
import type { CategoriaHora, SituacaoCobranca } from './tipos.ts';

/** Status em que o projeto foi contratado (entra no faturamento previsto). */
export const STATUS_CONTRATADOS = ['em_andamento', 'pausado', 'concluido'] as const;
export const STATUS_ATIVOS = ['em_andamento', 'pausado'] as const;

export interface DadosFinanceirosProjeto {
  valorFechadoCentavos: number;
  descontoCentavos: number;
  valorHoraDevCentavos: number;
  valorHoraSuporteCentavos: number;
  servicosAdicionaisCentavos: number;
  segundosDevCobraveis: number;
  segundosSuporteAvulsoCobraveis: number;
  atendimentosCentavos: number;
  recebidoCentavos: number;
  /** Parte do total ainda não faturada (para saber o que cobrar). */
  segundosDevFaturaveis: number;
  segundosSuporteAvulsoFaturaveis: number;
  servicosFaturaveisCentavos: number;
  atendimentosPendentesCentavos: number;
  /** Todas as horas trabalhadas (inclusive as incluídas no pacote), para o custo estimado. */
  segundosDevTrabalhados: number;
  segundosSuporteTrabalhados: number;
}

export interface ResultadoFinanceiroProjeto {
  horasDevCentavos: number;
  horasSuporteCentavos: number;
  brutoCentavos: number;
  totalCentavos: number;
  recebidoCentavos: number;
  pendenteCentavos: number;
  /** Extras faturáveis ainda não faturados: horas faturáveis + serviços faturáveis + atendimentos pendentes. */
  aFaturarCentavos: number;
  /** Custo estimado das horas: todas as horas trabalhadas × valor/hora do projeto. */
  custoHorasCentavos: number;
  /** Total do projeto − custo estimado das horas. */
  resultadoCentavos: number;
  /** Total do projeto ÷ horas trabalhadas (null sem horas). */
  valorHoraEfetivoCentavos: number | null;
}

export function calcularFinanceiroProjeto(d: DadosFinanceirosProjeto): ResultadoFinanceiroProjeto {
  const horasDevCentavos = valorPorTempo(d.segundosDevCobraveis, d.valorHoraDevCentavos);
  const horasSuporteCentavos = valorPorTempo(d.segundosSuporteAvulsoCobraveis, d.valorHoraSuporteCentavos);
  const brutoCentavos =
    d.valorFechadoCentavos + d.servicosAdicionaisCentavos + horasDevCentavos + horasSuporteCentavos + d.atendimentosCentavos;
  const totalCentavos = Math.max(0, brutoCentavos - d.descontoCentavos);
  const aFaturarCentavos =
    valorPorTempo(d.segundosDevFaturaveis, d.valorHoraDevCentavos) +
    valorPorTempo(d.segundosSuporteAvulsoFaturaveis, d.valorHoraSuporteCentavos) +
    d.servicosFaturaveisCentavos +
    d.atendimentosPendentesCentavos;
  const custoHorasCentavos =
    valorPorTempo(d.segundosDevTrabalhados, d.valorHoraDevCentavos) +
    valorPorTempo(d.segundosSuporteTrabalhados, d.valorHoraSuporteCentavos);
  const segundosTrabalhados = d.segundosDevTrabalhados + d.segundosSuporteTrabalhados;
  return {
    horasDevCentavos,
    horasSuporteCentavos,
    brutoCentavos,
    totalCentavos,
    recebidoCentavos: d.recebidoCentavos,
    // Pagamento acima do total não gera pendência negativa.
    pendenteCentavos: Math.max(0, totalCentavos - d.recebidoCentavos),
    aFaturarCentavos,
    custoHorasCentavos,
    resultadoCentavos: totalCentavos - custoHorasCentavos,
    valorHoraEfetivoCentavos: segundosTrabalhados > 0 ? Math.round((totalCentavos * 3600) / segundosTrabalhados) : null,
  };
}

/**
 * Situação de cobrança sugerida para novas horas: suporte é faturável; o restante fica
 * incluído no pacote quando o projeto tem valor fechado, e faturável quando não tem (projeto por hora).
 */
export function situacaoPadrao(categoria: CategoriaHora, valorFechadoCentavos: number): SituacaoCobranca {
  if (categoria === 'suporte') return 'faturavel';
  return valorFechadoCentavos > 0 ? 'incluido_pacote' : 'faturavel';
}
