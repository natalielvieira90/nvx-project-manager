/**
 * PDF do relatório de fechamento de projeto: resumo financeiro, horas por tipo,
 * todas as horas trabalhadas, serviços adicionais e pagamentos.
 * Carregado sob demanda (import dinâmico), junto com o gerador de PDF.
 */
import type { Coluna } from '../../lib/exportar.ts';
import { nomeArquivo } from '../../lib/exportar.ts';
import { nota, novoDocumento, resumo, salvar, secao, tabela } from '../../lib/pdf.ts';
import { CATEGORIA_HORA, FORMA_PAGAMENTO, SITUACAO_SERVICO, STATUS_PROJETO } from '../../lib/rotulos.ts';
import { formatarData, formatarDuracaoCurta, formatarMoeda } from '../../../shared/formatacao.ts';
import type { Pagamento, RelatorioFechamento, ServicoAdicional } from '../../../shared/tipos.ts';
import { colunasHoras } from './definicoes.ts';

export function gerarPdfFechamento(r: RelatorioFechamento) {
  const p = r.projeto;
  const f = p.financeiro;
  const cliente = p.clienteEmpresa ? `${p.clienteNome} (${p.clienteEmpresa})` : p.clienteNome;
  const periodo =
    p.dataInicio || p.prazoEntrega
      ? `Início: ${formatarData(p.dataInicio)} · Prazo: ${formatarData(p.prazoEntrega)}`
      : 'Sem datas definidas';
  const d = novoDocumento(
    'Relatório de fechamento de projeto',
    `${p.nome} · Cliente: ${cliente} · Status: ${STATUS_PROJETO[p.status].rotulo} · ${periodo}`,
  );

  resumo(d, [
    ['Total do projeto', formatarMoeda(f.totalCentavos)],
    ['Recebido', formatarMoeda(f.recebidoCentavos)],
    ['Pendente', formatarMoeda(f.pendenteCentavos)],
    ['Horas trabalhadas', formatarDuracaoCurta(p.horas.totalSegundos)],
  ]);

  secao(d, 'Composição do valor');
  type Item = [string, string];
  const composicao: Item[] = [
    ['Valor fechado', formatarMoeda(f.valorFechadoCentavos)],
    ['Serviços adicionais', formatarMoeda(f.servicosAdicionaisCentavos)],
    [`Horas de desenvolvimento cobradas à parte (${formatarMoeda(p.valorHoraDevCentavos)}/h)`, formatarMoeda(f.horasDevCentavos)],
    [`Horas de suporte cobradas à parte (${formatarMoeda(p.valorHoraSuporteCentavos)}/h)`, formatarMoeda(f.horasSuporteCentavos)],
    ['Atendimentos de suporte', formatarMoeda(f.atendimentosCentavos)],
    ['Desconto', f.descontoCentavos ? `- ${formatarMoeda(f.descontoCentavos)}` : formatarMoeda(0)],
  ];
  const colItem: Coluna<Item>[] = [
    { titulo: 'Item', valor: (i) => i[0], peso: 3 },
    { titulo: 'Valor', valor: (i) => i[1], direita: true },
  ];
  tabela(d, colItem, composicao, ['Total', formatarMoeda(f.totalCentavos)]);

  secao(d, 'Horas por tipo');
  const porTipo: Item[] = r.porCategoria.map((c) => [
    c.categoria === 'atendimento' ? 'Atendimentos de suporte' : CATEGORIA_HORA[c.categoria],
    formatarDuracaoCurta(c.segundos),
  ]);
  if (porTipo.length) {
    const colTipo: Coluna<Item>[] = [
      { titulo: 'Tipo', valor: (i) => i[0], peso: 3 },
      { titulo: 'Horas', valor: (i) => i[1], direita: true },
    ];
    const rodape = ['Total', formatarDuracaoCurta(p.horas.totalSegundos)];
    tabela(d, colTipo, porTipo, rodape);
  } else {
    nota(d, 'Nenhuma hora registrada neste projeto.');
  }
  nota(
    d,
    `Incluídas no pacote: ${formatarDuracaoCurta(p.cobranca.incluidoPacoteSegundos)} · ` +
      `Cobradas à parte: ${formatarDuracaoCurta(p.cobranca.faturavelSegundos + p.cobranca.faturadoSegundos)}` +
      (p.estimativaSegundos ? ` · Estimativa: ${formatarDuracaoCurta(p.estimativaSegundos)}` : '') +
      '. Horas incluídas no pacote estão cobertas pelo valor fechado e não são cobradas à parte.',
  );

  secao(d, 'Horas trabalhadas e serviços realizados');
  if (r.horas.length) {
    // Cliente e projeto já estão no título: ficam fora desta tabela.
    const colunas = colunasHoras.filter((c) => c.titulo !== 'Cliente' && c.titulo !== 'Projeto');
    const total = r.horas.reduce((t, h) => t + h.duracaoSegundos, 0);
    const valor = r.horas.reduce((t, h) => t + h.valorCentavos, 0);
    tabela(d, colunas, r.horas, ['Total', '', '', '', formatarDuracaoCurta(total), '', formatarMoeda(valor)]);
  } else {
    nota(d, 'Nenhuma hora registrada.');
  }

  secao(d, 'Serviços adicionais');
  if (r.servicos.length) {
    const colServ: Coluna<ServicoAdicional>[] = [
      { titulo: 'Data', valor: (s) => formatarData(s.data), peso: 0.8 },
      { titulo: 'Descrição', valor: (s) => s.descricao, peso: 3 },
      { titulo: 'Situação', valor: (s) => SITUACAO_SERVICO[s.situacao].rotulo, peso: 0.9 },
      { titulo: 'Valor', valor: (s) => formatarMoeda(s.valorCentavos), direita: true },
    ];
    tabela(d, colServ, r.servicos, ['Total', '', '', formatarMoeda(r.servicos.reduce((t, s) => t + s.valorCentavos, 0))]);
  } else {
    nota(d, 'Nenhum serviço adicional.');
  }

  secao(d, 'Pagamentos recebidos');
  if (r.pagamentos.length) {
    const colPag: Coluna<Pagamento>[] = [
      { titulo: 'Data', valor: (g) => formatarData(g.data), peso: 0.8 },
      { titulo: 'Forma', valor: (g) => (g.forma ? FORMA_PAGAMENTO[g.forma] : ''), peso: 0.9 },
      { titulo: 'Observações', valor: (g) => (g.atendimentoId ? 'Atendimento de suporte pago' : (g.observacoes ?? '')), peso: 2.6 },
      { titulo: 'Valor', valor: (g) => formatarMoeda(g.valorCentavos), direita: true },
    ];
    tabela(d, colPag, r.pagamentos, ['Total', '', '', formatarMoeda(f.recebidoCentavos)]);
  } else {
    nota(d, 'Nenhum pagamento registrado.');
  }

  resumo(d, [
    ['Total do projeto', formatarMoeda(f.totalCentavos)],
    ['Recebido', formatarMoeda(f.recebidoCentavos)],
    ['Saldo pendente', formatarMoeda(f.pendenteCentavos)],
  ]);

  salvar(d, `${nomeArquivo('fechamento', p.clienteNome, p.nome)}.pdf`);
}
