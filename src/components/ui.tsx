/**
 * Componentes visuais básicos reutilizados em todas as telas.
 * Mantê-los aqui garante aparência consistente (botões, cartões, cabeçalhos).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type VarianteBotao = 'primario' | 'secundario' | 'perigo' | 'fantasma';

const estilosBotao: Record<VarianteBotao, string> = {
  // Ação principal: botão Lima com texto Roxo (manual, contraste 13:1).
  primario: 'bg-lima-500 text-marca-900 font-semibold hover:bg-lima-300 shadow-sm',
  secundario: 'bg-superficie text-texto border border-borda hover:bg-fundo',
  perigo: 'bg-perigo text-white hover:bg-red-800 shadow-sm',
  fantasma: 'text-texto-suave hover:bg-fundo hover:text-texto',
};

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  icone?: LucideIcon;
}

export function Botao({ variante = 'primario', icone: Icone, className, children, type = 'button', ...resto }: BotaoProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        estilosBotao[variante],
        className,
      )}
      {...resto}
    >
      {Icone && <Icone className="size-4" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-cartao border border-borda bg-superficie shadow-cartao', className)}>{children}</div>
  );
}

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-texto-suave">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </header>
  );
}

export function EstadoVazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-lavanda-100 text-marca-600">
        <Icone className="size-6" aria-hidden="true" />
      </div>
      <h2 className="font-semibold">{titulo}</h2>
      {descricao && <p className="mt-1 max-w-md text-sm text-texto-suave">{descricao}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

type TomEtiqueta = 'neutro' | 'destaque' | 'sucesso' | 'alerta' | 'perigo';

const estilosEtiqueta: Record<TomEtiqueta, string> = {
  neutro: 'bg-lavanda-100 text-marca-700',
  destaque: 'bg-lima-100 text-marca-800 ring-1 ring-inset ring-lima-600/25',
  sucesso: 'bg-emerald-50 text-emerald-700',
  alerta: 'bg-amber-50 text-amber-800',
  perigo: 'bg-red-50 text-red-700',
};

export function Etiqueta({ tom = 'neutro', children }: { tom?: TomEtiqueta; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', estilosEtiqueta[tom])}>
      {children}
    </span>
  );
}
