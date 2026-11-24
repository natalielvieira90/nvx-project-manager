import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Timer } from 'lucide-react';
import { Modal } from '../../components/Modal.tsx';
import { Botao } from '../../components/ui.tsx';
import { CampoAreaTexto, CampoMoeda, CampoSelecao, CampoTexto } from '../../components/formulario.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { SITUACAO_ATENDIMENTO } from '../../lib/rotulos.ts';
import { errosPorCampo, esquemaAtendimento, SITUACOES_ATENDIMENTO } from '../../../shared/esquemas.ts';
import {
  centavosParaTexto,
  formatarDataHora,
  formatarDuracao,
  formatarHora,
  formatarMoeda,
  hojeIso,
  reaisParaCentavos,
  valorPorTempo,
} from '../../../shared/formatacao.ts';
import type { Atendimento, Lancamento, ProjetoResumo, SituacaoAtendimento } from '../../../shared/tipos.ts';
import { isoParaDataLocal, isoParaHoraLocal, localParaIso } from '../horas/apoio.ts';

interface Campos {
  clienteId: string;
  projetoId: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  problema: string;
  solucao: string;
  valor: string;
  situacao: SituacaoAtendimento;
}

/**
 * Registro/edição de atendimento. Com `lancamentoOrigem`, cria o atendimento a partir de um
 * lançamento de suporte (horários travados, vindos do cronômetro ou do lançamento manual).
 */
