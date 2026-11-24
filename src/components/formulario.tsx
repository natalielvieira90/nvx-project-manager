/** Campos de formulário padronizados (rótulo, dica, mensagem de erro e acessibilidade). */
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { centavosParaTexto, reaisParaCentavos } from '../../shared/formatacao.ts';
import { cx } from './ui.tsx';

const classeEntrada =
  'block w-full rounded-md border bg-superficie px-3 text-sm text-texto placeholder:text-texto-suave/60 ' +
  'transition-colors disabled:bg-fundo disabled:text-texto-suave';

interface PropsCampo {
  rotulo: string;
  erro?: string;
  dica?: string;
  obrigatorio?: boolean;
  className?: string;
}

function Envoltorio({
  id,
  rotulo,
  erro,
  dica,
  obrigatorio,
  className,
  children,
}: PropsCampo & { id: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {rotulo}
        {obrigatorio && (
          <span className="text-perigo" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="mt-1.5 text-xs font-medium text-perigo">
          {erro}
        </p>
      ) : (
        dica && (
          <p id={`${id}-dica`} className="mt-1.5 text-xs text-texto-suave">
            {dica}
          </p>
        )
      )}
    </div>
  );
}

function atributosAcessiveis(id: string, erro?: string, dica?: string, obrigatorio?: boolean) {
  return {
    id,
    'aria-invalid': erro ? true : undefined,
    'aria-describedby': erro ? `${id}-erro` : dica ? `${id}-dica` : undefined,
    'aria-required': obrigatorio || undefined,
  };
}

export function CampoTexto({
  rotulo,
  erro,
  dica,
  obrigatorio,
  className,
  ...entrada
}: PropsCampo & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Envoltorio id={id} {...{ rotulo, erro, dica, obrigatorio, className }}>
      <input
        {...entrada}
        {...atributosAcessiveis(id, erro, dica, obrigatorio)}
        className={cx(classeEntrada, 'h-10', erro ? 'border-perigo' : 'border-borda focus:border-destaque-500')}
      />
    </Envoltorio>
  );
}

export function CampoAreaTexto({
  rotulo,
  erro,
  dica,
  obrigatorio,
  className,
  ...entrada
}: PropsCampo & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Envoltorio id={id} {...{ rotulo, erro, dica, obrigatorio, className }}>
      <textarea
        rows={3}
        {...entrada}
        {...atributosAcessiveis(id, erro, dica, obrigatorio)}
        className={cx(classeEntrada, 'resize-y py-2', erro ? 'border-perigo' : 'border-borda focus:border-destaque-500')}
      />
    </Envoltorio>
  );
}

/** Caixa de busca com ícone. */
export function CampoBusca({
  valor,
  aoMudar,
  placeholder,
  rotulo,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder: string;
  rotulo: string;
}) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-suave"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={rotulo}
        className={cx(classeEntrada, 'h-10 border-borda pl-9 focus:border-destaque-500')}
      />
    </div>
  );
}

export function CampoSelecao({
  rotulo,
  erro,
  dica,
  obrigatorio,
  className,
  children,
  ...entrada
}: PropsCampo & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Envoltorio id={id} {...{ rotulo, erro, dica, obrigatorio, className }}>
      <select
        {...entrada}
        {...atributosAcessiveis(id, erro, dica, obrigatorio)}
        className={cx(classeEntrada, 'h-10 pr-8', erro ? 'border-perigo' : 'border-borda focus:border-destaque-500')}
      >
        {children}
      </select>
    </Envoltorio>
  );
}

/**
 * Campo de valor em reais. Guarda o texto digitado; formata como "1.234,56" ao sair do campo.
 * Converta com `reaisParaCentavos` ao salvar.
 */
export function CampoMoeda({
  rotulo,
  erro,
  dica,
  obrigatorio,
  className,
  valor,
  aoMudar,
}: PropsCampo & { valor: string; aoMudar: (texto: string) => void }) {
  const id = useId();
  return (
    <Envoltorio id={id} {...{ rotulo, erro, dica, obrigatorio, className }}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-suave">R$</span>
        <input
          {...atributosAcessiveis(id, erro, dica, obrigatorio)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={valor}
          onChange={(e) => aoMudar(e.target.value.replace(/[^\d.,]/g, ''))}
          onBlur={() => {
            const c = reaisParaCentavos(valor);
            if (c !== null && c >= 0) aoMudar(c === 0 ? '' : centavosParaTexto(c));
          }}
          className={cx(classeEntrada, 'tabular h-10 pl-10', erro ? 'border-perigo' : 'border-borda focus:border-destaque-500')}
        />
      </div>
    </Envoltorio>
  );
}
