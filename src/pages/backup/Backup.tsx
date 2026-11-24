/**
 * Backup manual, restauração (de arquivo ou de backup automático) e lixeira.
 */
import { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, CircleAlert, DatabaseBackup, Download, FolderClock, ShieldCheck, Trash2, Upload, TriangleAlert } from 'lucide-react';
import { Botao, CabecalhoPagina, Cartao, EstadoVazio, Etiqueta, cx } from '../../components/ui.tsx';
import { Modal } from '../../components/Modal.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { formatarDataHora } from '../../../shared/formatacao.ts';
import type { BackupAutomatico, EstadoBackup, ItemLixeira, ResultadoRestauracao, TipoLixeira } from '../../../shared/tipos.ts';

const TIPO_LIXEIRA: Record<TipoLixeira, string> = {
  cliente: 'Cliente',
  projeto: 'Projeto',
  lancamento: 'Horas',
  atendimento: 'Atendimento',
  servico: 'Serviço',
  pagamento: 'Pagamento',
};

function tamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Restauração pendente de confirmação: arquivo escolhido ou backup automático. */
type Pedido = { origem: 'arquivo'; arquivo: File } | { origem: 'automatico'; backup: BackupAutomatico };

export function Backup() {
  const aviso = useAviso();
  const [estado, setEstado] = useState<EstadoBackup | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [restaurando, setRestaurando] = useState(false);
  const [concluido, setConcluido] = useState<ResultadoRestauracao | null>(null);
  const [versao, setVersao] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<EstadoBackup>('/backup')
      .then((e) => (setEstado(e), setErro(null)))
      .catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : 'Erro inesperado.'));
  }, [versao]);

  function baixar(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function restaurar() {
    if (!pedido) return;
    setRestaurando(true);
    try {
      const resultado =
        pedido.origem === 'arquivo'
          ? await api<ResultadoRestauracao>('/backup/restaurar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: pedido.arquivo,
            })
          : await api<ResultadoRestauracao>(`/backup/automaticos/${encodeURIComponent(pedido.backup.nome)}/restaurar`, { method: 'POST' });
      setPedido(null);
      setConcluido(resultado);
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível restaurar o backup.');
    } finally {
      setRestaurando(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  return (
    <>
      <CabecalhoPagina titulo="Backup" descricao="Proteja seus dados, restaure uma cópia e recupere registros excluídos." />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        <Cartao className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <DatabaseBackup className="size-4 text-texto-suave" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Fazer backup agora</h2>
          </div>
          <p className="text-sm text-texto-suave">
            Gera um arquivo com <strong className="text-texto">todos os dados</strong> do sistema. Guarde-o fora deste computador (pen drive,
            HD externo ou sua nuvem). Para levar os dados para outra máquina, instale o programa nela e restaure este arquivo.
          </p>
          <Botao
            icone={Download}
            className="mt-4"
            onClick={() => {
              baixar('/api/backup/baixar');
              aviso.sucesso('Backup gerado. Escolha onde salvar o arquivo.');
            }}
          >
            Fazer backup
          </Botao>
        </Cartao>

        <Cartao className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <Upload className="size-4 text-texto-suave" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Restaurar um backup</h2>
          </div>
          <p className="text-sm text-texto-suave">
            Substitui os dados atuais pelos do arquivo escolhido. Antes, o sistema guarda automaticamente uma cópia do estado atual, que
            aparece em "Backups automáticos" caso você precise voltar.
          </p>
          <input
            ref={entrada}
            type="file"
            accept=".db"
            className="sr-only"
            id="arquivo-backup"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) setPedido({ origem: 'arquivo', arquivo });
            }}
          />
          <Botao variante="secundario" icone={Upload} className="mt-4" onClick={() => entrada.current?.click()}>
            Escolher arquivo de backup
          </Botao>
        </Cartao>

        <Cartao className="xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-borda px-5 py-3.5">
            <FolderClock className="size-4 text-texto-suave" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Backups automáticos</h2>
          </div>
          {erro ? (
            <EstadoVazio icone={CircleAlert} titulo="Não foi possível carregar" descricao={erro} />
          ) : !estado ? (
            <div className="m-5 h-12 animate-pulse rounded-lg bg-fundo" aria-busy="true" />
          ) : estado.automaticos.length === 0 ? (
            <p className="px-5 py-6 text-sm text-texto-suave">Nenhum backup automático ainda. O primeiro é feito ao abrir o programa.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {estado.automaticos.map((b) => (
                <li key={b.nome} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-sm font-medium">{formatarDataHora(b.criadoEm)}</p>
                    <p className="text-xs text-texto-suave">{tamanho(b.tamanhoBytes)}</p>
                  </div>
                  <Etiqueta tom={b.tipo === 'diario' ? 'neutro' : 'destaque'}>{b.tipo === 'diario' ? 'Diário' : 'Antes de restaurar'}</Etiqueta>
                  <div className="flex gap-2">
                    <Botao variante="secundario" icone={Download} className="h-8 px-3" onClick={() => baixar(`/api/backup/automaticos/${encodeURIComponent(b.nome)}`)}>
                      Baixar
                    </Botao>
                    <Botao variante="secundario" icone={ArchiveRestore} className="h-8 px-3" onClick={() => setPedido({ origem: 'automatico', backup: b })}>
                      Restaurar
                    </Botao>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-start gap-2 border-t border-borda px-5 py-3 text-xs text-texto-suave">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Um backup é feito automaticamente por dia (são mantidos os 14 mais recentes) e antes de cada restauração (os 10 mais recentes).
            Eles ficam neste computador; para se proteger de defeitos no computador, faça também o backup manual.
          </p>
        </Cartao>

        <Lixeira versao={versao} aoRestaurar={() => setVersao((n) => n + 1)} />
      </div>

      <Modal
        aberto={Boolean(pedido)}
        aoFechar={() => setPedido(null)}
        bloquearFechamento={restaurando}
        titulo="Restaurar backup?"
        largura="max-w-md"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setPedido(null)} disabled={restaurando} data-autofoco>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={restaurar} disabled={restaurando}>
              {restaurando ? 'Restaurando…' : 'Substituir dados atuais'}
            </Botao>
          </>
        }
      >
        <div className="flex gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-50 text-alerta">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </div>
          <div className="space-y-2 text-sm leading-relaxed text-texto-suave">
            <p>
              Arquivo:{' '}
              <strong className="break-all text-texto">
                {pedido?.origem === 'arquivo'
                  ? `${pedido.arquivo.name} (${tamanho(pedido.arquivo.size)})`
                  : pedido && `backup de ${formatarDataHora(pedido.backup.criadoEm)}`}
              </strong>
            </p>
            <p>
              <strong className="text-texto">Todos os dados atuais</strong> (clientes, projetos, horas, suporte, financeiro e lixeira) serão
              substituídos pelos do backup.
            </p>
            <p>Uma cópia do estado atual será guardada antes, em "Backups automáticos".</p>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={Boolean(concluido)}
        aoFechar={() => window.location.reload()}
        titulo="Backup restaurado"
        largura="max-w-md"
        rodape={
          <Botao onClick={() => window.location.reload()} data-autofoco>
            Continuar
          </Botao>
        }
      >
        {concluido && (
          <div className="space-y-2 text-sm text-texto-suave">
            <p>
              Dados restaurados: {concluido.registros.clientes ?? 0} cliente(s), {concluido.registros.projetos ?? 0} projeto(s),{' '}
              {concluido.registros.lancamentos_horas ?? 0} lançamento(s) de horas, {concluido.registros.atendimentos_suporte ?? 0} atendimento(s)
              e {concluido.registros.pagamentos ?? 0} pagamento(s).
            </p>
            {concluido.backupAnterior && (
              <p>O estado anterior foi guardado em "Backups automáticos" ({formatarDataHora(concluido.backupAnterior.criadoEm)}).</p>
            )}
            <p>A tela será recarregada para mostrar os dados restaurados.</p>
          </div>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lixeira
// ---------------------------------------------------------------------------

function Lixeira({ versao, aoRestaurar }: { versao: number; aoRestaurar: () => void }) {
  const aviso = useAviso();
  const [itens, setItens] = useState<ItemLixeira[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<TipoLixeira | ''>('');
  const [processando, setProcessando] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    api<ItemLixeira[]>('/lixeira')
      .then((i) => (setItens(i), setErro(null)))
      .catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : 'Erro inesperado.'));
  }, [versao, recarga]);

  async function restaurar(item: ItemLixeira) {
    const chave = `${item.tipo}-${item.id}`;
    setProcessando(chave);
    try {
      await api(`/lixeira/${item.tipo}/${item.id}/restaurar`, { method: 'POST' });
      aviso.sucesso(`${TIPO_LIXEIRA[item.tipo]} restaurado: ${item.titulo}`);
      setRecarga((n) => n + 1);
      aoRestaurar();
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível restaurar.');
    } finally {
      setProcessando(null);
    }
  }

  const tipos = [...new Set(itens?.map((i) => i.tipo) ?? [])];
  const visiveis = itens?.filter((i) => !filtro || i.tipo === filtro) ?? [];

  return (
    <Cartao className="xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Trash2 className="size-4 text-texto-suave" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Lixeira</h2>
          {itens && <span className="text-xs text-texto-suave">({itens.length})</span>}
        </div>
        {tipos.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar lixeira">
            {(['', ...tipos] as const).map((t) => (
              <button
                key={t || 'todos'}
                type="button"
                aria-pressed={filtro === t}
                onClick={() => setFiltro(t)}
                className={cx(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filtro === t ? 'border-marca-800 bg-marca-800 text-white' : 'border-borda text-texto-suave hover:text-texto',
                )}
              >
                {t ? TIPO_LIXEIRA[t] : 'Todos'}
              </button>
            ))}
          </div>
        )}
      </div>
      {erro ? (
        <EstadoVazio icone={CircleAlert} titulo="Não foi possível carregar a lixeira" descricao={erro} />
      ) : itens === null ? (
        <div className="m-5 h-12 animate-pulse rounded-lg bg-fundo" aria-busy="true" />
      ) : itens.length === 0 ? (
        <EstadoVazio icone={Trash2} titulo="A lixeira está vazia" descricao="Registros excluídos aparecem aqui e podem ser restaurados." />
      ) : (
        <ul className="divide-y divide-borda">
          {visiveis.map((i) => (
            <li key={`${i.tipo}-${i.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <Etiqueta>{TIPO_LIXEIRA[i.tipo]}</Etiqueta>
              <div className="min-w-0 flex-1 basis-60">
                <p className="truncate text-sm font-medium">{i.titulo}</p>
                <p className="truncate text-xs text-texto-suave">{i.detalhe}</p>
                {i.bloqueio && <p className="mt-0.5 text-xs text-alerta">{i.bloqueio}</p>}
              </div>
              <span className="text-xs text-texto-suave">Excluído em {formatarDataHora(i.excluidoEm)}</span>
              <Botao
                variante="secundario"
                icone={ArchiveRestore}
                className="h-8 px-3"
                disabled={Boolean(i.bloqueio) || processando !== null}
                onClick={() => restaurar(i)}
              >
                {processando === `${i.tipo}-${i.id}` ? 'Restaurando…' : 'Restaurar'}
              </Botao>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-borda px-5 py-3 text-xs text-texto-suave">
        Itens na lixeira não entram em cálculos nem relatórios. Ao restaurar um projeto, todos os registros dele voltam junto. Por
        segurança, não há exclusão definitiva: os dados ficam guardados no banco e nos backups.
      </p>
    </Cartao>
  );
}
