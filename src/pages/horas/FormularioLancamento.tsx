import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal.tsx';
import { Botao } from '../../components/ui.tsx';
import { CampoAreaTexto, CampoSelecao, CampoTexto } from '../../components/formulario.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { CATEGORIA_HORA, SITUACAO_COBRANCA } from '../../lib/rotulos.ts';
import { CATEGORIAS_HORA, errosPorCampo, esquemaLancamento, SITUACOES_COBRANCA } from '../../../shared/esquemas.ts';
import { situacaoPadrao } from '../../../shared/financeiro.ts';
import { formatarDuracao, hojeIso } from '../../../shared/formatacao.ts';
import type { CategoriaHora, Lancamento, ProjetoResumo, SituacaoCobranca } from '../../../shared/tipos.ts';
import { isoParaDataLocal, isoParaHoraLocal, localParaIso } from './apoio.ts';

interface Campos {
  projetoId: string;
  categoria: CategoriaHora;
  data: string;
  horaInicio: string;
  horaFim: string;
  descricao: string;
  situacaoCobranca: SituacaoCobranca;
}

/** Lançamento manual de horas (novo ou edição). */
export function FormularioLancamento({
  aberto,
  lancamento,
  projetos,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  lancamento?: Lancamento | null;
  projetos: ProjetoResumo[] | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const aviso = useAviso();
  const edicao = Boolean(lancamento);
  const [campos, setCampos] = useState<Campos>({
    projetoId: '',
    categoria: 'desenvolvimento',
    data: hojeIso(),
    horaInicio: '',
    horaFim: '',
    descricao: '',
    situacaoCobranca: 'incluido_pacote',
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  // Usuário escolheu a cobrança manualmente? Se não, ela acompanha projeto/categoria.
  const [cobrancaManual, setCobrancaManual] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setCobrancaManual(edicao);
    setCampos(
      lancamento
        ? {
            projetoId: String(lancamento.projetoId),
            categoria: lancamento.categoria,
            data: isoParaDataLocal(lancamento.inicio),
            horaInicio: isoParaHoraLocal(lancamento.inicio),
            horaFim: isoParaHoraLocal(lancamento.fim),
            descricao: lancamento.descricao ?? '',
            situacaoCobranca: lancamento.situacaoCobranca,
          }
        : { projetoId: '', categoria: 'desenvolvimento', data: hojeIso(), horaInicio: '', horaFim: '', descricao: '', situacaoCobranca: 'incluido_pacote' },
    );
  }, [aberto, lancamento, edicao]);

  const alterar = <K extends keyof Campos>(campo: K, valor: Campos[K]) => {
    setCampos((c) => {
      const novo = { ...c, [campo]: valor };
      if (!cobrancaManual && (campo === 'projetoId' || campo === 'categoria')) {
        const p = projetos?.find((x) => String(x.id) === novo.projetoId);
        novo.situacaoCobranca = situacaoPadrao(novo.categoria, p?.valorFechadoCentavos ?? 0);
      }
      return novo;
    });
    setErros((e) => {
      const r = { ...e };
      delete r[campo];
      if (campo === 'horaInicio' || campo === 'data') delete r.inicio;
      if (campo === 'horaFim') delete r.fim;
      return r;
    });
  };

  // Calcula início/fim; se o fim for menor ou igual ao início, entende que passa da meia-noite.
  const horarios = useMemo(() => {
    // Horários não alterados na edição: mantém os valores exatos (com segundos), preservando
    // a duração de lançamentos do cronômetro (que desconta pausas).
    if (
      lancamento &&
      campos.data === isoParaDataLocal(lancamento.inicio) &&
      campos.horaInicio === isoParaHoraLocal(lancamento.inicio) &&
      campos.horaFim === isoParaHoraLocal(lancamento.fim)
    ) {
      return { inicio: lancamento.inicio, fim: lancamento.fim, viraDia: isoParaDataLocal(lancamento.fim) !== campos.data, duracao: lancamento.duracaoSegundos };
    }
    const inicio = localParaIso(campos.data, campos.horaInicio);
    let fim = localParaIso(campos.data, campos.horaFim);
    let viraDia = false;
    if (inicio && fim && fim <= inicio) {
      fim = localParaIso(campos.data, campos.horaFim, 1);
      viraDia = true;
    }
    const duracao = inicio && fim ? (Date.parse(fim) - Date.parse(inicio)) / 1000 : 0;
    return { inicio, fim, viraDia, duracao };
  }, [campos.data, campos.horaInicio, campos.horaFim, lancamento]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const locais: Record<string, string> = {};
    if (!campos.data) locais.data = 'Informe a data.';
    if (!campos.horaInicio) locais.horaInicio = 'Informe o horário inicial.';
    if (!campos.horaFim) locais.horaFim = 'Informe o horário final.';
    const dados = {
      projetoId: Number(campos.projetoId) || 0,
      categoria: campos.categoria,
      descricao: campos.descricao,
      inicio: horarios.inicio ?? '',
      fim: horarios.fim ?? '',
      situacaoCobranca: campos.situacaoCobranca,
    };
    const v = esquemaLancamento.safeParse(dados);
    const todos = { ...(v.success ? {} : errosPorCampo(v.error)), ...locais };
    // Mostra os erros de horário nos campos de hora.
    if (todos.inicio && !locais.horaInicio) todos.horaInicio = todos.inicio;
    if (todos.fim && !locais.horaFim) todos.horaFim = todos.fim;
    if (Object.keys(todos).length) {
      setErros(todos);
      return;
    }
    setSalvando(true);
    try {
      await api(edicao ? `/lancamentos/${lancamento!.id}` : '/lancamentos', {
        method: edicao ? 'PUT' : 'POST',
        body: JSON.stringify(dados),
      });
      aviso.sucesso(edicao ? 'Lançamento atualizado.' : `Lançamento de ${formatarDuracao(horarios.duracao)} salvo.`);
      aoSalvar();
    } catch (erro) {
      if (erro instanceof ErroApi && erro.detalhes) {
        const d = erro.detalhes as Record<string, string>;
        setErros({ ...d, ...(d.inicio && { horaInicio: d.inicio }), ...(d.fim && { horaFim: d.fim }) });
      } else aviso.erro(erro instanceof ErroApi ? erro.message : 'Não foi possível salvar o lançamento.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      bloquearFechamento={salvando}
      titulo={edicao ? 'Editar lançamento' : 'Lançar horas'}
      descricao={edicao && lancamento?.origem === 'cronometro' ? 'Registrado pelo cronômetro.' : 'Registre um período trabalhado.'}
      largura="max-w-2xl"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-lancamento" disabled={salvando}>
            {salvando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Salvar lançamento'}
          </Botao>
        </>
      }
    >
      <form id="form-lancamento" onSubmit={salvar} noValidate className="grid gap-4 sm:grid-cols-6">
        <CampoSelecao
          rotulo="Projeto"
          obrigatorio
          className="sm:col-span-4"
          value={campos.projetoId}
          onChange={(e) => alterar('projetoId', e.target.value)}
          erro={erros.projetoId}
          disabled={!projetos}
        >
          <option value="">{projetos ? 'Selecione…' : 'Carregando…'}</option>
          {projetos?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} — {p.clienteNome}
            </option>
          ))}
        </CampoSelecao>
        <CampoSelecao
          rotulo="Categoria"
          className="sm:col-span-2"
          value={campos.categoria}
          onChange={(e) => alterar('categoria', e.target.value as CategoriaHora)}
          erro={erros.categoria}
        >
          {CATEGORIAS_HORA.map((c) => (
            <option key={c} value={c}>
              {CATEGORIA_HORA[c]}
            </option>
          ))}
        </CampoSelecao>
        <CampoTexto
          rotulo="Data"
          obrigatorio
          type="date"
          className="sm:col-span-2"
          value={campos.data}
          max={hojeIso()}
          onChange={(e) => alterar('data', e.target.value)}
          erro={erros.data}
        />
        <CampoTexto
          rotulo="Início"
          obrigatorio
          type="time"
          className="sm:col-span-2"
          value={campos.horaInicio}
          onChange={(e) => alterar('horaInicio', e.target.value)}
          erro={erros.horaInicio}
        />
        <CampoTexto
          rotulo="Fim"
          obrigatorio
          type="time"
          className="sm:col-span-2"
          value={campos.horaFim}
          onChange={(e) => alterar('horaFim', e.target.value)}
          erro={erros.horaFim}
          dica={horarios.duracao > 0 ? `${formatarDuracao(horarios.duracao)}${horarios.viraDia ? ' · termina no dia seguinte' : ''}` : undefined}
        />
        <CampoAreaTexto
          rotulo="Descrição da atividade"
          className="sm:col-span-6"
          value={campos.descricao}
          onChange={(e) => alterar('descricao', e.target.value)}
          erro={erros.descricao}
          maxLength={1000}
        />
        <CampoSelecao
          rotulo="Cobrança"
          className="sm:col-span-6"
          value={campos.situacaoCobranca}
          onChange={(e) => {
            setCobrancaManual(true);
            alterar('situacaoCobranca', e.target.value as SituacaoCobranca);
          }}
          dica={SITUACAO_COBRANCA[campos.situacaoCobranca].dica}
          erro={erros.situacaoCobranca}
        >
          {SITUACOES_COBRANCA.map((s) => (
            <option key={s} value={s}>
              {SITUACAO_COBRANCA[s].rotulo}
            </option>
          ))}
        </CampoSelecao>
      </form>
    </Modal>
  );
}
