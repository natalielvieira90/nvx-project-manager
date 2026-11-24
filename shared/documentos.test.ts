import { describe, expect, it } from 'vitest';
import { cnpjValido, cpfValido, formatarDocumento, formatarTelefone, normalizarBusca, telefoneValido } from './documentos.ts';
import { esquemaCliente } from './esquemas.ts';

describe('CPF e CNPJ', () => {
  it('valida CPF', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('123')).toBe(false);
  });
  it('valida CNPJ', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
    expect(cnpjValido('00.000.000/0000-00')).toBe(false);
  });
  it('formata enquanto digita', () => {
    expect(formatarDocumento('529982')).toBe('529.982');
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25');
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('telefone', () => {
  it('formata fixo, celular e com DDI', () => {
    expect(formatarTelefone('11988881111')).toBe('(11) 98888-1111');
    expect(formatarTelefone('1133334444')).toBe('(11) 3333-4444');
    expect(formatarTelefone('5511988881111')).toBe('(11) 98888-1111');
    expect(formatarTelefone('119')).toBe('(11) 9');
  });
  it('valida quantidade de dígitos', () => {
    expect(telefoneValido('(11) 98888-1111')).toBe(true);
    expect(telefoneValido('988881111')).toBe(false);
  });
});

describe('esquemaCliente', () => {
  it('normaliza os dados', () => {
    const r = esquemaCliente.parse({
      nome: '  Ana  ',
      empresa: '',
      telefone: '+55 (11) 98888-1111',
      email: ' ANA@Exemplo.com ',
      documento: '529.982.247-25',
    });
    expect(r).toEqual({
      nome: 'Ana',
      empresa: null,
      telefone: '11988881111',
      email: 'ana@exemplo.com',
      documento: '52998224725',
      observacoes: null,
    });
  });
  it('rejeita dados inválidos com mensagens em português', () => {
    const r = esquemaCliente.safeParse({ nome: ' ', email: 'x@', documento: '123', telefone: '9' });
    expect(r.success).toBe(false);
    const campos = r.error!.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(['nome', 'email', 'documento', 'telefone']));
  });
});

it('busca ignora acentos e maiúsculas', () => {
  expect(normalizarBusca('Clínica São José')).toBe('clinica sao jose');
});
