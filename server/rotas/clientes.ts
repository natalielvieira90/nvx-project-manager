import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { esquemaCliente, type DadosCliente } from '../../shared/esquemas.ts';
import { normalizarBusca, somenteDigitos } from '../../shared/documentos.ts';
import type { Cliente, ClienteDetalhe, ClienteResumo } from '../../shared/tipos.ts';
import { agoraIso, ErroHttp, idDaRota, validar } from '../http.ts';

const COLUNAS = 'id, nome, empresa, telefone, email, documento, observacoes, criado_em, atualizado_em';

function paraCliente(r: Record<string, unknown>): Cliente {
  return {
    id: Number(r.id),
    nome: String(r.nome),
    empresa: (r.empresa as string) ?? null,
    telefone: (r.telefone as string) ?? null,
    email: (r.email as string) ?? null,
    documento: (r.documento as string) ?? null,
    observacoes: (r.observacoes as string) ?? null,
    criadoEm: String(r.criado_em),
    atualizadoEm: String(r.atualizado_em),
  };
}

export function rotasClientes(db: DatabaseSync) {
  const r = Router();

  function buscarAtivo(id: number) {
    const linha = db.prepare(`SELECT ${COLUNAS} FROM clientes WHERE id = ? AND excluido_em IS NULL`).get(id);
    if (!linha) throw new ErroHttp(404, 'Cliente não encontrado.');
    return paraCliente(linha);
  }

  /** Impede duplicidade: mesmo CPF/CNPJ, mesmo e-mail ou mesmo nome + empresa. */
  function verificarDuplicidade(d: DadosCliente, ignorarId = 0) {
    const ativo = 'excluido_em IS NULL AND id <> ?';
    const erros: Record<string, string> = {};
    if (d.documento) {
      const outro = db.prepare(`SELECT nome FROM clientes WHERE documento = ? AND ${ativo}`).get(d.documento, ignorarId);
      if (outro) erros.documento = `Este CPF/CNPJ já pertence a "${outro.nome}".`;
    }
    if (d.email) {
      const outro = db.prepare(`SELECT nome FROM clientes WHERE lower(email) = ? AND ${ativo}`).get(d.email, ignorarId);
      if (outro) erros.email = `Este e-mail já pertence a "${outro.nome}".`;
    }
    const outro = db
      .prepare(`SELECT id FROM clientes WHERE lower(nome) = lower(?) AND lower(COALESCE(empresa,'')) = lower(?) AND ${ativo}`)
      .get(d.nome, d.empresa ?? '', ignorarId);
    if (outro) erros.nome = d.empresa ? 'Já existe um cliente com este nome nesta empresa.' : 'Já existe um cliente com este nome.';
    if (Object.keys(erros).length) throw new ErroHttp(409, 'Já existe um cliente com estes dados.', erros);
  }

  // Lista com busca (sem acento/maiúsculas) e contagem de projetos.
  r.get('/', (req, res) => {
    const termo = normalizarBusca(typeof req.query.busca === 'string' ? req.query.busca.trim() : '');
    const termoDigitos = somenteDigitos(termo);
    const linhas = db
      .prepare(
        `SELECT ${COLUNAS},
           (SELECT COUNT(*) FROM projetos p WHERE p.cliente_id = c.id AND p.excluido_em IS NULL) AS qtd_projetos,
           (SELECT COUNT(*) FROM projetos p WHERE p.cliente_id = c.id AND p.excluido_em IS NULL
              AND p.status IN ('em_andamento','pausado')) AS qtd_ativos
         FROM clientes c WHERE excluido_em IS NULL`,
      )
      .all();
    const lista: ClienteResumo[] = linhas
      .map((l) => ({ ...paraCliente(l), qtdProjetos: Number(l.qtd_projetos), qtdProjetosAtivos: Number(l.qtd_ativos) }))
      .filter((c) => {
        if (!termo) return true;
        const texto = normalizarBusca([c.nome, c.empresa, c.email, c.observacoes].join(' '));
        if (texto.includes(termo)) return true;
        return termoDigitos.length >= 3 && `${c.telefone ?? ''} ${c.documento ?? ''}`.includes(termoDigitos);
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    res.json(lista);
  });

  r.get('/:id', (req, res) => {
    const cliente = buscarAtivo(idDaRota(req.params.id));
    const projetos = db
      .prepare(
        `SELECT id, nome, status, valor_fechado_centavos, prazo_entrega FROM projetos
         WHERE cliente_id = ? AND excluido_em IS NULL ORDER BY criado_em DESC`,
      )
      .all(cliente.id)
      .map((p) => ({
        id: Number(p.id),
        nome: String(p.nome),
        status: String(p.status) as ClienteDetalhe['projetos'][number]['status'],
        valorFechadoCentavos: Number(p.valor_fechado_centavos),
        prazoEntrega: (p.prazo_entrega as string) ?? null,
      }));
    const detalhe: ClienteDetalhe = { ...cliente, projetos };
    res.json(detalhe);
  });

  r.post('/', (req, res) => {
    const d = validar(esquemaCliente, req.body);
    verificarDuplicidade(d);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO clientes (nome, empresa, telefone, email, documento, observacoes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(d.nome, d.empresa, d.telefone, d.email, d.documento, d.observacoes);
    res.status(201).json(buscarAtivo(Number(lastInsertRowid)));
  });

  r.put('/:id', (req, res) => {
    const id = idDaRota(req.params.id);
    buscarAtivo(id);
    const d = validar(esquemaCliente, req.body);
    verificarDuplicidade(d, id);
    db.prepare(
      `UPDATE clientes SET nome = ?, empresa = ?, telefone = ?, email = ?, documento = ?, observacoes = ?, atualizado_em = ?
       WHERE id = ?`,
    ).run(d.nome, d.empresa, d.telefone, d.email, d.documento, d.observacoes, agoraIso(), id);
    res.json(buscarAtivo(id));
  });

  // Exclusão lógica (vai para a lixeira). Bloqueada se houver projetos.
  r.delete('/:id', (req, res) => {
    const cliente = buscarAtivo(idDaRota(req.params.id));
    const { n } = db
      .prepare('SELECT COUNT(*) AS n FROM projetos WHERE cliente_id = ? AND excluido_em IS NULL')
      .get(cliente.id)!;
    if (Number(n) > 0) {
      throw new ErroHttp(
        409,
        `"${cliente.nome}" possui ${n} projeto(s). Exclua ou transfira os projetos antes de excluir o cliente.`,
      );
    }
    db.prepare('UPDATE clientes SET excluido_em = ?, atualizado_em = ? WHERE id = ?').run(agoraIso(), agoraIso(), cliente.id);
    res.status(204).end();
  });

  return r;
}

