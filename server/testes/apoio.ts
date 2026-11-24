/** Sobe a API com banco em memória para testes de rotas. */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import { abrirBanco } from '../db/conexao.ts';
import { criarApp } from '../app.ts';

/** Relógio controlável: `relogio.avancar(segundos)` simula a passagem do tempo. */
export function relogioDeTeste(inicio = '2026-11-24T12:00:00.000Z') {
  let atual = Date.parse(inicio);
  const fn = () => new Date(atual);
  fn.avancar = (segundos: number) => {
    atual += segundos * 1000;
  };
  fn.definir = (iso: string) => {
    atual = Date.parse(iso);
  };
  return fn;
}

export async function servidorDeTeste(relogio: () => Date = () => new Date(), pastaBackups: string | null = null) {
  const db: DatabaseSync = abrirBanco(':memory:');
  const servidor: Server = await new Promise((ok) => {
    const s = criarApp({ db, relogio, pastaBackups }).listen(0, '127.0.0.1', () => ok(s));
  });
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function chamar(metodo: string, caminho: string, envio?: unknown): Promise<{ status: number; corpo: any }> {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: envio === undefined ? undefined : JSON.stringify(envio),
    });
    return { status: r.status, corpo: r.status === 204 ? null : await r.json() };
  }

  return { db, base, chamar, fechar: () => servidor.close() };
}
