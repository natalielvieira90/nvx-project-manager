import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { cx } from './ui.tsx';

type TipoAviso = 'sucesso' | 'erro';
interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}

const Contexto = createContext<(tipo: TipoAviso, texto: string) => void>(() => {});

/** Mostra avisos rápidos no canto da tela (ex.: "Cliente salvo"). */
export function useAviso() {
  const avisar = useContext(Contexto);
  return {
    sucesso: (texto: string) => avisar('sucesso', texto),
    erro: (texto: string) => avisar('erro', texto),
  };
}

let proximoId = 1;

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const remover = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);

  const avisar = useCallback(
    (tipo: TipoAviso, texto: string) => {
      const id = proximoId++;
      setAvisos((a) => [...a.slice(-3), { id, tipo, texto }]);
      setTimeout(() => remover(id), tipo === 'erro' ? 7000 : 3500);
    },
    [remover],
  );

  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:bottom-6">
        {avisos.map((a) => (
          <div
            key={a.id}
            role={a.tipo === 'erro' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-superficie px-4 py-3 text-sm shadow-lg',
              a.tipo === 'erro' ? 'border-red-200' : 'border-emerald-200',
            )}
          >
            {a.tipo === 'erro' ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-perigo" aria-hidden="true" />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-sucesso" aria-hidden="true" />
            )}
            <p className="flex-1">{a.texto}</p>
            <button
              type="button"
              onClick={() => remover(a.id)}
              className="-m-1 rounded p-1 text-texto-suave hover:text-texto"
              aria-label="Fechar aviso"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}
