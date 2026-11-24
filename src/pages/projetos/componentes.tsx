import { Etiqueta, cx } from '../../components/ui.tsx';
import { STATUS_PROJETO } from '../../lib/rotulos.ts';
import { formatarData, formatarDuracao, formatarDuracaoCurta, hojeIso } from '../../../shared/formatacao.ts';
import type { StatusProjeto } from '../../../shared/tipos.ts';

export function EtiquetaStatus({ status }: { status: StatusProjeto }) {
  const s = STATUS_PROJETO[status];
  return <Etiqueta tom={s.tom}>{s.rotulo}</Etiqueta>;
}

const ENCERRADOS: StatusProjeto[] = ['concluido', 'cancelado'];

/** Prazo com destaque quando atrasado ou vencendo em até 7 dias. */
export function Prazo({ prazo, status }: { prazo: string | null; status: StatusProjeto }) {
  if (!prazo) return <span className="text-texto-suave">Sem prazo</span>;
  if (ENCERRADOS.includes(status)) return <span className="text-texto-suave">{formatarData(prazo)}</span>;
  const hoje = hojeIso();
  const dias = Math.round((Date.parse(`${prazo}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
  if (dias < 0) {
    return (
      <span className="font-medium text-perigo">
        {formatarData(prazo)} <span className="text-xs">· atrasado {-dias} dia(s)</span>
      </span>
    );
  }
  if (dias <= 7) {
    return (
      <span className="font-medium text-alerta">
        {formatarData(prazo)} <span className="text-xs">· {dias === 0 ? 'hoje' : `em ${dias} dia(s)`}</span>
      </span>
    );
  }
  return <span>{formatarData(prazo)}</span>;
}

/** Horas trabalhadas em relação à estimativa. Acima de 100% fica em alerta. */
export function ProgressoHoras({
  trabalhadas,
  estimativa,
  compacto = false,
}: {
  trabalhadas: number;
  estimativa: number;
  compacto?: boolean;
}) {
  if (!estimativa) {
    return <span className="tabular text-texto-suave">{formatarDuracao(trabalhadas)}</span>;
  }
  const pct = (trabalhadas / estimativa) * 100;
  const estourou = pct > 100;
  return (
    <div className={compacto ? 'w-28' : ''}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="tabular whitespace-nowrap font-medium text-texto">
          {(compacto ? formatarDuracaoCurta : formatarDuracao)(trabalhadas)}{' '}
          <span className="font-normal text-texto-suave">de {(compacto ? formatarDuracaoCurta : formatarDuracao)(estimativa)}</span>
        </span>
        {!compacto && <span className={cx('tabular', estourou ? 'font-medium text-alerta' : 'text-texto-suave')}>{Math.round(pct)}%</span>}
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fundo"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Horas trabalhadas em relação à estimativa"
      >
        <div
          className={cx('h-full rounded-full', estourou ? 'bg-alerta' : 'bg-serie-dev')}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
