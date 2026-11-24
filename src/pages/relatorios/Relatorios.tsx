/**
 * Relatórios com prévia na tela e exportação em PDF e CSV (gerados no próprio computador).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, CircleAlert, Clock, FileDown, FileSpreadsheet, FileText, HandCoins, Users, FileCheck2, type LucideIcon } from 'lucide-react';
import { Botao, CabecalhoPagina, Cartao, EstadoVazio, cx } from '../../components/ui.tsx';
import { CampoSelecao, CampoTexto } from '../../components/formulario.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { baixarCsv, nomeArquivo, type Coluna } from '../../lib/exportar.ts';
import { CATEGORIA_HORA, STATUS_PROJETO } from '../../lib/rotulos.ts';
import { STATUS_PROJETO_VALORES } from '../../../shared/esquemas.ts';
import { formatarData, formatarDuracaoCurta, formatarMoeda, hojeIso } from '../../../shared/formatacao.ts';
import type {
  ClienteResumo,
  Pagamento,
  ProjetoResumo,
  RelatorioClientes,
  RelatorioFechamento,
  RelatorioHoras,
  RelatorioProjetos,
} from '../../../shared/tipos.ts';
import { colunasClientes, colunasHoras, colunasPagamentos, colunasProjetos } from './definicoes.ts';

type Tipo = 'horas' | 'projetos' | 'clientes' | 'pagamentos' | 'fechamento';

const TIPOS: { valor: Tipo; titulo: string; descricao: string; icone: LucideIcon }[] = [
  { valor: 'horas', titulo: 'Horas trabalhadas', descricao: 'Desenvolvimento e suporte, com cobrança e valor', icone: Clock },
  { valor: 'projetos', titulo: 'Por projeto', descricao: 'Horas, faturado, recebido e pendente', icone: Briefcase },
  { valor: 'clientes', titulo: 'Por cliente', descricao: 'Os mesmos valores somados por cliente', icone: Users },
  { valor: 'pagamentos', titulo: 'Valores recebidos', descricao: 'Pagamentos no período', icone: HandCoins },
  { valor: 'fechamento', titulo: 'Fechamento de projeto', descricao: 'Tudo o que foi feito e cobrado', icone: FileCheck2 },
];

interface Filtros {
  de: string;
  ate: string;
  cliente: string;
  projeto: string;
  tipoHora: '' | 'desenvolvimento' | 'suporte';
  cobranca: '' | 'pacote' | 'a_faturar' | 'faturado';
  status: string;
}

/** Atalhos de período. */
function periodo(atalho: 'mes' | 'mesPassado' | 'ano' | 'tudo'): { de: string; ate: string } {
  const hoje = new Date();
  const iso = (d: Date) => hojeIso(d);
  if (atalho === 'tudo') return { de: '', ate: '' };
  if (atalho === 'ano') return { de: `${hoje.getFullYear()}-01-01`, ate: `${hoje.getFullYear()}-12-31` };
  const deslocamento = atalho === 'mesPassado' ? -1 : 0;
  return {
    de: iso(new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1)),
    ate: iso(new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento + 1, 0)),
  };
}

