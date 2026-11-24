import type { CategoriaHora, FormaPagamento, SituacaoAtendimento, SituacaoCobranca, SituacaoServico, StatusProjeto } from '../../shared/tipos.ts';

type Tom = 'neutro' | 'destaque' | 'sucesso' | 'alerta' | 'perigo';

/** Nome e cor de cada status de projeto (usado em listas e etiquetas). */
export const STATUS_PROJETO: Record<StatusProjeto, { rotulo: string; tom: Tom }> = {
  orcamento: { rotulo: 'Orçamento', tom: 'neutro' },
  aguardando_aprovacao: { rotulo: 'Aguardando aprovação', tom: 'alerta' },
  em_andamento: { rotulo: 'Em andamento', tom: 'destaque' },
  pausado: { rotulo: 'Pausado', tom: 'alerta' },
  concluido: { rotulo: 'Concluído', tom: 'sucesso' },
  cancelado: { rotulo: 'Cancelado', tom: 'perigo' },
};

export const CATEGORIA_HORA: Record<CategoriaHora, string> = {
  desenvolvimento: 'Desenvolvimento',
  reuniao: 'Reunião',
  planejamento: 'Planejamento',
  correcao: 'Correção',
  suporte: 'Suporte',
};

export const SITUACAO_COBRANCA: Record<SituacaoCobranca, { rotulo: string; tom: Tom; dica: string }> = {
  incluido_pacote: { rotulo: 'Incluído no pacote', tom: 'neutro', dica: 'Coberto pelo valor fechado; não é cobrado à parte.' },
  faturavel: { rotulo: 'Faturável', tom: 'alerta', dica: 'Será cobrado e ainda não foi faturado.' },
  faturado: { rotulo: 'Faturado', tom: 'sucesso', dica: 'Já incluído em uma cobrança.' },
};

export const SITUACAO_ATENDIMENTO: Record<SituacaoAtendimento, { rotulo: string; tom: Tom; dica: string }> = {
  pendente: { rotulo: 'Pendente', tom: 'alerta', dica: 'Ainda não foi cobrado do cliente.' },
  faturado: { rotulo: 'Faturado', tom: 'destaque', dica: 'Cobrado; aguardando pagamento.' },
  pago: { rotulo: 'Pago', tom: 'sucesso', dica: 'Recebido. O pagamento é registrado automaticamente no projeto.' },
};

export const SITUACAO_SERVICO: Record<SituacaoServico, { rotulo: string; tom: Tom }> = {
  faturavel: { rotulo: 'A faturar', tom: 'alerta' },
  faturado: { rotulo: 'Faturado', tom: 'sucesso' },
};

export const FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  pix: 'Pix',
  transferencia: 'Transferência',
  boleto: 'Boleto',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
  outro: 'Outro',
};
