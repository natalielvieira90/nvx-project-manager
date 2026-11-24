/**
 * Formatação e conversão no padrão brasileiro (R$, dd/mm/aaaa, horas).
 * Compartilhado entre frontend e backend (relatórios/CSV).
 * Valores monetários trafegam SEMPRE em centavos inteiros.
 */

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 123456 → "R$ 1.234,56" */
export function formatarMoeda(centavos: number): string {
  // Intl usa espaço não separável; normalizamos para espaço comum (melhor em CSV/PDF).
  return formatoMoeda.format(centavos / 100).replace(/ /g, ' ');
}

/**
 * Converte texto digitado em reais para centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "1234".
 * Retorna null se o texto for inválido.
 */
export function reaisParaCentavos(texto: string): number | null {
  let s = texto.replace(/R\$|\s/g, '').trim();
  if (!s) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.'); // padrão BR: ponto = milhar, vírgula = decimal
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // "1.234" sem vírgula = milhar
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const [inteiro, dec = ''] = s.replace('-', '').split('.');
  const centavos = Number(inteiro) * 100 + Number(dec.padEnd(2, '0'));
  return s.startsWith('-') ? -centavos : centavos;
}

/** "2026-11-24" ou ISO completo → "24/11/2026" (data local). */
export function formatarData(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split('-');
    return `${d}/${m}/${a}`; // data pura: não converter fuso
  }
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleDateString('pt-BR');
}

/** ISO → "14:05" (hora local). */
export function formatarHora(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** ISO → "24/11/2026 14:05". */
export function formatarDataHora(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  return `${formatarData(valor)} ${formatarHora(valor)}`;
}

/** Segundos → "2h 05min" (resumo) — arredonda para baixo os segundos. */
export function formatarDuracao(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

/** Segundos → "13h30" / "60h" (versão curta para tabelas). */
export function formatarDuracaoCurta(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Segundos → "02:05:09" (cronômetro). */
export function formatarCronometro(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Segundos → horas decimais com 2 casas, ex.: 5400 → "1,50". Útil em relatórios. */
export function formatarHorasDecimais(segundos: number): string {
  return (segundos / 3600).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Valor de um tempo trabalhado: segundos × valor/hora, arredondado ao centavo.
 * Ex.: 5400 s a R$ 100,00/h (10000 centavos) → 15000 centavos.
 */
export function valorPorTempo(segundos: number, valorHoraCentavos: number): number {
  return Math.round((segundos * valorHoraCentavos) / 3600);
}

/**
 * Converte horas digitadas em segundos. Aceita "40", "12,5", "12.5", "12:30" e "12h30".
 * Retorna null se inválido.
 */
export function horasParaSegundos(texto: string): number | null {
  const s = texto.trim().toLowerCase().replace(/\s/g, '');
  if (!s) return null;
  const hm = s.match(/^(\d{1,5})(?::|h)(\d{1,2})?(?:min|m)?$/);
  if (hm) {
    const min = Number(hm[2] ?? 0);
    if (min > 59) return null;
    return Number(hm[1]) * 3600 + min * 60;
  }
  const dec = s.replace(',', '.').replace(/h$/, '');
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(dec)) return null;
  return Math.round(Number(dec) * 3600);
}

/** Segundos → texto editável de horas: 45000 → "12:30", 144000 → "40". */
export function segundosParaHorasTexto(segundos: number): string {
  if (!segundos) return '';
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  return m ? `${h}:${String(m).padStart(2, '0')}` : String(h);
}

/** Centavos → texto editável em reais: 123456 → "1.234,56". */
export function centavosParaTexto(centavos: number): string {
  if (!centavos) return '';
  return (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Data local de hoje em AAAA-MM-DD. */
export function hojeIso(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}
