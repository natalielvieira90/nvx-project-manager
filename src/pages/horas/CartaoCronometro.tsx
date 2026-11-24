import { useEffect, useState } from 'react';
import { Pause, Play, Square, Trash2 } from 'lucide-react';
import { Botao, Cartao, cx } from '../../components/ui.tsx';
import { CampoAreaTexto, CampoSelecao, CampoTexto } from '../../components/formulario.tsx';
import { Confirmacao, Modal } from '../../components/Modal.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { useCronometro } from '../../lib/cronometro.tsx';
import { CATEGORIA_HORA, SITUACAO_COBRANCA } from '../../lib/rotulos.ts';
import { CATEGORIAS_HORA, SITUACOES_COBRANCA } from '../../../shared/esquemas.ts';
import { situacaoPadrao } from '../../../shared/financeiro.ts';
import { formatarCronometro, formatarDuracao, formatarHora } from '../../../shared/formatacao.ts';
import type { CategoriaHora, CronometroAtivo, ProjetoResumo, SituacaoCobranca } from '../../../shared/tipos.ts';

export function CartaoCronometro({
  projetos,
  aoFinalizar,
}: {
  projetos: ProjetoResumo[] | null;
  aoFinalizar: () => void;
}) {
  const { cronometro, segundos, carregado, definir } = useCronometro();
  const aviso = useAviso();
  const [projetoId, setProjetoId] = useState('');
  const [categoria, setCategoria] = useState<CategoriaHora>('desenvolvimento');
  const [descricao, setDescricao] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erroProjeto, setErroProjeto] = useState<string>();
  const [finalizando, setFinalizando] = useState(false);
  const [descartando, setDescartando] = useState(false);

  // Mantém os campos sincronizados com o cronômetro ativo.
  useEffect(() => {
    if (cronometro) {
      setProjetoId(String(cronometro.projetoId));
      setCategoria(cronometro.categoria);
      setDescricao(cronometro.descricao ?? '');
    }
  }, [cronometro?.projetoId, cronometro?.categoria, cronometro?.descricao]); // eslint-disable-line react-hooks/exhaustive-deps

  async function executar(acao: () => Promise<CronometroAtivo | null>, sucesso?: string) {
    setOcupado(true);
    try {
      definir(await acao());
      if (sucesso) aviso.sucesso(sucesso);
    } catch (e) {
      if (e instanceof ErroApi && e.detalhes && 'projetoId' in (e.detalhes as object)) {
        setErroProjeto((e.detalhes as Record<string, string>).projetoId);
      } else aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      setOcupado(false);
    }
  }

  const iniciar = () => {
    if (!projetoId) {
      setErroProjeto('Selecione o projeto.');
      return;
    }
    executar(() =>
      api<CronometroAtivo>('/cronometro/iniciar', {
        method: 'POST',
        body: JSON.stringify({ projetoId: Number(projetoId), categoria, descricao }),
      }),
    );
  };

  // Salva ajustes (projeto/categoria/descrição) sem parar o cronômetro.
  const salvarAjustes = (mudancas: Partial<{ projetoId: string; categoria: CategoriaHora; descricao: string }>) => {
    if (!cronometro) return;
    const dados = { projetoId: Number(mudancas.projetoId ?? projetoId), categoria: mudancas.categoria ?? categoria, descricao: mudancas.descricao ?? descricao };
    if (
      dados.projetoId === cronometro.projetoId &&
      dados.categoria === cronometro.categoria &&
      (dados.descricao || null) === (cronometro.descricao || null)
    ) {
      return;
    }
    executar(() => api<CronometroAtivo>('/cronometro', { method: 'PUT', body: JSON.stringify(dados) }));
  };

  const rodando = Boolean(cronometro?.segmentoIniciadoEm);

  return (
    <Cartao className={cx('overflow-hidden', cronometro && 'border-marca-700')}>
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Campos */}
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <CampoSelecao
            rotulo="Projeto"
            obrigatorio
            value={projetoId}
            disabled={!projetos || ocupado}
            erro={erroProjeto}
            onChange={(e) => {
              setProjetoId(e.target.value);
              setErroProjeto(undefined);
              if (cronometro && e.target.value) salvarAjustes({ projetoId: e.target.value });
            }}
          >
            <option value="">{projetos ? 'Selecione o projeto…' : 'Carregando…'}</option>
            {projetos?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} — {p.clienteNome}
              </option>
            ))}
          </CampoSelecao>
          <CampoSelecao
            rotulo="Categoria"
            value={categoria}
            disabled={ocupado}
            onChange={(e) => {
              const c = e.target.value as CategoriaHora;
              setCategoria(c);
              if (cronometro) salvarAjustes({ categoria: c });
            }}
          >
            {CATEGORIAS_HORA.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_HORA[c]}
              </option>
            ))}
          </CampoSelecao>
          <CampoTexto
            rotulo="Descrição da atividade"
            className="sm:col-span-2"
            value={descricao}
            maxLength={1000}
            placeholder="O que está sendo feito?"
            onChange={(e) => setDescricao(e.target.value)}
            onBlur={() => cronometro && salvarAjustes({ descricao })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (cronometro) salvarAjustes({ descricao });
                else iniciar();
              }
            }}
          />
        </div>

        {/* Relógio e botões */}
        <div className="flex flex-col justify-center gap-4 border-t border-borda bg-marca-900 p-5 text-white xl:border-l xl:border-t-0">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-white/50" aria-live="polite">
              {!carregado ? 'Carregando…' : !cronometro ? 'Pronto para iniciar' : rodando ? 'Em andamento' : 'Pausado'}
            </p>
            <p
              className={cx('tabular mt-1 text-5xl font-semibold tracking-tight', cronometro && !rodando && 'text-white/60')}
              role="timer"
              aria-label={`Tempo trabalhado: ${formatarDuracao(segundos)}`}
            >
              {formatarCronometro(segundos)}
            </p>
            {cronometro && (
              <p className="mt-1 text-xs text-white/50">
                Iniciado às {formatarHora(cronometro.iniciadoEm)}
                {cronometro.pausadoEm && ` · pausado às ${formatarHora(cronometro.pausadoEm)}`}
              </p>
            )}
          </div>

          {!cronometro ? (
            <Botao icone={Play} onClick={iniciar} disabled={ocupado || !carregado} className="h-11">
              Iniciar
            </Botao>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {rodando ? (
                <Botao
                  icone={Pause}
                  onClick={() => executar(() => api<CronometroAtivo>('/cronometro/pausar', { method: 'POST' }))}
                  disabled={ocupado}
                  className="h-11 bg-white/10! hover:bg-white/20!"
                >
                  Pausar
                </Botao>
              ) : (
                <Botao
                  icone={Play}
                  onClick={() => executar(() => api<CronometroAtivo>('/cronometro/retomar', { method: 'POST' }))}
                  disabled={ocupado}
                  className="h-11 bg-white/10! hover:bg-white/20!"
                >
                  Retomar
                </Botao>
              )}
              <Botao
                icone={Square}
                onClick={() => setFinalizando(true)}
                disabled={ocupado}
                className="h-11"
              >
                Finalizar
              </Botao>
              <button
                type="button"
                onClick={() => setDescartando(true)}
                disabled={ocupado}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-white/50 hover:bg-white/5 hover:text-white/80"
              >
                <Trash2 className="size-3.5" aria-hidden="true" /> Descartar este tempo
              </button>
            </div>
          )}
        </div>
      </div>

      {cronometro && (
        <ModalFinalizar
          aberto={finalizando}
          cronometro={cronometro}
          segundos={segundos}
          descricaoAtual={descricao}
          valorFechadoCentavos={projetos?.find((p) => p.id === cronometro.projetoId)?.valorFechadoCentavos ?? 0}
          aoFechar={() => setFinalizando(false)}
          aoConcluir={() => {
            setFinalizando(false);
            definir(null);
            setDescricao('');
            aoFinalizar();
          }}
        />
      )}

      <Confirmacao
        aberto={descartando}
        titulo="Descartar o tempo?"
        textoConfirmar="Descartar"
        processando={ocupado}
        aoCancelar={() => setDescartando(false)}
        aoConfirmar={async () => {
          await executar(async () => {
            await api('/cronometro', { method: 'DELETE' });
            return null;
          }, 'Cronômetro descartado.');
          setDescartando(false);
          setDescricao('');
        }}
        mensagem={
          <>
            Os <strong className="text-texto">{formatarDuracao(segundos)}</strong> registrados neste cronômetro serão
            perdidos e nenhum lançamento será criado.
          </>
        }
      />
    </Cartao>
  );
}

