/**
 * Módulo Financeiro: visão por projeto, serviços adicionais, pagamentos recebidos e desconto.
 *
 * Regras principais (ver docs/requirements.md):
 * - O cálculo do total/pendente vem de `shared/financeiro.ts` (fonte única).
 * - Pagamentos gerados por atendimento marcado como "pago" são mantidos pelo módulo Suporte:
 *   aqui eles aparecem, mas não podem ser editados nem excluídos.
 * - Para evitar registros duplicados, um pagamento igual (mesmo projeto, data e valor) só é
 *   gravado com confirmação explícita; um serviço com a mesma descrição e data é recusado.
 * - "Faturar extras" marca de uma vez as horas faturáveis, os serviços faturáveis e os
 *   atendimentos pendentes do projeto como faturados. Horas do pacote não são tocadas.
 */
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { esquemaPagamento, esquemaServico, STATUS_PROJETO_VALORES, type DadosPagamento } from '../../shared/esquemas.ts';
import { STATUS_CONTRATADOS } from '../../shared/financeiro.ts';
import { formatarData, formatarMoeda, hojeIso } from '../../shared/formatacao.ts';
import { normalizarBusca } from '../../shared/documentos.ts';
import type {
  FormaPagamento,
  Pagamento,
  ProjetoFinanceiro,
  ResumoFinanceiro,
  ServicoAdicional,
  SituacaoServico,
  StatusProjeto,
} from '../../shared/tipos.ts';
import { ErroHttp, idDaRota, validar } from '../http.ts';
import { financeiroParaTela, resumirProjetos } from '../servicos/financeiro.ts';
import type { Relogio } from './horas.ts';

function emTransacao<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

function projetoAtivo(db: DatabaseSync, projetoId: number) {
  const p = db.prepare('SELECT id, nome, status FROM projetos WHERE id = ? AND excluido_em IS NULL').get(projetoId);
  if (!p) throw new ErroHttp(400, 'Verifique os campos destacados.', { projetoId: 'Projeto não encontrado.' });
  return { id: Number(p.id), nome: String(p.nome), status: p.status as StatusProjeto };
}

/** Valida um filtro de data AAAA-MM-DD vindo da URL. */
function dataDoFiltro(v: string, campo: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErroHttp(400, `Filtro "${campo}" inválido. Use AAAA-MM-DD.`);
  return v;
}

// ---------------------------------------------------------------------------
// Visão geral por projeto
// ---------------------------------------------------------------------------

