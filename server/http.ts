import type { z } from 'zod';
import { errosPorCampo } from '../shared/esquemas.ts';

/** Erro com status HTTP e mensagem para o usuário (em português). */
export class ErroHttp extends Error {
  constructor(
    public status: number,
    message: string,
    public detalhes?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Valida o corpo da requisição; em caso de erro responde 400 com o erro de cada campo. */
export function validar<T extends z.ZodType>(esquema: T, dados: unknown): z.output<T> {
  const r = esquema.safeParse(dados ?? {});
  if (!r.success) throw new ErroHttp(400, 'Verifique os campos destacados.', errosPorCampo(r.error));
  return r.data;
}

/** Lê um id numérico da URL. */
export function idDaRota(valor: string | undefined): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new ErroHttp(400, 'Identificador inválido.');
  return id;
}

export const agoraIso = () => new Date().toISOString();
