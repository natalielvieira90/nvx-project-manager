import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, LifeBuoy, Pencil, Plus, Timer, Trash2 } from 'lucide-react';
import { Botao, CabecalhoPagina, Cartao, EstadoVazio, cx } from '../../components/ui.tsx';
import { Confirmacao } from '../../components/Modal.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { SITUACAO_ATENDIMENTO } from '../../lib/rotulos.ts';
import { SITUACOES_ATENDIMENTO } from '../../../shared/esquemas.ts';
import { formatarData, formatarDuracao, formatarHora, formatarMoeda } from '../../../shared/formatacao.ts';
import type { Atendimento, Lancamento, SituacaoAtendimento } from '../../../shared/tipos.ts';
import { SeletorMes } from '../dashboard/componentes.tsx';
import { useProjetosParaHoras } from '../horas/apoio.ts';
import { FormularioAtendimento } from './FormularioAtendimento.tsx';

function mesCorrente() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const classeFiltro =
  'h-9 rounded-md border border-borda bg-superficie px-2.5 pr-7 text-sm focus:border-destaque-500';

const TONS_SITUACAO: Record<SituacaoAtendimento, string> = {
  pendente: 'bg-amber-50 text-amber-800',
  faturado: 'bg-lima-100 text-marca-800',
  pago: 'bg-emerald-50 text-emerald-700',
};

