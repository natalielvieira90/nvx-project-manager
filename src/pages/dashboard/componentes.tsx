import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { Cartao, cx } from '../../components/ui.tsx';

/** Cartão de indicador (número principal + rótulo + complemento). */
export function Indicador({
  rotulo,
  valor,
  complemento,
  icone: Icone,
  destaque = false,
  className,
  children,
}: {
  rotulo: string;
  valor: string;
  complemento?: ReactNode;
  icone: LucideIcon;
  destaque?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Cartao className={cx('p-5', destaque && 'border-marca-800! bg-marca-900! text-white', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className={cx('text-sm font-medium', destaque ? 'text-white/70' : 'text-texto-suave')}>{rotulo}</p>
        <Icone className={cx('size-[18px] shrink-0', destaque ? 'text-destaque-400' : 'text-texto-suave/70')} aria-hidden="true" />
      </div>
      <p className="numero-destaque mt-2 text-[26px] font-semibold leading-tight">{valor}</p>
      {complemento && (
        <p className={cx('mt-1 text-xs', destaque ? 'text-white/60' : 'text-texto-suave')}>{complemento}</p>
      )}
      {children}
    </Cartao>
  );
}

export function SeletorMes({ mes, onChange }: { mes: string; onChange: (mes: string) => void }) {
  const [ano, m] = mes.split('-').map(Number);
  const mover = (delta: number) => {
    const d = new Date(ano, m - 1 + delta, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const rotulo = nomeDoMes(mes);
  return (
    <div className="flex h-10 items-center rounded-lg border border-borda bg-superficie shadow-cartao">
      <button
        type="button"
        onClick={() => mover(-1)}
        className="grid h-full w-10 place-items-center rounded-l-lg text-texto-suave hover:bg-fundo hover:text-texto"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-36 px-2 text-center text-sm font-medium" aria-live="polite">
        {rotulo}
      </span>
      <button
        type="button"
        onClick={() => mover(1)}
        className="grid h-full w-10 place-items-center rounded-r-lg text-texto-suave hover:bg-fundo hover:text-texto"
        aria-label="Próximo mês"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/** "2026-11" → "Novembro de 2026" */
export function nomeDoMes(mes: string, curto = false): string {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m - 1, 1);
  if (curto) {
    const abrev = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return `${abrev.charAt(0).toUpperCase()}${abrev.slice(1)}/${String(ano).slice(2)}`;
  }
  const texto = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Cabeçalho de cartão de gráfico, com alternância gráfico/tabela. */
export function CartaoGrafico({
  titulo,
  descricao,
  emTabela,
  onAlternar,
  legenda,
  children,
  className,
  podeAlternar = true,
}: {
  titulo: string;
  descricao?: string;
  podeAlternar?: boolean;
  emTabela: boolean;
  onAlternar: () => void;
  legenda?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Cartao className={cx('flex flex-col p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-texto-suave">{descricao}</p>}
        </div>
        {podeAlternar && (<button
          type="button"
          onClick={onAlternar}
          className="rounded-md px-2 py-1 text-xs font-medium text-destaque-700 hover:bg-fundo"
        >
          {emTabela ? 'Ver gráfico' : 'Ver tabela'}
        </button>)}
      </div>
      {legenda && !emTabela && <div className="mb-3">{legenda}</div>}
      <div className="flex-1">{children}</div>
    </Cartao>
  );
}

export function ItemLegenda({ cor, rotulo }: { cor: string; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-texto-suave">
      <span className="size-2.5 rounded-sm" style={{ background: cor }} aria-hidden="true" />
      {rotulo}
    </span>
  );
}

export function GraficoVazio({ texto }: { texto: string }) {
  return (
    <div className="grid h-full min-h-56 place-items-center rounded-lg border border-dashed border-borda bg-fundo/60 px-6 text-center text-sm text-texto-suave">
      {texto}
    </div>
  );
}
