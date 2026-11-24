/**
 * Atendimentos de suporte.
 *
 * Regras principais:
 * - O cliente é sempre o do projeto (não há como divergir).
 * - Um atendimento pode nascer de um lançamento de suporte (ex.: cronômetro): o lançamento fica
 *   vinculado e deixa de ser contado à parte (as horas e o valor passam a ser do atendimento).
 * - Ao marcar "pago", um pagamento vinculado é registrado automaticamente; ao desmarcar ou
 *   excluir, esse pagamento vai para a lixeira. Assim recebido/pendente do projeto ficam corretos.
 */
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import {
  esquemaAtendimento,
  esquemaSituacaoAtendimentos,
  SITUACOES_ATENDIMENTO,
  type DadosAtendimento,
} from '../../shared/esquemas.ts';
import { formatarDataHora, formatarHora, hojeIso } from '../../shared/formatacao.ts';
import type { Atendimento, SituacaoAtendimento } from '../../shared/tipos.ts';
import { ErroHttp, idDaRota, validar } from '../http.ts';
import type { Relogio } from './horas.ts';

const SELECT_ATENDIMENTO = `
  SELECT a.*, p.nome AS projeto_nome, c.nome AS cliente_nome,
    (SELECT l.id FROM lancamentos_horas l WHERE l.atendimento_id = a.id AND l.excluido_em IS NULL LIMIT 1) AS lancamento_id
  FROM atendimentos_suporte a
  JOIN projetos p ON p.id = a.projeto_id
  JOIN clientes c ON c.id = a.cliente_id
  WHERE a.excluido_em IS NULL AND p.excluido_em IS NULL`;

function paraAtendimento(r: Record<string, unknown>): Atendimento {
  return {
    id: Number(r.id),
    clienteId: Number(r.cliente_id),
    clienteNome: String(r.cliente_nome),
    projetoId: Number(r.projeto_id),
    projetoNome: String(r.projeto_nome),
    inicio: String(r.inicio),
    fim: String(r.fim),
    duracaoSegundos: Number(r.duracao_segundos),
    problema: String(r.problema),
    solucao: (r.solucao as string) ?? null,
    valorCentavos: Number(r.valor_centavos),
    situacao: r.situacao as SituacaoAtendimento,
    lancamentoId: r.lancamento_id === null || r.lancamento_id === undefined ? null : Number(r.lancamento_id),
    criadoEm: String(r.criado_em),
  };
}

const segundosEntre = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / 1000);

/**
 * Mantém o pagamento automático coerente com a situação "pago" do atendimento.
 * Usado pelo módulo Suporte e pela lixeira (ao restaurar um atendimento).
 */
export function sincronizarPagamentoAtendimento(db: DatabaseSync, relogio: Relogio, atendimentoId: number) {
  const agora = () => relogio().toISOString();
  const a = db
    .prepare('SELECT projeto_id, valor_centavos, situacao, excluido_em FROM atendimentos_suporte WHERE id = ?')
    .get(atendimentoId)!;
  const pag = db
    .prepare('SELECT id FROM pagamentos WHERE atendimento_id = ? AND excluido_em IS NULL')
    .get(atendimentoId);
  const deveExistir = !a.excluido_em && a.situacao === 'pago' && Number(a.valor_centavos) > 0;
  if (deveExistir && pag) {
    db.prepare('UPDATE pagamentos SET projeto_id = ?, valor_centavos = ?, atualizado_em = ? WHERE id = ?').run(
      Number(a.projeto_id), Number(a.valor_centavos), agora(), Number(pag.id),
    );
  } else if (deveExistir) {
    db.prepare(
      `INSERT INTO pagamentos (projeto_id, data, valor_centavos, forma, observacoes, atendimento_id)
       VALUES (?, ?, ?, NULL, ?, ?)`,
    ).run(Number(a.projeto_id), hojeIso(relogio()), Number(a.valor_centavos), `Atendimento de suporte nº ${atendimentoId}`, atendimentoId);
  } else if (pag) {
    db.prepare('UPDATE pagamentos SET excluido_em = ?, atualizado_em = ? WHERE id = ?').run(agora(), agora(), Number(pag.id));
  }
}