export function Relatorios() {
  const [parametros, setParametros] = useSearchParams();
  const tipo = (TIPOS.some((t) => t.valor === parametros.get('tipo')) ? parametros.get('tipo') : 'horas') as Tipo;
  const [filtros, setFiltros] = useState<Filtros>(() => ({
    ...periodo('mes'),
    cliente: '',
    projeto: parametros.get('projeto') ?? '',
    tipoHora: '',
    cobranca: '',
    status: 'contratados',
  }));
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [projetos, setProjetos] = useState<ProjetoResumo[]>([]);

  useEffect(() => {
    api<ClienteResumo[]>('/clientes').then(setClientes).catch(() => setClientes([]));
    api<ProjetoResumo[]>('/projetos').then(setProjetos).catch(() => setProjetos([]));
  }, []);

  const alterar = <K extends keyof Filtros>(campo: K, valor: Filtros[K]) =>
    setFiltros((f) => {
      const novo = { ...f, [campo]: valor };
      // Projeto de outro cliente deixa de valer ao trocar o cliente.
      if (campo === 'cliente' && valor && projetos.find((p) => String(p.id) === f.projeto)?.clienteId !== Number(valor)) novo.projeto = '';
      return novo;
    });

  const projetosDoFiltro = projetos
    .filter((p) => !filtros.cliente || String(p.clienteId) === filtros.cliente)
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <>
      <CabecalhoPagina titulo="Relatórios" descricao="Escolha o relatório, ajuste os filtros e exporte em PDF ou CSV." />

      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5" role="tablist" aria-label="Tipo de relatório">
        {TIPOS.map((t) => (
          <button
            key={t.valor}
            role="tab"
            type="button"
            aria-selected={tipo === t.valor}
            onClick={() => setParametros({ tipo: t.valor }, { replace: true })}
            className={cx(
              'flex items-start gap-3 rounded-cartao border p-3.5 text-left transition-colors',
              tipo === t.valor ? 'border-marca-800 bg-marca-900 text-white' : 'border-borda bg-superficie hover:border-texto-suave/40',
            )}
          >
            <t.icone className={cx('mt-0.5 size-4 shrink-0', tipo === t.valor ? 'text-destaque-400' : 'text-texto-suave')} aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold">{t.titulo}</span>
              <span className={cx('block text-xs', tipo === t.valor ? 'text-white/70' : 'text-texto-suave')}>{t.descricao}</span>
            </span>
          </button>
        ))}
      </div>

      {tipo === 'fechamento' ? (
        <Fechamento projetos={projetos} projetoInicial={filtros.projeto} />
      ) : (
        <>
          <Cartao className="mb-5 p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CampoTexto rotulo="De" type="date" value={filtros.de} max={filtros.ate || undefined} onChange={(e) => alterar('de', e.target.value)} />
              <CampoTexto rotulo="Até" type="date" value={filtros.ate} min={filtros.de || undefined} onChange={(e) => alterar('ate', e.target.value)} />
              <CampoSelecao rotulo="Cliente" value={filtros.cliente} onChange={(e) => alterar('cliente', e.target.value)}>
                <option value="">Todos os clientes</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </CampoSelecao>
              {tipo !== 'clientes' && (
                <CampoSelecao rotulo="Projeto" value={filtros.projeto} onChange={(e) => alterar('projeto', e.target.value)}>
                  <option value="">Todos os projetos</option>
                  {projetosDoFiltro.map((p) => (
                    <option key={p.id} value={p.id}>
                      {filtros.cliente ? p.nome : `${p.clienteNome} — ${p.nome}`}
                    </option>
                  ))}
                </CampoSelecao>
              )}
              {tipo === 'horas' && (
                <>
                  <CampoSelecao rotulo="Tipo de hora" value={filtros.tipoHora} onChange={(e) => alterar('tipoHora', e.target.value as Filtros['tipoHora'])}>
                    <option value="">Desenvolvimento e suporte</option>
                    <option value="desenvolvimento">Somente desenvolvimento</option>
                    <option value="suporte">Somente suporte</option>
                  </CampoSelecao>
                  <CampoSelecao rotulo="Cobrança" value={filtros.cobranca} onChange={(e) => alterar('cobranca', e.target.value as Filtros['cobranca'])}>
                    <option value="">Todas</option>
                    <option value="pacote">Incluídas no pacote</option>
                    <option value="a_faturar">A faturar (faturáveis e pendentes)</option>
                    <option value="faturado">Faturadas (inclui atendimentos pagos)</option>
                  </CampoSelecao>
                </>
              )}
              {(tipo === 'projetos' || tipo === 'clientes') && (
                <CampoSelecao rotulo="Status dos projetos" value={filtros.status} onChange={(e) => alterar('status', e.target.value)}>
                  <option value="contratados">Contratados</option>
                  <option value="todos">Todos</option>
                  {STATUS_PROJETO_VALORES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_PROJETO[s].rotulo}
                    </option>
                  ))}
                </CampoSelecao>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Atalhos de período">
              {(
                [
                  ['mes', 'Este mês'],
                  ['mesPassado', 'Mês passado'],
                  ['ano', 'Este ano'],
                  ['tudo', 'Todo o período'],
                ] as const
              ).map(([atalho, rotulo]) => {
                const p = periodo(atalho);
                const ativo = p.de === filtros.de && p.ate === filtros.ate;
                return (
                  <button
                    key={atalho}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setFiltros((f) => ({ ...f, ...p }))}
                    className={cx(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      ativo ? 'border-marca-800 bg-marca-800 text-white' : 'border-borda text-texto-suave hover:text-texto',
                    )}
                  >
                    {rotulo}
                  </button>
                );
              })}
            </div>
          </Cartao>
          <RelatorioComFiltros tipo={tipo} filtros={filtros} clientes={clientes} projetos={projetos} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Relatórios tabulares (horas, projetos, clientes, pagamentos)
// ---------------------------------------------------------------------------

interface Dados {
  colunas: Coluna<any>[];
  linhas: any[];
  resumo: [string, string][];
  rodape?: string[];
  observacao?: string;
}

function RelatorioComFiltros({
  tipo,
  filtros,
  clientes,
  projetos,
}: {
  tipo: Exclude<Tipo, 'fechamento'>;
  filtros: Filtros;
  clientes: ClienteResumo[];
  projetos: ProjetoResumo[];
}) {
  const aviso = useAviso();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setDados(null);
    setErro(null);
    const q = new URLSearchParams();
    if (filtros.de) q.set('de', filtros.de);
    if (filtros.ate) q.set('ate', filtros.ate);
    if (filtros.cliente) q.set('cliente', filtros.cliente);
    if (filtros.projeto && tipo !== 'clientes') q.set('projeto', filtros.projeto);
    const t = setTimeout(async () => {
      try {
        const montado = await carregar(tipo, q, filtros);
        if (ativo) setDados(montado);
      } catch (e) {
        if (ativo) setErro(e instanceof ErroApi ? e.message : 'Não foi possível gerar o relatório.');
      }
    }, 150);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [tipo, filtros]);

  const titulo = TIPOS.find((t) => t.valor === tipo)!.titulo;
  const descricaoFiltros = useMemo(() => {
    const partes = [
      filtros.de || filtros.ate
        ? `Período: ${filtros.de ? formatarData(filtros.de) : 'início'} a ${filtros.ate ? formatarData(filtros.ate) : 'hoje'}`
        : 'Período: todo',
    ];
    const cliente = clientes.find((c) => String(c.id) === filtros.cliente);
    if (cliente) partes.push(`Cliente: ${cliente.nome}`);
    const projeto = projetos.find((p) => String(p.id) === filtros.projeto);
    if (projeto && tipo !== 'clientes') partes.push(`Projeto: ${projeto.nome}`);
    if (tipo === 'horas' && filtros.tipoHora) partes.push(`Tipo: ${filtros.tipoHora === 'suporte' ? 'Suporte' : 'Desenvolvimento'}`);
    if (tipo === 'horas' && filtros.cobranca)
      partes.push(`Cobrança: ${{ pacote: 'incluídas no pacote', a_faturar: 'a faturar', faturado: 'faturadas' }[filtros.cobranca]}`);
    if ((tipo === 'projetos' || tipo === 'clientes') && filtros.status !== 'todos')
      partes.push(`Status: ${filtros.status === 'contratados' ? 'contratados' : STATUS_PROJETO[filtros.status as keyof typeof STATUS_PROJETO].rotulo}`);
    return partes.join(' · ');
  }, [filtros, clientes, projetos, tipo]);

  const arquivo = nomeArquivo('relatorio', titulo, filtros.de, filtros.ate);

  async function exportarPdf() {
    if (!dados) return;
    setGerando(true);
    try {
      const { relatorioTabela } = await import('../../lib/pdf.ts');
      relatorioTabela({
        nomeArquivo: `${arquivo}.pdf`,
        titulo: `Relatório: ${titulo}`,
        subtitulo: descricaoFiltros,
        resumo: dados.resumo,
        colunas: dados.colunas,
        linhas: dados.linhas,
        rodape: dados.rodape,
        observacao: dados.observacao,
        paisagem: true,
      });
      aviso.sucesso('PDF gerado.');
    } catch {
      aviso.erro('Não foi possível gerar o PDF.');
    } finally {
      setGerando(false);
    }
  }

  function exportarCsv() {
    if (!dados) return;
    baixarCsv(`${arquivo}.csv`, dados.colunas, dados.linhas);
    aviso.sucesso('CSV gerado.');
  }

  return (
    <Cartao>
      <div className="flex flex-col gap-3 border-b border-borda p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold">{titulo}</h2>
          <p className="text-xs text-texto-suave">{descricaoFiltros}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Botao variante="secundario" icone={FileSpreadsheet} onClick={exportarCsv} disabled={!dados?.linhas.length}>
            CSV
          </Botao>
          <Botao icone={FileDown} onClick={exportarPdf} disabled={!dados?.linhas.length || gerando}>
            {gerando ? 'Gerando…' : 'PDF'}
          </Botao>
        </div>
      </div>

      {erro ? (
        <EstadoVazio icone={CircleAlert} titulo="Não foi possível gerar o relatório" descricao={erro} />
      ) : dados === null ? (
        <div className="space-y-3 p-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-fundo" />
          ))}
        </div>
      ) : (
        <>
          <dl className="grid gap-px border-b border-borda bg-borda sm:grid-cols-2 xl:grid-cols-4">
            {dados.resumo.map(([rotulo, valor]) => (
              <div key={rotulo} className="bg-superficie px-4 py-3">
                <dt className="text-xs text-texto-suave">{rotulo}</dt>
                <dd className="tabular mt-0.5 font-semibold">{valor}</dd>
              </div>
            ))}
          </dl>
          {dados.linhas.length === 0 ? (
            <EstadoVazio icone={FileText} titulo="Nada encontrado" descricao="Não há registros para os filtros escolhidos." />
          ) : (
            <TabelaPrevia colunas={dados.colunas} linhas={dados.linhas} rodape={dados.rodape} />
          )}
          {dados.observacao && <p className="border-t border-borda px-4 py-3 text-xs text-texto-suave">{dados.observacao}</p>}
        </>
      )}
    </Cartao>
  );
}

