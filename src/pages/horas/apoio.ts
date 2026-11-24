import { useEffect, useState } from 'react';
import { api } from '../../lib/api.ts';
import type { ProjetoResumo } from '../../../shared/tipos.ts';

/** Projetos que podem receber horas (todos, exceto cancelados). */
export function useProjetosParaHoras() {
  const [projetos, setProjetos] = useState<ProjetoResumo[] | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    api<ProjetoResumo[]>('/projetos')
      .then((l) => setProjetos(l.filter((p) => p.status !== 'cancelado')))
      .catch(() => setErro(true));
  }, []);
  return { projetos, erro };
}

const dois = (n: number) => String(n).padStart(2, '0');

/** ISO UTC → "AAAA-MM-DD" no horário local. */
export function isoParaDataLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** ISO UTC → "HH:MM" no horário local. */
export function isoParaHoraLocal(iso: string): string {
  const d = new Date(iso);
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** Data + hora locais → ISO UTC. Retorna null se inválido. */
export function localParaIso(data: string, hora: string, somarDias = 0): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) return null;
  const [a, m, d] = data.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  const dt = new Date(a, m - 1, d + somarDias, h, min, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}
