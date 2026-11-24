import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { esquemaDesconto, esquemaProjeto, esquemaStatusProjeto, STATUS_PROJETO_VALORES, type DadosProjeto } from '../../shared/esquemas.ts';
import { normalizarBusca } from '../../shared/documentos.ts';
import { formatarMoeda } from '../../shared/formatacao.ts';
import type { Projeto, ProjetoDetalhe, ProjetoResumo, StatusProjeto } from '../../shared/tipos.ts';
import { agoraIso, ErroHttp, idDaRota, validar } from '../http.ts';
import { financeiroParaTela, resumirProjetos, type ResumoProjeto } from '../servicos/financeiro.ts';

/** Ordem de exibição na lista: o que está em execução aparece primeiro. */
const ORDEM_LISTA: StatusProjeto[] = ['em_andamento', 'pausado', 'aguardando_aprovacao', 'orcamento', 'concluido', 'cancelado'];

const SELECT_PROJETO = `
  SELECT p.*, c.nome AS cliente_nome, c.empresa AS cliente_empresa
  FROM projetos p JOIN clientes c ON c.id = p.cliente_id
  WHERE p.excluido_em IS NULL`;

function paraProjeto(r: Record<string, unknown>): Projeto {
  return {
    id: Number(r.id),
    clienteId: Number(r.cliente_id),
    clienteNome: String(r.cliente_nome),
    clienteEmpresa: (r.cliente_empresa as string) ?? null,
    nome: String(r.nome),
    descricao: (r.descricao as string) ?? null,
    dataInicio: (r.data_inicio as string) ?? null,
    prazoEntrega: (r.prazo_entrega as string) ?? null,
    valorFechadoCentavos: Number(r.valor_fechado_centavos),
    estimativaSegundos: Number(r.estimativa_segundos),
    valorHoraDevCentavos: Number(r.valor_hora_dev_centavos),
    valorHoraSuporteCentavos: Number(r.valor_hora_suporte_centavos),
    status: r.status as StatusProjeto,
    observacoes: (r.observacoes as string) ?? null,
    criadoEm: String(r.criado_em),
    atualizadoEm: String(r.atualizado_em),
  };
}

function comResumo(p: Projeto, r: ResumoProjeto | undefined): ProjetoResumo {
  const vazio = { desenvolvimentoSegundos: 0, suporteSegundos: 0, totalSegundos: 0 };
  return { ...p, horas: r?.horas ?? vazio, financeiro: financeiroParaTela(p.valorFechadoCentavos, r) };
}

