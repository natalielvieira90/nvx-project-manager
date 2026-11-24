import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Clock, FileCheck2, FileText, Pencil, Timer, Trash2, Wallet } from 'lucide-react';
import { Botao, Cartao, EstadoVazio, cx } from '../../components/ui.tsx';
import { Confirmacao, Modal } from '../../components/Modal.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { STATUS_PROJETO } from '../../lib/rotulos.ts';
import { STATUS_PROJETO_VALORES } from '../../../shared/esquemas.ts';
import { formatarData, formatarDuracao, formatarDuracaoCurta, formatarMoeda } from '../../../shared/formatacao.ts';
import { STATUS_CONTRATADOS } from '../../../shared/financeiro.ts';
import type { ProjetoDetalhe, StatusProjeto } from '../../../shared/tipos.ts';
import { FormularioProjeto } from './FormularioProjeto.tsx';
import { Prazo, ProgressoHoras } from './componentes.tsx';
import { SecaoFinanceira } from './SecaoFinanceira.tsx';
import { FormularioDesconto } from '../financeiro/formularios.tsx';

export function DetalheProjeto() {
  const { id } = useParams();
  const navegar = useNavigate();
  const aviso = useAviso();
  const [projeto, setProjeto] = useState<ProjetoDetalhe | null>(null);
  const [erro, setErro] = useState<{ texto: string; status: number } | null>(null);
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [trocandoStatus, setTrocandoStatus] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const [editandoDesconto, setEditandoDesconto] = useState(false);
  const [faturando, setFaturando] = useState<'confirmar' | 'salvando' | null>(null);

  useEffect(() => {
    let ativo = true;
    api<ProjetoDetalhe>(`/projetos/${id}`)
      .then((p) => ativo && (setProjeto(p), setErro(null)))
      .catch((e: unknown) =>
        ativo && setErro(e instanceof ErroApi ? { texto: e.message, status: e.status } : { texto: 'Erro inesperado.', status: 0 }),
      );
    return () => {
      ativo = false;
    };
  }, [id, recarregar]);

  async function trocarStatus(status: StatusProjeto) {
    if (!projeto || status === projeto.status) return;
    setTrocandoStatus(true);
    try {
      await api(`/projetos/${projeto.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      aviso.sucesso(`Status alterado para "${STATUS_PROJETO[status].rotulo}".`);
      setRecarregar((n) => n + 1);
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível alterar o status.');
    } finally {
      setTrocandoStatus(false);
    }
  }

  async function faturarExtras() {
    if (!projeto) return;
    setFaturando('salvando');
    try {
      const r = await api<{ lancamentos: number; servicos: number; atendimentos: number }>(
        `/financeiro/projetos/${projeto.id}/faturar`,
        { method: 'POST' },
      );
      const partes = [
        r.lancamentos && `${r.lancamentos} lançamento(s) de horas`,
        r.servicos && `${r.servicos} serviço(s)`,
        r.atendimentos && `${r.atendimentos} atendimento(s)`,
      ].filter(Boolean);
      aviso.sucesso(`Marcados como faturados: ${partes.join(', ') || 'nada pendente'}.`);
      setRecarregar((n) => n + 1);
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível marcar como faturado.');
    } finally {
      setFaturando(null);
    }
  }

  async function excluir() {
    if (!projeto) return;
    setExcluindo(true);
    try {
      await api(`/projetos/${projeto.id}`, { method: 'DELETE' });
      aviso.sucesso(`"${projeto.nome}" foi movido para a lixeira.`);
      navegar('/projetos');
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível excluir o projeto.');
      setConfirmando(false);
    } finally {
      setExcluindo(false);
    }
  }

  const voltar = (
    <Link to="/projetos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-texto-suave hover:text-texto">
      <ArrowLeft className="size-4" aria-hidden="true" /> Projetos
    </Link>
  );

  if (erro) {
    return (
      <>
        {voltar}
        <Cartao>
          <EstadoVazio
            icone={CircleAlert}
            titulo={erro.status === 404 ? 'Projeto não encontrado' : 'Não foi possível carregar o projeto'}
            descricao={erro.status === 404 ? 'Ele pode ter sido excluído.' : erro.texto}
            acao={erro.status !== 404 && <Botao onClick={() => setRecarregar((n) => n + 1)}>Tentar novamente</Botao>}
          />
        </Cartao>
      </>
    );
  }
  if (!projeto) {
    return (
      <>
        {voltar}
        <div className="h-24 animate-pulse rounded-cartao bg-superficie" aria-busy="true" />
      </>
    );
  }

  const f = projeto.financeiro;
  const contratado = (STATUS_CONTRATADOS as readonly string[]).includes(projeto.status);
  const semValorHora = !projeto.valorHoraDevCentavos && !projeto.valorHoraSuporteCentavos;
  const registros = projeto.contagem.lancamentos + projeto.contagem.atendimentos + projeto.contagem.pagamentos + projeto.contagem.servicos;

  return (
    <>
      {voltar}
      <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{projeto.nome}</h1>
          <p className="mt-1 text-sm text-texto-suave">
            Cliente:{' '}
            <Link to={`/clientes/${projeto.clienteId}`} className="font-medium text-destaque-700 hover:underline">
              {projeto.clienteNome}
            </Link>
            {projeto.clienteEmpresa && ` · ${projeto.clienteEmpresa}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="status-projeto">
            Status do projeto
          </label>
          <select
            id="status-projeto"
            value={projeto.status}
            disabled={trocandoStatus}
            onChange={(e) => trocarStatus(e.target.value as StatusProjeto)}
            className="h-10 rounded-md border border-borda bg-superficie px-3 pr-8 text-sm font-medium focus:border-destaque-500"
          >
            {STATUS_PROJETO_VALORES.map((s) => (
              <option key={s} value={s}>
                {STATUS_PROJETO[s].rotulo}
              </option>
            ))}
          </select>
          <Botao variante="secundario" icone={FileText} onClick={() => navegar(`/relatorios?tipo=fechamento&projeto=${projeto.id}`)}>
            Fechamento
          </Botao>
          <Botao variante="secundario" icone={Pencil} onClick={() => setEditando(true)}>
            Editar
          </Botao>
          <Botao variante="secundario" icone={Trash2} onClick={() => setConfirmando(true)} className="text-perigo">
            Excluir
          </Botao>
        </div>
      </header>

      {projeto.cronometroAtivo && (
        <div className="mb-6 flex items-center gap-3 rounded-cartao border border-lima-600/30 bg-lima-100 px-4 py-3 text-sm text-marca-900" role="status">
          <Timer className="size-4 shrink-0" aria-hidden="true" /> Há um cronômetro em andamento neste projeto.
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-3">
        {/* Financeiro */}
        <Cartao className="p-5 xl:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="size-4 text-texto-suave" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Resumo financeiro</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Numero rotulo="Total a cobrar" valor={formatarMoeda(f.totalCentavos)} destaque />
            <Numero rotulo="Recebido" valor={formatarMoeda(f.recebidoCentavos)} />
            <Numero
              rotulo="Pendente"
              valor={contratado ? formatarMoeda(f.pendenteCentavos) : '—'}
              alerta={contratado && f.pendenteCentavos > 0}
              dica={contratado ? undefined : 'Só há pendência em projetos contratados.'}
            />
          </div>
          <dl className="mt-5 divide-y divide-borda border-t border-borda text-sm">
            <Linha rotulo="Valor fechado" valor={formatarMoeda(f.valorFechadoCentavos)} />
            <Linha rotulo="Serviços adicionais" valor={formatarMoeda(f.servicosAdicionaisCentavos)} />
            <Linha
              rotulo="Horas de desenvolvimento faturáveis"
              detalhe={projeto.valorHoraDevCentavos ? `${formatarMoeda(projeto.valorHoraDevCentavos)}/h` : 'valor/hora não definido'}
              valor={formatarMoeda(f.horasDevCentavos)}
            />
            <Linha
              rotulo="Horas de suporte faturáveis"
              detalhe={projeto.valorHoraSuporteCentavos ? `${formatarMoeda(projeto.valorHoraSuporteCentavos)}/h` : 'valor/hora não definido'}
              valor={formatarMoeda(f.horasSuporteCentavos)}
            />
            <Linha rotulo="Atendimentos de suporte" valor={formatarMoeda(f.atendimentosCentavos)} />
            <div className="flex items-center justify-between gap-4 py-2">
              <dt className="text-texto-suave">
                Desconto
                <button
                  type="button"
                  onClick={() => setEditandoDesconto(true)}
                  className="ml-2 text-xs font-medium text-destaque-700 hover:underline"
                >
                  {f.descontoCentavos ? 'Alterar' : 'Aplicar desconto'}
                </button>
              </dt>
              <dd className="tabular whitespace-nowrap font-medium">
                {f.descontoCentavos ? `− ${formatarMoeda(f.descontoCentavos)}` : formatarMoeda(0)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-texto-suave">Horas marcadas como "incluídas no pacote" não somam ao total.</p>

          {f.aFaturarCentavos > 0 && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <p>
                <strong className="tabular">{formatarMoeda(f.aFaturarCentavos)}</strong> em extras ainda não faturados (horas
                faturáveis, serviços e atendimentos pendentes).
              </p>
              <Botao variante="secundario" icone={FileCheck2} className="h-8 shrink-0 px-3" onClick={() => setFaturando('confirmar')}>
                Marcar como faturados
              </Botao>
            </div>
          )}

          <p className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-texto-suave">Custo estimado × receita</p>
          <dl className="divide-y divide-borda text-sm">
            <Linha
              rotulo="Custo estimado das horas"
              detalhe={`${formatarDuracaoCurta(projeto.horas.totalSegundos)} × valor/hora`}
              valor={semValorHora ? '—' : formatarMoeda(f.custoHorasCentavos)}
            />
            <Linha rotulo="Receita obtida (recebido)" valor={formatarMoeda(f.recebidoCentavos)} />
            <Linha
              rotulo="Total do projeto − custo das horas"
              valor={semValorHora ? '—' : `${f.resultadoCentavos < 0 ? '− ' : ''}${formatarMoeda(Math.abs(f.resultadoCentavos))}`}
              tom={semValorHora ? undefined : f.resultadoCentavos < 0 ? 'perigo' : 'sucesso'}
            />
            <Linha
              rotulo="Valor efetivo por hora"
              detalhe="total ÷ horas trabalhadas"
              valor={f.valorHoraEfetivoCentavos === null ? '—' : `${formatarMoeda(f.valorHoraEfetivoCentavos)}/h`}
            />
          </dl>
          <p className="mt-3 text-xs text-texto-suave">
            {semValorHora
              ? 'Defina o valor da hora no projeto para calcular o custo estimado.'
              : 'O custo estimado considera todas as horas trabalhadas (inclusive as do pacote) pelo valor/hora do projeto.'}
          </p>
        </Cartao>

        {/* Horas */}
        <Cartao className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="size-4 text-texto-suave" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Horas trabalhadas</h2>
          </div>
          {projeto.estimativaSegundos ? (
            <ProgressoHoras trabalhadas={projeto.horas.totalSegundos} estimativa={projeto.estimativaSegundos} />
          ) : (
            <p className="tabular text-2xl font-semibold">{formatarDuracao(projeto.horas.totalSegundos)}</p>
          )}
          <dl className="mt-4 divide-y divide-borda border-t border-borda text-sm">
            <Linha rotulo="Desenvolvimento" valor={formatarDuracao(projeto.horas.desenvolvimentoSegundos)} />
            <Linha rotulo="Suporte" valor={formatarDuracao(projeto.horas.suporteSegundos)} />
          </dl>
          <p className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-texto-suave">Cobrança das horas</p>
          <dl className="divide-y divide-borda text-sm">
            <Linha rotulo="Incluídas no pacote" valor={formatarDuracao(projeto.cobranca.incluidoPacoteSegundos)} />
            <Linha rotulo="Faturáveis (a cobrar)" valor={formatarDuracao(projeto.cobranca.faturavelSegundos)} />
            <Linha rotulo="Já faturadas" valor={formatarDuracao(projeto.cobranca.faturadoSegundos)} />
          </dl>
        </Cartao>

        <SecaoFinanceira projeto={projeto} aoAlterar={() => setRecarregar((n) => n + 1)} />

        {/* Informações */}
        <Cartao className="p-5 xl:col-span-3">
          <h2 className="mb-4 text-sm font-semibold">Informações do projeto</h2>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Info rotulo="Data de início" valor={formatarData(projeto.dataInicio)} />
            <Info rotulo="Prazo de entrega" valor={<Prazo prazo={projeto.prazoEntrega} status={projeto.status} />} />
            <Info rotulo="Estimativa" valor={projeto.estimativaSegundos ? formatarDuracao(projeto.estimativaSegundos) : '—'} />
            <Info rotulo="Cadastrado em" valor={formatarData(projeto.criadoEm)} />
          </dl>
          {(projeto.descricao || projeto.observacoes) && (
            <div className="mt-5 grid gap-5 border-t border-borda pt-4 sm:grid-cols-2">
              {projeto.descricao && <Texto rotulo="Descrição" texto={projeto.descricao} />}
              {projeto.observacoes && <Texto rotulo="Observações" texto={projeto.observacoes} />}
            </div>
          )}
        </Cartao>
      </div>

      <FormularioProjeto
        aberto={editando}
        projeto={projeto}
        aoFechar={() => setEditando(false)}
        aoSalvar={() => {
          setEditando(false);
          setRecarregar((n) => n + 1);
        }}
      />

      <FormularioDesconto
        aberto={editandoDesconto}
        projetoId={projeto.id}
        descontoCentavos={f.descontoCentavos}
        brutoCentavos={f.brutoCentavos}
        aoFechar={() => setEditandoDesconto(false)}
        aoSalvar={() => {
          setEditandoDesconto(false);
          setRecarregar((n) => n + 1);
        }}
      />

      <Modal
        aberto={faturando !== null}
        aoFechar={() => setFaturando(null)}
        bloquearFechamento={faturando === 'salvando'}
        titulo="Marcar extras como faturados?"
        largura="max-w-md"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setFaturando(null)} disabled={faturando === 'salvando'} data-autofoco>
              Cancelar
            </Botao>
            <Botao onClick={faturarExtras} disabled={faturando === 'salvando'}>
              {faturando === 'salvando' ? 'Salvando…' : 'Marcar como faturados'}
            </Botao>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-texto-suave">
          Use quando enviar a cobrança ao cliente. Horas faturáveis, serviços adicionais a faturar e atendimentos pendentes deste
          projeto ({formatarMoeda(f.aFaturarCentavos)}) passam para <strong className="text-texto">faturado</strong>. O total não muda
          e horas incluídas no pacote não são alteradas. Cada item pode ser ajustado depois na sua tela.
        </p>
      </Modal>

      <Confirmacao
        aberto={confirmando}
        titulo={projeto.cronometroAtivo ? 'Não é possível excluir' : 'Excluir projeto?'}
        apenasAviso={projeto.cronometroAtivo}
        processando={excluindo}
        aoCancelar={() => setConfirmando(false)}
        aoConfirmar={excluir}
        mensagem={
          projeto.cronometroAtivo ? (
            'Há um cronômetro em andamento neste projeto. Finalize-o antes de excluir.'
          ) : (
            <>
              <strong className="text-texto">{projeto.nome}</strong> será movido para a lixeira
              {registros > 0 && (
                <>
                  {' '}
                  junto com seus registros ({projeto.contagem.lancamentos} lançamento(s) de horas, {projeto.contagem.atendimentos}{' '}
                  atendimento(s), {projeto.contagem.pagamentos} pagamento(s))
                </>
              )}
              . Eles deixam de aparecer nos cálculos e relatórios, mas podem ser restaurados pela área de Backup.
            </>
          )
        }
      />
    </>
  );
}

function Numero({
  rotulo,
  valor,
  destaque,
  alerta,
  dica,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  alerta?: boolean;
  dica?: string;
}) {
  return (
    <div className={cx('rounded-lg px-4 py-3', destaque ? 'bg-marca-900 text-white' : 'bg-fundo')} title={dica}>
      <p className={cx('text-xs', destaque ? 'text-white/70' : 'text-texto-suave')}>{rotulo}</p>
      <p className={cx('numero-destaque mt-1 whitespace-nowrap text-lg font-semibold', alerta && 'text-alerta')}>{valor}</p>
    </div>
  );
}

function Linha({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: string; tom?: 'sucesso' | 'perigo' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-texto-suave">
        {rotulo}
        {detalhe && <span className="ml-1.5 text-xs text-texto-suave/70">({detalhe})</span>}
      </dt>
      <dd className={cx('tabular whitespace-nowrap font-medium', tom === 'sucesso' && 'text-sucesso', tom === 'perigo' && 'text-perigo')}>
        {valor}
      </dd>
    </div>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-texto-suave">{rotulo}</dt>
      <dd className="mt-0.5">{valor}</dd>
    </div>
  );
}

function Texto({ rotulo, texto }: { rotulo: string; texto: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-texto-suave">{rotulo}</p>
      <p className="whitespace-pre-wrap text-sm">{texto}</p>
    </div>
  );
}
