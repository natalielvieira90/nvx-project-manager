/**
 * Estado global do cronômetro (usado na página de horas e no menu lateral).
 *
 * A fonte da verdade é o servidor/banco. A tela só "anda" o relógio a cada segundo a partir
 * dos horários recebidos, corrigindo a diferença entre o relógio da tela e o do servidor.
 * Ao voltar o foco para a janela, o estado é recarregado do servidor.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api.ts';
import type { CronometroAtivo } from '../../shared/tipos.ts';

interface ContextoCronometro {
  cronometro: CronometroAtivo | null;
  /** Segundos trabalhados, atualizado a cada segundo. */
  segundos: number;
  carregado: boolean;
  definir: (c: CronometroAtivo | null) => void;
  recarregar: () => Promise<void>;
}

const Contexto = createContext<ContextoCronometro>({
  cronometro: null,
  segundos: 0,
  carregado: false,
  definir: () => {},
  recarregar: async () => {},
});

export const useCronometro = () => useContext(Contexto);

function calcular(c: CronometroAtivo, diferencaMs: number): number {
  if (!c.segmentoIniciadoEm) return c.segundosAcumulados;
  const agoraServidor = Date.now() + diferencaMs;
  return c.segundosAcumulados + Math.max(0, Math.floor((agoraServidor - Date.parse(c.segmentoIniciadoEm)) / 1000));
}

export function ProvedorCronometro({ children }: { children: ReactNode }) {
  const [cronometro, setCronometro] = useState<CronometroAtivo | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [carregado, setCarregado] = useState(false);
  const diferenca = useRef(0);

  const definir = useCallback((c: CronometroAtivo | null) => {
    if (c) diferenca.current = Date.parse(c.agora) - Date.now();
    setCronometro(c);
    setSegundos(c ? calcular(c, diferenca.current) : 0);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      definir(await api<CronometroAtivo | null>('/cronometro'));
    } catch {
      /* mantém o último estado; a página mostra erros nas ações */
    } finally {
      setCarregado(true);
    }
  }, [definir]);

  useEffect(() => {
    recarregar();
    const aoFocar = () => document.visibilityState === 'visible' && recarregar();
    document.addEventListener('visibilitychange', aoFocar);
    window.addEventListener('focus', aoFocar);
    const periodico = setInterval(recarregar, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', aoFocar);
      window.removeEventListener('focus', aoFocar);
      clearInterval(periodico);
    };
  }, [recarregar]);

  // Relógio da tela (só quando está rodando).
  useEffect(() => {
    if (!cronometro?.segmentoIniciadoEm) return;
    // Atualiza 4x por segundo para a virada do segundo aparecer sem atraso perceptível.
    const t = setInterval(() => setSegundos(calcular(cronometro, diferenca.current)), 250);
    return () => clearInterval(t);
  }, [cronometro]);

  // Mostra o tempo no título da janela enquanto roda.
  useEffect(() => {
    const base = 'NVX Project Manager';
    if (!cronometro) {
      document.title = base;
      return;
    }
    const h = Math.floor(segundos / 3600);
    const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, '0');
    const s = String(segundos % 60).padStart(2, '0');
    document.title = `${cronometro.segmentoIniciadoEm ? '▶' : '❚❚'} ${h}:${m}:${s} · ${cronometro.projetoNome} — ${base}`;
  }, [cronometro, segundos]);

  return (
    <Contexto.Provider value={{ cronometro, segundos, carregado, definir, recarregar }}>{children}</Contexto.Provider>
  );
}