/** Detalhe completo do projeto (usado pela tela do projeto e pelo relatório de fechamento). */
export function detalharProjeto(db: DatabaseSync, id: number): ProjetoDetalhe {
  const linha = db.prepare(`${SELECT_PROJETO} AND p.id = ?`).get(id);
  if (!linha) throw new ErroHttp(404, 'Projeto não encontrado.');
  const projeto = paraProjeto(linha);
  const resumo = resumirProjetos(db, 'p.id = ?', [projeto.id]).get(projeto.id);
  const cobranca = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN situacao_cobranca = 'incluido_pacote' THEN duracao_segundos END), 0) AS incluido,
         COALESCE(SUM(CASE WHEN situacao_cobranca = 'faturavel' THEN duracao_segundos END), 0) AS faturavel,
         COALESCE(SUM(CASE WHEN situacao_cobranca = 'faturado' THEN duracao_segundos END), 0) AS faturado
       FROM lancamentos_horas WHERE projeto_id = ? AND excluido_em IS NULL AND atendimento_id IS NULL`,
    )
    .get(projeto.id)!;
  const conta = (tabela: string) =>
    Number(db.prepare(`SELECT COUNT(*) AS n FROM ${tabela} WHERE projeto_id = ? AND excluido_em IS NULL`).get(projeto.id)!.n);
  const detalhe: ProjetoDetalhe = {
    ...comResumo(projeto, resumo),
    cobranca: {
      incluidoPacoteSegundos: Number(cobranca.incluido),
      faturavelSegundos: Number(cobranca.faturavel),
      faturadoSegundos: Number(cobranca.faturado),
    },
    contagem: {
      lancamentos: conta('lancamentos_horas'),
      atendimentos: conta('atendimentos_suporte'),
      pagamentos: conta('pagamentos'),
      servicos: conta('servicos_adicionais'),
    },
    cronometroAtivo: Boolean(db.prepare('SELECT 1 FROM cronometro_ativo WHERE projeto_id = ?').get(projeto.id)),
  };
  return detalhe;
}


export function rotasProjetos(db: DatabaseSync) {
  const r = Router();

  function buscarAtivo(id: number): Projeto {
    const linha = db.prepare(`${SELECT_PROJETO} AND p.id = ?`).get(id);
    if (!linha) throw new ErroHttp(404, 'Projeto não encontrado.');
    return paraProjeto(linha);
  }

  function validarCliente(clienteId: number) {
    const c = db.prepare('SELECT id FROM clientes WHERE id = ? AND excluido_em IS NULL').get(clienteId);
    if (!c) throw new ErroHttp(400, 'Verifique os campos destacados.', { clienteId: 'Cliente não encontrado.' });
  }

  function verificarDuplicidade(d: DadosProjeto, ignorarId = 0) {
    const outro = db
      .prepare('SELECT id FROM projetos WHERE cliente_id = ? AND lower(nome) = lower(?) AND excluido_em IS NULL AND id <> ?')
      .get(d.clienteId, d.nome, ignorarId);
    if (outro) {
      throw new ErroHttp(409, 'Já existe um projeto com este nome para o cliente.', {
        nome: 'Este cliente já tem um projeto com este nome.',
      });
    }
  }

  // Lista com filtros: busca (nome do projeto/cliente), status e cliente.
  r.get('/', (req, res) => {
    const filtros: string[] = [];
    const params: (string | number)[] = [];
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status) {
      if (!(STATUS_PROJETO_VALORES as readonly string[]).includes(status)) throw new ErroHttp(400, 'Status inválido.');
      filtros.push('p.status = ?');
      params.push(status);
    }
    if (req.query.cliente) {
      filtros.push('p.cliente_id = ?');
      params.push(idDaRota(String(req.query.cliente)));
    }
    const linhas = db.prepare(`${SELECT_PROJETO} ${filtros.map((f) => `AND ${f}`).join(' ')}`).all(...params);
    const resumos = resumirProjetos(db);
    const termo = normalizarBusca(typeof req.query.busca === 'string' ? req.query.busca.trim() : '');

    const lista = linhas
      .map(paraProjeto)
      .filter((p) => !termo || normalizarBusca(`${p.nome} ${p.clienteNome} ${p.clienteEmpresa ?? ''}`).includes(termo))
      .map((p) => comResumo(p, resumos.get(p.id)))
      // Ativos primeiro; depois por prazo (sem prazo por último) e nome.
      .sort((a, b) => {
        const ordem = (s: StatusProjeto) => ORDEM_LISTA.indexOf(s);
        return (
          ordem(a.status) - ordem(b.status) ||
          (a.prazoEntrega ?? '9999').localeCompare(b.prazoEntrega ?? '9999') ||
          a.nome.localeCompare(b.nome, 'pt-BR')
        );
      });
    res.json(lista);
  });

  r.get('/:id', (req, res) => {
    res.json(detalharProjeto(db, idDaRota(req.params.id)));
  });

  r.post('/', (req, res) => {
    const d = validar(esquemaProjeto, req.body);
    validarCliente(d.clienteId);
    verificarDuplicidade(d);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO projetos (cliente_id, nome, descricao, data_inicio, prazo_entrega, valor_fechado_centavos,
           estimativa_segundos, valor_hora_dev_centavos, valor_hora_suporte_centavos, status, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.clienteId, d.nome, d.descricao, d.dataInicio, d.prazoEntrega, d.valorFechadoCentavos,
        d.estimativaSegundos, d.valorHoraDevCentavos, d.valorHoraSuporteCentavos, d.status, d.observacoes,
      );
    res.status(201).json(buscarAtivo(Number(lastInsertRowid)));
  });

  r.put('/:id', (req, res) => {
    const id = idDaRota(req.params.id);
    buscarAtivo(id);
    const d = validar(esquemaProjeto, req.body);
    validarCliente(d.clienteId);
    verificarDuplicidade(d, id);
    // Desconto é configurado no módulo Financeiro e não é alterado aqui.
    db.prepare(
      `UPDATE projetos SET cliente_id = ?, nome = ?, descricao = ?, data_inicio = ?, prazo_entrega = ?,
         valor_fechado_centavos = ?, estimativa_segundos = ?, valor_hora_dev_centavos = ?,
         valor_hora_suporte_centavos = ?, status = ?, observacoes = ?, atualizado_em = ?
       WHERE id = ?`,
    ).run(
      d.clienteId, d.nome, d.descricao, d.dataInicio, d.prazoEntrega, d.valorFechadoCentavos, d.estimativaSegundos,
      d.valorHoraDevCentavos, d.valorHoraSuporteCentavos, d.status, d.observacoes, agoraIso(), id,
    );
    res.json(buscarAtivo(id));
  });

  // Troca rápida de status (sem abrir o formulário).
  r.patch('/:id/status', (req, res) => {
    const id = idDaRota(req.params.id);
    buscarAtivo(id);
    const { status } = validar(esquemaStatusProjeto, req.body);
    db.prepare('UPDATE projetos SET status = ?, atualizado_em = ? WHERE id = ?').run(status, agoraIso(), id);
    res.json(buscarAtivo(id));
  });

  // Desconto (configurado no módulo Financeiro). Não pode passar do valor bruto do projeto.
  r.patch('/:id/desconto', (req, res) => {
    const id = idDaRota(req.params.id);
    buscarAtivo(id);
    const { descontoCentavos } = validar(esquemaDesconto, req.body);
    const bruto = resumirProjetos(db, 'p.id = ?', [id]).get(id)?.financeiro.brutoCentavos ?? 0;
    if (descontoCentavos > bruto) {
      throw new ErroHttp(400, 'Verifique os campos destacados.', {
        descontoCentavos: `O desconto não pode ser maior que o valor do projeto antes do desconto (${formatarMoeda(bruto)}).`,
      });
    }
    db.prepare('UPDATE projetos SET desconto_centavos = ?, atualizado_em = ? WHERE id = ?').run(descontoCentavos, agoraIso(), id);
    res.json(buscarAtivo(id));
  });

  // Exclusão lógica: projeto e seus registros saem dos cálculos, mas continuam no banco (lixeira).
  r.delete('/:id', (req, res) => {
    const projeto = buscarAtivo(idDaRota(req.params.id));
    if (db.prepare('SELECT 1 FROM cronometro_ativo WHERE projeto_id = ?').get(projeto.id)) {
      throw new ErroHttp(409, 'Há um cronômetro em andamento neste projeto. Finalize-o antes de excluir.');
    }
    db.prepare('UPDATE projetos SET excluido_em = ?, atualizado_em = ? WHERE id = ?').run(agoraIso(), agoraIso(), projeto.id);
    res.status(204).end();
  });

  return r;
}
