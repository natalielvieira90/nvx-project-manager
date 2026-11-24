/**
 * Exportação de relatórios para CSV (abre no Excel/LibreOffice em português).
 *
 * - Separador ";" e decimal com vírgula, padrão das planilhas no Brasil.
 * - UTF-8 com BOM, para os acentos aparecerem corretamente no Excel.
 * - Valores numéricos sem "R$" e sem separador de milhar, para poderem ser somados.
 */

/** Coluna de relatório: o mesmo cadastro serve para a tela, o PDF e o CSV. */
export interface Coluna<T> {
  titulo: string;
  /** Texto formatado (tela e PDF). */
  valor: (linha: T) => string;
  /** Valor para o CSV (padrão: o mesmo da tela). */
  csv?: (linha: T) => string;
  direita?: boolean;
  /** Largura relativa no PDF (padrão 1). */
  peso?: number;
}

/** Centavos → "1234,56" (CSV). */
export const centavosCsv = (c: number) => (c / 100).toFixed(2).replace('.', ',');
/** Segundos → horas decimais "12,50" (CSV). */
export const horasCsv = (s: number) => (s / 3600).toFixed(2).replace('.', ',');

function celula(v: string): string {
  // Evita que a planilha interprete o texto como fórmula e escapa aspas/quebras.
  const seguro = /^[=+\-@\t\r]/.test(v) && !/^-?\d+(,\d+)?$/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function gerarCsv<T>(colunas: Coluna<T>[], linhas: T[], rodape?: string[][]): string {
  const todas = [
    colunas.map((c) => c.titulo),
    ...linhas.map((l) => colunas.map((c) => (c.csv ?? c.valor)(l))),
    ...(rodape ?? []),
  ];
  return '﻿' + todas.map((linha) => linha.map(celula).join(';')).join('\r\n') + '\r\n';
}

export function baixarArquivo(nome: string, conteudo: Blob) {
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function baixarCsv<T>(nome: string, colunas: Coluna<T>[], linhas: T[], rodape?: string[][]) {
  baixarArquivo(nome, new Blob([gerarCsv(colunas, linhas, rodape)], { type: 'text/csv;charset=utf-8' }));
}

/** Nome de arquivo seguro: "Relatório de horas" → "relatorio-de-horas". */
export function nomeArquivo(...partes: string[]): string {
  return partes
    .filter(Boolean)
    .join('-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
