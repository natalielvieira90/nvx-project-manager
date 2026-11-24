/**
 * Esquemas de validação (Zod) compartilhados: a interface valida antes de enviar
 * e a API valida de novo antes de gravar (a API é a palavra final).
 */
import { z } from 'zod';
import { documentoValido, somenteDigitos, telefoneValido } from './documentos.ts';

/** Texto opcional: espaços removidos; vazio vira null. */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));

export const esquemaCliente = z.object({
  nome: z
    .string({ error: 'Informe o nome do cliente.' })
    .trim()
    .min(1, 'Informe o nome do cliente.')
    .max(120, 'Use no máximo 120 caracteres.'),
  empresa: textoOpcional(120),
  telefone: textoOpcional(30)
    .refine((v) => v === null || telefoneValido(v), 'Telefone inválido. Informe o DDD e o número.')
    .transform((v) => (v ? somenteDigitos(v).replace(/^55(?=\d{10,11}$)/, '') : null)),
  email: textoOpcional(160)
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'E-mail inválido.')
    .transform((v) => (v ? v.toLowerCase() : null)),
  documento: textoOpcional(30)
    .refine((v) => v === null || documentoValido(v), 'CPF ou CNPJ inválido.')
    .transform((v) => (v ? somenteDigitos(v) : null)),
  observacoes: textoOpcional(2000),
});

export type DadosCliente = z.output<typeof esquemaCliente>;
export type EntradaCliente = z.input<typeof esquemaCliente>;

/** Converte erros do Zod em { campo: mensagem } (primeira mensagem de cada campo). */
export function errosPorCampo(erro: z.ZodError): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const issue of erro.issues) {
    const campo = String(issue.path[0] ?? '_');
    erros[campo] ??= issue.message;
  }
  return erros;
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

export const STATUS_PROJETO_VALORES = [
  'orcamento',
  'aguardando_aprovacao',
  'em_andamento',
  'pausado',
  'concluido',
  'cancelado',
] as const;

/** Data opcional AAAA-MM-DD (vazio vira null). */
const dataOpcional = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || dataExiste(v), 'Data inválida.');

/** Confere se AAAA-MM-DD existe no calendário (rejeita 31/02). */
function dataExiste(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Centavos inteiros, não negativos, até R$ 100 milhões. */
const centavos = (rotulo: string) =>
  z
    .number({ error: `Informe ${rotulo}.` })
    .int(`${rotulo} inválido.`)
    .min(0, 'O valor não pode ser negativo.')
    .max(10_000_000_000, 'Valor muito alto.');

export const esquemaProjeto = z
  .object({
    clienteId: z.number({ error: 'Selecione o cliente.' }).int().positive('Selecione o cliente.'),
    nome: z
      .string({ error: 'Informe o nome do projeto.' })
      .trim()
      .min(1, 'Informe o nome do projeto.')
      .max(120, 'Use no máximo 120 caracteres.'),
    descricao: textoOpcional(4000),
    dataInicio: dataOpcional,
    prazoEntrega: dataOpcional,
    valorFechadoCentavos: centavos('o valor fechado').default(0),
    estimativaSegundos: z.number().int().min(0, 'Estimativa inválida.').max(100_000 * 3600, 'Estimativa muito alta.').default(0),
    valorHoraDevCentavos: centavos('o valor da hora').default(0),
    valorHoraSuporteCentavos: centavos('o valor da hora').default(0),
    status: z.enum(STATUS_PROJETO_VALORES, { error: 'Status inválido.' }).default('orcamento'),
    observacoes: textoOpcional(2000),
  })
  .refine((p) => !p.dataInicio || !p.prazoEntrega || p.prazoEntrega >= p.dataInicio, {
    message: 'O prazo não pode ser anterior à data de início.',
    path: ['prazoEntrega'],
  });

export type DadosProjeto = z.output<typeof esquemaProjeto>;

export const esquemaStatusProjeto = z.object({
  status: z.enum(STATUS_PROJETO_VALORES, { error: 'Status inválido.' }),
});

// ---------------------------------------------------------------------------
// Horas (cronômetro e lançamentos)
// ---------------------------------------------------------------------------

export const CATEGORIAS_HORA = ['desenvolvimento', 'reuniao', 'planejamento', 'correcao', 'suporte'] as const;
export const SITUACOES_COBRANCA = ['incluido_pacote', 'faturavel', 'faturado'] as const;

/** Horário ISO 8601 UTC no formato canônico de `Date.toISOString()` (permite comparar como texto). */
const instante = (rotulo: string) =>
  z
    .string({ error: `Informe ${rotulo}.` })
    .refine((v) => {
      const d = new Date(v);
      return !Number.isNaN(d.getTime()) && d.toISOString() === v;
    }, `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} inválido.`);

const idProjeto = z.number({ error: 'Selecione o projeto.' }).int().positive('Selecione o projeto.');
const categoria = z.enum(CATEGORIAS_HORA, { error: 'Selecione a categoria.' });
const situacaoCobranca = z.enum(SITUACOES_COBRANCA, { error: 'Situação de cobrança inválida.' });

export const esquemaIniciarCronometro = z.object({
  projetoId: idProjeto,
  categoria,
  descricao: textoOpcional(1000),
});

export const esquemaAtualizarCronometro = esquemaIniciarCronometro;

export const esquemaFinalizarCronometro = z.object({
  descricao: textoOpcional(1000),
  situacaoCobranca: situacaoCobranca.optional(),
});

/** Máximo de um lançamento: 24 horas. */
export const DURACAO_MAXIMA_SEGUNDOS = 24 * 3600;

export const esquemaLancamento = z
  .object({
    projetoId: idProjeto,
    categoria,
    descricao: textoOpcional(1000),
    inicio: instante('o horário inicial'),
    fim: instante('o horário final'),
    situacaoCobranca: situacaoCobranca.default('incluido_pacote'),
  })
  .refine((l) => l.fim > l.inicio, { message: 'O horário final deve ser depois do inicial.', path: ['fim'] })
  .refine((l) => Date.parse(l.fim) - Date.parse(l.inicio) <= DURACAO_MAXIMA_SEGUNDOS * 1000, {
    message: 'Um lançamento pode ter no máximo 24 horas.',
    path: ['fim'],
  });

export type DadosLancamento = z.output<typeof esquemaLancamento>;

export const esquemaSituacaoLote = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'Selecione ao menos um lançamento.').max(1000),
  situacaoCobranca,
});

