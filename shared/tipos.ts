/** Tipos trocados entre a API e a interface. */

export interface IndicadoresDashboard {
  /** Mês de referência (AAAA-MM) para os indicadores mensais. */
  mes: string;
  projetos: {
    ativos: number;
    concluidos: number;
    emOrcamento: number;
  };
  horasMes: {
    totalSegundos: number;
    desenvolvimentoSegundos: number;
    suporteSegundos: number;
  };
  faturamento: {
    /** Soma do total de todos os projetos contratados. */
    previstoCentavos: number;
    recebidoCentavos: number;
    pendenteCentavos: number;
    recebidoNoMesCentavos: number;
  };
  naoCobrado: {
    segundos: number;
    valorCentavos: number;
  };
  /** Últimos 12 meses terminando no mês de referência. */
  faturamentoMensal: { mes: string; recebidoCentavos: number }[];
  /** Horas do mês de referência por projeto (ordenado do maior para o menor). */
  horasPorProjeto: {
    projetoId: number;
    projeto: string;
    cliente: string;
    desenvolvimentoSegundos: number;
    suporteSegundos: number;
  }[];
}

export type StatusProjeto =
  | 'orcamento'
  | 'aguardando_aprovacao'
  | 'em_andamento'
  | 'pausado'
  | 'concluido'
  | 'cancelado';

