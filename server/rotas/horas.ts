/**
 * Cronômetro e lançamentos de horas.
 *
 * O cronômetro vive no banco (tabela `cronometro_ativo`, no máximo 1 linha). O tempo é
 * sempre recalculado a partir dos horários salvos, por isso continua correto depois de
 * recarregar a página, fechar o programa ou reiniciar o computador.
 */
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import {
  esquemaAtualizarCronometro,
  esquemaFinalizarCronometro,
  esquemaIniciarCronometro,
  esquemaLancamento,
  esquemaSituacaoLote,
  CATEGORIAS_HORA,
  SITUACOES_COBRANCA,
  type DadosLancamento,
} from '../../shared/esquemas.ts';
import { formatarDataHora, formatarHora } from '../../shared/formatacao.ts';
import type { CategoriaHora, CronometroAtivo, Lancamento, SituacaoCobranca } from '../../shared/tipos.ts';

export { situacaoPadrao };
import { ErroHttp, idDaRota, validar } from '../http.ts';
import { situacaoPadrao } from '../../shared/financeiro.ts';

export type Relogio = () => Date;

const segundosEntre = (inicio: string, fim: string) => Math.max(0, Math.floor((Date.parse(fim) - Date.parse(inicio)) / 1000));

/** Projeto ativo e que aceita horas (não excluído, não cancelado). */
function projetoParaHoras(db: DatabaseSync, projetoId: number) {
  const p = db
    .prepare('SELECT id, nome, status, valor_fechado_centavos FROM projetos WHERE id = ? AND excluido_em IS NULL')
    .get(projetoId);
  if (!p) throw new ErroHttp(400, 'Verifique os campos destacados.', { projetoId: 'Projeto não encontrado.' });
  if (p.status === 'cancelado') {
    throw new ErroHttp(400, 'Verifique os campos destacados.', { projetoId: 'Projeto cancelado não recebe horas.' });
  }
  return p;
}

// ---------------------------------------------------------------------------