function ModalFinalizar({
  aberto,
  cronometro,
  segundos,
  descricaoAtual,
  valorFechadoCentavos,
  aoFechar,
  aoConcluir,
}: {
  aberto: boolean;
  cronometro: CronometroAtivo;
  segundos: number;
  descricaoAtual: string;
  valorFechadoCentavos: number;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const aviso = useAviso();
  const [descricao, setDescricao] = useState('');
  const [situacao, setSituacao] = useState<SituacaoCobranca>('incluido_pacote');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setDescricao(descricaoAtual);
      setSituacao(situacaoPadrao(cronometro.categoria, valorFechadoCentavos));
    }
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    setSalvando(true);
    try {
      const r = await api<{ duracaoSegundos: number }>('/cronometro/finalizar', {
        method: 'POST',
        body: JSON.stringify({ descricao, situacaoCobranca: situacao }),
      });
      aviso.sucesso(`Lançamento de ${formatarDuracao(r.duracaoSegundos)} salvo.`);
      aoConcluir();
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível finalizar o cronômetro.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      bloquearFechamento={salvando}
      titulo="Finalizar cronômetro"
      descricao={`${cronometro.projetoNome} · ${CATEGORIA_HORA[cronometro.categoria]}`}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Continuar contando
          </Botao>
          <Botao onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar lançamento'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-fundo px-4 py-3">
          <p className="text-xs text-texto-suave">Tempo trabalhado (pausas não contam)</p>
          <p className="tabular text-2xl font-semibold">{formatarCronometro(segundos)}</p>
        </div>
        <CampoAreaTexto rotulo="Descrição da atividade" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={1000} />
        <CampoSelecao
          rotulo="Cobrança"
          value={situacao}
          onChange={(e) => setSituacao(e.target.value as SituacaoCobranca)}
          dica={SITUACAO_COBRANCA[situacao].dica}
        >
          {SITUACOES_COBRANCA.map((s) => (
            <option key={s} value={s}>
              {SITUACAO_COBRANCA[s].rotulo}
            </option>
          ))}
        </CampoSelecao>
      </div>
    </Modal>
  );
}