export function FormularioAtendimento({
  aberto,
  atendimento,
  lancamentoOrigem,
  projetos,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  atendimento?: Atendimento | null;
  lancamentoOrigem?: Lancamento | null;
  projetos: ProjetoResumo[] | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const aviso = useAviso();
  const edicao = Boolean(atendimento);
  const travado = Boolean(lancamentoOrigem || atendimento?.lancamentoId);
  const [campos, setCampos] = useState<Campos>(vazio());
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [valorManual, setValorManual] = useState(false);

  // Clientes = donos dos projetos disponíveis.
  const clientes = useMemo(() => {
    const mapa = new Map<number, string>();
    projetos?.forEach((p) => mapa.set(p.clienteId, p.clienteNome));
    return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [projetos]);
  const projetosDoCliente = projetos?.filter((p) => String(p.clienteId) === campos.clienteId) ?? [];
  const projeto = projetos?.find((p) => String(p.id) === campos.projetoId);

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    if (atendimento) {
      setValorManual(true);
      setCampos({
        clienteId: String(atendimento.clienteId),
        projetoId: String(atendimento.projetoId),
        data: isoParaDataLocal(atendimento.inicio),
        horaInicio: isoParaHoraLocal(atendimento.inicio),
        horaFim: isoParaHoraLocal(atendimento.fim),
        problema: atendimento.problema,
        solucao: atendimento.solucao ?? '',
        valor: centavosParaTexto(atendimento.valorCentavos),
        situacao: atendimento.situacao,
      });
    } else if (lancamentoOrigem) {
      setValorManual(false);
      const p = projetos?.find((x) => x.id === lancamentoOrigem.projetoId);
      setCampos({
        ...vazio(),
        clienteId: String(p?.clienteId ?? ''),
        projetoId: String(lancamentoOrigem.projetoId),
        data: isoParaDataLocal(lancamentoOrigem.inicio),
        horaInicio: isoParaHoraLocal(lancamentoOrigem.inicio),
        horaFim: isoParaHoraLocal(lancamentoOrigem.fim),
        problema: lancamentoOrigem.descricao ?? '',
      });
    } else {
      setValorManual(false);
      setCampos(vazio());
    }
  }, [aberto, atendimento, lancamentoOrigem, projetos]);

  // Horários e duração (travados quando vêm de um lançamento).
  const horarios = useMemo(() => {
    if (lancamentoOrigem) return { inicio: lancamentoOrigem.inicio, fim: lancamentoOrigem.fim, duracao: lancamentoOrigem.duracaoSegundos };
    if (atendimento?.lancamentoId) return { inicio: atendimento.inicio, fim: atendimento.fim, duracao: atendimento.duracaoSegundos };
    const inicio = localParaIso(campos.data, campos.horaInicio);
    let fim = localParaIso(campos.data, campos.horaFim);
    if (inicio && fim && fim <= inicio) fim = localParaIso(campos.data, campos.horaFim, 1);
    return { inicio, fim, duracao: inicio && fim ? (Date.parse(fim) - Date.parse(inicio)) / 1000 : 0 };
  }, [campos.data, campos.horaInicio, campos.horaFim, lancamentoOrigem, atendimento]);

  const sugerido = projeto?.valorHoraSuporteCentavos ? valorPorTempo(horarios.duracao, projeto.valorHoraSuporteCentavos) : 0;

  // Preenche o valor sugerido enquanto o usuário não digitar um valor próprio.
  useEffect(() => {
    if (aberto && !valorManual) setCampos((c) => ({ ...c, valor: centavosParaTexto(sugerido) }));
  }, [sugerido, aberto, valorManual]);

  const alterar = <K extends keyof Campos>(campo: K, valor: Campos[K]) => {
    setCampos((c) => {
      const novo = { ...c, [campo]: valor };
      if (campo === 'clienteId') novo.projetoId = '';
      return novo;
    });
    setErros((e) => {
      const r = { ...e };
      delete r[campo];
      if (campo === 'projetoId' || campo === 'clienteId') delete r.projetoId;
      if (campo === 'valor') delete r.valorCentavos;
      if (campo === 'horaInicio' || campo === 'data') delete r.inicio;
      if (campo === 'horaFim') delete r.fim;
      return r;
    });
  };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const locais: Record<string, string> = {};
    if (!campos.clienteId) locais.clienteId = 'Selecione o cliente.';
    let valorCentavos = 0;
    if (campos.valor.trim()) {
      const v = reaisParaCentavos(campos.valor);
      if (v === null || v < 0) locais.valorCentavos = 'Valor inválido. Ex.: 150,00';
      else valorCentavos = v;
    }
    const dados = {
      projetoId: Number(campos.projetoId) || 0,
      lancamentoId: lancamentoOrigem?.id ?? null,
      inicio: horarios.inicio ?? null,
      fim: horarios.fim ?? null,
      problema: campos.problema,
      solucao: campos.solucao,
      valorCentavos,
      situacao: campos.situacao,
    };
    const v = esquemaAtendimento.safeParse(dados);
    const todos: Record<string, string> = { ...(v.success ? {} : errosPorCampo(v.error)), ...locais };
    if (!travado) {
      if (!campos.horaInicio) todos.inicio = 'Informe o horário inicial.';
      if (!campos.horaFim) todos.fim = 'Informe o horário final.';
    }
    if (Object.keys(todos).length) {
      setErros(todos);
      return;
    }
    setSalvando(true);
    try {
      await api(edicao ? `/atendimentos/${atendimento!.id}` : '/atendimentos', {
        method: edicao ? 'PUT' : 'POST',
        body: JSON.stringify(dados),
      });
      aviso.sucesso(edicao ? 'Atendimento atualizado.' : 'Atendimento registrado.');
      aoSalvar();
    } catch (erro) {
      if (erro instanceof ErroApi && erro.detalhes) setErros(erro.detalhes as Record<string, string>);
      else aviso.erro(erro instanceof ErroApi ? erro.message : 'Não foi possível salvar o atendimento.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      bloquearFechamento={salvando}
      titulo={edicao ? 'Editar atendimento' : 'Registrar atendimento'}
      descricao="Campos com * são obrigatórios."
      largura="max-w-2xl"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-atendimento" disabled={salvando}>
            {salvando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Registrar atendimento'}
          </Botao>
        </>
      }
    >
      <form id="form-atendimento" onSubmit={salvar} noValidate className="grid gap-4 sm:grid-cols-6">
        <CampoSelecao
          rotulo="Cliente"
          obrigatorio
          className="sm:col-span-3"
          value={campos.clienteId}
          disabled={!projetos || travado}
          onChange={(e) => alterar('clienteId', e.target.value)}
          erro={erros.clienteId}
        >
          <option value="">{projetos ? 'Selecione…' : 'Carregando…'}</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </CampoSelecao>
        <CampoSelecao
          rotulo="Projeto"
          obrigatorio
          className="sm:col-span-3"
          value={campos.projetoId}
          disabled={!campos.clienteId || travado}
          onChange={(e) => alterar('projetoId', e.target.value)}
          erro={erros.projetoId}
        >
          <option value="">{campos.clienteId ? 'Selecione…' : 'Escolha o cliente primeiro'}</option>
          {projetosDoCliente.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </CampoSelecao>

        {travado ? (
          <div className="flex items-center gap-3 rounded-lg bg-fundo px-4 py-3 text-sm sm:col-span-6">
            <Timer className="size-4 shrink-0 text-texto-suave" aria-hidden="true" />
            <span>
              {horarios.inicio && formatarDataHora(horarios.inicio)}–{horarios.fim && formatarHora(horarios.fim)} ·{' '}
              <strong>{formatarDuracao(horarios.duracao)}</strong>
              <span className="text-texto-suave"> · horário vindo do lançamento de horas (pausas descontadas)</span>
            </span>
          </div>
        ) : (
          <>
            <CampoTexto
              rotulo="Data"
              obrigatorio
              type="date"
              className="sm:col-span-2"
              value={campos.data}
              max={hojeIso()}
              onChange={(e) => alterar('data', e.target.value)}
            />
            <CampoTexto
              rotulo="Início"
              obrigatorio
              type="time"
              className="sm:col-span-2"
              value={campos.horaInicio}
              onChange={(e) => alterar('horaInicio', e.target.value)}
              erro={erros.inicio}
            />
            <CampoTexto
              rotulo="Fim"
              obrigatorio
              type="time"
              className="sm:col-span-2"
              value={campos.horaFim}
              onChange={(e) => alterar('horaFim', e.target.value)}
              erro={erros.fim}
              dica={horarios.duracao > 0 ? `Tempo total: ${formatarDuracao(horarios.duracao)}` : undefined}
            />
          </>
        )}

        <CampoAreaTexto
          rotulo="Descrição do problema"
          obrigatorio
          className="sm:col-span-6"
          value={campos.problema}
          maxLength={4000}
          onChange={(e) => alterar('problema', e.target.value)}
          erro={erros.problema}
        />
        <CampoAreaTexto
          rotulo="Solução aplicada"
          className="sm:col-span-6"
          value={campos.solucao}
          maxLength={4000}
          onChange={(e) => alterar('solucao', e.target.value)}
          erro={erros.solucao}
        />
        <CampoMoeda
          rotulo="Valor cobrado"
          className="sm:col-span-3"
          valor={campos.valor}
          aoMudar={(v) => {
            setValorManual(true);
            alterar('valor', v);
          }}
          erro={erros.valorCentavos}
          dica={
            projeto
              ? projeto.valorHoraSuporteCentavos
                ? `Sugerido: ${formatarMoeda(sugerido)} (${formatarDuracao(horarios.duracao)} × ${formatarMoeda(projeto.valorHoraSuporteCentavos)}/h)`
                : 'O projeto não tem valor de hora de suporte definido.'
              : undefined
          }
        />
        <CampoSelecao
          rotulo="Situação"
          className="sm:col-span-3"
          value={campos.situacao}
          onChange={(e) => alterar('situacao', e.target.value as SituacaoAtendimento)}
          dica={SITUACAO_ATENDIMENTO[campos.situacao].dica}
        >
          {SITUACOES_ATENDIMENTO.map((s) => (
            <option key={s} value={s}>
              {SITUACAO_ATENDIMENTO[s].rotulo}
            </option>
          ))}
        </CampoSelecao>
        {valorManual && sugerido > 0 && reaisParaCentavos(campos.valor) !== sugerido && (
          <button
            type="button"
            className="-mt-2 justify-self-start text-xs font-medium text-destaque-700 hover:underline sm:col-span-6"
            onClick={() => {
              setValorManual(false);
              alterar('valor', centavosParaTexto(sugerido));
            }}
          >
            Usar valor sugerido ({formatarMoeda(sugerido)})
          </button>
        )}
      </form>
    </Modal>
  );
}

function vazio(): Campos {
  return {
    clienteId: '',
    projetoId: '',
    data: hojeIso(),
    horaInicio: '',
    horaFim: '',
    problema: '',
    solucao: '',
    valor: '',
    situacao: 'pendente',
  };
}