/** Busca os dados e monta colunas, resumo e totais de cada relatório. */
async function carregar(tipo: Exclude<Tipo, 'fechamento'>, q: URLSearchParams, filtros: Filtros): Promise<Dados> {
  if (tipo === 'horas') {
    if (filtros.tipoHora) q.set('tipo', filtros.tipoHora);
    if (filtros.cobranca) q.set('cobranca', filtros.cobranca);
    const r = await api<RelatorioHoras>(`/relatorios/horas?${q}`);
    const t = r.totais;
    return {
      colunas: colunasHoras,
      linhas: r.linhas,
      resumo: [
        ['Horas trabalhadas', formatarDuracaoCurta(t.totalSegundos)],
        ['Desenvolvimento · Suporte', `${formatarDuracaoCurta(t.desenvolvimentoSegundos)} · ${formatarDuracaoCurta(t.suporteSegundos)}`],
        ['Faturado', formatarMoeda(t.faturadoCentavos)],
        ['A faturar', formatarMoeda(t.aFaturarCentavos)],
      ],
      rodape: ['Total', '', '', '', '', '', formatarDuracaoCurta(t.totalSegundos), '', formatarMoeda(t.valorCentavos)],
      observacao: `Horas incluídas no pacote (${formatarDuracaoCurta(t.pacoteSegundos)}) estão cobertas pelo valor fechado e aparecem com valor R$ 0,00. Horas de suporte convertidas em atendimento aparecem uma única vez, como atendimento.`,
    };
  }
  if (tipo === 'projetos' || tipo === 'clientes') {
    q.set('status', filtros.status);
    const r = await api<RelatorioProjetos | RelatorioClientes>(`/relatorios/${tipo}?${q}`);
    const { periodo: p, atual: a } = r.totais;
    const valores = [
      formatarDuracaoCurta(p.desenvolvimentoSegundos),
      formatarDuracaoCurta(p.suporteSegundos),
      formatarMoeda(p.recebidoCentavos),
      formatarMoeda(a.totalCentavos),
      formatarMoeda(a.extrasFaturadosCentavos),
      formatarMoeda(a.aFaturarCentavos),
      formatarMoeda(a.recebidoCentavos),
      formatarMoeda(a.pendenteCentavos),
    ];
    return {
      colunas: tipo === 'projetos' ? colunasProjetos : colunasClientes,
      linhas: r.linhas,
      resumo: [
        ['Recebido no período', formatarMoeda(p.recebidoCentavos)],
        ['Horas no período', formatarDuracaoCurta(p.desenvolvimentoSegundos + p.suporteSegundos)],
        ['Pendente (hoje)', formatarMoeda(a.pendenteCentavos)],
        ['A faturar (hoje)', formatarMoeda(a.aFaturarCentavos)],
      ],
      rodape: tipo === 'projetos' ? ['Total', '', '', ...valores] : ['Total', String(r.linhas.reduce((t, l) => t + ('projetos' in l ? l.projetos : 0), 0)), ...valores],
      observacao:
        'Colunas "(período)" consideram só as datas escolhidas. As demais mostram a posição de hoje: total do projeto, extras já faturados, extras a faturar, tudo o que já foi recebido e o pendente (somente projetos contratados).',
    };
  }
  const r = await api<Pagamento[]>(`/pagamentos?${q}`);
  const total = r.reduce((t, g) => t + g.valorCentavos, 0);
  return {
    colunas: colunasPagamentos,
    linhas: r.slice().reverse(), // ordem cronológica
    resumo: [
      ['Total recebido', formatarMoeda(total)],
      ['Pagamentos', String(r.length)],
    ],
    rodape: ['Total', '', '', '', '', formatarMoeda(total)],
  };
}

