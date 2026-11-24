/**
 * Serviços adicionais e pagamentos de um projeto (exibidos no detalhe do projeto).
 * Cada alteração chama `aoAlterar` para o detalhe recarregar o resumo financeiro.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HandCoins, Headset, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { Botao, Cartao, Etiqueta } from '../../components/ui.tsx';
import { Confirmacao } from '../../components/Modal.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { FORMA_PAGAMENTO, SITUACAO_SERVICO } from '../../lib/rotulos.ts';
import { formatarData, formatarMoeda } from '../../../shared/formatacao.ts';
import type { Pagamento, ProjetoDetalhe, ServicoAdicional } from '../../../shared/tipos.ts';
import { FormularioPagamento, FormularioServico } from '../financeiro/formularios.tsx';

type Exclusao = { tipo: 'servico'; item: ServicoAdicional } | { tipo: 'pagamento'; item: Pagamento };

export function SecaoFinanceira({ projeto, aoAlterar }: { projeto: ProjetoDetalhe; aoAlterar: () => void }) {
  const aviso = useAviso();
  const [servicos, setServicos] = useState<ServicoAdicional[] | null>(null);
  const [pagamentos, setPagamentos] = useState<Pagamento[] | null>(null);
  const [erro, setErro] = useState(false);
  const [servicoForm, setServicoForm] = useState<{ aberto: boolean; item: ServicoAdicional | null }>({ aberto: false, item: null });
  const [pagamentoForm, setPagamentoForm] = useState<{ aberto: boolean; item: Pagamento | null }>({ aberto: false, item: null });
  const [exclusao, setExclusao] = useState<Exclusao | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // Recarrega sempre que o detalhe do projeto é recarregado.
  useEffect(() => {
    let ativo = true;
    Promise.all([
      api<ServicoAdicional[]>(`/servicos?projeto=${projeto.id}`),
      api<Pagamento[]>(`/pagamentos?projeto=${projeto.id}`),
    ])
      .then(([s, p]) => ativo && (setServicos(s), setPagamentos(p), setErro(false)))
      .catch(() => ativo && setErro(true));
    return () => {
      ativo = false;
    };
  }, [projeto]);

  async function excluir() {
    if (!exclusao) return;
    setExcluindo(true);
    try {
      await api(`/${exclusao.tipo === 'servico' ? 'servicos' : 'pagamentos'}/${exclusao.item.id}`, { method: 'DELETE' });
      aviso.sucesso(exclusao.tipo === 'servico' ? 'Serviço movido para a lixeira.' : 'Pagamento movido para a lixeira.');
      setExclusao(null);
      aoAlterar();
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível excluir.');
    } finally {
      setExcluindo(false);
    }
  }

  const salvo = () => {
    setServicoForm({ aberto: false, item: null });
    setPagamentoForm({ aberto: false, item: null });
    aoAlterar();
  };

  const totalServicos = servicos?.reduce((t, s) => t + s.valorCentavos, 0) ?? 0;
  const totalPagamentos = pagamentos?.reduce((t, p) => t + p.valorCentavos, 0) ?? 0;

  return (
    <>
      {/* Serviços adicionais */}
      <Cartao className="flex flex-col xl:col-span-3 2xl:col-span-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Receipt className="size-4 text-texto-suave" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Serviços adicionais</h2>
          </div>
          <Botao variante="secundario" icone={Plus} className="h-8 px-3" onClick={() => setServicoForm({ aberto: true, item: null })}>
            Adicionar
          </Botao>
        </div>
        <Lista
          carregando={servicos === null && !erro}
          erro={erro}
          vazio="Nenhum serviço adicional. Use para cobrar algo à parte do valor fechado."
          itens={servicos ?? []}
          render={(s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
              <div className="min-w-0 flex-1 basis-44">
                <p className="truncate text-sm font-medium">{s.descricao}</p>
                <p className="text-xs text-texto-suave">{formatarData(s.data)}</p>
              </div>
              <Etiqueta tom={SITUACAO_SERVICO[s.situacao].tom}>{SITUACAO_SERVICO[s.situacao].rotulo}</Etiqueta>
              <span className="tabular ml-auto whitespace-nowrap text-right text-sm font-medium sm:w-28">{formatarMoeda(s.valorCentavos)}</span>
              <Acoes
                rotulo={s.descricao}
                aoEditar={() => setServicoForm({ aberto: true, item: s })}
                aoExcluir={() => setExclusao({ tipo: 'servico', item: s })}
              />
            </li>
          )}
          rodape={servicos?.length ? `${servicos.length} serviço(s) · ${formatarMoeda(totalServicos)}` : null}
        />
      </Cartao>

      {/* Pagamentos */}
      <Cartao className="flex flex-col xl:col-span-3 2xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-5 py-3.5">
          <div className="flex items-center gap-2">
            <HandCoins className="size-4 text-texto-suave" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Pagamentos recebidos</h2>
          </div>
          <Botao icone={Plus} className="h-8 px-3" onClick={() => setPagamentoForm({ aberto: true, item: null })}>
            Registrar pagamento
          </Botao>
        </div>
        <Lista
          carregando={pagamentos === null && !erro}
          erro={erro}
          vazio="Nenhum pagamento registrado."
          itens={pagamentos ?? []}
          render={(p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
              <div className="min-w-0 flex-1 basis-44">
                <p className="text-sm font-medium">
                  {formatarData(p.data)}
                  {p.forma && <span className="font-normal text-texto-suave"> · {FORMA_PAGAMENTO[p.forma]}</span>}
                </p>
                {p.atendimentoId ? (
                  <Link to="/suporte" className="inline-flex items-center gap-1 text-xs text-destaque-700 hover:underline">
                    <Headset className="size-3" aria-hidden="true" /> Via atendimento de suporte
                  </Link>
                ) : (
                  p.observacoes && <p className="truncate text-xs text-texto-suave">{p.observacoes}</p>
                )}
              </div>
              <span className="tabular ml-auto whitespace-nowrap text-right text-sm font-medium sm:w-28">{formatarMoeda(p.valorCentavos)}</span>
              {p.atendimentoId ? (
                <span className="w-[72px] text-center text-[11px] leading-tight text-texto-suave" title="Altere pelo módulo Suporte">
                  pelo Suporte
                </span>
              ) : (
                <Acoes
                  rotulo={`pagamento de ${formatarData(p.data)}`}
                  aoEditar={() => setPagamentoForm({ aberto: true, item: p })}
                  aoExcluir={() => setExclusao({ tipo: 'pagamento', item: p })}
                />
              )}
            </li>
          )}
          rodape={pagamentos?.length ? `${pagamentos.length} pagamento(s) · ${formatarMoeda(totalPagamentos)}` : null}
        />
      </Cartao>

      <FormularioServico
        aberto={servicoForm.aberto}
        projetoId={projeto.id}
        servico={servicoForm.item}
        aoFechar={() => setServicoForm({ aberto: false, item: null })}
        aoSalvar={salvo}
      />
      <FormularioPagamento
        aberto={pagamentoForm.aberto}
        pagamento={pagamentoForm.item}
        projetoFixo={{ id: projeto.id, nome: projeto.nome }}
        pendenteCentavos={projeto.financeiro.pendenteCentavos}
        aoFechar={() => setPagamentoForm({ aberto: false, item: null })}
        aoSalvar={salvo}
      />
      <Confirmacao
        aberto={Boolean(exclusao)}
        titulo={exclusao?.tipo === 'servico' ? 'Excluir serviço?' : 'Excluir pagamento?'}
        processando={excluindo}
        aoCancelar={() => setExclusao(null)}
        aoConfirmar={excluir}
        mensagem={
          exclusao && (
            <>
              {exclusao.tipo === 'servico' ? (
                <>
                  O serviço <strong className="text-texto">{exclusao.item.descricao}</strong> ({formatarMoeda(exclusao.item.valorCentavos)}) deixa de
                  somar ao total do projeto.
                </>
              ) : (
                <>
                  O pagamento de <strong className="text-texto">{formatarMoeda(exclusao.item.valorCentavos)}</strong> em{' '}
                  {formatarData(exclusao.item.data)} deixa de contar como recebido.
                </>
              )}{' '}
              Ele vai para a lixeira e pode ser restaurado pela área de Backup.
            </>
          )
        }
      />
    </>
  );
}

