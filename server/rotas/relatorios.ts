/**
 * Relatórios: horas trabalhadas (detalhado), resumo por projeto, resumo por cliente e
 * fechamento de projeto. A exportação (PDF/CSV) é feita na interface a partir destes dados.
 *
 * Período: `de` e `ate` em AAAA-MM-DD, ambos inclusivos, no fuso do computador.
 * Os valores usam as mesmas regras do financeiro (`shared/financeiro.ts`).
 */
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { STATUS_PROJETO_VALORES } from '../../shared/esquemas.ts';
import { STATUS_CONTRATADOS } from '../../shared/financeiro.ts';
import { valorPorTempo } from '../../shared/formatacao.ts';
import type {
  CategoriaHora,
  CobrancaRelatorio,
  LinhaRelatorioCliente,
  LinhaRelatorioHoras,
  LinhaRelatorioProjeto,
  RelatorioClientes,
  RelatorioFechamento,
  RelatorioHoras,
  RelatorioProjetos,
  SituacaoAtendimento,
  SituacaoCobranca,
  StatusProjeto,
  ValoresAtuais,
  ValoresPeriodo,
} from '../../shared/tipos.ts';
import { ErroHttp, idDaRota } from '../http.ts';
import { resumirProjetos } from '../servicos/financeiro.ts';
import { paraPagamento, paraServico, SELECT_PAGAMENTO } from './financeiro.ts';
import { detalharProjeto } from './projetos.ts';
import type { Relogio } from './horas.ts';

type Consulta = Record<string, string | undefined>;

/** Converte AAAA-MM-DD (fuso local) em instante ISO UTC. */
function inicioDoDia(data: string, somarDias = 0): string {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(a, m - 1, d + somarDias).toISOString();
}

function lerData(v: string | undefined, campo: string): string | null {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new ErroHttp(400, `Filtro "${campo}" inválido. Use AAAA-MM-DD.`);
  }
  return v;
}

/** Período opcional: devolve as datas e os limites em ISO (fim exclusivo). */
function lerPeriodo(q: Consulta) {
  const de = lerData(q.de, 'de');
  const ate = lerData(q.ate, 'ate');
  if (de && ate && ate < de) throw new ErroHttp(400, 'A data final do período não pode ser anterior à inicial.');
  return { de, ate, inicioIso: de ? inicioDoDia(de) : null, fimIso: ate ? inicioDoDia(ate, 1) : null };
}

function filtroStatus(status: string, filtros: string[], params: (string | number)[]) {
  if (status === 'contratados') {
    filtros.push(`p.status IN (${STATUS_CONTRATADOS.map(() => '?').join(',')})`);
    params.push(...STATUS_CONTRATADOS);
  } else if (status !== 'todos') {
    if (!(STATUS_PROJETO_VALORES as readonly string[]).includes(status)) throw new ErroHttp(400, 'Status inválido.');
    filtros.push('p.status = ?');
    params.push(status);
  }
}

const COBRANCA_LANCAMENTO: Record<SituacaoCobranca, CobrancaRelatorio> = {
  incluido_pacote: 'pacote',
  faturavel: 'a_faturar',
  faturado: 'faturado',
};
const COBRANCA_ATENDIMENTO: Record<SituacaoAtendimento, CobrancaRelatorio> = {
  pendente: 'a_faturar',
  faturado: 'faturado',
  pago: 'faturado',
};

interface FiltrosHoras {
  inicioIso?: string | null;
  fimIso?: string | null;
  cliente?: number;
  projeto?: number;
  tipo?: 'desenvolvimento' | 'suporte';
  cobranca?: CobrancaRelatorio;
}

/**
 * Horas trabalhadas: lançamentos avulsos + atendimentos de suporte. Lançamentos vinculados a um
 * atendimento ficam de fora (o atendimento já representa essas horas e o valor).
 */