function TabelaPrevia({ colunas, linhas, rodape }: { colunas: Coluna<any>[]; linhas: any[]; rodape?: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-borda text-left text-xs text-texto-suave">
            {colunas.map((c) => (
              <th key={c.titulo} className={cx('whitespace-nowrap px-4 py-2.5 font-medium', c.direita && 'text-right')}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((l, i) => (
            <tr key={i} className="hover:bg-fundo/60">
              {colunas.map((c) => (
                <Celula key={c.titulo} direita={c.direita}>
                  {c.valor(l)}
                </Celula>
              ))}
            </tr>
          ))}
        </tbody>
        {rodape && (
          <tfoot>
            <tr className="border-t-2 border-borda bg-fundo font-semibold">
              {rodape.map((v, i) => (
                <Celula key={i} direita={colunas[i]?.direita}>
                  {v}
                </Celula>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Celula({ direita, children }: { direita?: boolean; children: ReactNode }) {
  return <td className={cx('px-4 py-2.5 align-top', direita && 'tabular whitespace-nowrap text-right')}>{children}</td>;
}

// ---------------------------------------------------------------------------
// Fechamento de projeto
// ---------------------------------------------------------------------------

function Fechamento({ projetos, projetoInicial }: { projetos: ProjetoResumo[]; projetoInicial: string }) {
  const aviso = useAviso();
  const [projetoId, setProjetoId] = useState(projetoInicial);
  const [dados, setDados] = useState<RelatorioFechamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (!projetoId) return setDados(null);
    let ativo = true;
    setDados(null);
    setErro(null);
    api<RelatorioFechamento>(`/relatorios/fechamento/${projetoId}`)
      .then((d) => ativo && setDados(d))
      .catch((e: unknown) => ativo && setErro(e instanceof ErroApi ? e.message : 'Não foi possível carregar o projeto.'));
    return () => {
      ativo = false;
    };
  }, [projetoId]);

  async function gerarPdf() {
    if (!dados) return;
    setGerando(true);
    try {
      const { gerarPdfFechamento } = await import('./pdfFechamento.ts');
      gerarPdfFechamento(dados);
      aviso.sucesso('Relatório de fechamento gerado.');
    } catch {
      aviso.erro('Não foi possível gerar o PDF.');
    } finally {
      setGerando(false);
    }
  }

  function exportarCsv() {
    if (!dados) return;
    baixarCsv(`${nomeArquivo('fechamento', dados.projeto.clienteNome, dados.projeto.nome, 'horas')}.csv`, colunasHoras, dados.horas);
    aviso.sucesso('CSV gerado.');
  }

  const ordenados = projetos
    .slice()
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
  const p = dados?.projeto;

  return (
    <Cartao>
      <div className="flex flex-col gap-3 border-b border-borda p-4 lg:flex-row lg:items-end lg:justify-between">
        <CampoSelecao rotulo="Projeto" className="w-full lg:max-w-md" value={projetoId} onChange={(e) => setProjetoId(e.target.value)}>
          <option value="">Selecione o projeto</option>
          {ordenados.map((x) => (
            <option key={x.id} value={x.id}>
              {x.clienteNome} — {x.nome} ({STATUS_PROJETO[x.status].rotulo})
            </option>
          ))}
        </CampoSelecao>
        <div className="flex shrink-0 gap-2">
          <Botao variante="secundario" icone={FileSpreadsheet} onClick={exportarCsv} disabled={!dados?.horas.length}>
            Horas em CSV
          </Botao>
          <Botao icone={FileDown} onClick={gerarPdf} disabled={!dados || gerando}>
            {gerando ? 'Gerando…' : 'Gerar PDF de fechamento'}
          </Botao>
        </div>
      </div>

      {erro ? (
        <EstadoVazio icone={CircleAlert} titulo="Não foi possível carregar" descricao={erro} />
      ) : !projetoId ? (
        <EstadoVazio
          icone={FileCheck2}
          titulo="Escolha um projeto"
          descricao="O fechamento reúne composição do valor, horas por tipo, todas as horas trabalhadas, serviços adicionais e pagamentos."
        />
      ) : !p || !dados ? (
        <div className="m-4 h-24 animate-pulse rounded-lg bg-fundo" aria-busy="true" />
      ) : (
        <div className="space-y-5 p-4">
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ['Total do projeto', formatarMoeda(p.financeiro.totalCentavos)],
                ['Recebido', formatarMoeda(p.financeiro.recebidoCentavos)],
                ['Pendente', formatarMoeda(p.financeiro.pendenteCentavos)],
                ['Horas trabalhadas', formatarDuracaoCurta(p.horas.totalSegundos)],
              ] as const
            ).map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-lg bg-fundo px-4 py-3">
                <dt className="text-xs text-texto-suave">{rotulo}</dt>
                <dd className="tabular mt-0.5 text-lg font-semibold">{valor}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-texto-suave">Horas por tipo</p>
              <ul className="divide-y divide-borda text-sm">
                {dados.porCategoria.length === 0 && <li className="py-2 text-texto-suave">Nenhuma hora registrada.</li>}
                {dados.porCategoria.map((c) => (
                  <li key={c.categoria} className="flex justify-between py-2">
                    <span className="text-texto-suave">{c.categoria === 'atendimento' ? 'Atendimentos de suporte' : CATEGORIA_HORA[c.categoria]}</span>
                    <span className="tabular font-medium">{formatarDuracaoCurta(c.segundos)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-texto-suave">O PDF inclui</p>
              <ul className="divide-y divide-borda text-sm">
                <li className="flex justify-between py-2">
                  <span className="text-texto-suave">Registros de horas e atendimentos</span>
                  <span className="tabular font-medium">{dados.horas.length}</span>
                </li>
                <li className="flex justify-between py-2">
                  <span className="text-texto-suave">Serviços adicionais</span>
                  <span className="tabular font-medium">{dados.servicos.length}</span>
                </li>
                <li className="flex justify-between py-2">
                  <span className="text-texto-suave">Pagamentos</span>
                  <span className="tabular font-medium">{dados.pagamentos.length}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </Cartao>
  );
}