export function rotasAtendimentos(db: DatabaseSync, relogio: Relogio) {
  const r = Router();
  const agora = () => relogio().toISOString();

  function buscar(id: number): Atendimento {
    const a = db.prepare(`${SELECT_ATENDIMENTO} AND a.id = ?`).get(id);
    if (!a) throw new ErroHttp(404, 'Atendimento não encontrado.');
    return paraAtendimento(a);
  }

  function projetoValido(projetoId: number) {
    const p = db.prepare('SELECT id, cliente_id, status FROM projetos WHERE id = ? AND excluido_em IS NULL').get(projetoId);
    if (!p) throw new ErroHttp(400, 'Verifique os campos destacados.', { projetoId: 'Projeto não encontrado.' });
    if (p.status === 'cancelado') {
      throw new ErroHttp(400, 'Verifique os campos destacados.', { projetoId: 'Projeto cancelado não recebe atendimentos.' });
    }
    return { clienteId: Number(p.cliente_id) };
  }

  /** Impede registrar o mesmo período duas vezes (outro atendimento ou outro lançamento de horas). */
  function verificarConflito(inicio: string, fim: string, ignorarAtendimento = 0, ignorarLancamento = 0) {
    const atend = db
      .prepare(
        `${SELECT_ATENDIMENTO} AND a.id <> ? AND a.inicio < ? AND a.fim > ? ORDER BY a.inicio LIMIT 1`,
      )
      .get(ignorarAtendimento, fim, inicio);
    if (atend) {
      const o = paraAtendimento(atend);
      throw new ErroHttp(409, 'Já existe um atendimento neste horário.', {
        inicio: `Conflita com o atendimento de ${formatarDataHora(o.inicio)}–${formatarHora(o.fim)} (${o.clienteNome}).`,
      });
    }
    const lanc = db
      .prepare(
        `SELECT l.inicio, l.fim, p.nome AS projeto FROM lancamentos_horas l JOIN projetos p ON p.id = l.projeto_id
         WHERE l.excluido_em IS NULL AND p.excluido_em IS NULL AND l.id <> ?
           AND (l.atendimento_id IS NULL OR l.atendimento_id <> ?)
           AND l.inicio < ? AND l.fim > ? LIMIT 1`,
      )
      .get(ignorarLancamento, ignorarAtendimento, fim, inicio);
    if (lanc) {
      throw new ErroHttp(409, 'Já existe um lançamento de horas neste horário.', {
        inicio: `Conflita com o lançamento de ${formatarDataHora(String(lanc.inicio))}–${formatarHora(String(lanc.fim))} (${lanc.projeto}). Para registrá-lo como atendimento, use "Criar atendimento" na lista de horas de suporte.`,
      });
    }
  }

  function futuro(fim: string) {
    if (Date.parse(fim) > relogio().getTime() + 5 * 60_000) {
      throw new ErroHttp(400, 'Verifique os campos destacados.', { fim: 'Não é possível registrar atendimento no futuro.' });
    }
  }

  const sincronizarPagamento = (id: number) => sincronizarPagamentoAtendimento(db, relogio, id);

  function emTransacao<T>(fn: () => T): T {
    db.exec('BEGIN');
    try {
      const resultado = fn();
      db.exec('COMMIT');
      return resultado;
    } catch (erro) {
      db.exec('ROLLBACK');
      throw erro;
    }
  }

  /** Lançamento de suporte disponível para virar atendimento. */
  function lancamentoParaConverter(lancamentoId: number, projetoId: number) {
    const l = db
      .prepare('SELECT id, projeto_id, categoria, inicio, fim, duracao_segundos, atendimento_id FROM lancamentos_horas WHERE id = ? AND excluido_em IS NULL')
      .get(lancamentoId);
    if (!l) throw new ErroHttp(400, 'Lançamento de horas não encontrado.');
    if (l.categoria !== 'suporte') throw new ErroHttp(400, 'Só lançamentos da categoria Suporte podem virar atendimento.');
    if (l.atendimento_id !== null) throw new ErroHttp(409, 'Este lançamento já está vinculado a um atendimento.');
    if (Number(l.projeto_id) !== projetoId) {
      throw new ErroHttp(400, 'Verifique os campos destacados.', { projetoId: 'O projeto deve ser o mesmo do lançamento.' });
    }
    return { inicio: String(l.inicio), fim: String(l.fim), duracao: Number(l.duracao_segundos) };
  }

  // ---------------------------------------------------------------------------

  r.get('/', (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const filtros: string[] = [];
    const params: (string | number)[] = [];
    const iso = (v: string, campo: string) => {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new ErroHttp(400, `Filtro "${campo}" inválido.`);
      return d.toISOString();
    };
    if (q.de) (filtros.push('a.inicio >= ?'), params.push(iso(q.de, 'de')));
    if (q.ate) (filtros.push('a.inicio < ?'), params.push(iso(q.ate, 'ate')));
    if (q.cliente) (filtros.push('a.cliente_id = ?'), params.push(idDaRota(q.cliente)));
    if (q.projeto) (filtros.push('a.projeto_id = ?'), params.push(idDaRota(q.projeto)));
    if (q.situacao) {
      if (!(SITUACOES_ATENDIMENTO as readonly string[]).includes(q.situacao)) throw new ErroHttp(400, 'Situação inválida.');
      filtros.push('a.situacao = ?');
      params.push(q.situacao);
    }
    const linhas = db
      .prepare(`${SELECT_ATENDIMENTO} ${filtros.map((f) => `AND ${f}`).join(' ')} ORDER BY a.inicio DESC LIMIT 2000`)
      .all(...params);
    res.json(linhas.map(paraAtendimento));
  });

  r.get('/:id', (req, res) => {
    res.json(buscar(idDaRota(req.params.id)));
  });

  r.post('/', (req, res) => {
    const d: DadosAtendimento = validar(esquemaAtendimento, req.body);
    const { clienteId } = projetoValido(d.projetoId);
    let inicio = d.inicio!;
    let fim = d.fim!;
    let duracao = 0;
    if (d.lancamentoId) {
      const l = lancamentoParaConverter(d.lancamentoId, d.projetoId);
      ({ inicio, fim } = l);
      duracao = l.duracao; // preserva o tempo trabalhado (pausas descontadas)
      verificarConflito(inicio, fim, 0, d.lancamentoId);
    } else {
      futuro(fim);
      verificarConflito(inicio, fim);
      duracao = segundosEntre(inicio, fim);
    }
    const id = emTransacao(() => {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO atendimentos_suporte (cliente_id, projeto_id, inicio, fim, duracao_segundos, problema, solucao, valor_centavos, situacao)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(clienteId, d.projetoId, inicio, fim, duracao, d.problema, d.solucao, d.valorCentavos, d.situacao);
      const novo = Number(lastInsertRowid);
      if (d.lancamentoId) {
        db.prepare('UPDATE lancamentos_horas SET atendimento_id = ?, atualizado_em = ? WHERE id = ?').run(novo, agora(), d.lancamentoId);
      }
      sincronizarPagamento(novo);
      return novo;
    });
    res.status(201).json(buscar(id));
  });

  r.put('/:id', (req, res) => {
    const id = idDaRota(req.params.id);
    const atual = buscar(id);
    const d = validar(esquemaAtendimento, { ...req.body, lancamentoId: undefined, ...(atual.lancamentoId && { inicio: atual.inicio, fim: atual.fim }) });
    const { clienteId } = projetoValido(d.projetoId);
    if (atual.lancamentoId && d.projetoId !== atual.projetoId) {
      throw new ErroHttp(400, 'Verifique os campos destacados.', {
        projetoId: 'Atendimento criado a partir de um lançamento não pode trocar de projeto.',
      });
    }
    // Horários de atendimento vindo do cronômetro ficam travados (mantêm a duração com pausas).
    const inicio = atual.lancamentoId ? atual.inicio : d.inicio!;
    const fim = atual.lancamentoId ? atual.fim : d.fim!;
    const duracao = atual.lancamentoId ? atual.duracaoSegundos : segundosEntre(inicio, fim);
    if (!atual.lancamentoId) {
      futuro(fim);
      verificarConflito(inicio, fim, id);
    }
    emTransacao(() => {
      db.prepare(
        `UPDATE atendimentos_suporte SET cliente_id = ?, projeto_id = ?, inicio = ?, fim = ?, duracao_segundos = ?,
           problema = ?, solucao = ?, valor_centavos = ?, situacao = ?, atualizado_em = ? WHERE id = ?`,
      ).run(clienteId, d.projetoId, inicio, fim, duracao, d.problema, d.solucao, d.valorCentavos, d.situacao, agora(), id);
      sincronizarPagamento(id);
    });
    res.json(buscar(id));
  });

  r.patch('/situacao', (req, res) => {
    const { ids, situacao } = validar(esquemaSituacaoAtendimentos, req.body);
    const alterados = emTransacao(() => {
      let n = 0;
      for (const id of ids) {
        const { changes } = db
          .prepare('UPDATE atendimentos_suporte SET situacao = ?, atualizado_em = ? WHERE id = ? AND excluido_em IS NULL')
          .run(situacao, agora(), id);
        if (Number(changes)) {
          n++;
          sincronizarPagamento(id);
        }
      }
      return n;
    });
    res.json({ alterados });
  });

  // Exclusão lógica. O lançamento de origem volta a ser hora de suporte avulsa e o pagamento automático vai para a lixeira.
  r.delete('/:id', (req, res) => {
    const a = buscar(idDaRota(req.params.id));
    emTransacao(() => {
      db.prepare('UPDATE atendimentos_suporte SET excluido_em = ?, atualizado_em = ? WHERE id = ?').run(agora(), agora(), a.id);
      db.prepare('UPDATE lancamentos_horas SET atendimento_id = NULL, atualizado_em = ? WHERE atendimento_id = ?').run(agora(), a.id);
      sincronizarPagamento(a.id);
    });
    res.status(204).end();
  });

  return r;
}
