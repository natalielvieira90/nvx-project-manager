/**
 * Migrações do banco SQLite, aplicadas em ordem e registradas em `schema_migracoes`.
 *
 * Convenções:
 * - Valores monetários em CENTAVOS (INTEGER) para evitar erros de arredondamento.
 * - Durações em SEGUNDOS (INTEGER).
 * - Datas/horas em texto ISO 8601 UTC (ex.: 2026-11-24T13:05:00.000Z); datas puras em AAAA-MM-DD.
 * - Exclusão lógica via `excluido_em` (registro vai para a lixeira e pode ser restaurado).
 *
 * Nunca altere uma migração já publicada: crie uma nova versão.
 */
export interface Migracao {
  versao: number;
  descricao: string;
  sql: string;
}

export const migracoes: Migracao[] = [
  {
    versao: 1,
    descricao: 'Estrutura inicial',
    sql: /* sql */ `
      CREATE TABLE clientes (
        id            INTEGER PRIMARY KEY,
        nome          TEXT    NOT NULL CHECK (length(trim(nome)) > 0),
        empresa       TEXT,
        telefone      TEXT,
        email         TEXT,
        documento     TEXT,                -- CPF/CNPJ somente dígitos (opcional)
        observacoes   TEXT,
        criado_em     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        atualizado_em TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        excluido_em   TEXT
      ) STRICT;
      CREATE UNIQUE INDEX ux_clientes_documento ON clientes(documento)
        WHERE documento IS NOT NULL AND excluido_em IS NULL;
      CREATE UNIQUE INDEX ux_clientes_email ON clientes(lower(email))
        WHERE email IS NOT NULL AND excluido_em IS NULL;

      CREATE TABLE projetos (
        id                          INTEGER PRIMARY KEY,
        cliente_id                  INTEGER NOT NULL REFERENCES clientes(id),
        nome                        TEXT    NOT NULL CHECK (length(trim(nome)) > 0),
        descricao                   TEXT,
        data_inicio                 TEXT,
        prazo_entrega               TEXT,
        valor_fechado_centavos      INTEGER NOT NULL DEFAULT 0 CHECK (valor_fechado_centavos >= 0),
        estimativa_segundos         INTEGER NOT NULL DEFAULT 0 CHECK (estimativa_segundos >= 0),
        valor_hora_dev_centavos     INTEGER NOT NULL DEFAULT 0 CHECK (valor_hora_dev_centavos >= 0),
        valor_hora_suporte_centavos INTEGER NOT NULL DEFAULT 0 CHECK (valor_hora_suporte_centavos >= 0),
        desconto_centavos           INTEGER NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
        status                      TEXT    NOT NULL DEFAULT 'orcamento' CHECK (status IN
                                      ('orcamento','aguardando_aprovacao','em_andamento','pausado','concluido','cancelado')),
        observacoes                 TEXT,
        criado_em                   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        atualizado_em               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        excluido_em                 TEXT
      ) STRICT;
      CREATE INDEX ix_projetos_cliente ON projetos(cliente_id);
      CREATE UNIQUE INDEX ux_projetos_cliente_nome ON projetos(cliente_id, lower(nome))
        WHERE excluido_em IS NULL;

      CREATE TABLE atendimentos_suporte (
        id               INTEGER PRIMARY KEY,
        cliente_id       INTEGER NOT NULL REFERENCES clientes(id),
        projeto_id       INTEGER NOT NULL REFERENCES projetos(id),
        inicio           TEXT    NOT NULL,
        fim              TEXT    NOT NULL,
        duracao_segundos INTEGER NOT NULL CHECK (duracao_segundos > 0),
        problema         TEXT    NOT NULL CHECK (length(trim(problema)) > 0),
        solucao          TEXT,
        valor_centavos   INTEGER NOT NULL DEFAULT 0 CHECK (valor_centavos >= 0),
        situacao         TEXT    NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente','faturado','pago')),
        criado_em        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        atualizado_em    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        excluido_em      TEXT,
        CHECK (fim > inicio)
      ) STRICT;
      CREATE INDEX ix_suporte_projeto ON atendimentos_suporte(projeto_id);
      CREATE INDEX ix_suporte_inicio ON atendimentos_suporte(inicio);

      CREATE TABLE lancamentos_horas (
        id                INTEGER PRIMARY KEY,
        projeto_id        INTEGER NOT NULL REFERENCES projetos(id),
        categoria         TEXT    NOT NULL CHECK (categoria IN
                            ('desenvolvimento','reuniao','planejamento','correcao','suporte')),
        descricao         TEXT,
        inicio            TEXT    NOT NULL,
        fim               TEXT    NOT NULL,
        duracao_segundos  INTEGER NOT NULL CHECK (duracao_segundos > 0),
        origem            TEXT    NOT NULL CHECK (origem IN ('cronometro','manual')),
        situacao_cobranca TEXT    NOT NULL DEFAULT 'incluido_pacote' CHECK (situacao_cobranca IN
                            ('incluido_pacote','faturavel','faturado')),
        atendimento_id    INTEGER REFERENCES atendimentos_suporte(id),
        criado_em         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        atualizado_em     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        excluido_em       TEXT,
        CHECK (fim > inicio)
      ) STRICT;
      CREATE INDEX ix_lancamentos_projeto ON lancamentos_horas(projeto_id);
      CREATE INDEX ix_lancamentos_inicio ON lancamentos_horas(inicio);

      -- No máximo UM cronômetro ativo (id fixo = 1). O tempo é sempre recalculado
      -- a partir dos horários salvos, por isso sobrevive a recarregar/fechar a página.
      CREATE TABLE cronometro_ativo (
        id                    INTEGER PRIMARY KEY CHECK (id = 1),
        projeto_id            INTEGER NOT NULL REFERENCES projetos(id),
        categoria             TEXT    NOT NULL CHECK (categoria IN
                                ('desenvolvimento','reuniao','planejamento','correcao','suporte')),
        descricao             TEXT,
        iniciado_em           TEXT    NOT NULL,  -- início do trabalho (primeiro "iniciar")
        segmento_iniciado_em  TEXT,              -- início do trecho atual; NULL quando pausado
        segundos_acumulados   INTEGER NOT NULL DEFAULT 0 CHECK (segundos_acumulados >= 0)
      ) STRICT;

      CREATE TABLE servicos_adicionais (
        id             INTEGER PRIMARY KEY,
        projeto_id     INTEGER NOT NULL REFERENCES projetos(id),
        descricao      TEXT    NOT NULL CHECK (length(trim(descricao)) > 0),
        data           TEXT    NOT NULL,
        valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
        situacao       TEXT    NOT NULL DEFAULT 'faturavel' CHECK (situacao IN ('faturavel','faturado')),
        criado_em      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        atualizado_em  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        excluido_em    TEXT
      ) STRICT;
      CREATE INDEX ix_servicos_projeto ON servicos_adicionais(projeto_id);

      CREATE TABLE pagamentos (
        id             INTEGER PRIMARY KEY,
        projeto_id     INTEGER NOT NULL REFERENCES projetos(id),
        data           TEXT    NOT NULL,
        valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
        forma          TEXT,
        observacoes    TEXT,
        criado_em      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        atualizado_em  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        excluido_em    TEXT
      ) STRICT;
      CREATE INDEX ix_pagamentos_projeto ON pagamentos(projeto_id);
      CREATE INDEX ix_pagamentos_data ON pagamentos(data);

      CREATE TABLE configuracoes (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      ) STRICT;
      INSERT INTO configuracoes (chave, valor) VALUES
        ('valor_hora_dev_padrao_centavos', '0'),
        ('valor_hora_suporte_padrao_centavos', '0');
    `,
  },
  {
    versao: 2,
    descricao: 'Cronômetro: horário da pausa',
    sql: /* sql */ `
      -- Momento em que o cronômetro foi pausado. Ao finalizar um cronômetro pausado,
      -- o horário final do lançamento é o da pausa (e não o do clique em "finalizar").
      ALTER TABLE cronometro_ativo ADD COLUMN pausado_em TEXT;
    `,
  },
  {
    versao: 3,
    descricao: 'Pagamento gerado por atendimento de suporte',
    sql: /* sql */ `
      -- Quando um atendimento é marcado como "pago", o sistema registra o pagamento
      -- vinculado a ele, para que o valor recebido e o pendente do projeto fiquem corretos.
      ALTER TABLE pagamentos ADD COLUMN atendimento_id INTEGER REFERENCES atendimentos_suporte(id);
      CREATE INDEX ix_pagamentos_atendimento ON pagamentos(atendimento_id);
      CREATE INDEX ix_lancamentos_atendimento ON lancamentos_horas(atendimento_id);
    `,
  },
];
