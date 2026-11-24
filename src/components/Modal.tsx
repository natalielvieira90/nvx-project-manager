import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert, X } from 'lucide-react';
import { Botao, cx } from './ui.tsx';

/**
 * Janela modal acessível: fecha com Esc ou clique fora, prende o foco
 * e devolve o foco ao elemento anterior ao fechar.
 */
export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  largura = 'max-w-lg',
  bloquearFechamento = false,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children?: ReactNode;
  rodape?: ReactNode;
  largura?: string;
  /** Impede fechar (ex.: enquanto salva). */
  bloquearFechamento?: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  // Guardados em ref para o efeito rodar só ao abrir/fechar (e não roubar o foco a cada digitação).
  const fecharRef = useRef(aoFechar);
  const bloqueadoRef = useRef(bloquearFechamento);
  fecharRef.current = aoFechar;
  bloqueadoRef.current = bloquearFechamento;

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    // Foca o primeiro campo (ou a própria caixa).
    const primeiro = caixa.current?.querySelector<HTMLElement>('input, textarea, select, [data-autofoco]');
    (primeiro ?? caixa.current)?.focus();

    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !bloqueadoRef.current) fecharRef.current();
      if (e.key === 'Tab' && caixa.current) {
        const focaveis = caixa.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focaveis.length) return;
        const primeiroEl = focaveis[0];
        const ultimoEl = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiroEl) {
          e.preventDefault();
          ultimoEl.focus();
        } else if (!e.shiftKey && document.activeElement === ultimoEl) {
          e.preventDefault();
          primeiroEl.focus();
        }
      }
    };
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
      anterior?.focus();
    };
  }, [aberto]);

  if (!aberto) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-marca-950/50 backdrop-blur-[2px]"
        onClick={() => !bloquearFechamento && aoFechar()}
        aria-hidden="true"
      />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titulo"
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-superficie shadow-2xl outline-none sm:rounded-2xl',
          largura,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-borda px-6 py-4">
          <div>
            <h2 id="modal-titulo" className="text-base font-semibold">
              {titulo}
            </h2>
            {descricao && <p className="mt-0.5 text-sm text-texto-suave">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            disabled={bloquearFechamento}
            className="-mr-2 grid size-9 shrink-0 place-items-center rounded-lg text-texto-suave hover:bg-fundo hover:text-texto disabled:opacity-40"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {rodape && <div className="flex flex-wrap justify-end gap-2 border-t border-borda px-6 py-4">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmação antes de ações destrutivas (ex.: excluir). */
export function Confirmacao({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = 'Excluir',
  processando = false,
  apenasAviso = false,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean;
  titulo: string;
  mensagem: ReactNode;
  textoConfirmar?: string;
  processando?: boolean;
  /** Só informa (ex.: exclusão bloqueada): um único botão "Entendi". */
  apenasAviso?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoCancelar}
      titulo={titulo}
      largura="max-w-md"
      bloquearFechamento={processando}
      rodape={
        apenasAviso ? (
          <Botao onClick={aoCancelar} data-autofoco>
            Entendi
          </Botao>
        ) : (
          <>
            <Botao variante="secundario" onClick={aoCancelar} disabled={processando} data-autofoco>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={aoConfirmar} disabled={processando}>
              {processando ? 'Excluindo…' : textoConfirmar}
            </Botao>
          </>
        )
      }
    >
      <div className="flex gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-perigo">
          <TriangleAlert className="size-5" aria-hidden="true" />
        </div>
        <div className="text-sm leading-relaxed text-texto-suave">{mensagem}</div>
      </div>
    </Modal>
  );
}