export function rotasFinanceiro(db: DatabaseSync, relogio: Relogio) {
  const r = Router();
  const agora = () => relogio().toISOString();

  /**
   * Lista os projetos com seus valores. `status`: "contratados" (padrão: em andamento, pausado,
   * concluído), "todos" ou um status específico.
   */
  r.get('/', (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const status = q.status || 'contratados';
    const filtros: string[] = [];
    const params: (string | number)[] = [];
    if (status === 'contratados') {
      filtros.push(`p.status IN (${STATUS_CONTRATADOS.map(() => '?').join(',')})`);
      params.push(...STATUS_CONTRATADOS);
    } else if (status !== 'todos') {
      if (!(STATUS_PROJETO_VALORES as readonly string[]).includes(status)) throw new ErroHttp(400, 'Status inválido.');
      filtros.push('p.status = ?');
      params.push(status);
    }
    if (q.cliente) (filtros.push('p.cliente_id = ?'), params.push(idDaRota(q.cliente)));

    const linhas = db
      .prepare(
        `SELECT p.id, p.nome, p.status, p.valor_fechado_centavos, c.id AS cliente_id, c.nome AS cliente_nome, c.empresa
         FROM projetos p JOIN clientes c ON c.id = p.cliente_id
         WHERE p.excluido_em IS NULL ${filtros.map((f) => `AND ${f}`).join(' ')}`,
      )
      .all(...params);
    const resumos = resumirProjetos(db);
    const termo = normalizarBusca((q.busca ?? '').trim());
    const vazio = { desenvolvimentoSegundos: 0, suporteSegundos: 0, totalSegundos: 0 };

    const projetos: ProjetoFinanceiro[] = linhas
      .filter((l) => !termo || normalizarBusca(`${l.nome} ${l.cliente_nome} ${l.empresa ?? ''}`).includes(termo))
      .map((l) => {
        const resumo = resumos.get(Number(l.id));
        return {
          id: Number(l.id),
          nome: String(l.nome),
          clienteId: Number(l.cliente_id),
          clienteNome: String(l.cliente_nome),
          status: l.status as StatusProjeto,
          horas: resumo?.horas ?? vazio,
          financeiro: financeiroParaTela(Number(l.valor_fechado_centavos), resumo),
        };
      })
      // Quem tem mais a receber aparece primeiro.
      .sort(
        (a, b) =>
          b.financeiro.pendenteCentavos - a.financeiro.pendenteCentavos ||
          b.financeiro.aFaturarCentavos - a.financeiro.aFaturarCentavos ||
          a.nome.localeCompare(b.nome, 'pt-BR'),
      );

    // Pendente só existe para projetos contratados (orçamento não deve nada).
    const contratado = (s: StatusProjeto) => (STATUS_CONTRATADOS as readonly string[]).includes(s);
    const soma = (fn: (p: ProjetoFinanceiro) => number) => projetos.reduce((t, p) => t + fn(p), 0);
    const resposta: ResumoFinanceiro = {
      projetos,
      totais: {
        totalCentavos: soma((p) => (contratado(p.status) ? p.financeiro.totalCentavos : 0)),
        recebidoCentavos: soma((p) => p.financeiro.recebidoCentavos),
        pendenteCentavos: soma((p) => (contratado(p.status) ? p.financeiro.pendenteCentavos : 0)),
        aFaturarCentavos: soma((p) => p.financeiro.aFaturarCentavos),
      },
    };
    res.json(resposta);
  });

  // Marca os extras ainda não faturados do projeto como faturados (um clique ao emitir a cobrança).
  r.post('/projetos/:id/faturar', (req, res) => {
    const id = idDaRota(req.params.id);
    const p = db.prepare('SELECT id FROM projetos WHERE id = ? AND excluido_em IS NULL').get(id);
    if (!p) throw new ErroHttp(404, 'Projeto não encontrado.');
    const resultado = emTransacao(db, () => {
      const lancamentos = db
        .prepare(
          `UPDATE lancamentos_horas SET situacao_cobranca = 'faturado', atualizado_em = ?
           WHERE projeto_id = ? AND excluido_em IS NULL AND atendimento_id IS NULL AND situacao_cobranca = 'faturavel'`,
        )
        .run(agora(), id).changes;
      const servicos = db
        .prepare(
          `UPDATE servicos_adicionais SET situacao = 'faturado', atualizado_em = ?
           WHERE projeto_id = ? AND excluido_em IS NULL AND situacao = 'faturavel'`,
        )
        .run(agora(), id).changes;
      const atendimentos = db
        .prepare(
          `UPDATE atendimentos_suporte SET situacao = 'faturado', atualizado_em = ?
           WHERE projeto_id = ? AND excluido_em IS NULL AND situacao = 'pendente'`,
        )
        .run(agora(), id).changes;
      return { lancamentos: Number(lancamentos), servicos: Number(servicos), atendimentos: Number(atendimentos) };
    });
    res.json(resultado);
  });

  return r;
}

// ---------------------------------------------------------------------------
// Serviços adicionais
// ---------------------------------------------------------------------------

export function paraServico(r: Record<string, unknown>): ServicoAdicional {
  return {
    id: Number(r.id),
    projetoId: Number(r.projeto_id),
    descricao: String(r.descricao),
    data: String(r.data),
    valorCentavos: Number(r.valor_centavos),
    situacao: r.situacao as SituacaoServico,
    criadoEm: String(r.criado_em),
  };
}

