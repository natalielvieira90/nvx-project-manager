/**
 * Formulários do módulo Financeiro: pagamento recebido, serviço adicional e desconto.
 * A API valida de novo e é a palavra final; aqui a validação só antecipa os erros.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Modal } from '../../components/Modal.tsx';
import { Botao } from '../../components/ui.tsx';
import { CampoAreaTexto, CampoMoeda, CampoSelecao, CampoTexto } from '../../components/formulario.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { FORMA_PAGAMENTO, SITUACAO_SERVICO } from '../../lib/rotulos.ts';
import {
  errosPorCampo,
  esquemaPagamento,
  esquemaServico,
  FORMAS_PAGAMENTO,
  SITUACOES_SERVICO,
} from '../../../shared/esquemas.ts';
import { centavosParaTexto, formatarMoeda, hojeIso, reaisParaCentavos } from '../../../shared/formatacao.ts';
import type { FormaPagamento, Pagamento, ProjetoResumo, ServicoAdicional, SituacaoServico } from '../../../shared/tipos.ts';

/** Converte o texto do campo de valor; devolve null quando vazio ou inválido. */
function lerValor(texto: string): number | null {
  if (!texto.trim()) return 0;
  const v = reaisParaCentavos(texto);
  return v === null || v < 0 ? null : v;
}

function mensagemDeErro(erro: unknown, padrao: string) {
  return erro instanceof ErroApi ? erro.message : padrao;
}

// ---------------------------------------------------------------------------
// Pagamento
// ---------------------------------------------------------------------------

interface CamposPagamento {
  projetoId: string;
  data: string;
  valor: string;
  forma: '' | FormaPagamento;
  observacoes: string;
}

/**
 * Registro/edição de pagamento. Com `projetoFixo` (tela do projeto) o projeto não aparece para escolha;
 * sem ele (tela Financeiro) a lista de projetos é carregada ao abrir.
 */