export function linhasDeHoras(db: DatabaseSync, f: FiltrosHoras): LinhaRelatorioHoras[] {
  const comuns: string[] = [];
  const params: (string | number)[] = [];
  if (f.inicioIso) (comuns.push('x.inicio >= ?'), params.push(f.inicioIso));
  if (f.fimIso) (comuns.push('x.inicio < ?'), params.push(f.fimIso));
  if (f.cliente) (comuns.push('p.cliente_id = ?'), params.push(f.cliente));
  if (f.projeto) (comuns.push('p.id = ?'), params.push(f.projeto));
  const onde = comuns.map((c) => `AND ${c}`).join(' ');

  const lancamentos = db
    .prepare(
      `SELECT x.id, x.inicio, x.fim, x.categoria, x.descricao, x.duracao_segundos, x.situacao_cobranca,
         p.id AS projeto_id, p.nome AS projeto_nome, p.valor_hora_dev_centavos, p.valor_hora_suporte_centavos,
         c.id AS cliente_id, c.nome AS cliente_nome
       FROM lancamentos_horas x JOIN projetos p ON p.id = x.projeto_id JOIN clientes c ON c.id = p.cliente_id
       WHERE x.excluido_em IS NULL AND p.excluido_em IS NULL AND x.atendimento_id IS NULL ${onde}`,
    )
    .all(...params)
    .map((r): LinhaRelatorioHoras => {
      const categoria = r.categoria as CategoriaHora;
      const tipo = categoria === 'suporte' ? 'suporte' : 'desenvolvimento';
      const situacao = r.situacao_cobranca as SituacaoCobranca;
      const cobranca = COBRANCA_LANCAMENTO[situacao];
      const valorHora = Number(tipo === 'suporte' ? r.valor_hora_suporte_centavos : r.valor_hora_dev_centavos);
      const duracao = Number(r.duracao_segundos);
      return {
        origem: 'lancamento',
        id: Number(r.id),
        inicio: String(r.inicio),
        fim: String(r.fim),
        clienteId: Number(r.cliente_id),
        clienteNome: String(r.cliente_nome),
        projetoId: Number(r.projeto_id),
        projetoNome: String(r.projeto_nome),
        tipo,
        categoria,
        descricao: (r.descricao as string) ?? null,
        duracaoSegundos: duracao,
        situacao,
        cobranca,
        valorCentavos: cobranca === 'pacote' ? 0 : valorPorTempo(duracao, valorHora),
      };
    });

  const atendimentos = db
    .prepare(
      `SELECT x.id, x.inicio, x.fim, x.problema, x.duracao_segundos, x.situacao, x.valor_centavos,
         p.id AS projeto_id, p.nome AS projeto_nome, c.id AS cliente_id, c.nome AS cliente_nome
       FROM atendimentos_suporte x JOIN projetos p ON p.id = x.projeto_id JOIN clientes c ON c.id = p.cliente_id
       WHERE x.excluido_em IS NULL AND p.excluido_em IS NULL ${onde}`,
    )
    .all(...params)
    .map((r): LinhaRelatorioHoras => {
      const situacao = r.situacao as SituacaoAtendimento;
      return {
        origem: 'atendimento',
        id: Number(r.id),
        inicio: String(r.inicio),
        fim: String(r.fim),
        clienteId: Number(r.cliente_id),
        clienteNome: String(r.cliente_nome),
        projetoId: Number(r.projeto_id),
        projetoNome: String(r.projeto_nome),
        tipo: 'suporte',
        categoria: 'atendimento',
        descricao: String(r.problema),
        duracaoSegundos: Number(r.duracao_segundos),
        situacao,
        cobranca: COBRANCA_ATENDIMENTO[situacao],
        valorCentavos: Number(r.valor_centavos),
      };
    });

  return [...lancamentos, ...atendimentos]
    .filter((l) => (!f.tipo || l.tipo === f.tipo) && (!f.cobranca || l.cobranca === f.cobranca))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

function totaisDeHoras(linhas: LinhaRelatorioHoras[]): RelatorioHoras['totais'] {
  const t = { desenvolvimentoSegundos: 0, suporteSegundos: 0, totalSegundos: 0, pacoteSegundos: 0, aFaturarCentavos: 0, faturadoCentavos: 0, valorCentavos: 0 };
  for (const l of linhas) {
    if (l.tipo === 'suporte') t.suporteSegundos += l.duracaoSegundos;
    else t.desenvolvimentoSegundos += l.duracaoSegundos;
    if (l.cobranca === 'pacote') t.pacoteSegundos += l.duracaoSegundos;
    if (l.cobranca === 'a_faturar') t.aFaturarCentavos += l.valorCentavos;
    if (l.cobranca === 'faturado') t.faturadoCentavos += l.valorCentavos;
    t.valorCentavos += l.valorCentavos;
  }
  t.totalSegundos = t.desenvolvimentoSegundos + t.suporteSegundos;
  return t;
}

const periodoVazio = (): ValoresPeriodo => ({ desenvolvimentoSegundos: 0, suporteSegundos: 0, recebidoCentavos: 0 });
const atualVazio = (): ValoresAtuais => ({ totalCentavos: 0, extrasFaturadosCentavos: 0, aFaturarCentavos: 0, recebidoCentavos: 0, pendenteCentavos: 0 });

function somar(alvo: { periodo: ValoresPeriodo; atual: ValoresAtuais }, l: { periodo: ValoresPeriodo; atual: ValoresAtuais }) {
  for (const k of Object.keys(alvo.periodo) as (keyof ValoresPeriodo)[]) alvo.periodo[k] += l.periodo[k];
  for (const k of Object.keys(alvo.atual) as (keyof ValoresAtuais)[]) alvo.atual[k] += l.atual[k];
}

/** Resumo por projeto: horas e recebimentos no período + posição financeira atual. */
function linhasDeProjetos(db: DatabaseSync, q: Consulta): LinhaRelatorioProjeto[] {
  const { de, ate, inicioIso, fimIso } = lerPeriodo(q);
  const filtros: string[] = [];
  const params: (string | number)[] = [];
  filtroStatus(q.status || 'contratados', filtros, params);
  if (q.cliente) (filtros.push('p.cliente_id = ?'), params.push(idDaRota(q.cliente)));
  if (q.projeto) (filtros.push('p.id = ?'), params.push(idDaRota(q.projeto)));

  const projetos = db
    .prepare(
      `SELECT p.id, p.nome, p.status, p.valor_fechado_centavos, c.id AS cliente_id, c.nome AS cliente_nome
       FROM projetos p JOIN clientes c ON c.id = p.cliente_id
       WHERE p.excluido_em IS NULL ${filtros.map((f) => `AND ${f}`).join(' ')}`,
    )
    .all(...params);
  const resumos = resumirProjetos(db);

  const horas = new Map<number, ValoresPeriodo>();
  for (const l of linhasDeHoras(db, { inicioIso, fimIso })) {
    const v = horas.get(l.projetoId) ?? periodoVazio();
    if (l.tipo === 'suporte') v.suporteSegundos += l.duracaoSegundos;
    else v.desenvolvimentoSegundos += l.duracaoSegundos;
    horas.set(l.projetoId, v);
  }
  const pagFiltros: string[] = [];
  const pagParams: string[] = [];
  if (de) (pagFiltros.push('data >= ?'), pagParams.push(de));
  if (ate) (pagFiltros.push('data <= ?'), pagParams.push(ate));
  const recebidos = new Map<number, number>();
  for (const r of db
    .prepare(
      `SELECT projeto_id, SUM(valor_centavos) AS v FROM pagamentos WHERE excluido_em IS NULL
       ${pagFiltros.map((f) => `AND ${f}`).join(' ')} GROUP BY projeto_id`,
    )
    .all(...pagParams)) {
    recebidos.set(Number(r.projeto_id), Number(r.v));
  }

  const contratado = (s: StatusProjeto) => (STATUS_CONTRATADOS as readonly string[]).includes(s);
  return projetos
    .map((p): LinhaRelatorioProjeto => {
      const id = Number(p.id);
      const status = p.status as StatusProjeto;
      const r = resumos.get(id);
      const f = r?.financeiro;
      const extras = (f?.brutoCentavos ?? 0) - Number(p.valor_fechado_centavos);
      return {
        projetoId: id,
        projeto: String(p.nome),
        clienteId: Number(p.cliente_id),
        cliente: String(p.cliente_nome),
        status,
        periodo: { ...(horas.get(id) ?? periodoVazio()), recebidoCentavos: recebidos.get(id) ?? 0 },
        atual: {
          totalCentavos: f?.totalCentavos ?? 0,
          extrasFaturadosCentavos: Math.max(0, extras - (f?.aFaturarCentavos ?? 0)),
          aFaturarCentavos: f?.aFaturarCentavos ?? 0,
          recebidoCentavos: f?.recebidoCentavos ?? 0,
          pendenteCentavos: contratado(status) ? (f?.pendenteCentavos ?? 0) : 0,
        },
      };
    })
    .sort((a, b) => a.cliente.localeCompare(b.cliente, 'pt-BR') || a.projeto.localeCompare(b.projeto, 'pt-BR'));
}

export function rotasRelatorios(db: DatabaseSync, relogio: Relogio) {
  const r = Router();

  r.get('/horas', (req, res) => {
    const q = req.query as Consulta;
    const { inicioIso, fimIso } = lerPeriodo(q);
    if (q.tipo && q.tipo !== 'desenvolvimento' && q.tipo !== 'suporte') throw new ErroHttp(400, 'Tipo de hora inválido.');
    if (q.cobranca && !['pacote', 'a_faturar', 'faturado'].includes(q.cobranca)) throw new ErroHttp(400, 'Situação de cobrança inválida.');
    const linhas = linhasDeHoras(db, {
      inicioIso,
      fimIso,
      cliente: q.cliente ? idDaRota(q.cliente) : undefined,
      projeto: q.projeto ? idDaRota(q.projeto) : undefined,
      tipo: q.tipo as FiltrosHoras['tipo'],
      cobranca: q.cobranca as CobrancaRelatorio | undefined,
    });
    const resposta: RelatorioHoras = { linhas, totais: totaisDeHoras(linhas) };
    res.json(resposta);
  });

  r.get('/projetos', (req, res) => {
    const linhas = linhasDeProjetos(db, req.query as Consulta);
    const totais = { periodo: periodoVazio(), atual: atualVazio() };
    linhas.forEach((l) => somar(totais, l));
    const resposta: RelatorioProjetos = { linhas, totais };
    res.json(resposta);
  });

  r.get('/clientes', (req, res) => {
    const porCliente = new Map<number, LinhaRelatorioCliente>();
    for (const l of linhasDeProjetos(db, req.query as Consulta)) {
      const c = porCliente.get(l.clienteId) ?? { clienteId: l.clienteId, cliente: l.cliente, projetos: 0, periodo: periodoVazio(), atual: atualVazio() };
      c.projetos++;
      somar(c, l);
      porCliente.set(l.clienteId, c);
    }
    const linhas = [...porCliente.values()];
    const totais = { periodo: periodoVazio(), atual: atualVazio() };
    linhas.forEach((l) => somar(totais, l));
    const resposta: RelatorioClientes = { linhas, totais };
    res.json(resposta);
  });

  // Fechamento: tudo o que foi feito e cobrado no projeto, do início ao fim.
  r.get('/fechamento/:id', (req, res) => {
    const projeto = detalharProjeto(db, idDaRota(req.params.id));
    const horas = linhasDeHoras(db, { projeto: projeto.id });
    const categorias = new Map<CategoriaHora | 'atendimento', number>();
    for (const h of horas) categorias.set(h.categoria, (categorias.get(h.categoria) ?? 0) + h.duracaoSegundos);
    const resposta: RelatorioFechamento = {
      projeto,
      horas,
      porCategoria: [...categorias].map(([categoria, segundos]) => ({ categoria, segundos })).sort((a, b) => b.segundos - a.segundos),
      servicos: db
        .prepare('SELECT * FROM servicos_adicionais WHERE projeto_id = ? AND excluido_em IS NULL ORDER BY data, id')
        .all(projeto.id)
        .map(paraServico),
      pagamentos: db.prepare(`${SELECT_PAGAMENTO} AND g.projeto_id = ? ORDER BY g.data, g.id`).all(projeto.id).map(paraPagamento),
      geradoEm: relogio().toISOString(),
    };
    res.json(resposta);
  });

  return r;
}
