import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal.tsx';
import { Botao } from '../../components/ui.tsx';
import { CampoAreaTexto, CampoMoeda, CampoSelecao, CampoTexto } from '../../components/formulario.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { STATUS_PROJETO } from '../../lib/rotulos.ts';
import { errosPorCampo, esquemaProjeto, STATUS_PROJETO_VALORES } from '../../../shared/esquemas.ts';
import {
  centavosParaTexto,
  horasParaSegundos,
  reaisParaCentavos,
  segundosParaHorasTexto,
} from '../../../shared/formatacao.ts';
import type { ClienteResumo, Projeto, StatusProjeto } from '../../../shared/tipos.ts';

interface Campos {
  clienteId: string;
  nome: string;
  descricao: string;
  dataInicio: string;
  prazoEntrega: string;
  valorFechado: string;
  estimativa: string;
  valorHoraDev: string;
  valorHoraSuporte: string;
  status: StatusProjeto;
  observacoes: string;
}

function camposDe(p: Projeto | null | undefined, clienteIdInicial?: number): Campos {
  return {
    clienteId: String(p?.clienteId ?? clienteIdInicial ?? ''),
    nome: p?.nome ?? '',
    descricao: p?.descricao ?? '',
    dataInicio: p?.dataInicio ?? '',
    prazoEntrega: p?.prazoEntrega ?? '',
    valorFechado: centavosParaTexto(p?.valorFechadoCentavos ?? 0),
    estimativa: segundosParaHorasTexto(p?.estimativaSegundos ?? 0),
    valorHoraDev: centavosParaTexto(p?.valorHoraDevCentavos ?? 0),
    valorHoraSuporte: centavosParaTexto(p?.valorHoraSuporteCentavos ?? 0),
    status: p?.status ?? 'orcamento',
    observacoes: p?.observacoes ?? '',
  };
}

