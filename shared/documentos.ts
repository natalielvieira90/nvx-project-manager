/** Validação e formatação de CPF, CNPJ e telefone brasileiros. */

export const somenteDigitos = (texto: string | null | undefined) => (texto ?? '').replace(/\D/g, '');

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = base.split('').reduce((s, d, i) => s + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const d1 = digitoVerificador(cpf.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(cpf.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cpf.endsWith(`${d1}${d2}`);
}

export function cnpjValido(valor: string): boolean {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const d1 = digitoVerificador(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${d1}${d2}`);
}

export const documentoValido = (valor: string) => cpfValido(valor) || cnpjValido(valor);

/** Máscara progressiva: CPF até 11 dígitos, CNPJ a partir do 12º. */
export function formatarDocumento(valor: string | null | undefined): string {
  const d = somenteDigitos(valor).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** (11) 98888-1111 · (11) 3333-4444 — formata enquanto digita. */
export function formatarTelefone(valor: string | null | undefined): string {
  let d = somenteDigitos(valor);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2); // remove DDI do Brasil
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Telefone com DDD: 10 (fixo) ou 11 (celular) dígitos; aceita DDI 55. */
export function telefoneValido(valor: string): boolean {
  let d = somenteDigitos(valor);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11;
}

/** Remove acentos e caixa, para busca. */
export const normalizarBusca = (texto: string | null | undefined) =>
  (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
