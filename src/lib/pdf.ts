/**
 * Geração de PDF local (jsPDF + autotable), com cabeçalho e rodapé padrão NVX.
 * Este módulo é carregado sob demanda (import dinâmico) para não pesar a abertura do sistema.
 */
import { jsPDF } from 'jspdf';
import { autoTable, type UserOptions } from 'jspdf-autotable';
import { baixarArquivo, type Coluna } from './exportar.ts';
// Logotipo oficial (versão horizontal para fundo claro), embutido no PDF.
import logoPdf from '../assets/marca/nvx-horizontal-cor-fundo-claro.png?inline';

type RGB = [number, number, number];
// Cores do manual da marca NVX Digital.
const MARCA: RGB = [36, 22, 47]; // Roxo Profundo
const DESTAQUE: RGB = [201, 240, 90]; // Lima Tecnológico
const TEXTO: RGB = [23, 23, 23]; // Preto Suave
const SUAVE: RGB = [118, 90, 131]; // Lavanda Escura
const BORDA: RGB = [222, 213, 214]; // Areia 300
const AREIA: RGB = [245, 240, 232]; // Areia Clara
const AREIA_50: RGB = [251, 248, 245];
const MARGEM = 14;

/**
 * As fontes padrão do PDF só têm o alfabeto latino (acentos do português funcionam).
 * Troca caracteres fora dele pelos equivalentes.
 */
export function textoPdf(v: string): string {
  return v.replace(/[  ]/g, ' ').replace(/−/g, '-').replace(/[✓✔]/g, 'x');
}

export interface Documento {
  doc: jsPDF;
  /** Posição vertical atual (mm). */
  y: number;
  largura: number;
}

/** Cria o documento já com o cabeçalho da primeira página. */
export function novoDocumento(titulo: string, subtitulo: string, paisagem = false): Documento {
  const doc = new jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: textoPdf(titulo), creator: 'NVX Project Manager' });
  const largura = doc.internal.pageSize.getWidth();

  // Logotipo oficial: 2000 × 493 px → 42 mm de largura (acima da redução mínima de 36 mm).
  // Mesmo apelido + compressão: a imagem entra uma vez só no arquivo e fica leve.
  doc.addImage(logoPdf, 'PNG', MARGEM, 11, 42, 42 * (493 / 2000), 'logo-nvx', 'FAST');
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...SUAVE);
  doc.setFontSize(7.5);
  doc.text(textoPdf(`Gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`), largura - MARGEM, 16.5, {
    align: 'right',
  });

  // Barra de cruzamento: o traço Lima do X como marcador gráfico.
  doc.setFillColor(...DESTAQUE);
  doc.rect(MARGEM, 26.6, 18, 0.9, 'F');
  doc.setDrawColor(...BORDA);
  doc.line(MARGEM + 18, 27, largura - MARGEM, 27);

  doc.setTextColor(...TEXTO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(textoPdf(titulo), MARGEM, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SUAVE);
  const linhas = doc.splitTextToSize(textoPdf(subtitulo), largura - 2 * MARGEM) as string[];
  doc.text(linhas, MARGEM, 42);
  return { doc, y: 42 + linhas.length * 4.2 + 3, largura };
}

/** Título de seção. */
export function secao(d: Documento, titulo: string) {
  garantirEspaco(d, 20);
  d.doc.setFont('helvetica', 'bold');
  d.doc.setFontSize(10.5);
  d.doc.setTextColor(...TEXTO);
  d.doc.text(textoPdf(titulo), MARGEM, d.y + 5);
  d.y += 8;
}

/** Parágrafo curto em cinza. */
export function nota(d: Documento, texto: string) {
  d.doc.setFont('helvetica', 'normal');
  d.doc.setFontSize(8);
  d.doc.setTextColor(...SUAVE);
  const linhas = d.doc.splitTextToSize(textoPdf(texto), d.largura - 2 * MARGEM) as string[];
  garantirEspaco(d, linhas.length * 3.6 + 2);
  d.doc.text(linhas, MARGEM, d.y + 3);
  d.y += linhas.length * 3.6 + 3;
}