// ---------------------------------------------------------------------------
// Atendimentos de suporte
// ---------------------------------------------------------------------------

export const SITUACOES_ATENDIMENTO = ['pendente', 'faturado', 'pago'] as const;

export const esquemaAtendimento = z
  .object({
    projetoId: idProjeto,
    /** Converte um lançamento de suporte (ex.: do cronômetro) em atendimento; os horários vêm dele. */
    lancamentoId: z.number().int().positive().nullish(),
    inicio: instante('o horário inicial').nullish(),
    fim: instante('o horário final').nullish(),
    problema: z
      .string({ error: 'Descreva o problema.' })
      .trim()
      .min(1, 'Descreva o problema.')
      .max(4000, 'Use no máximo 4000 caracteres.'),
    solucao: textoOpcional(4000),
    valorCentavos: z
      .number({ error: 'Informe o valor.' })
      .int('Valor inválido.')
      .min(0, 'O valor não pode ser negativo.')
      .max(10_000_000_000, 'Valor muito alto.'),
    situacao: z.enum(SITUACOES_ATENDIMENTO, { error: 'Situação inválida.' }).default('pendente'),
  })
  .superRefine((a, ctx) => {
    if (a.lancamentoId) return;
    if (!a.inicio) ctx.addIssue({ code: 'custom', path: ['inicio'], message: 'Informe o horário inicial.' });
    if (!a.fim) ctx.addIssue({ code: 'custom', path: ['fim'], message: 'Informe o horário final.' });
    if (a.inicio && a.fim) {
      if (a.fim <= a.inicio) ctx.addIssue({ code: 'custom', path: ['fim'], message: 'O horário final deve ser depois do inicial.' });
      else if (Date.parse(a.fim) - Date.parse(a.inicio) > DURACAO_MAXIMA_SEGUNDOS * 1000) {
        ctx.addIssue({ code: 'custom', path: ['fim'], message: 'Um atendimento pode ter no máximo 24 horas.' });
      }
    }
  });

export type DadosAtendimento = z.output<typeof esquemaAtendimento>;

export const esquemaSituacaoAtendimentos = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'Selecione ao menos um atendimento.').max(1000),
  situacao: z.enum(SITUACOES_ATENDIMENTO, { error: 'Situação inválida.' }),
});

// ---------------------------------------------------------------------------
// Financeiro (serviços adicionais, pagamentos e desconto)
// ---------------------------------------------------------------------------

export const SITUACOES_SERVICO = ['faturavel', 'faturado'] as const;
export const FORMAS_PAGAMENTO = ['pix', 'transferencia', 'boleto', 'cartao', 'dinheiro', 'outro'] as const;

const dataObrigatoria = (rotulo: string) =>
  z
    .string({ error: `Informe ${rotulo}.` })
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .refine(dataExiste, 'Data inválida.');

const valorPositivo = centavos('o valor').min(1, 'Informe um valor maior que zero.');

export const esquemaServico = z.object({
  projetoId: idProjeto,
  descricao: z
    .string({ error: 'Descreva o serviço.' })
    .trim()
    .min(1, 'Descreva o serviço.')
    .max(300, 'Use no máximo 300 caracteres.'),
  data: dataObrigatoria('a data'),
  valorCentavos: valorPositivo,
  situacao: z.enum(SITUACOES_SERVICO, { error: 'Situação inválida.' }).default('faturavel'),
});

export type DadosServico = z.output<typeof esquemaServico>;

export const esquemaPagamento = z.object({
  projetoId: idProjeto,
  data: dataObrigatoria('a data do pagamento'),
  valorCentavos: valorPositivo,
  forma: z.enum(FORMAS_PAGAMENTO, { error: 'Forma de pagamento inválida.' }).nullish().transform((v) => v ?? null),
  observacoes: textoOpcional(1000),
  /** Confirma o registro mesmo havendo outro pagamento igual (mesmo projeto, data e valor). */
  permitirDuplicado: z.boolean().optional(),
});

export type DadosPagamento = z.output<typeof esquemaPagamento>;

export const esquemaDesconto = z.object({
  descontoCentavos: centavos('o desconto'),
});
