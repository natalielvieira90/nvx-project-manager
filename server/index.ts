/**
 * Ponto de entrada da API em modo DESENVOLVIMENTO (`npm run dev`).
 * O aplicativo instalado usa `electron/main.ts`, que inicia o mesmo servidor internamente.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { iniciarServidor } from './iniciar.ts';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const servidor = await iniciarServidor({
  porta: Number(process.env.PORTA ?? 3000),
  caminhoBanco: process.env.CAMINHO_BANCO ?? join(raiz, 'data', 'nvx.db'),
});
console.log(`NVX Project Manager — API de desenvolvimento em http://127.0.0.1:${servidor.porta}`);

async function encerrar() {
  await servidor.encerrar();
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