export function rotasServicos(db: DatabaseSync, relogio: Relogio) {
  const r = Router();
  const agora = () => relogio().toISOString();

  function buscar(id: number): ServicoAdicional {
    const s = db
      .prepare(
        `SELECT s.* FROM servicos_adicionais s JOIN projetos p ON p.id = s.projeto_id
         WHERE s.id = ? AND s.excluido_em IS NULL AND p.excluido_em IS NULL`,
      )
      .get(id);
    if (!s) throw new ErroHttp(404, 'Serviço não encontrado.');
    return paraServico(s);
  }

  function verificarDuplicidade(projetoId: number, descricao: string, data: string, ignorarId = 0) {
    const outro = db
      .prepare(
        `SELECT id FROM servicos_adicionais WHERE projeto_id = ? AND lower(descricao) = lower(?) AND data = ?
           AND excluido_em IS NULL AND id <> ?`,
      )
      .get(projetoId, descricao, data, ignorarId);
    if (outro) {
      throw new ErroHttp(409, 'Este serviço já foi registrado.', {
        descricao: `Já existe um serviço com esta descrição em ${formatarData(data)} neste projeto.`,
      });
    }
  }

  r.get('/', (req, res) => {
    const projeto = req.query.projeto;
    if (!projeto) throw new ErroHttp(400, 'Informe o projeto.');
    const linhas = db
      .prepare('SELECT * FROM servicos_adicionais WHERE projeto_id = ? AND excluido_em IS NULL ORDER BY data DESC, id DESC')
      .all(idDaRota(String(projeto)));
    res.json(linhas.map(paraServico));
  });

  r.post('/', (req, res) => {
    const d = validar(esquemaServico, req.body);
    projetoAtivo(db, d.projetoId);
    verificarDuplicidade(d.projetoId, d.descricao, d.data);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO servicos_adicionais (projeto_id, descricao, data, valor_centavos, situacao) VALUES (?, ?, ?, ?, ?)')
      .run(d.projetoId, d.descricao, d.data, d.valorCentavos, d.situacao);
    res.status(201).json(buscar(Number(lastInsertRowid)));
  });

  r.put('/:id', (req, res) => {
    const id = idDaRota(req.params.id);
    const atual = buscar(id);
    const d = validar(esquemaServico, req.body);
    if (d.projetoId !== atual.projetoId) {
      throw new ErroHttp(400, 'Verifique os campos destacados.', { projetoId: 'Um serviço não pode mudar de projeto.' });
    }
    verificarDuplicidade(d.projetoId, d.descricao, d.data, id);
    db.prepare(
      'UPDATE servicos_adicionais SET descricao = ?, data = ?, valor_centavos = ?, situacao = ?, atualizado_em = ? WHERE id = ?',
    ).run(d.descricao, d.data, d.valorCentavos, d.situacao, agora(), id);
    res.json(buscar(id));
  });

  r.delete('/:id', (req, res) => {
    const s = buscar(idDaRota(req.params.id));
    db.prepare('UPDATE servicos_adicionais SET excluido_em = ?, atualizado_em = ? WHERE id = ?').run(agora(), agora(), s.id);
    res.status(204).end();
  });

  return r;
}

// ---------------------------------------------------------------------------
// Pagamentos recebidos
// ---------------------------------------------------------------------------

export const SELECT_PAGAMENTO = `
  SELECT g.*, p.nome AS projeto_nome, c.id AS cliente_id, c.nome AS cliente_nome
  FROM pagamentos g
  JOIN projetos p ON p.id = g.projeto_id
  JOIN clientes c ON c.id = p.cliente_id
  WHERE g.excluido_em IS NULL AND p.excluido_em IS NULL`;

export function paraPagamento(r: Record<string, unknown>): Pagamento {
  return {
    id: Number(r.id),
    projetoId: Number(r.projeto_id),
    projetoNome: String(r.projeto_nome),
    clienteId: Number(r.cliente_id),
    clienteNome: String(r.cliente_nome),
    data: String(r.data),
    valorCentavos: Number(r.valor_centavos),
    forma: (r.forma as FormaPagamento) ?? null,
    observacoes: (r.observacoes as string) ?? null,
    atendimentoId: r.atendimento_id === null || r.atendimento_id === undefined ? null : Number(r.atendimento_id),
    criadoEm: String(r.criado_em),
  };
}

