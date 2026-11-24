/**
 * Módulo Financeiro: quanto cada projeto vale, quanto já entrou, o que falta receber e
 * o que ainda precisa ser faturado; e a lista de pagamentos recebidos por mês.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, CircleAlert, FileClock, HandCoins, Headset, Pencil, Plus, SearchX, Trash2, Wallet, Hourglass } from 'lucide-react';
import { Botao, CabecalhoPagina, Cartao, EstadoVazio, cx } from '../../components/ui.tsx';
import { Confirmacao } from '../../components/Modal.tsx';
import { CampoBusca } from '../../components/formulario.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { FORMA_PAGAMENTO, STATUS_PROJETO } from '../../lib/rotulos.ts';
import { STATUS_PROJETO_VALORES } from '../../../shared/esquemas.ts';
import { STATUS_CONTRATADOS } from '../../../shared/financeiro.ts';
import { formatarData, formatarDuracaoCurta, formatarMoeda, hojeIso } from '../../../shared/formatacao.ts';
import type { Pagamento, ProjetoFinanceiro, ResumoFinanceiro } from '../../../shared/tipos.ts';
import { Indicador, SeletorMes, nomeDoMes } from '../dashboard/componentes.tsx';
import { EtiquetaStatus } from '../projetos/componentes.tsx';
import { FormularioPagamento } from './formularios.tsx';

type Aba = 'projetos' | 'pagamentos';

export function Financeiro() {
  const [parametros, setParametros] = useSearchParams();
  const aba: Aba = parametros.get('aba') === 'pagamentos' ? 'pagamentos' : 'projetos';
  const [formAberto, setFormAberto] = useState(false);
  const [versao, setVersao] = useState(0);

  return (
    <>
      <CabecalhoPagina
        titulo="Financeiro"
        descricao="Valores a receber, pagamentos e o que ainda falta faturar."
        acoes={
          <Botao icone={Plus} onClick={() => setFormAberto(true)}>
            Registrar pagamento
          </Botao>
        }
      />

      <div role="tablist" aria-label="Seções do financeiro" className="mb-5 flex gap-1 border-b border-borda">
        {(
          [
            ['projetos', 'Por projeto'],
            ['pagamentos', 'Pagamentos recebidos'],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            role="tab"
            type="button"
            aria-selected={aba === valor}
            onClick={() => setParametros(valor === 'projetos' ? {} : { aba: valor }, { replace: true })}
            className={cx(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              aba === valor ? 'border-destaque-500 text-texto' : 'border-transparent text-texto-suave hover:text-texto',
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'projetos' ? <VisaoProjetos versao={versao} /> : <ListaPagamentos versao={versao} aoAlterar={() => setVersao((n) => n + 1)} />}

      <FormularioPagamento
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        aoSalvar={() => {
          setFormAberto(false);
          setVersao((n) => n + 1);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Por projeto
// ---------------------------------------------------------------------------

function VisaoProjetos({ versao }: { versao: number }) {
  const navegar = useNavigate();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('contratados');
  const [dados, setDados] = useState<ResumoFinanceiro | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    const t = setTimeout(() => {
      const q = new URLSearchParams({ status });
      if (busca.trim()) q.set('busca', busca.trim());
      api<ResumoFinanceiro>(`/financeiro?${q}`)
        .then((d) => ativo && (setDados(d), setErro(null)))
        .catch((e: unknown) => ativo && setErro(e instanceof ErroApi ? e.message : 'Erro inesperado.'));
    }, 200);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [busca, status, versao, tentativa]);

  if (erro) {
    return (
      <Cartao>
        <EstadoVazio
          icone={CircleAlert}
          titulo="Não foi possível carregar o financeiro"
          descricao={erro}
          acao={<Botao onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Botao>}
        />
      </Cartao>
    );
  }

  const t = dados?.totais;
  const recebidoPct = t && t.totalCentavos ? Math.min(100, Math.round((t.recebidoCentavos / t.totalCentavos) * 100)) : 0;
  const contratado = (p: ProjetoFinanceiro) => (STATUS_CONTRATADOS as readonly string[]).includes(p.status);
  const abrir = (id: number) => navegar(`/projetos/${id}`);

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Total contratado" valor={t ? formatarMoeda(t.totalCentavos) : '—'} icone={Wallet} destaque complemento="Projetos listados abaixo, já com descontos" />
        <Indicador rotulo="Recebido" valor={t ? formatarMoeda(t.recebidoCentavos) : '—'} icone={HandCoins} complemento={t?.totalCentavos ? `${recebidoPct}% do total contratado` : undefined} />
        <Indicador rotulo="Pendente" valor={t ? formatarMoeda(t.pendenteCentavos) : '—'} icone={Hourglass} complemento="Falta receber dos projetos contratados" />
        <Indicador rotulo="A faturar" valor={t ? formatarMoeda(t.aFaturarCentavos) : '—'} icone={FileClock} complemento="Extras ainda não incluídos em cobrança" />
      </div>

      <Cartao>
        <div className="flex flex-col gap-3 border-b border-borda p-4 sm:flex-row sm:items-center">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar projeto ou cliente" rotulo="Buscar projetos" />
          <label className="sr-only" htmlFor="filtro-status-fin">
            Status
          </label>
          <select
            id="filtro-status-fin"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-md border border-borda bg-superficie px-3 pr-8 text-sm focus:border-destaque-500"
          >
            <option value="contratados">Contratados</option>
            <option value="todos">Todos os status</option>
            {STATUS_PROJETO_VALORES.map((s) => (
              <option key={s} value={s}>
                {STATUS_PROJETO[s].rotulo}
              </option>
            ))}
          </select>
        </div>

        {dados === null ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-fundo" />
            ))}
          </div>
        ) : dados.projetos.length === 0 ? (
          <EstadoVazio icone={SearchX} titulo="Nenhum projeto encontrado" descricao="Ajuste a busca ou o filtro de status." />
        ) : (
          <>
            <div className="hidden xl:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borda text-left text-xs text-texto-suave">
                    <th className="px-5 py-3 font-medium">Projeto</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">Total</th>
                    <th className="px-5 py-3 text-right font-medium">Recebido</th>
                    <th className="px-5 py-3 text-right font-medium">Pendente</th>
                    <th className="px-5 py-3 text-right font-medium">A faturar</th>
                    <th className="px-5 py-3 text-right font-medium" title="Total do projeto ÷ horas trabalhadas">
                      Valor/hora efetivo
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {dados.projetos.map((p) => (
                    <tr key={p.id} onClick={() => abrir(p.id)} className="group cursor-pointer hover:bg-fundo/70">
                      <td className="px-5 py-3">
                        <Link to={`/projetos/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                          {p.nome}
                        </Link>
                        <p className="text-xs text-texto-suave">{p.clienteNome}</p>
                      </td>
                      <td className="px-5 py-3">
                        <EtiquetaStatus status={p.status} />
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-right">{formatarMoeda(p.financeiro.totalCentavos)}</td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-right">{formatarMoeda(p.financeiro.recebidoCentavos)}</td>
                      <td className={cx('tabular whitespace-nowrap px-5 py-3 text-right', contratado(p) && p.financeiro.pendenteCentavos ? 'font-medium' : 'text-texto-suave')}>
                        {contratado(p) && p.financeiro.pendenteCentavos ? formatarMoeda(p.financeiro.pendenteCentavos) : '—'}
                      </td>
                      <td className={cx('tabular whitespace-nowrap px-5 py-3 text-right', p.financeiro.aFaturarCentavos ? 'font-medium text-alerta' : 'text-texto-suave')}>
                        {p.financeiro.aFaturarCentavos ? formatarMoeda(p.financeiro.aFaturarCentavos) : '—'}
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-right text-texto-suave">
                        {p.financeiro.valorHoraEfetivoCentavos === null ? '—' : `${formatarMoeda(p.financeiro.valorHoraEfetivoCentavos)}/h`}
                        <p className="text-xs">{formatarDuracaoCurta(p.horas.totalSegundos)} trabalhadas</p>
                      </td>
                      <td className="pr-4 text-texto-suave/50 group-hover:text-texto-suave">
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-borda xl:hidden">
              {dados.projetos.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => abrir(p.id)} className="w-full px-4 py-3.5 text-left hover:bg-fundo/70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.nome}</p>
                        <p className="truncate text-xs text-texto-suave">{p.clienteNome}</p>
                      </div>
                      <EtiquetaStatus status={p.status} />
                    </div>
                    <dl className="tabular mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      <ValorCompacto rotulo="Total" valor={formatarMoeda(p.financeiro.totalCentavos)} />
                      <ValorCompacto rotulo="Recebido" valor={formatarMoeda(p.financeiro.recebidoCentavos)} />
                      <ValorCompacto rotulo="Pendente" valor={contratado(p) ? formatarMoeda(p.financeiro.pendenteCentavos) : '—'} />
                      <ValorCompacto
                        rotulo="A faturar"
                        valor={p.financeiro.aFaturarCentavos ? formatarMoeda(p.financeiro.aFaturarCentavos) : '—'}
                        alerta={p.financeiro.aFaturarCentavos > 0}
                      />
                    </dl>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Cartao>
      <p className="mt-3 text-xs text-texto-suave">
        Pagamentos, serviços adicionais e desconto de cada projeto são lançados na tela do projeto (clique na linha). "A faturar"
        reúne horas faturáveis, serviços adicionais e atendimentos de suporte ainda não cobrados.
      </p>
    </>
  );
}

function ValorCompacto({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="flex justify-between gap-2 sm:block">
      <dt className="text-texto-suave">{rotulo}</dt>
      <dd className={cx('whitespace-nowrap font-medium', alerta && 'text-alerta')}>{valor}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagamentos recebidos
// ---------------------------------------------------------------------------

function ListaPagamentos({ versao, aoAlterar }: { versao: number; aoAlterar: () => void }) {
  const aviso = useAviso();
  const [mes, setMes] = useState(() => hojeIso().slice(0, 7));
  const [pagamentos, setPagamentos] = useState<Pagamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Pagamento | null>(null);
  const [excluindo, setExcluindo] = useState<Pagamento | null>(null);
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setPagamentos(null);
    const [ano, m] = mes.split('-').map(Number);
    const ultimoDia = new Date(ano, m, 0).getDate();
    api<Pagamento[]>(`/pagamentos?de=${mes}-01&ate=${mes}-${String(ultimoDia).padStart(2, '0')}`)
      .then((p) => ativo && (setPagamentos(p), setErro(null)))
      .catch((e: unknown) => ativo && setErro(e instanceof ErroApi ? e.message : 'Erro inesperado.'));
    return () => {
      ativo = false;
    };
  }, [mes, versao]);

  async function excluir() {
    if (!excluindo) return;
    setProcessando(true);
    try {
      await api(`/pagamentos/${excluindo.id}`, { method: 'DELETE' });
      aviso.sucesso('Pagamento movido para a lixeira.');
      setExcluindo(null);
      aoAlterar();
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível excluir o pagamento.');
    } finally {
      setProcessando(false);
    }
  }

  const total = pagamentos?.reduce((t, p) => t + p.valorCentavos, 0) ?? 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SeletorMes mes={mes} onChange={setMes} />
        {pagamentos && (
          <p className="text-sm text-texto-suave">
            Recebido em {nomeDoMes(mes).toLowerCase()}: <strong className="tabular text-texto">{formatarMoeda(total)}</strong>
          </p>
        )}
      </div>

      <Cartao>
        {erro ? (
          <EstadoVazio icone={CircleAlert} titulo="Não foi possível carregar os pagamentos" descricao={erro} />
        ) : pagamentos === null ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-fundo" />
            ))}
          </div>
        ) : pagamentos.length === 0 ? (
          <EstadoVazio icone={HandCoins} titulo="Nenhum pagamento neste mês" descricao="Use “Registrar pagamento” para lançar um valor recebido." />
        ) : (
          <ul className="divide-y divide-borda">
            {pagamentos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="tabular w-24 shrink-0 text-sm font-medium">{formatarData(p.data)}</span>
                <div className="min-w-0 flex-1 basis-48">
                  <Link to={`/projetos/${p.projetoId}`} className="block truncate text-sm font-medium hover:underline">
                    {p.projetoNome}
                  </Link>
                  <p className="truncate text-xs text-texto-suave">
                    {p.clienteNome}
                    {p.forma && ` · ${FORMA_PAGAMENTO[p.forma]}`}
                    {!p.atendimentoId && p.observacoes && ` · ${p.observacoes}`}
                  </p>
                </div>
                {p.atendimentoId && (
                  <Link to="/suporte" className="inline-flex items-center gap-1 text-xs text-destaque-700 hover:underline">
                    <Headset className="size-3" aria-hidden="true" /> Via atendimento
                  </Link>
                )}
                <span className="tabular ml-auto w-28 whitespace-nowrap text-right text-sm font-semibold">{formatarMoeda(p.valorCentavos)}</span>
                <div className="flex w-[72px] shrink-0 justify-end">
                  {!p.atendimentoId && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditando(p)}
                        className="grid size-9 place-items-center rounded-lg text-texto-suave hover:bg-fundo hover:text-texto"
                        aria-label={`Editar pagamento de ${formatarData(p.data)}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExcluindo(p)}
                        className="grid size-9 place-items-center rounded-lg text-texto-suave hover:bg-red-50 hover:text-perigo"
                        aria-label={`Excluir pagamento de ${formatarData(p.data)}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      <p className="mt-3 text-xs text-texto-suave">
        Pagamentos “via atendimento” são criados ao marcar um atendimento de suporte como pago e só podem ser alterados pelo módulo
        Suporte.
      </p>

      <FormularioPagamento
        aberto={Boolean(editando)}
        pagamento={editando}
        aoFechar={() => setEditando(null)}
        aoSalvar={() => {
          setEditando(null);
          aoAlterar();
        }}
      />
      <Confirmacao
        aberto={Boolean(excluindo)}
        titulo="Excluir pagamento?"
        processando={processando}
        aoCancelar={() => setExcluindo(null)}
        aoConfirmar={excluir}
        mensagem={
          excluindo && (
            <>
              O pagamento de <strong className="text-texto">{formatarMoeda(excluindo.valorCentavos)}</strong> em {formatarData(excluindo.data)} (
              {excluindo.projetoNome}) deixa de contar como recebido. Ele vai para a lixeira e pode ser restaurado pela área de Backup.
            </>
          )
        }
      />
    </>
  );
}
