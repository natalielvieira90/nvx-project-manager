import express, { type ErrorRequestHandler } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { versaoAtual } from './db/conexao.ts';
import { calcularIndicadores, mesAtual } from './servicos/dashboard.ts';
import { rotasClientes } from './rotas/clientes.ts';
import { rotasProjetos } from './rotas/projetos.ts';
import { rotasCronometro, rotasLancamentos, type Relogio } from './rotas/horas.ts';
import { rotasAtendimentos } from './rotas/atendimentos.ts';
import { rotasFinanceiro, rotasPagamentos, rotasServicos } from './rotas/financeiro.ts';
import { rotasRelatorios } from './rotas/relatorios.ts';
import { rotasBackup } from './rotas/backup.ts';
import { rotasLixeira } from './rotas/lixeira.ts';
import { ErroHttp } from './http.ts';

export interface OpcoesApp {
  db: DatabaseSync;
  /** Pasta do frontend compilado (servida em produção). */
  pastaFrontend?: string;
  /** Fonte da hora atual (substituível nos testes). */
  relogio?: Relogio;
  /** Pasta dos backups automáticos (null = sem backups automáticos, ex.: alguns testes). */
  pastaBackups?: string | null;
}

/** Monta a aplicação Express. Separado do `index.ts` para facilitar testes. */
export function criarApp({ db, pastaFrontend, relogio = () => new Date(), pastaBackups = null }: OpcoesApp) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();

  api.get('/saude', (_req, res) => {
    res.json({ ok: true, versaoBanco: versaoAtual(db), horario: new Date().toISOString() });
  });

  api.get('/dashboard', (req, res) => {
    const mes = typeof req.query.mes === 'string' ? req.query.mes : mesAtual();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      res.status(400).json({ erro: 'Mês inválido. Use o formato AAAA-MM.' });
      return;
    }
    res.json(calcularIndicadores(db, mes));
  });

  api.use('/clientes', rotasClientes(db));
  api.use('/projetos', rotasProjetos(db));
  api.use('/cronometro', rotasCronometro(db, relogio));
  api.use('/lancamentos', rotasLancamentos(db, relogio));
  api.use('/atendimentos', rotasAtendimentos(db, relogio));
  api.use('/financeiro', rotasFinanceiro(db, relogio));
  api.use('/servicos', rotasServicos(db, relogio));
  api.use('/pagamentos', rotasPagamentos(db, relogio));
  api.use('/relatorios', rotasRelatorios(db, relogio));
  api.use('/backup', rotasBackup(db, relogio, pastaBackups));
  api.use('/lixeira', rotasLixeira(db, relogio));
  // Rotas dos demais módulos serão registradas aqui nas próximas etapas.

  api.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.use('/api', api);

  // Em produção, o próprio servidor entrega a interface (SPA).
  if (pastaFrontend && existsSync(pastaFrontend)) {
    app.use(express.static(pastaFrontend));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(pastaFrontend, 'index.html')));
  }

  const tratarErro: ErrorRequestHandler = (erro, _req, res, _next) => {
    if (erro instanceof ErroHttp) {
      res.status(erro.status).json({ erro: erro.message, detalhes: erro.detalhes });
      return;
    }
    if (erro?.type === 'entity.parse.failed') {
      res.status(400).json({ erro: 'Os dados enviados estão em formato inválido.' });
      return;
    }
    if (typeof erro?.status === 'number' && erro.status < 500) {
      res.status(erro.status).json({ erro: 'Requisição inválida.' });
      return;
    }
    // Erros inesperados: registra o detalhe no console e mostra mensagem genérica.
    console.error('[erro]', erro);
    res.status(500).json({ erro: 'Erro interno. Tente novamente; se persistir, reinicie o programa.' });
  };
  app.use(tratarErro);

  return app;
}