export function rotasPagamentos(db: DatabaseSync, relogio: Relogio) {
  const r = Router();
  const agora = () => relogio().toISOString();

  function buscar(id: number): Pagamento {
    const g = db.prepare(`${SELECT_PAGAMENTO} AND g.id = ?`).get(id);
    if (!g) throw new ErroHttp(404, 'Pagamento não encontrado.');
    return paraPagamento(g);
  }

  function editavel(g: Pagamento) {
    if (g.atendimentoId !== null) {
      throw new ErroHttp(
        409,
        'Este pagamento foi gerado por um atendimento de suporte marcado como pago. Altere-o pelo módulo Suporte.',
      );
    }
  }

  function validarRegras(d: DadosPagamento, ignorarId = 0) {
    if (d.data > hojeIso(relogio())) {
      throw new ErroHttp(400, 'Verifique os campos destacados.', { data: 'A data do pagamento não pode estar no futuro.' });
    }
    if (d.permitirDuplicado) return;
    const igual = db
      .prepare(
        `SELECT id FROM pagamentos WHERE projeto_id = ? AND data = ? AND valor_centavos = ?
           AND excluido_em IS NULL AND id <> ?`,
      )
      .get(d.projetoId, d.data, d.valorCentavos, ignorarId);
    if (igual) {
      throw new ErroHttp(409, 'Possível pagamento duplicado.', {
        duplicado: `Já existe um pagamento de ${formatarMoeda(d.valorCentavos)} em ${formatarData(d.data)} neste projeto.`,
      });
    }
  }

  r.get('/', (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const filtros: string[] = [];
    const params: (string | number)[] = [];
    if (q.projeto) (filtros.push('g.projeto_id = ?'), params.push(idDaRota(q.projeto)));
    if (q.cliente) (filtros.push('p.cliente_id = ?'), params.push(idDaRota(q.cliente)));
    if (q.de) (filtros.push('g.data >= ?'), params.push(dataDoFiltro(q.de, 'de')));
    if (q.ate) (filtros.push('g.data <= ?'), params.push(dataDoFiltro(q.ate, 'ate')));
    const linhas = db
      .prepare(`${SELECT_PAGAMENTO} ${filtros.map((f) => `AND ${f}`).join(' ')} ORDER BY g.data DESC, g.id DESC LIMIT 5000`)
      .all(...params);
    res.json(linhas.map(paraPagamento));
  });

  r.get('/:id', (req, res) => {
    res.json(buscar(idDaRota(req.params.id)));
  });

  r.post('/', (req, res) => {
    const d = validar(esquemaPagamento, req.body);
    projetoAtivo(db, d.projetoId);
    validarRegras(d);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO pagamentos (projeto_id, data, valor_centavos, forma, observacoes) VALUES (?, ?, ?, ?, ?)')
      .run(d.projetoId, d.data, d.valorCentavos, d.forma, d.observacoes);
    res.status(201).json(buscar(Number(lastInsertRowid)));
  });

  r.put('/:id', (req, res) => {
    const id = idDaRota(req.params.id);
    const atual = buscar(id);
    editavel(atual);
    const d = validar(esquemaPagamento, req.body);
    projetoAtivo(db, d.projetoId);
    validarRegras(d, id);
    db.prepare(
      'UPDATE pagamentos SET projeto_id = ?, data = ?, valor_centavos = ?, forma = ?, observacoes = ?, atualizado_em = ? WHERE id = ?',
    ).run(d.projetoId, d.data, d.valorCentavos, d.forma, d.observacoes, agora(), id);
    res.json(buscar(id));
  });

  r.delete('/:id', (req, res) => {
    const g = buscar(idDaRota(req.params.id));
    editavel(g);
    db.prepare('UPDATE pagamentos SET excluido_em = ?, atualizado_em = ? WHERE id = ?').run(agora(), agora(), g.id);
    res.status(204).end();
  });

  return r;
}
