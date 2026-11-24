import { describe, expect, it } from 'vitest';
import {
  formatarCronometro,
  formatarData,
  formatarDuracao,
  formatarHorasDecimais,
  formatarMoeda,
  reaisParaCentavos,
  valorPorTempo,
} from './formatacao.ts';

describe('formatarMoeda', () => {
  it('formata centavos em reais', () => {
    expect(formatarMoeda(123456)).toBe('R$ 1.234,56');
    expect(formatarMoeda(0)).toBe('R$ 0,00');
    expect(formatarMoeda(5)).toBe('R$ 0,05');
  });
});

describe('reaisParaCentavos', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234.56', 123456],
    ['R$ 1.234,56', 123456],
    ['1234', 123400],
    ['1.234', 123400],
    ['0,1', 10],
    ['10,05', 1005],
  ])('%s → %i', (entrada, esperado) => {
    expect(reaisParaCentavos(entrada)).toBe(esperado);
  });

  it.each(['', 'abc', '1,234,5', '12,345'])('rejeita "%s"', (entrada) => {
    expect(reaisParaCentavos(entrada)).toBeNull();
  });
});

describe('datas e durações', () => {
  it('formata data pura sem deslocar o fuso', () => {
    expect(formatarData('2026-01-01')).toBe('01/01/2026');
  });
  it('formata durações', () => {
    expect(formatarDuracao(0)).toBe('0min');
    expect(formatarDuracao(59 * 60)).toBe('59min');
    expect(formatarDuracao(3600 + 5 * 60 + 30)).toBe('1h 05min');
    expect(formatarCronometro(3600 + 5 * 60 + 9)).toBe('01:05:09');
    expect(formatarHorasDecimais(5400)).toBe('1,50');
  });
});

describe('valorPorTempo', () => {
  it('calcula valor proporcional ao tempo, arredondando ao centavo', () => {
    expect(valorPorTempo(5400, 10000)).toBe(15000); // 1,5h × R$100
    expect(valorPorTempo(60, 10000)).toBe(167); // 1min × R$100 = R$1,666… → R$1,67
    expect(valorPorTempo(0, 10000)).toBe(0);
  });
});

import { centavosParaTexto, horasParaSegundos, segundosParaHorasTexto } from './formatacao.ts';

describe('horasParaSegundos', () => {
  it.each([
    ['40', 144000],
    ['12,5', 45000],
    ['12.5', 45000],
    ['12:30', 45000],
    ['12h30', 45000],
    ['12h', 43200],
    ['0:45', 2700],
  ])('%s → %i', (e, s) => expect(horasParaSegundos(e)).toBe(s));
  it.each(['', 'abc', '12:75', '-3', '1,234'])('rejeita "%s"', (e) => expect(horasParaSegundos(e)).toBeNull());
  it('converte de volta para texto', () => {
    expect(segundosParaHorasTexto(45000)).toBe('12:30');
    expect(segundosParaHorasTexto(144000)).toBe('40');
    expect(centavosParaTexto(123456)).toBe('1.234,56');
  });
});
