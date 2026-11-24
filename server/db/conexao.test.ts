import { describe, expect, it } from 'vitest';
import { abrirBanco, aplicarMigracoes, versaoAtual } from './conexao.ts';

describe('banco de dados', () => {
  it('aplica migrações uma única vez', () => {
    const db = abrirBanco(':memory:');
    expect(versaoAtual(db)).toBeGreaterThanOrEqual(1);
    expect(aplicarMigracoes(db)).toEqual([]); // segunda execução não reaplica
  });

  it('impede dois cronômetros ativos', () => {
    const db = abrirBanco(':memory:');
    db.prepare("INSERT INTO clientes (nome) VALUES ('Cliente')").run();
    db.prepare("INSERT INTO projetos (cliente_id, nome) VALUES (1, 'Projeto')").run();
    const inserir = db.prepare(
      "INSERT INTO cronometro_ativo (id, projeto_id, categoria, iniciado_em) VALUES (?, 1, 'desenvolvimento', '2026-01-01T00:00:00Z')",
    );
    inserir.run(1);
    expect(() => inserir.run(1)).toThrow();
    expect(() => inserir.run(2)).toThrow();
  });

  it('impede cliente com CPF/CNPJ duplicado', () => {
    const db = abrirBanco(':memory:');
    const inserir = db.prepare("INSERT INTO clientes (nome, documento) VALUES ('A', '12345678901')");
    inserir.run();
    expect(() => inserir.run()).toThrow();
  });

  it('exige integridade referencial', () => {
    const db = abrirBanco(':memory:');
    expect(() => db.prepare("INSERT INTO projetos (cliente_id, nome) VALUES (999, 'X')").run()).toThrow();
  });
});
