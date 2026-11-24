/**
 * Colunas de cada relatório. O mesmo cadastro alimenta a prévia na tela, o PDF e o CSV,
 * garantindo que os três mostrem exatamente os mesmos números.
 */
import { centavosCsv, horasCsv, type Coluna } from '../../lib/exportar.ts';
import { CATEGORIA_HORA, FORMA_PAGAMENTO, SITUACAO_ATENDIMENTO, SITUACAO_COBRANCA, STATUS_PROJETO } from '../../lib/rotulos.ts';
import { formatarData, formatarDuracaoCurta, formatarHora, formatarMoeda } from '../../../shared/formatacao.ts';
import type {
  LinhaRelatorioCliente,
  LinhaRelatorioHoras,
  LinhaRelatorioProjeto,
  Pagamento,
  SituacaoAtendimento,
  SituacaoCobranca,
} from '../../../shared/tipos.ts';

const moeda = (c: number) => formatarMoeda(c);
const horas = (s: number) => formatarDuracaoCurta(s);

export function rotuloCategoria(l: LinhaRelatorioHoras) {
  return l.categoria === 'atendimento' ? 'Atendimento de suporte' : CATEGORIA_HORA[l.categoria];
}

export function rotuloSituacao(l: LinhaRelatorioHoras) {
  return l.origem === 'atendimento'
    ? SITUACAO_ATENDIMENTO[l.situacao as SituacaoAtendimento].rotulo
    : SITUACAO_COBRANCA[l.situacao as SituacaoCobranca].rotulo;
}

export const colunasHoras: Coluna<LinhaRelatorioHoras>[] = [
  { titulo: 'Data', valor: (l) => formatarData(l.inicio), peso: 0.9 },
  { titulo: 'Horário', valor: (l) => `${formatarHora(l.inicio)}–${formatarHora(l.fim)}`, peso: 0.9 },
  { titulo: 'Cliente', valor: (l) => l.clienteNome, peso: 1.3 },
  { titulo: 'Projeto', valor: (l) => l.projetoNome, peso: 1.3 },
  { titulo: 'Tipo', valor: rotuloCategoria, peso: 1.1 },
  { titulo: 'Descrição', valor: (l) => l.descricao ?? '', peso: 2 },
  { titulo: 'Horas', valor: (l) => horas(l.duracaoSegundos), csv: (l) => horasCsv(l.duracaoSegundos), direita: true, peso: 0.7 },
  { titulo: 'Cobrança', valor: rotuloSituacao, peso: 1.3 },
  { titulo: 'Valor', valor: (l) => moeda(l.valorCentavos), csv: (l) => centavosCsv(l.valorCentavos), direita: true, peso: 1 },
];

export const colunasProjetos: Coluna<LinhaRelatorioProjeto>[] = [
  { titulo: 'Cliente', valor: (l) => l.cliente, peso: 1.4 },
  { titulo: 'Projeto', valor: (l) => l.projeto, peso: 1.5 },
  { titulo: 'Status', valor: (l) => STATUS_PROJETO[l.status].rotulo, peso: 1 },
  ...colunasValores<LinhaRelatorioProjeto>(),
];

export const colunasClientes: Coluna<LinhaRelatorioCliente>[] = [
  { titulo: 'Cliente', valor: (l) => l.cliente, peso: 1.8 },
  { titulo: 'Projetos', valor: (l) => String(l.projetos), direita: true, peso: 0.7 },
  ...colunasValores<LinhaRelatorioCliente>(),
];

/** Colunas comuns ao resumo por projeto e por cliente. */
function colunasValores<T extends LinhaRelatorioProjeto | LinhaRelatorioCliente>(): Coluna<T>[] {
  return [
    { titulo: 'Horas dev. (período)', valor: (l) => horas(l.periodo.desenvolvimentoSegundos), csv: (l) => horasCsv(l.periodo.desenvolvimentoSegundos), direita: true, peso: 0.9 },
    { titulo: 'Horas suporte (período)', valor: (l) => horas(l.periodo.suporteSegundos), csv: (l) => horasCsv(l.periodo.suporteSegundos), direita: true, peso: 0.9 },
    { titulo: 'Recebido (período)', valor: (l) => moeda(l.periodo.recebidoCentavos), csv: (l) => centavosCsv(l.periodo.recebidoCentavos), direita: true },
    { titulo: 'Total do projeto', valor: (l) => moeda(l.atual.totalCentavos), csv: (l) => centavosCsv(l.atual.totalCentavos), direita: true },
    { titulo: 'Extras faturados', valor: (l) => moeda(l.atual.extrasFaturadosCentavos), csv: (l) => centavosCsv(l.atual.extrasFaturadosCentavos), direita: true },
    { titulo: 'A faturar', valor: (l) => moeda(l.atual.aFaturarCentavos), csv: (l) => centavosCsv(l.atual.aFaturarCentavos), direita: true },
    { titulo: 'Recebido (total)', valor: (l) => moeda(l.atual.recebidoCentavos), csv: (l) => centavosCsv(l.atual.recebidoCentavos), direita: true },
    { titulo: 'Pendente', valor: (l) => moeda(l.atual.pendenteCentavos), csv: (l) => centavosCsv(l.atual.pendenteCentavos), direita: true },
  ];
}

export const colunasPagamentos: Coluna<Pagamento>[] = [
  { titulo: 'Data', valor: (p) => formatarData(p.data), peso: 0.8 },
  { titulo: 'Cliente', valor: (p) => p.clienteNome, peso: 1.4 },
  { titulo: 'Projeto', valor: (p) => p.projetoNome, peso: 1.4 },
  { titulo: 'Forma', valor: (p) => (p.forma ? FORMA_PAGAMENTO[p.forma] : ''), peso: 0.8 },
  { titulo: 'Observações', valor: (p) => (p.atendimentoId ? 'Atendimento de suporte pago' : (p.observacoes ?? '')), peso: 2 },
  { titulo: 'Valor', valor: (p) => moeda(p.valorCentavos), csv: (p) => centavosCsv(p.valorCentavos), direita: true, peso: 1 },
];