export function rotasCronometro(db: DatabaseSync, relogio: Relogio) {
  const r = Router();

  function ler(): CronometroAtivo | null {
    const c = db
      .prepare(
        `SELECT c.*, p.nome AS projeto_nome, cl.nome AS cliente_nome
         FROM cronometro_ativo c JOIN projetos p ON p.id = c.projeto_id JOIN clientes cl ON cl.id = p.cliente_id
         WHERE c.id = 1`,
      )
      .get();
    if (!c) return null;
    const agora = relogio().toISOString();
    const segmento = (c.segmento_iniciado_em as string) ?? null;
    const acumulados = Number(c.segundos_acumulados);
    return {
      projetoId: Number(c.projeto_id),
      projetoNome: String(c.projeto_nome),
      clienteNome: String(c.cliente_nome),
      categoria: c.categoria as CategoriaHora,
      descricao: (c.descricao as string) ?? null,
      iniciadoEm: String(c.iniciado_em),
      segmentoIniciadoEm: segmento,
      pausadoEm: (c.pausado_em as string) ?? null,
      segundosAcumulados: acumulados,
      segundosDecorridos: acumulados + (segmento ? segundosEntre(segmento, agora) : 0),
      agora,
    };
  }

  function exigir(): CronometroAtivo {
    const c = ler();
    if (!c) throw new ErroHttp(404, 'Nenhum cronômetro em andamento.');
    return c;
  }

  r.get('/', (_req, res) => {
    res.json(ler());
  });

  r.post('/iniciar', (req, res) => {
    const d = validar(esquemaIniciarCronometro, req.body);
    projetoParaHoras(db, d.projetoId);
    const atual = ler();
    if (atual) {
      throw new ErroHttp(409, `Já existe um cronômetro em andamento (${atual.projetoNome}). Finalize-o antes de iniciar outro.`);
    }
    const agora = relogio().toISOString();
    try {
      db.prepare(
        `INSERT INTO cronometro_ativo (id, projeto_id, categoria, descricao, iniciado_em, segmento_iniciado_em, segundos_acumulados)
         VALUES (1, ?, ?, ?, ?, ?, 0)`,
      ).run(d.projetoId, d.categoria, d.descricao, agora, agora);
    } catch {
      // Proteção extra: a chave id = 1 impede dois cronômetros mesmo com cliques simultâneos.
      throw new ErroHttp(409, 'Já existe um cronômetro em andamento.');
    }
    res.status(201).json(ler());
  });

  r.post('/pausar', (_req, res) => {
    const c = exigir();
    if (!c.segmentoIniciadoEm) throw new ErroHttp(409, 'O cronômetro já está pausado.');
    const agora = relogio().toISOString();
    db.prepare(
      'UPDATE cronometro_ativo SET segundos_acumulados = ?, segmento_iniciado_em = NULL, pausado_em = ? WHERE id = 1',
    ).run(c.segundosAcumulados + segundosEntre(c.segmentoIniciadoEm, agora), agora);
    res.json(ler());
  });

  r.post('/retomar', (_req, res) => {
    const c = exigir();
    if (c.segmentoIniciadoEm) throw new ErroHttp(409, 'O cronômetro já está em andamento.');
    db.prepare('UPDATE cronometro_ativo SET segmento_iniciado_em = ?, pausado_em = NULL WHERE id = 1').run(
      relogio().toISOString(),
    );
    res.json(ler());
  });

  // Ajusta projeto, categoria ou descrição sem parar o cronômetro.
  r.put('/', (req, res) => {
    exigir();
    const d = validar(esquemaAtualizarCronometro, req.body);
    projetoParaHoras(db, d.projetoId);
    db.prepare('UPDATE cronometro_ativo SET projeto_id = ?, categoria = ?, descricao = ? WHERE id = 1').run(
      d.projetoId,
      d.categoria,
      d.descricao,
    );
    res.json(ler());
  });

  // Finaliza: cria o lançamento e remove o cronômetro na MESMA transação (nada se perde).
  r.post('/finalizar', (req, res) => {
    const c = exigir();
    const d = validar(esquemaFinalizarCronometro, req.body);
    if (c.segundosDecorridos < 1) throw new ErroHttp(400, 'O tempo registrado é muito curto para ser salvo.');
    const projeto = projetoParaHoras(db, c.projetoId);
    const fim = c.pausadoEm ?? c.agora;
    const descricao = d.descricao !== undefined && d.descricao !== null ? d.descricao : c.descricao;
    const situacao = d.situacaoCobranca ?? situacaoPadrao(c.categoria, Number(projeto.valor_fechado_centavos));

    db.exec('BEGIN');
    try {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO lancamentos_horas (projeto_id, categoria, descricao, inicio, fim, duracao_segundos, origem, situacao_cobranca)
           VALUES (?, ?, ?, ?, ?, ?, 'cronometro', ?)`,
        )
        .run(c.projetoId, c.categoria, descricao, c.iniciadoEm, fim > c.iniciadoEm ? fim : c.agora, c.segundosDecorridos, situacao);
      db.prepare('DELETE FROM cronometro_ativo WHERE id = 1').run();
      db.exec('COMMIT');
      res.status(201).json({ lancamentoId: Number(lastInsertRowid), duracaoSegundos: c.segundosDecorridos });
    } catch (erro) {
      db.exec('ROLLBACK');
      throw erro;
    }
  });

  // Descarta o cronômetro sem gerar lançamento.
  r.delete('/', (_req, res) => {
    exigir();
    db.prepare('DELETE FROM cronometro_ativo WHERE id = 1').run();
    res.status(204).end();
  });

  return r;
}

// ---------------------------------------------------------------------------

const SELECT_LANCAMENTO = `
  SELECT l.*, p.nome AS projeto_nome, c.nome AS cliente_nome
  FROM lancamentos_horas l
  JOIN projetos p ON p.id = l.projeto_id
  JOIN clientes c ON c.id = p.cliente_id
  WHERE l.excluido_em IS NULL AND p.excluido_em IS NULL`;

function paraLancamento(r: Record<string, unknown>): Lancamento {
  return {
    id: Number(r.id),
    projetoId: Number(r.projeto_id),
    projetoNome: String(r.projeto_nome),
    clienteNome: String(r.cliente_nome),
    categoria: r.categoria as CategoriaHora,
    descricao: (r.descricao as string) ?? null,
    inicio: String(r.inicio),
    fim: String(r.fim),
    duracaoSegundos: Number(r.duracao_segundos),
    origem: r.origem as Lancamento['origem'],
    situacaoCobranca: r.situacao_cobranca as SituacaoCobranca,
    atendimentoId: r.atendimento_id === null ? null : Number(r.atendimento_id),
    criadoEm: String(r.criado_em),
  };
}

export function rotasLancamentos(db: DatabaseSync, relogio: Relogio) {
  const r = Router();

  function buscar(id: number): Lancamento {
    const l = db.prepare(`${SELECT_LANCAMENTO} AND l.id = ?`).get(id);
    if (!l) throw new ErroHttp(404, 'Lançamento não encontrado.');
    return paraLancamento(l);
  }

  /** Impede horários sobrepostos (evita lançar o mesmo trabalho duas vezes). */
  function verificarConflito(d: DadosLancamento, ignorarId = 0) {
    const outro = db
      .prepare(
        `${SELECT_LANCAMENTO} AND l.id <> ? AND l.inicio < ? AND l.fim > ? ORDER BY l.inicio LIMIT 1`,
      )
      .get(ignorarId, d.fim, d.inicio);
    if (outro) {
      const o = paraLancamento(outro);
      throw new ErroHttp(409, 'Já existe um lançamento neste horário.', {
        inicio: `Conflita com ${formatarDataHora(o.inicio)}–${formatarHora(o.fim)} (${o.projetoNome}).`,
      });
    }
    const atendimento = db
      .prepare(
        `SELECT a.inicio, a.fim, c.nome AS cliente FROM atendimentos_suporte a
         JOIN projetos p ON p.id = a.projeto_id JOIN clientes c ON c.id = a.cliente_id
         WHERE a.excluido_em IS NULL AND p.excluido_em IS NULL AND a.inicio < ? AND a.fim > ? LIMIT 1`,
      )
      .get(d.fim, d.inicio);
    if (atendimento) {
      throw new ErroHttp(409, 'Já existe um atendimento de suporte neste horário.', {
        inicio: `Conflita com o atendimento de ${formatarDataHora(String(atendimento.inicio))}–${formatarHora(String(atendimento.fim))} (${atendimento.cliente}).`,
      });
    }
  }

  /** Lançamento que virou atendimento é mantido pela tela de Suporte (evita desencontro de horários). */
  function exigirLivre(l: Lancamento) {
    if (l.atendimentoId !== null) {
      throw new ErroHttp(409, 'Este lançamento pertence a um atendimento de suporte. Altere-o pela tela de Suporte.');
    }
  }

  function validarFuturo(d: DadosLancamento) {
    // Tolerância de 5 minutos para diferenças de relógio.
    if (Date.parse(d.fim) > relogio().getTime() + 5 * 60_000) {
      throw new ErroHttp(400, 'Verifique os campos destacados.', { fim: 'Não é possível lançar horas no futuro.' });
    }
  }

  // Lista com filtros: período (de/ate em AAAA-MM-DD, horário local convertido pela tela em ISO), projeto, categoria, situação.
  r.get('/', (req, res) => {
    const filtros: string[] = [];
    const params: (string | number)[] = [];
    const q = req.query as Record<string, string | undefined>;
    const iso = (v: string, campo: string) => {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new ErroHttp(400, `Filtro "${campo}" inválido.`);
      return d.toISOString();
    };
    if (q.de) {
      filtros.push('l.inicio >= ?');
      params.push(iso(q.de, 'de'));
    }
    if (q.ate) {
      filtros.push('l.inicio < ?');
      params.push(iso(q.ate, 'ate'));
    }
    if (q.projeto) {
      filtros.push('l.projeto_id = ?');
      params.push(idDaRota(q.projeto));
    }
    if (q.categoria) {
      if (!(CATEGORIAS_HORA as readonly string[]).includes(q.categoria)) throw new ErroHttp(400, 'Categoria inválida.');
      filtros.push('l.categoria = ?');
      params.push(q.categoria);
    }
    if (q.situacao) {
      if (!(SITUACOES_COBRANCA as readonly string[]).includes(q.situacao)) throw new ErroHttp(400, 'Situação inválida.');
      filtros.push('l.situacao_cobranca = ?');
      params.push(q.situacao);
    }
    const linhas = db
      .prepare(`${SELECT_LANCAMENTO} ${filtros.map((f) => `AND ${f}`).join(' ')} ORDER BY l.inicio DESC LIMIT 2000`)
      .all(...params);
    res.json(linhas.map(paraLancamento));
  });

  r.get('/:id', (req, res) => {
    res.json(buscar(idDaRota(req.params.id)));
  });

  r.post('/', (req, res) => {
    const d = validar(esquemaLancamento, req.body);
    projetoParaHoras(db, d.projetoId);
    validarFuturo(d);
    verificarConflito(d);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO lancamentos_horas (projeto_id, categoria, descricao, inicio, fim, duracao_segundos, origem, situacao_cobranca)
         VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)`,
      )
      .run(d.projetoId, d.categoria, d.descricao, d.inicio, d.fim, segundosEntre(d.inicio, d.fim), d.situacaoCobranca);
    res.status(201).json(buscar(Number(lastInsertRowid)));
  });

  r.put('/:id', (req, res) => {
    const id = idDaRota(req.params.id);
    const atual = buscar(id);
    exigirLivre(atual);
    const d = validar(esquemaLancamento, req.body);
    projetoParaHoras(db, d.projetoId);
    validarFuturo(d);
    verificarConflito(d, id);
    // Lançamento do cronômetro editado mantém a duração trabalhada se os horários não mudaram
    // (pausas não entram na duração); se mudaram, a duração passa a ser fim − início.
    const mesmosHorarios = d.inicio === atual.inicio && d.fim === atual.fim;
    const duracao = mesmosHorarios ? atual.duracaoSegundos : segundosEntre(d.inicio, d.fim);
    db.prepare(
      `UPDATE lancamentos_horas SET projeto_id = ?, categoria = ?, descricao = ?, inicio = ?, fim = ?,
         duracao_segundos = ?, situacao_cobranca = ?, atualizado_em = ? WHERE id = ?`,
    ).run(d.projetoId, d.categoria, d.descricao, d.inicio, d.fim, duracao, d.situacaoCobranca, relogio().toISOString(), id);
    res.json(buscar(id));
  });

  // Altera a situação de cobrança de vários lançamentos (ex.: marcar como faturado).
  r.patch('/situacao', (req, res) => {
    const { ids, situacaoCobranca } = validar(esquemaSituacaoLote, req.body);
    const marcadores = ids.map(() => '?').join(',');
    const { changes } = db
      .prepare(
        `UPDATE lancamentos_horas SET situacao_cobranca = ?, atualizado_em = ?
         WHERE excluido_em IS NULL AND atendimento_id IS NULL AND id IN (${marcadores})`,
      )
      .run(situacaoCobranca, relogio().toISOString(), ...ids);
    res.json({ alterados: Number(changes) });
  });

  r.delete('/:id', (req, res) => {
    const l = buscar(idDaRota(req.params.id));
    exigirLivre(l);
    const agora = relogio().toISOString();
    db.prepare('UPDATE lancamentos_horas SET excluido_em = ?, atualizado_em = ? WHERE id = ?').run(agora, agora, l.id);
    res.status(204).end();
  });

  return r;
}