/** Faixa de números-resumo (rótulo em cima, valor embaixo). */
export function resumo(d: Documento, itens: [string, string][]) {
  if (!itens.length) return;
  const porLinha = Math.min(itens.length, d.largura > 250 ? 6 : 4);
  const larguraItem = (d.largura - 2 * MARGEM - (porLinha - 1) * 3) / porLinha;
  itens.forEach(([rotulo, valor], i) => {
    const col = i % porLinha;
    if (col === 0) {
      if (i > 0) d.y += 17;
      garantirEspaco(d, 16);
    }
    const x = MARGEM + col * (larguraItem + 3);
    d.doc.setFillColor(...AREIA);
    d.doc.roundedRect(x, d.y, larguraItem, 14, 1.5, 1.5, 'F');
    d.doc.setFont('helvetica', 'normal');
    d.doc.setFontSize(7.5);
    d.doc.setTextColor(...SUAVE);
    d.doc.text(textoPdf(rotulo), x + 3, d.y + 5);
    d.doc.setFont('helvetica', 'bold');
    d.doc.setFontSize(10.5);
    d.doc.setTextColor(...TEXTO);
    d.doc.text(textoPdf(valor), x + 3, d.y + 11);
  });
  d.y += 19;
}

/** Tabela com cabeçalho repetido em cada página. */
export function tabela<T>(d: Documento, colunas: Coluna<T>[], linhas: T[], rodape?: string[], extra: Partial<UserOptions> = {}) {
  const pesoTotal = colunas.reduce((t, c) => t + (c.peso ?? 1), 0);
  const util = d.largura - 2 * MARGEM;
  autoTable(d.doc, {
    startY: d.y,
    margin: { left: MARGEM, right: MARGEM, top: 16, bottom: 16 },
    head: [colunas.map((c) => textoPdf(c.titulo))],
    body: linhas.map((l) => colunas.map((c) => textoPdf(c.valor(l)))),
    foot: rodape ? [rodape.map(textoPdf)] : undefined,
    showFoot: 'lastPage',
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, textColor: TEXTO, overflow: 'linebreak' },
    headStyles: { fillColor: MARCA, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: AREIA, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: AREIA_50 },
    columnStyles: Object.fromEntries(
      colunas.map((c, i) => [i, { halign: c.direita ? 'right' : 'left', cellWidth: (util * (c.peso ?? 1)) / pesoTotal }]),
    ),
    didParseCell: (dados) => {
      if (dados.section !== 'body' && colunas[dados.column.index]?.direita) dados.cell.styles.halign = 'right';
    },
    ...extra,
  });
  d.y = (d.doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
}

function garantirEspaco(d: Documento, altura: number) {
  if (d.y + altura > d.doc.internal.pageSize.getHeight() - 18) {
    d.doc.addPage();
    d.y = 18;
  }
}

/** Numera as páginas, escreve o rodapé e baixa o arquivo. */
export function salvar(d: Documento, nome: string) {
  const total = d.doc.getNumberOfPages();
  const altura = d.doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    d.doc.setPage(i);
    d.doc.setDrawColor(...BORDA);
    d.doc.line(MARGEM, altura - 11, d.largura - MARGEM, altura - 11);
    d.doc.setFont('helvetica', 'normal');
    d.doc.setFontSize(7);
    d.doc.setTextColor(...SUAVE);
    d.doc.text('NVX Digital · NVX Project Manager', MARGEM, altura - 7);
    d.doc.text(textoPdf(`Página ${i} de ${total}`), d.largura - MARGEM, altura - 7, { align: 'right' });
  }
  baixarArquivo(nome, d.doc.output('blob'));
}

/** Relatório simples: título, filtros, faixa de resumo e uma tabela. */
export function relatorioTabela<T>(opcoes: {
  nomeArquivo: string;
  titulo: string;
  subtitulo: string;
  resumo?: [string, string][];
  colunas: Coluna<T>[];
  linhas: T[];
  rodape?: string[];
  observacao?: string;
  paisagem?: boolean;
}) {
  const d = novoDocumento(opcoes.titulo, opcoes.subtitulo, opcoes.paisagem);
  if (opcoes.resumo) resumo(d, opcoes.resumo);
  tabela(d, opcoes.colunas, opcoes.linhas, opcoes.rodape);
  if (opcoes.observacao) nota(d, opcoes.observacao);
  salvar(d, opcoes.nomeArquivo);
}
