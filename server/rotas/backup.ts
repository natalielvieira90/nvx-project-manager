/**
 * Rotas de backup: baixar uma cópia, listar/baixar backups automáticos e restaurar
 * (de um arquivo enviado ou de um backup automático).
 */
import express, { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { rmSync, writeFileSync } from 'node:fs';
import { versaoAtual } from '../db/conexao.ts';
import { ErroHttp } from '../http.ts';
import {
  arquivoTemporario,
  caminhoDoBackup,
  carimbo,
  copiarBanco,
  listarBackups,
  restaurarBackup,
} from '../servicos/backup.ts';
import type { Relogio } from './horas.ts';

export function rotasBackup(db: DatabaseSync, relogio: Relogio, pastaBackups: string | null) {
  const r = Router();

  r.get('/', (_req, res) => {
    res.json({ versaoBanco: versaoAtual(db), pastaBackups, automaticos: listarBackups(pastaBackups) });
  });

  // Cópia completa do banco neste momento, entregue como arquivo para salvar onde quiser.
  r.get('/baixar', (_req, res, next) => {
    const temp = arquivoTemporario();
    try {
      copiarBanco(db, temp);
    } catch (erro) {
      rmSync(temp, { force: true });
      next(erro);
      return;
    }
    res.download(temp, `nvx-backup-${carimbo(relogio())}.db`, () => rmSync(temp, { force: true }));
  });

  r.get('/automaticos/:nome', (req, res) => {
    res.download(caminhoDoBackup(pastaBackups, req.params.nome), req.params.nome);
  });

  r.post('/automaticos/:nome/restaurar', (req, res) => {
    const caminho = caminhoDoBackup(pastaBackups, req.params.nome);
    res.json(restaurarBackup(db, caminho, pastaBackups, relogio()));
  });

  // Restauração de um arquivo escolhido pelo usuário (corpo binário).
  r.post('/restaurar', express.raw({ type: 'application/octet-stream', limit: '500mb' }), (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ErroHttp(400, 'Selecione o arquivo de backup.');
    const temp = arquivoTemporario();
    writeFileSync(temp, req.body);
    try {
      res.json(restaurarBackup(db, temp, pastaBackups, relogio()));
    } finally {
      rmSync(temp, { force: true });
    }
  });

  return r;
}