/** Modal de cadastro/edição de projeto. */
export function FormularioProjeto({
  aberto,
  projeto,
  clienteIdInicial,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  projeto?: Projeto | null;
  clienteIdInicial?: number;
  aoFechar: () => void;
  aoSalvar: (p: Projeto) => void;
}) {
  const [campos, setCampos] = useState<Campos>(() => camposDe(null));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [clientes, setClientes] = useState<ClienteResumo[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const aviso = useAviso();
  const edicao = Boolean(projeto);

  useEffect(() => {
    if (!aberto) return;
    setCampos(camposDe(projeto, clienteIdInicial));
    setErros({});
    api<ClienteResumo[]>('/clientes')
      .then(setClientes)
      .catch(() => aviso.erro('Não foi possível carregar a lista de clientes.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, projeto, clienteIdInicial]);

  const alterar = <K extends keyof Campos>(campo: K, valor: Campos[K]) => {
    setCampos((c) => ({ ...c, [campo]: valor }));
    setErros((e) => {
      const resto: Record<string, string> = { ...e };
      delete resto[campo];
      // Os campos de texto mapeiam para nomes da API; limpa ambos.
      const mapa: Record<string, string> = {
        valorFechado: 'valorFechadoCentavos',
        estimativa: 'estimativaSegundos',
        valorHoraDev: 'valorHoraDevCentavos',
        valorHoraSuporte: 'valorHoraSuporteCentavos',
      };
      if (mapa[campo]) delete resto[mapa[campo]];
      return resto;
    });
  };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const errosLocais: Record<string, string> = {};
    const dinheiro = (texto: string, campo: string) => {
      if (!texto.trim()) return 0;
      const c = reaisParaCentavos(texto);
      if (c === null || c < 0) errosLocais[campo] = 'Valor inválido. Ex.: 1.500,00';
      return c ?? 0;
    };
    let estimativaSegundos = 0;
    if (campos.estimativa.trim()) {
      const s = horasParaSegundos(campos.estimativa);
      if (s === null) errosLocais.estimativaSegundos = 'Use horas, ex.: 40, 12,5 ou 12:30';
      else estimativaSegundos = s;
    }
    const dados = {
      clienteId: Number(campos.clienteId) || 0,
      nome: campos.nome,
      descricao: campos.descricao,
      dataInicio: campos.dataInicio,
      prazoEntrega: campos.prazoEntrega,
      valorFechadoCentavos: dinheiro(campos.valorFechado, 'valorFechadoCentavos'),
      estimativaSegundos,
      valorHoraDevCentavos: dinheiro(campos.valorHoraDev, 'valorHoraDevCentavos'),
      valorHoraSuporteCentavos: dinheiro(campos.valorHoraSuporte, 'valorHoraSuporteCentavos'),
      status: campos.status,
      observacoes: campos.observacoes,
    };
    const validacao = esquemaProjeto.safeParse(dados);
    const todos = { ...(validacao.success ? {} : errosPorCampo(validacao.error)), ...errosLocais };
    if (Object.keys(todos).length) {
      setErros(todos);
      return;
    }

    setSalvando(true);
    try {
      const salvo = await api<Projeto>(edicao ? `/projetos/${projeto!.id}` : '/projetos', {
        method: edicao ? 'PUT' : 'POST',
        body: JSON.stringify(dados),
      });
      aviso.sucesso(edicao ? 'Projeto atualizado.' : 'Projeto cadastrado.');
      aoSalvar(salvo);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.detalhes) setErros(erro.detalhes as Record<string, string>);
      else aviso.erro(erro instanceof ErroApi ? erro.message : 'Não foi possível salvar o projeto.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      bloquearFechamento={salvando}
      titulo={edicao ? 'Editar projeto' : 'Novo projeto'}
      descricao="Campos com * são obrigatórios."
      largura="max-w-3xl"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-projeto" disabled={salvando}>
            {salvando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Cadastrar projeto'}
          </Botao>
        </>
      }
    >
      <form id="form-projeto" onSubmit={salvar} noValidate className="space-y-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Identificação</legend>
          <CampoTexto
            rotulo="Nome do projeto"
            obrigatorio
            value={campos.nome}
            onChange={(e) => alterar('nome', e.target.value)}
            erro={erros.nome}
            maxLength={120}
            autoComplete="off"
          />
          <CampoSelecao
            rotulo="Cliente responsável"
            obrigatorio
            value={campos.clienteId}
            onChange={(e) => alterar('clienteId', e.target.value)}
            erro={erros.clienteId}
            disabled={clientes === null}
          >
            <option value="">{clientes === null ? 'Carregando…' : 'Selecione…'}</option>
            {clientes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.empresa ? ` — ${c.empresa}` : ''}
              </option>
            ))}
          </CampoSelecao>
          <CampoAreaTexto
            rotulo="Descrição"
            value={campos.descricao}
            onChange={(e) => alterar('descricao', e.target.value)}
            erro={erros.descricao}
            maxLength={4000}
            className="sm:col-span-2"
          />
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-texto-suave">Prazo e status</legend>
          <CampoTexto
            rotulo="Data de início"
            type="date"
            value={campos.dataInicio}
            onChange={(e) => alterar('dataInicio', e.target.value)}
            erro={erros.dataInicio}
          />
          <CampoTexto
            rotulo="Prazo de entrega"
            type="date"
            value={campos.prazoEntrega}
            min={campos.dataInicio || undefined}
            onChange={(e) => alterar('prazoEntrega', e.target.value)}
            erro={erros.prazoEntrega}
          />
          <CampoSelecao
            rotulo="Status"
            value={campos.status}
            onChange={(e) => alterar('status', e.target.value as StatusProjeto)}
            erro={erros.status}
          >
            {STATUS_PROJETO_VALORES.map((s) => (
              <option key={s} value={s}>
                {STATUS_PROJETO[s].rotulo}
              </option>
            ))}
          </CampoSelecao>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-texto-suave">Valores</legend>
          <CampoMoeda
            rotulo="Valor fechado do projeto"
            valor={campos.valorFechado}
            aoMudar={(v) => alterar('valorFechado', v)}
            erro={erros.valorFechadoCentavos}
            dica="Preço combinado. Horas incluídas nele não são cobradas à parte."
          />
          <CampoTexto
            rotulo="Estimativa de horas"
            value={campos.estimativa}
            onChange={(e) => alterar('estimativa', e.target.value)}
            erro={erros.estimativaSegundos}
            placeholder="Ex.: 40 ou 12:30"
            inputMode="decimal"
            autoComplete="off"
          />
          <CampoMoeda
            rotulo="Valor da hora de desenvolvimento"
            valor={campos.valorHoraDev}
            aoMudar={(v) => alterar('valorHoraDev', v)}
            erro={erros.valorHoraDevCentavos}
            dica="Usado nas horas extras marcadas como faturáveis."
          />
          <CampoMoeda
            rotulo="Valor da hora de suporte"
            valor={campos.valorHoraSuporte}
            aoMudar={(v) => alterar('valorHoraSuporte', v)}
            erro={erros.valorHoraSuporteCentavos}
          />
        </fieldset>

        <CampoAreaTexto
          rotulo="Observações"
          value={campos.observacoes}
          onChange={(e) => alterar('observacoes', e.target.value)}
          erro={erros.observacoes}
          maxLength={2000}
        />
      </form>
    </Modal>
  );
}