function Lista<T>({
  carregando,
  erro,
  vazio,
  itens,
  render,
  rodape,
}: {
  carregando: boolean;
  erro: boolean;
  vazio: string;
  itens: T[];
  render: (item: T) => ReactNode;
  rodape: string | null;
}) {
  if (erro) return <p className="px-5 py-6 text-sm text-perigo">Não foi possível carregar. Recarregue a página.</p>;
  if (carregando) return <div className="m-5 h-10 animate-pulse rounded-lg bg-fundo" aria-busy="true" />;
  if (!itens.length) return <p className="px-5 py-6 text-sm text-texto-suave">{vazio}</p>;
  return (
    <>
      <ul className="flex-1 divide-y divide-borda">{itens.map(render)}</ul>
      {rodape && <p className="tabular border-t border-borda px-5 py-2.5 text-right text-xs text-texto-suave">{rodape}</p>}
    </>
  );
}

function Acoes({ rotulo, aoEditar, aoExcluir }: { rotulo: string; aoEditar: () => void; aoExcluir: () => void }) {
  return (
    <div className="flex shrink-0">
      <button
        type="button"
        onClick={aoEditar}
        className="grid size-9 place-items-center rounded-lg text-texto-suave hover:bg-fundo hover:text-texto"
        aria-label={`Editar ${rotulo}`}
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        onClick={aoExcluir}
        className="grid size-9 place-items-center rounded-lg text-texto-suave hover:bg-red-50 hover:text-perigo"
        aria-label={`Excluir ${rotulo}`}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