export function Suporte() {
  const aviso = useAviso();
  const { projetos } = useProjetosParaHoras();
  const [mes, setMes] = useState(mesCorrente);
  const [cliente, setCliente] = useState('');
  const [situacao, setSituacao] = useState<SituacaoAtendimento | ''>('');
  const [atendimentos, setAtendimentos] = useState<Atendimento[] | null>(null);
  const [semAtendimento, setSemAtendimento] = useState<Lancamento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [recarregar, setRecarregar] = useState(0);
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Atendimento | null>(null);
  const [convertendo, setConvertendo] = useState<Lancamento | null>(null);
  const [excluindo, setExcluindo] = useState<Atendimento | null>(null);
  const [processando, setProcessando] = useState(false);
  const atualizar = useCallback(() => setRecarregar((n) => n + 1), []);

  useEffect(() => {
    let ativo = true;
    const [a, m] = mes.split('-').map(Number);
    const q = new URLSearchParams({ de: new Date(a, m - 1, 1).toISOString(), ate: new Date(a, m, 1).toISOString() });
    if (cliente) q.set('cliente', cliente);
    if (situacao) q.set('situacao', situacao);
    api<Atendimento[]>(`/atendimentos?${q}`)
      .then((l) => ativo && (setAtendimentos(l), setErro(null)))
      .catch((e: unknown) => ativo && setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar atendimentos.'));
    // Horas de suporte registradas (cronômetro/manual) que ainda não viraram atendimento.
    api<Lancamento[]>('/lancamentos?categoria=suporte')
      .then((l) => ativo && setSemAtendimento(l.filter((x) => x.atendimentoId === null)))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [mes, cliente, situacao, recarregar]);

  const clientes = useMemo(() => {
    const mapa = new Map<number, string>();
    projetos?.forEach((p) => mapa.set(p.clienteId, p.clienteNome));
    return [...mapa].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [projetos]);

  const totais = useMemo(() => {
    const t = { tempo: 0, pendente: 0, faturado: 0, pago: 0 };
    for (const a of atendimentos ?? []) {
      t.tempo += a.duracaoSegundos;
      t[a.situacao] += a.valorCentavos;
    }
    return t;
  }, [atendimentos]);

  async function mudarSituacao(a: Atendimento, nova: SituacaoAtendimento) {
    setProcessando(true);
    try {
      await api('/atendimentos/situacao', { method: 'PATCH', body: JSON.stringify({ ids: [a.id], situacao: nova }) });
      aviso.sucesso(
        nova === 'pago' && a.valorCentavos > 0
          ? `Marcado como pago. Pagamento de ${formatarMoeda(a.valorCentavos)} registrado no projeto.`
          : `Situação alterada para "${SITUACAO_ATENDIMENTO[nova].rotulo}".`,
      );
      atualizar();
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível alterar a situação.');
    } finally {
      setProcessando(false);
    }
  }

  async function excluir() {
    if (!excluindo) return;
    setProcessando(true);
    try {
      await api(`/atendimentos/${excluindo.id}`, { method: 'DELETE' });
      aviso.sucesso('Atendimento movido para a lixeira.');
      setExcluindo(null);
      atualizar();
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível excluir.');
    } finally {
      setProcessando(false);
    }
  }

  const filtrando = Boolean(cliente || situacao);

  return (
    <>
      <CabecalhoPagina
        titulo="Suporte"
        descricao="Atendimentos de suporte e sua cobrança."
        acoes={
          <Botao icone={Plus} onClick={() => setFormAberto(true)} disabled={projetos?.length === 0}>
            Registrar atendimento
          </Botao>
        }
      />

      {/* Horas de suporte ainda sem atendimento */}
      {semAtendimento.length > 0 && (
        <Cartao className="mb-6 border-amber-200">
          <div className="border-b border-borda px-5 py-3.5">
            <h2 className="text-sm font-semibold">Horas de suporte sem atendimento ({semAtendimento.length})</h2>
            <p className="mt-0.5 text-xs text-texto-suave">
              Registradas no cronômetro ou manualmente como "Suporte". Transforme em atendimento para informar problema, solução
              e valor. As horas não são contadas duas vezes.
            </p>
          </div>
          <ul className="divide-y divide-borda">
            {semAtendimento.slice(0, 5).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
                <Timer className="size-4 shrink-0 text-texto-suave" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {l.projetoNome} <span className="font-normal text-texto-suave">· {l.clienteNome}</span>
                  </p>
                  <p className="truncate text-xs text-texto-suave">
                    {formatarData(l.inicio)} · {formatarHora(l.inicio)}–{formatarHora(l.fim)} · {formatarDuracao(l.duracaoSegundos)}
                    {l.descricao && ` · ${l.descricao}`}
                  </p>
                </div>
                <Botao variante="secundario" className="h-8 px-3 text-xs" onClick={() => setConvertendo(l)}>
                  Criar atendimento
                </Botao>
              </li>
            ))}
          </ul>
          {semAtendimento.length > 5 && (
            <p className="border-t border-borda px-5 py-2.5 text-xs text-texto-suave">
              E mais {semAtendimento.length - 5}. Elas aparecem aqui conforme você converte as primeiras.
            </p>
          )}
        </Cartao>
      )}

      <Cartao>
        <div className="flex flex-col gap-3 border-b border-borda p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="self-start">
            <SeletorMes mes={mes} onChange={setMes} />
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Filtrar por cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} className={cx(classeFiltro, 'max-w-56')}>
              <option value="">Todos os clientes</option>
              {clientes.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
            <select aria-label="Filtrar por situação" value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoAtendimento | '')} className={classeFiltro}>
              <option value="">Todas as situações</option>
              {SITUACOES_ATENDIMENTO.map((s) => (
                <option key={s} value={s}>
                  {SITUACAO_ATENDIMENTO[s].rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        {atendimentos && atendimentos.length > 0 && (
          <div className="grid grid-cols-2 gap-px border-b border-borda bg-borda sm:grid-cols-4">
            {[
              ['Tempo de suporte', formatarDuracao(totais.tempo)],
              ['Pendente', formatarMoeda(totais.pendente)],
              ['Faturado', formatarMoeda(totais.faturado)],
              ['Pago', formatarMoeda(totais.pago)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="bg-superficie px-4 py-3">
                <p className="text-xs text-texto-suave">{rotulo}</p>
                <p className="tabular whitespace-nowrap text-lg font-semibold">{valor}</p>
              </div>
            ))}
          </div>
        )}

        {erro ? (
          <EstadoVazio icone={CircleAlert} titulo="Não foi possível carregar os atendimentos" descricao={erro} acao={<Botao onClick={atualizar}>Tentar novamente</Botao>} />
        ) : atendimentos === null ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-fundo" />
            ))}
          </div>
        ) : atendimentos.length === 0 ? (
          <EstadoVazio
            icone={LifeBuoy}
            titulo={filtrando ? 'Nenhum atendimento com estes filtros' : 'Nenhum atendimento neste mês'}
            descricao={filtrando ? 'Ajuste os filtros ou troque o mês.' : 'Registre os atendimentos de suporte para controlar o que cobrar.'}
          />
        ) : (
          <ul className="divide-y divide-borda">
            {atendimentos.map((a) => (
              <li key={a.id} className="group grid gap-x-6 gap-y-2 px-5 py-4 lg:grid-cols-[150px_minmax(0,1fr)_auto]">
                <div className="text-sm">
                  <p className="font-medium">{formatarData(a.inicio)}</p>
                  <p className="tabular text-xs text-texto-suave">
                    {formatarHora(a.inicio)}–{formatarHora(a.fim)} · {formatarDuracao(a.duracaoSegundos)}
                    {a.lancamentoId && <Timer className="ml-1 inline size-3" aria-label="Originado de lançamento de horas" />}
                  </p>
                </div>
                <div className="min-w-0 text-sm">
                  <p className="text-xs text-texto-suave">
                    <span className="font-medium text-texto">{a.clienteNome}</span> ·{' '}
                    <Link to={`/projetos/${a.projetoId}`} className="hover:underline">
                      {a.projetoNome}
                    </Link>
                  </p>
                  <p className="mt-1">
                    <span className="text-texto-suave">Problema: </span>
                    {a.problema}
                  </p>
                  {a.solucao && (
                    <p className="mt-0.5 text-texto-suave">
                      Solução: <span className="text-texto">{a.solucao}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 lg:flex-col lg:items-end">
                  <p className="tabular whitespace-nowrap font-semibold">{formatarMoeda(a.valorCentavos)}</p>
                  <select
                    aria-label="Situação do atendimento"
                    title={SITUACAO_ATENDIMENTO[a.situacao].dica}
                    value={a.situacao}
                    disabled={processando}
                    onChange={(e) => mudarSituacao(a, e.target.value as SituacaoAtendimento)}
                    className={cx('h-7 cursor-pointer rounded-full border-0 py-0 pl-2.5 pr-7 text-xs font-medium', TONS_SITUACAO[a.situacao])}
                  >
                    {SITUACOES_ATENDIMENTO.map((s) => (
                      <option key={s} value={s}>
                        {SITUACAO_ATENDIMENTO[s].rotulo}
                      </option>
                    ))}
                  </select>
                  <div className="ml-auto flex gap-1 opacity-70 group-hover:opacity-100 lg:ml-0">
                    <button type="button" aria-label="Editar" title="Editar" onClick={() => setEditando(a)} className="grid size-8 place-items-center rounded-lg text-texto-suave hover:bg-fundo hover:text-texto">
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" aria-label="Excluir" title="Excluir" onClick={() => setExcluindo(a)} className="grid size-8 place-items-center rounded-lg text-texto-suave hover:bg-fundo hover:text-perigo">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <FormularioAtendimento
        aberto={formAberto || editando !== null || convertendo !== null}
        atendimento={editando}
        lancamentoOrigem={convertendo}
        projetos={projetos}
        aoFechar={() => {
          setFormAberto(false);
          setEditando(null);
          setConvertendo(null);
        }}
        aoSalvar={() => {
          setFormAberto(false);
          setEditando(null);
          setConvertendo(null);
          atualizar();
        }}
      />

      <Confirmacao
        aberto={excluindo !== null}
        titulo="Excluir atendimento?"
        processando={processando}
        aoCancelar={() => setExcluindo(null)}
        aoConfirmar={excluir}
        mensagem={
          excluindo && (
            <>
              O atendimento de <strong className="text-texto">{formatarData(excluindo.inicio)}</strong> ({excluindo.clienteNome}) será
              movido para a lixeira.
              {excluindo.situacao === 'pago' && excluindo.valorCentavos > 0 && ' O pagamento registrado automaticamente também será removido.'}
              {excluindo.lancamentoId && ' As horas voltam a aparecer como suporte sem atendimento.'}
            </>
          )
        }
      />
    </>
  );
}