export interface Cliente {
  id: number;
  nome: string;
  empresa: string | null;
  /** Somente dígitos. */
  telefone: string | null;
  email: string | null;
  /** CPF/CNPJ somente dígitos. */
  documento: string | null;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ClienteResumo extends Cliente {
  qtdProjetos: number;
  qtdProjetosAtivos: number;
}

export interface ClienteDetalhe extends Cliente {
  projetos: {
    id: number;
    nome: string;
    status: StatusProjeto;
    valorFechadoCentavos: number;
    prazoEntrega: string | null;
  }[];
}

/** Resposta de erro padrão da API. */
export interface RespostaErro {
  erro: string;
  detalhes?: Record<string, string>;
}

export interface FinanceiroProjeto {
  valorFechadoCentavos: number;
  servicosAdicionaisCentavos: number;
  horasDevCentavos: number;
  horasSuporteCentavos: number;
  atendimentosCentavos: number;
  descontoCentavos: number;
  /** Total antes do desconto. */
  brutoCentavos: number;
  totalCentavos: number;
  recebidoCentavos: number;
  pendenteCentavos: number;
  /** Extras faturáveis ainda não faturados (horas faturáveis, serviços faturáveis, atendimentos pendentes). */
  aFaturarCentavos: number;
  /** Todas as horas trabalhadas × valor/hora do projeto. */
  custoHorasCentavos: number;
  /** Total − custo estimado das horas. */
  resultadoCentavos: number;
  /** Total ÷ horas trabalhadas; null quando não há horas. */
  valorHoraEfetivoCentavos: number | null;
}

export interface Projeto {
  id: number;
  clienteId: number;
  clienteNome: string;
  clienteEmpresa: string | null;
  nome: string;
  descricao: string | null;
  dataInicio: string | null;
  prazoEntrega: string | null;
  valorFechadoCentavos: number;
  estimativaSegundos: number;
  valorHoraDevCentavos: number;
  valorHoraSuporteCentavos: number;
  status: StatusProjeto;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ProjetoResumo extends Projeto {
  horas: { desenvolvimentoSegundos: number; suporteSegundos: number; totalSegundos: number };
  financeiro: FinanceiroProjeto;
}

export interface ProjetoDetalhe extends ProjetoResumo {
  /** Horas de lançamentos (sem atendimentos) por situação de cobrança. */
  cobranca: { incluidoPacoteSegundos: number; faturavelSegundos: number; faturadoSegundos: number };
  contagem: { lancamentos: number; atendimentos: number; pagamentos: number; servicos: number };
  cronometroAtivo: boolean;
}

export type CategoriaHora = 'desenvolvimento' | 'reuniao' | 'planejamento' | 'correcao' | 'suporte';
export type SituacaoCobranca = 'incluido_pacote' | 'faturavel' | 'faturado';

export interface CronometroAtivo {
  projetoId: number;
  projetoNome: string;
  clienteNome: string;
  categoria: CategoriaHora;
  descricao: string | null;
  iniciadoEm: string;
  /** Início do trecho atual; null quando pausado. */
  segmentoIniciadoEm: string | null;
  pausadoEm: string | null;
  segundosAcumulados: number;
  /** Tempo trabalhado calculado pelo servidor no momento da resposta. */
  segundosDecorridos: number;
  /** Horário do servidor na resposta (para sincronizar o relógio da tela). */
  agora: string;
}

export interface Lancamento {
  id: number;
  projetoId: number;
  projetoNome: string;
  clienteNome: string;
  categoria: CategoriaHora;
  descricao: string | null;
  inicio: string;
  fim: string;
  duracaoSegundos: number;
  origem: 'cronometro' | 'manual';
  situacaoCobranca: SituacaoCobranca;
  atendimentoId: number | null;
  criadoEm: string;
}

export type SituacaoAtendimento = 'pendente' | 'faturado' | 'pago';

export interface Atendimento {
  id: number;
  clienteId: number;
  clienteNome: string;
  projetoId: number;
  projetoNome: string;
  inicio: string;
  fim: string;
  duracaoSegundos: number;
  problema: string;
  solucao: string | null;
  valorCentavos: number;
  situacao: SituacaoAtendimento;
  /** Lançamento (ex.: do cronômetro) que originou o atendimento. */
  lancamentoId: number | null;
  criadoEm: string;
}

export type SituacaoServico = 'faturavel' | 'faturado';
export type FormaPagamento = 'pix' | 'transferencia' | 'boleto' | 'cartao' | 'dinheiro' | 'outro';

export interface ServicoAdicional {
  id: number;
  projetoId: number;
  descricao: string;
  /** AAAA-MM-DD */
  data: string;
  valorCentavos: number;
  situacao: SituacaoServico;
  criadoEm: string;
}

export interface Pagamento {
  id: number;
  projetoId: number;
  projetoNome: string;
  clienteId: number;
  clienteNome: string;
  /** AAAA-MM-DD */
  data: string;
  valorCentavos: number;
  forma: FormaPagamento | null;
  observacoes: string | null;
  /** Preenchido quando o pagamento foi gerado por um atendimento marcado como pago. */
  atendimentoId: number | null;
  criadoEm: string;
}

/** Linha do módulo Financeiro (um projeto). */
export interface ProjetoFinanceiro {
  id: number;
  nome: string;
  clienteId: number;
  clienteNome: string;
  status: StatusProjeto;
  horas: { desenvolvimentoSegundos: number; suporteSegundos: number; totalSegundos: number };
  financeiro: FinanceiroProjeto;
}

export interface ResumoFinanceiro {
  projetos: ProjetoFinanceiro[];
  totais: {
    totalCentavos: number;
    recebidoCentavos: number;
    pendenteCentavos: number;
    aFaturarCentavos: number;
  };
}

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

export type TipoHora = 'desenvolvimento' | 'suporte';
/** Situação de cobrança unificada (lançamentos e atendimentos). */
export type CobrancaRelatorio = 'pacote' | 'a_faturar' | 'faturado';

export interface LinhaRelatorioHoras {
  origem: 'lancamento' | 'atendimento';
  id: number;
  inicio: string;
  fim: string;
  clienteId: number;
  clienteNome: string;
  projetoId: number;
  projetoNome: string;
  tipo: TipoHora;
  /** Categoria do lançamento ou "atendimento". */
  categoria: CategoriaHora | 'atendimento';
  descricao: string | null;
  duracaoSegundos: number;
  situacao: SituacaoCobranca | SituacaoAtendimento;
  cobranca: CobrancaRelatorio;
  /** Valor cobrável: 0 para horas do pacote; tempo × valor/hora para faturáveis/faturadas; valor do atendimento. */
  valorCentavos: number;
}

export interface RelatorioHoras {
  linhas: LinhaRelatorioHoras[];
  totais: {
    desenvolvimentoSegundos: number;
    suporteSegundos: number;
    totalSegundos: number;
    pacoteSegundos: number;
    aFaturarCentavos: number;
    faturadoCentavos: number;
    valorCentavos: number;
  };
}

export interface ValoresPeriodo {
  desenvolvimentoSegundos: number;
  suporteSegundos: number;
  recebidoCentavos: number;
}

export interface ValoresAtuais {
  totalCentavos: number;
  /** Extras (horas, serviços, atendimentos) já faturados. */
  extrasFaturadosCentavos: number;
  aFaturarCentavos: number;
  recebidoCentavos: number;
  pendenteCentavos: number;
}

export interface LinhaRelatorioProjeto {
  projetoId: number;
  projeto: string;
  clienteId: number;
  cliente: string;
  status: StatusProjeto;
  periodo: ValoresPeriodo;
  atual: ValoresAtuais;
}

export interface LinhaRelatorioCliente {
  clienteId: number;
  cliente: string;
  projetos: number;
  periodo: ValoresPeriodo;
  atual: ValoresAtuais;
}

export interface RelatorioProjetos {
  linhas: LinhaRelatorioProjeto[];
  totais: { periodo: ValoresPeriodo; atual: ValoresAtuais };
}

export interface RelatorioClientes {
  linhas: LinhaRelatorioCliente[];
  totais: { periodo: ValoresPeriodo; atual: ValoresAtuais };
}

export interface RelatorioFechamento {
  projeto: ProjetoDetalhe;
  /** Todas as horas do projeto (lançamentos avulsos e atendimentos), em ordem cronológica. */
  horas: LinhaRelatorioHoras[];
  porCategoria: { categoria: CategoriaHora | 'atendimento'; segundos: number }[];
  servicos: ServicoAdicional[];
  pagamentos: Pagamento[];
  geradoEm: string;
}

// ---------------------------------------------------------------------------
// Backup e lixeira
// ---------------------------------------------------------------------------

export interface BackupAutomatico {
  nome: string;
  tipo: 'diario' | 'antes-restauracao';
  criadoEm: string;
  tamanhoBytes: number;
}

export interface EstadoBackup {
  versaoBanco: number;
  pastaBackups: string | null;
  automaticos: BackupAutomatico[];
}

export interface ResultadoRestauracao {
  backupAnterior: BackupAutomatico | null;
  registros: Record<string, number>;
}

export type TipoLixeira = 'cliente' | 'projeto' | 'lancamento' | 'atendimento' | 'servico' | 'pagamento';

export interface ItemLixeira {
  tipo: TipoLixeira;
  id: number;
  titulo: string;
  detalhe: string;
  excluidoEm: string;
  /** Motivo pelo qual ainda não pode ser restaurado (ex.: projeto também na lixeira). */
  bloqueio: string | null;
}
