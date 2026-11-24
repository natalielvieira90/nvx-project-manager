import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, Clock, Pencil, Plus, Timer, Trash2 } from 'lucide-react';
import { Botao, CabecalhoPagina, Cartao, EstadoVazio, Etiqueta, cx } from '../../components/ui.tsx';
import { Confirmacao } from '../../components/Modal.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { CATEGORIA_HORA, SITUACAO_COBRANCA } from '../../lib/rotulos.ts';
import { CATEGORIAS_HORA, SITUACOES_COBRANCA } from '../../../shared/esquemas.ts';
import { formatarData, formatarDuracao, formatarHora } from '../../../shared/formatacao.ts';
import type { CategoriaHora, Lancamento, SituacaoCobranca } from '../../../shared/tipos.ts';
import { SeletorMes } from '../dashboard/componentes.tsx';
import { CartaoCronometro } from './CartaoCronometro.tsx';
import { FormularioLancamento } from './FormularioLancamento.tsx';
import { useProjetosParaHoras } from './apoio.ts';

function mesCorrente() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const classeFiltro =
  'h-9 rounded-md border border-borda bg-superficie px-2.5 pr-7 text-sm focus:border-destaque-500';

export function ControleHoras() {
  const aviso = useAviso();
  const { projetos } = useProjetosParaHoras();
  const [mes, setMes] = useState(mesCorrente);
  const [projeto, setProjeto] = useState('');
  const [categoria, setCategoria] = useState<CategoriaHora | ''>('');
  const [situacao, setSituacao] = useState<SituacaoCobranca | ''>('');
  const [lancamentos, setLancamentos] = useState<Lancamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recarregar, setRecarregar] = useState(0);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Lancamento | null>(null);
  const [excluindo, setExcluindo] = useState<Lancamento | null>(null);
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    let ativo = true;
    const [a, m] = mes.split('-').map(Number);
    const q = new URLSearchParams({
      de: new Date(a, m - 1, 1).toISOString(),
      ate: new Date(a, m, 1).toISOString(),
    });
    if (projeto) q.set('projeto', projeto);
    if (categoria) q.set('categoria', categoria);
    if (situacao) q.set('situacao', situacao);
    api<Lancamento[]>(`/lancamentos?${q}`)
      .then((l) => {
        if (!ativo) return;
        setLancamentos(l);
        setErro(null);
        setSelecionados(new Set());
      })
      .catch((e: unknown) => ativo && setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar lançamentos.'));
    return () => {
      ativo = false;
    };
  }, [mes, projeto, categoria, situacao, recarregar]);

  const totais = useMemo(() => {
    const t = { total: 0, dev: 0, suporte: 0, faturavel: 0 };
    for (const l of lancamentos ?? []) {
      t.total += l.duracaoSegundos;
      if (l.categoria === 'suporte') t.suporte += l.duracaoSegundos;
      else t.dev += l.duracaoSegundos;
      if (l.situacaoCobranca === 'faturavel') t.faturavel += l.duracaoSegundos;
    }
    return t;
  }, [lancamentos]);

  const alternar = (id: number) =>
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selecionaveis = lancamentos?.filter((l) => l.atendimentoId === null).length ?? 0;
  const todosMarcados = selecionaveis > 0 && selecionados.size === selecionaveis;

  async function mudarSituacao(ids: number[], nova: SituacaoCobranca) {
    setProcessando(true);
    try {
      const r = await api<{ alterados: number }>('/lancamentos/situacao', {
        method: 'PATCH',
        body: JSON.stringify({ ids, situacaoCobranca: nova }),
      });
      aviso.sucesso(`${r.alterados} lançamento(s) marcado(s) como "${SITUACAO_COBRANCA[nova].rotulo}".`);
      setRecarregar((n) => n + 1);
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível alterar a cobrança.');
    } finally {
      setProcessando(false);
    }
  }

  async function excluir() {
    if (!excluindo) return;
    setProcessando(true);
    try {
      await api(`/lancamentos/${excluindo.id}`, { method: 'DELETE' });
      aviso.sucesso('Lançamento movido para a lixeira.');
      setExcluindo(null);
      setRecarregar((n) => n + 1);
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível excluir.');
    } finally {
      setProcessando(false);
    }
  }

  const filtrando = Boolean(projeto || categoria || situacao);

  return (
    <>
      <CabecalhoPagina
        titulo="Controle de horas"
        descricao="Cronômetro e lançamentos de horas trabalhadas."
        acoes={
          <Botao variante="secundario" icone={Plus} onClick={() => setFormAberto(true)}>
            Lançar horas
          </Botao>
        }
      />

      {projetos && projetos.length === 0 ? (
        <Cartao className="mb-6">
          <EstadoVazio
            icone={Timer}
            titulo="Cadastre um projeto primeiro"
            descricao="As horas são registradas sempre em um projeto."
            acao={
              <Link to="/projetos" className="text-sm font-medium text-destaque-700 hover:underline">
                Ir para Projetos
              </Link>
            }
          />
        </Cartao>
      ) : (
        <div className="mb-6">
          <CartaoCronometro projetos={projetos} aoFinalizar={() => setRecarregar((n) => n + 1)} />
        </div>
      )}

      <Cartao>
        {/* Filtros */}
        <div className="flex flex-col gap-3 border-b border-borda p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="self-start">
            <SeletorMes mes={mes} onChange={setMes} />
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Filtrar por projeto" value={projeto} onChange={(e) => setProjeto(e.target.value)} className={cx(classeFiltro, 'max-w-56')}>
              <option value="">Todos os projetos</option>
              {projetos?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <select aria-label="Filtrar por categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaHora | '')} className={classeFiltro}>
              <option value="">Todas as categorias</option>
              {CATEGORIAS_HORA.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_HORA[c]}
                </option>
              ))}
            </select>
            <select aria-label="Filtrar por cobrança" value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoCobranca | '')} className={classeFiltro}>
              <option value="">Toda cobrança</option>
              {SITUACOES_COBRANCA.map((s) => (
                <option key={s} value={s}>
                  {SITUACAO_COBRANCA[s].rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Totais */}
        {lancamentos && lancamentos.length > 0 && (
          <div className="grid grid-cols-2 gap-px border-b border-borda bg-borda sm:grid-cols-4">
            {[
              ['Total', totais.total],
              ['Desenvolvimento', totais.dev],
              ['Suporte', totais.suporte],
              ['Faturável a cobrar', totais.faturavel],
            ].map(([rotulo, seg]) => (
              <div key={rotulo} className="bg-superficie px-4 py-3">
                <p className="text-xs text-texto-suave">{rotulo}</p>
                <p className="tabular text-lg font-semibold">{formatarDuracao(seg as number)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Ações em lote */}
        {selecionados.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-borda bg-lavanda-100/70 px-4 py-2.5 text-sm" role="region" aria-label="Ações para selecionados">
            <span className="mr-2 font-medium">{selecionados.size} selecionado(s)</span>
            <span className="text-texto-suave">Marcar como:</span>
            {SITUACOES_COBRANCA.map((s) => (
              <Botao key={s} variante="secundario" className="h-8 px-3 text-xs" disabled={processando} onClick={() => mudarSituacao([...selecionados], s)}>
                {SITUACAO_COBRANCA[s].rotulo}
              </Botao>
            ))}
            <button type="button" className="ml-auto text-xs text-texto-suave hover:text-texto" onClick={() => setSelecionados(new Set())}>
              Limpar seleção
            </button>
          </div>
        )}

        {erro ? (
          <EstadoVazio icone={CircleAlert} titulo="Não foi possível carregar os lançamentos" descricao={erro} acao={<Botao onClick={() => setRecarregar((n) => n + 1)}>Tentar novamente</Botao>} />
        ) : lancamentos === null ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-fundo" />
            ))}
          </div>
        ) : lancamentos.length === 0 ? (
          <EstadoVazio
            icone={Clock}
            titulo={filtrando ? 'Nenhum lançamento com estes filtros' : 'Nenhuma hora registrada neste mês'}
            descricao={filtrando ? 'Ajuste os filtros ou troque o mês.' : 'Use o cronômetro acima ou lance horas manualmente.'}
          />
        ) : (
          <>
            <table className="hidden w-full text-sm xl:table">
              <thead>
                <tr className="border-b border-borda text-left text-xs text-texto-suave">
                  <th className="w-10 py-3 pl-4">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={todosMarcados}
                      onChange={() => setSelecionados(todosMarcados ? new Set() : new Set(lancamentos.filter((l) => l.atendimentoId === null).map((l) => l.id)))}
                      className="size-4 accent-marca-800"
                    />
                  </th>
                  <th className="px-3 py-3 font-medium">Data</th>
                  <th className="px-3 py-3 font-medium">Horário</th>
                  <th className="px-3 py-3 font-medium">Duração</th>
                  <th className="px-3 py-3 font-medium">Projeto</th>
                  <th className="px-3 py-3 font-medium">Atividade</th>
                  <th className="px-3 py-3 font-medium">Cobrança</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {lancamentos.map((l) => (
                  <tr key={l.id} className={cx('group', selecionados.has(l.id) && 'bg-lavanda-100/50')}>
                    <td className="py-2.5 pl-4">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar lançamento de ${formatarData(l.inicio)} ${formatarHora(l.inicio)}`}
                        checked={selecionados.has(l.id)}
                        disabled={l.atendimentoId !== null}
                        onChange={() => alternar(l.id)}
                        className="size-4 accent-marca-800 disabled:opacity-30"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{formatarData(l.inicio)}</td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-texto-suave">
                      {formatarHora(l.inicio)}–{formatarHora(l.fim)}
                      {l.origem === 'cronometro' && <Timer className="ml-1.5 inline size-3.5 text-texto-suave/60" aria-label="Registrado pelo cronômetro" />}
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 font-medium">{formatarDuracao(l.duracaoSegundos)}</td>
                    <td className="px-3 py-2.5">
                      <Link to={`/projetos/${l.projetoId}`} className="hover:underline">
                        {l.projetoNome}
                      </Link>
                      <p className="text-xs text-texto-suave">{l.clienteNome}</p>
                    </td>
                    <td className="max-w-72 px-3 py-2.5">
                      <span className="text-xs font-medium text-texto-suave">{CATEGORIA_HORA[l.categoria]}</span>
                      {l.descricao && <p className="truncate" title={l.descricao}>{l.descricao}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.atendimentoId ? (
                        <Etiqueta tom="destaque">Atendimento</Etiqueta>
                      ) : (
                        <SeletorCobranca valor={l.situacaoCobranca} desabilitado={processando} aoMudar={(s) => mudarSituacao([l.id], s)} />
                      )}
                    </td>
                    <td className="pr-3">
                      {l.atendimentoId ? (
                        <Link to="/suporte" className="block text-right text-xs text-destaque-700 hover:underline">
                          Ver no Suporte
                        </Link>
                      ) : (
                        <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100">
                          <BotaoIcone rotulo="Editar" icone={Pencil} onClick={() => setEditando(l)} />
                          <BotaoIcone rotulo="Excluir" icone={Trash2} onClick={() => setExcluindo(l)} perigo />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Celular / telas médias */}
            <ul className="divide-y divide-borda xl:hidden">
              {lancamentos.map((l) => (
                <li key={l.id} className="flex gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Selecionar lançamento"
                    checked={selecionados.has(l.id)}
                    disabled={l.atendimentoId !== null}
                    onChange={() => alternar(l.id)}
                    className="mt-1 size-4 shrink-0 accent-marca-800 disabled:opacity-30"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-medium">{l.projetoNome}</p>
                      <p className="tabular shrink-0 font-semibold">{formatarDuracao(l.duracaoSegundos)}</p>
                    </div>
                    <p className="text-xs text-texto-suave">
                      {formatarData(l.inicio)} · {formatarHora(l.inicio)}–{formatarHora(l.fim)} · {CATEGORIA_HORA[l.categoria]}
                    </p>
                    {l.descricao && <p className="mt-1 line-clamp-2 text-sm">{l.descricao}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {l.atendimentoId ? (
                        <>
                          <Etiqueta tom="destaque">Atendimento</Etiqueta>
                          <Link to="/suporte" className="text-xs text-destaque-700 hover:underline">
                            Ver no Suporte
                          </Link>
                        </>
                      ) : (
                        <>
                          <Etiqueta tom={SITUACAO_COBRANCA[l.situacaoCobranca].tom}>{SITUACAO_COBRANCA[l.situacaoCobranca].rotulo}</Etiqueta>
                          <div className="flex gap-1">
                            <BotaoIcone rotulo="Editar" icone={Pencil} onClick={() => setEditando(l)} />
                            <BotaoIcone rotulo="Excluir" icone={Trash2} onClick={() => setExcluindo(l)} perigo />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Cartao>

      <FormularioLancamento
        aberto={formAberto || editando !== null}
        lancamento={editando}
        projetos={projetos}
        aoFechar={() => {
          setFormAberto(false);
          setEditando(null);
        }}
        aoSalvar={() => {
          setFormAberto(false);
          setEditando(null);
          setRecarregar((n) => n + 1);
        }}
      />

      <Confirmacao
        aberto={excluindo !== null}
        titulo="Excluir lançamento?"
        processando={processando}
        aoCancelar={() => setExcluindo(null)}
        aoConfirmar={excluir}
        mensagem={
          excluindo && (
            <>
              O lançamento de <strong className="text-texto">{formatarDuracao(excluindo.duracaoSegundos)}</strong> em{' '}
              {formatarData(excluindo.inicio)} ({excluindo.projetoNome}) será movido para a lixeira.
            </>
          )
        }
      />
    </>
  );
}

function SeletorCobranca({ valor, aoMudar, desabilitado }: { valor: SituacaoCobranca; aoMudar: (s: SituacaoCobranca) => void; desabilitado: boolean }) {
  const tons: Record<SituacaoCobranca, string> = {
    incluido_pacote: 'bg-lavanda-100 text-marca-700',
    faturavel: 'bg-amber-50 text-amber-800',
    faturado: 'bg-emerald-50 text-emerald-700',
  };
  return (
    <select
      aria-label="Situação de cobrança"
      title={SITUACAO_COBRANCA[valor].dica}
      value={valor}
      disabled={desabilitado}
      onChange={(e) => aoMudar(e.target.value as SituacaoCobranca)}
      className={cx('h-7 cursor-pointer rounded-full border-0 py-0 pl-2.5 pr-7 text-xs font-medium', tons[valor])}
    >
      {SITUACOES_COBRANCA.map((s) => (
        <option key={s} value={s}>
          {SITUACAO_COBRANCA[s].rotulo}
        </option>
      ))}
    </select>
  );
}

function BotaoIcone({ rotulo, icone: Icone, onClick, perigo }: { rotulo: string; icone: typeof Pencil; onClick: () => void; perigo?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={cx('grid size-8 place-items-center rounded-lg text-texto-suave hover:bg-fundo', perigo ? 'hover:text-perigo' : 'hover:text-texto')}
    >
      <Icone className="size-4" />
    </button>
  );
}