export function FormularioPagamento({
  aberto,
  pagamento,
  projetoFixo,
  pendenteCentavos,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  pagamento?: Pagamento | null;
  projetoFixo?: { id: number; nome: string } | null;
  /** Mostrado como atalho "receber o restante". */
  pendenteCentavos?: number;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const aviso = useAviso();
  const edicao = Boolean(pagamento);
  const [campos, setCampos] = useState<CamposPagamento>(vazioPagamento(projetoFixo?.id));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [duplicado, setDuplicado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [projetos, setProjetos] = useState<ProjetoResumo[] | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setDuplicado(null);
    setCampos(
      pagamento
        ? {
            projetoId: String(pagamento.projetoId),
            data: pagamento.data,
            valor: centavosParaTexto(pagamento.valorCentavos),
            forma: pagamento.forma ?? '',
            observacoes: pagamento.observacoes ?? '',
          }
        : vazioPagamento(projetoFixo?.id),
    );
    if (!projetoFixo) {
      api<ProjetoResumo[]>('/projetos')
        .then(setProjetos)
        .catch(() => setProjetos([]));
    }
  }, [aberto, pagamento, projetoFixo]);

  const alterar = <K extends keyof CamposPagamento>(campo: K, valor: CamposPagamento[K]) => {
    setCampos((c) => ({ ...c, [campo]: valor }));
    setDuplicado(null);
    setErros((e) => {
      const r = { ...e };
      delete r[campo === 'valor' ? 'valorCentavos' : campo];
      return r;
    });
  };

  async function salvar(e: FormEvent | null, permitirDuplicado = false) {
    e?.preventDefault();
    const valorCentavos = lerValor(campos.valor);
    const dados = {
      projetoId: Number(campos.projetoId) || 0,
      data: campos.data,
      valorCentavos: valorCentavos ?? 0,
      forma: campos.forma || null,
      observacoes: campos.observacoes,
      permitirDuplicado: permitirDuplicado || undefined,
    };
    const v = esquemaPagamento.safeParse(dados);
    const todos = v.success ? {} : errosPorCampo(v.error);
    if (valorCentavos === null) todos.valorCentavos = 'Valor inválido. Ex.: 1.500,00';
    if (campos.data > hojeIso()) todos.data = 'A data do pagamento não pode estar no futuro.';
    if (Object.keys(todos).length) {
      setErros(todos);
      return;
    }
    setSalvando(true);
    try {
      await api(edicao ? `/pagamentos/${pagamento!.id}` : '/pagamentos', {
        method: edicao ? 'PUT' : 'POST',
        body: JSON.stringify(dados),
      });
      aviso.sucesso(edicao ? 'Pagamento atualizado.' : `Pagamento de ${formatarMoeda(dados.valorCentavos)} registrado.`);
      aoSalvar();
    } catch (erro) {
      const detalhes = erro instanceof ErroApi ? (erro.detalhes as Record<string, string> | undefined) : undefined;
      if (detalhes?.duplicado) setDuplicado(detalhes.duplicado);
      else if (detalhes) setErros(detalhes);
      else aviso.erro(mensagemDeErro(erro, 'Não foi possível salvar o pagamento.'));
    } finally {
      setSalvando(false);
    }
  }

  const projetosOrdenados = (projetos ?? [])
    .slice()
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      bloquearFechamento={salvando}
      titulo={edicao ? 'Editar pagamento' : 'Registrar pagamento'}
      descricao={projetoFixo ? projetoFixo.nome : 'Campos com * são obrigatórios.'}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-pagamento" disabled={salvando || Boolean(duplicado)}>
            {salvando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Registrar pagamento'}
          </Botao>
        </>
      }
    >
      <form id="form-pagamento" onSubmit={(e) => salvar(e)} noValidate className="grid gap-4 sm:grid-cols-2">
        {!projetoFixo && (
          <CampoSelecao
            rotulo="Projeto"
            obrigatorio
            className="sm:col-span-2"
            value={campos.projetoId}
            onChange={(e) => alterar('projetoId', e.target.value)}
            erro={erros.projetoId}
            disabled={projetos === null}
          >
            <option value="">{projetos === null ? 'Carregando…' : 'Selecione o projeto'}</option>
            {projetosOrdenados.map((p) => (
              <option key={p.id} value={p.id}>
                {p.clienteNome} — {p.nome}
              </option>
            ))}
          </CampoSelecao>
        )}
        <CampoTexto
          rotulo="Data do pagamento"
          type="date"
          obrigatorio
          max={hojeIso()}
          value={campos.data}
          onChange={(e) => alterar('data', e.target.value)}
          erro={erros.data}
        />
        <div>
          <CampoMoeda rotulo="Valor recebido" obrigatorio valor={campos.valor} aoMudar={(v) => alterar('valor', v)} erro={erros.valorCentavos} />
          {!edicao && Boolean(pendenteCentavos) && (
            <button
              type="button"
              onClick={() => alterar('valor', centavosParaTexto(pendenteCentavos!))}
              className="mt-1.5 text-xs font-medium text-destaque-700 hover:underline"
            >
              Usar o pendente ({formatarMoeda(pendenteCentavos!)})
            </button>
          )}
        </div>
        <CampoSelecao
          rotulo="Forma de pagamento"
          value={campos.forma}
          onChange={(e) => alterar('forma', e.target.value as CamposPagamento['forma'])}
          erro={erros.forma}
        >
          <option value="">Não informada</option>
          {FORMAS_PAGAMENTO.map((f) => (
            <option key={f} value={f}>
              {FORMA_PAGAMENTO[f]}
            </option>
          ))}
        </CampoSelecao>
        <CampoAreaTexto
          rotulo="Observações"
          className="sm:col-span-2"
          rows={2}
          placeholder="Ex.: 2ª parcela, sinal, nota fiscal nº…"
          value={campos.observacoes}
          onChange={(e) => alterar('observacoes', e.target.value)}
          erro={erros.observacoes}
        />
        {duplicado && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">Possível pagamento duplicado</p>
              <p className="mt-0.5">{duplicado} É mesmo um novo pagamento?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Botao variante="secundario" className="h-8 px-3" onClick={() => salvar(null, true)} disabled={salvando}>
                  Sim, registrar mesmo assim
                </Botao>
                <Botao variante="fantasma" className="h-8 px-3" onClick={() => setDuplicado(null)} disabled={salvando}>
                  Revisar
                </Botao>
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

function vazioPagamento(projetoId?: number): CamposPagamento {
  return { projetoId: projetoId ? String(projetoId) : '', data: hojeIso(), valor: '', forma: '', observacoes: '' };
}

// ---------------------------------------------------------------------------
// Serviço adicional
// ---------------------------------------------------------------------------

interface CamposServico {
  descricao: string;
  data: string;
  valor: string;
  situacao: SituacaoServico;
}

export function FormularioServico({
  aberto,
  projetoId,
  servico,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  projetoId: number;
  servico?: ServicoAdicional | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const aviso = useAviso();
  const edicao = Boolean(servico);
  const [campos, setCampos] = useState<CamposServico>({ descricao: '', data: hojeIso(), valor: '', situacao: 'faturavel' });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setCampos(
      servico
        ? { descricao: servico.descricao, data: servico.data, valor: centavosParaTexto(servico.valorCentavos), situacao: servico.situacao }
        : { descricao: '', data: hojeIso(), valor: '', situacao: 'faturavel' },
    );
  }, [aberto, servico]);

  const alterar = <K extends keyof CamposServico>(campo: K, valor: CamposServico[K]) => {
    setCampos((c) => ({ ...c, [campo]: valor }));
    setErros((e) => {
      const r = { ...e };
      delete r[campo === 'valor' ? 'valorCentavos' : campo];
      return r;
    });
  };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const valorCentavos = lerValor(campos.valor);
    const dados = { projetoId, descricao: campos.descricao, data: campos.data, valorCentavos: valorCentavos ?? 0, situacao: campos.situacao };
    const v = esquemaServico.safeParse(dados);
    const todos = v.success ? {} : errosPorCampo(v.error);
    if (valorCentavos === null) todos.valorCentavos = 'Valor inválido. Ex.: 800,00';
    if (Object.keys(todos).length) {
      setErros(todos);
      return;
    }
    setSalvando(true);
    try {
      await api(edicao ? `/servicos/${servico!.id}` : '/servicos', { method: edicao ? 'PUT' : 'POST', body: JSON.stringify(dados) });
      aviso.sucesso(edicao ? 'Serviço atualizado.' : 'Serviço adicional registrado.');
      aoSalvar();
    } catch (erro) {
      if (erro instanceof ErroApi && erro.detalhes) setErros(erro.detalhes as Record<string, string>);
      else aviso.erro(mensagemDeErro(erro, 'Não foi possível salvar o serviço.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      bloquearFechamento={salvando}
      titulo={edicao ? 'Editar serviço adicional' : 'Novo serviço adicional'}
      descricao="Algo cobrado à parte do valor fechado (ex.: nova tela, integração, hospedagem)."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-servico" disabled={salvando}>
            {salvando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Adicionar serviço'}
          </Botao>
        </>
      }
    >
      <form id="form-servico" onSubmit={salvar} noValidate className="grid gap-4 sm:grid-cols-2">
        <CampoTexto
          rotulo="Descrição"
          obrigatorio
          className="sm:col-span-2"
          maxLength={300}
          placeholder="Ex.: Integração com o ERP"
          value={campos.descricao}
          onChange={(e) => alterar('descricao', e.target.value)}
          erro={erros.descricao}
        />
        <CampoTexto rotulo="Data" type="date" obrigatorio value={campos.data} onChange={(e) => alterar('data', e.target.value)} erro={erros.data} />
        <CampoMoeda rotulo="Valor" obrigatorio valor={campos.valor} aoMudar={(v) => alterar('valor', v)} erro={erros.valorCentavos} />
        <CampoSelecao
          rotulo="Situação"
          className="sm:col-span-2"
          value={campos.situacao}
          onChange={(e) => alterar('situacao', e.target.value as SituacaoServico)}
          dica="Marque como faturado quando o serviço já tiver sido incluído em uma cobrança."
        >
          {SITUACOES_SERVICO.map((s) => (
            <option key={s} value={s}>
              {SITUACAO_SERVICO[s].rotulo}
            </option>
          ))}
        </CampoSelecao>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Desconto
// ---------------------------------------------------------------------------

export function FormularioDesconto({
  aberto,
  projetoId,
  descontoCentavos,
  brutoCentavos,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  projetoId: number;
  descontoCentavos: number;
  brutoCentavos: number;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const aviso = useAviso();
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro(undefined);
    setValor(descontoCentavos ? centavosParaTexto(descontoCentavos) : '');
  }, [aberto, descontoCentavos]);

  const centavos = lerValor(valor);
  const total = centavos === null ? null : Math.max(0, brutoCentavos - centavos);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (centavos === null) return setErro('Valor inválido. Ex.: 500,00');
    if (centavos > brutoCentavos) return setErro(`O desconto não pode passar de ${formatarMoeda(brutoCentavos)}.`);
    setSalvando(true);
    try {
      await api(`/projetos/${projetoId}/desconto`, { method: 'PATCH', body: JSON.stringify({ descontoCentavos: centavos }) });
      aviso.sucesso(centavos ? `Desconto de ${formatarMoeda(centavos)} aplicado.` : 'Desconto removido.');
      aoSalvar();
    } catch (er) {
      const detalhes = er instanceof ErroApi ? (er.detalhes as Record<string, string> | undefined) : undefined;
      if (detalhes?.descontoCentavos) setErro(detalhes.descontoCentavos);
      else aviso.erro(mensagemDeErro(er, 'Não foi possível salvar o desconto.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      bloquearFechamento={salvando}
      titulo="Desconto do projeto"
      largura="max-w-md"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-desconto" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar desconto'}
          </Botao>
        </>
      }
    >
      <form id="form-desconto" onSubmit={salvar} noValidate className="space-y-4">
        <CampoMoeda
          rotulo="Valor do desconto"
          valor={valor}
          aoMudar={(v) => (setValor(v), setErro(undefined))}
          erro={erro}
          dica="Deixe em branco para remover o desconto."
        />
        <dl className="divide-y divide-borda rounded-lg bg-fundo px-4 text-sm">
          <div className="flex justify-between py-2">
            <dt className="text-texto-suave">Valor antes do desconto</dt>
            <dd className="tabular font-medium">{formatarMoeda(brutoCentavos)}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-texto-suave">Total com desconto</dt>
            <dd className="tabular font-semibold">{total === null ? '—' : formatarMoeda(total)}</dd>
          </div>
        </dl>
      </form>
    </Modal>
  );
}
