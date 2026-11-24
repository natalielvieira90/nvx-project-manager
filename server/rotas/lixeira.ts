/**
 * Lixeira: lista os registros excluídos (exclusão lógica) e permite restaurá-los.
 *
 * Regras ao restaurar:
 * - Projeto só volta se o cliente estiver ativo; registros de um projeto só voltam se o projeto estiver ativo.
 * - Excluir um projeto não apaga seus registros um a um: ao restaurá-lo, tudo volta junto.
 * - Não restaura se isso criar duplicidade (documento/e-mail/nome de cliente, nome de projeto,
 *   serviço repetido) ou horário sobreposto (lançamentos e atendimentos).
 * - Pagamentos gerados por atendimento voltam junto com o atendimento (não aparecem sozinhos).
 * - Não há exclusão definitiva pela interface: os dados ficam guardados.
 */
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { CATEGORIAS_HORA } from '../../shared/esquemas.ts';
import { formatarData, formatarDataHora, formatarDuracaoCurta, formatarHora, formatarMoeda } from '../../shared/formatacao.ts';
import type { CategoriaHora, ItemLixeira, TipoLixeira } from '../../shared/tipos.ts';
import { ErroHttp, idDaRota } from '../http.ts';
import { sincronizarPagamentoAtendimento } from './atendimentos.ts';
import type { Relogio } from './horas.ts';

const ROTULO_CATEGORIA: Record<CategoriaHora, string> = {
  desenvolvimento: 'Desenvolvimento',
  reuniao: 'Reunião',
  planejamento: 'Planejamento',
  correcao: 'Correção',
  suporte: 'Suporte',
};

const TABELA: Record<TipoLixeira, string> = {
  cliente: 'clientes',
  projeto: 'projetos',
  lancamento: 'lancamentos_horas',
  atendimento: 'atendimentos_suporte',
  servico: 'servicos_adicionais',
  pagamento: 'pagamentos',
};

const PROJETO_NA_LIXEIRA = 'O projeto está na lixeira. Restaure o projeto primeiro.';

export function rotasLixeira(db: DatabaseSync, relogio: Relogio) {
  const r = Router();
  const agora = () => relogio().toISOString();

  r.get('/', (_req, res) => {
    const itens: ItemLixeira[] = [];

    for (const c of db.prepare('SELECT id, nome, empresa, excluido_em FROM clientes WHERE excluido_em IS NOT NULL').all()) {
      itens.push({ tipo: 'cliente', id: Number(c.id), titulo: String(c.nome), detalhe: (c.empresa as string) ?? 'Cliente', excluidoEm: String(c.excluido_em), bloqueio: null });
    }
    for (const p of db
      .prepare(
        `SELECT p.id, p.nome, p.excluido_em, c.nome AS cliente, c.excluido_em AS cliente_excluido,
           (SELECT COUNT(*) FROM lancamentos_horas l WHERE l.projeto_id = p.id AND l.excluido_em IS NULL) AS lanc,
           (SELECT COUNT(*) FROM pagamentos g WHERE g.projeto_id = p.id AND g.excluido_em IS NULL) AS pag
         FROM projetos p JOIN clientes c ON c.id = p.cliente_id WHERE p.excluido_em IS NOT NULL`,
      )
      .all()) {
      itens.push({
        tipo: 'projeto',
        id: Number(p.id),
        titulo: String(p.nome),
        detalhe: `${p.cliente} · ${p.lanc} lançamento(s) de horas, ${p.pag} pagamento(s) voltam junto`,
        excluidoEm: String(p.excluido_em),
        bloqueio: p.cliente_excluido ? 'O cliente está na lixeira. Restaure o cliente primeiro.' : null,
      });
    }
    for (const l of db
      .prepare(
        `SELECT l.id, l.categoria, l.inicio, l.fim, l.duracao_segundos, l.descricao, l.excluido_em, p.nome AS projeto, p.excluido_em AS proj_excl
         FROM lancamentos_horas l JOIN projetos p ON p.id = l.projeto_id WHERE l.excluido_em IS NOT NULL`,
      )
      .all()) {
      itens.push({
        tipo: 'lancamento',
        id: Number(l.id),
        titulo: `${ROTULO_CATEGORIA[l.categoria as CategoriaHora]} · ${formatarDuracaoCurta(Number(l.duracao_segundos))}${l.descricao ? ` · ${l.descricao}` : ''}`,
        detalhe: `${l.projeto} · ${formatarDataHora(String(l.inicio))}–${formatarHora(String(l.fim))}`,
        excluidoEm: String(l.excluido_em),
        bloqueio: l.proj_excl ? PROJETO_NA_LIXEIRA : null,
      });
    }
    for (const a of db
      .prepare(
        `SELECT a.id, a.problema, a.inicio, a.valor_centavos, a.excluido_em, p.nome AS projeto, p.excluido_em AS proj_excl
         FROM atendimentos_suporte a JOIN projetos p ON p.id = a.projeto_id WHERE a.excluido_em IS NOT NULL`,
      )
      .all()) {
      itens.push({
        tipo: 'atendimento',
        id: Number(a.id),
        titulo: String(a.problema),
        detalhe: `${a.projeto} · ${formatarDataHora(String(a.inicio))} · ${formatarMoeda(Number(a.valor_centavos))}`,
        excluidoEm: String(a.excluido_em),
        bloqueio: a.proj_excl ? PROJETO_NA_LIXEIRA : null,
      });
    }
    for (const s of db
      .prepare(
        `SELECT s.id, s.descricao, s.data, s.valor_centavos, s.excluido_em, p.nome AS projeto, p.excluido_em AS proj_excl
         FROM servicos_adicionais s JOIN projetos p ON p.id = s.projeto_id WHERE s.excluido_em IS NOT NULL`,
      )
      .all()) {
      itens.push({
        tipo: 'servico',
        id: Number(s.id),
        titulo: String(s.descricao),
        detalhe: `${s.projeto} · ${formatarData(String(s.data))} · ${formatarMoeda(Number(s.valor_centavos))}`,
        excluidoEm: String(s.excluido_em),
        bloqueio: s.proj_excl ? PROJETO_NA_LIXEIRA : null,
      });
    }
    for (const g of db
      .prepare(
        `SELECT g.id, g.data, g.valor_centavos, g.excluido_em, p.nome AS projeto, p.excluido_em AS proj_excl
         FROM pagamentos g JOIN projetos p ON p.id = g.projeto_id WHERE g.excluido_em IS NOT NULL AND g.atendimento_id IS NULL`,
      )
      .all()) {
      itens.push({
        tipo: 'pagamento',
        id: Number(g.id),
        titulo: `Pagamento de ${formatarMoeda(Number(g.valor_centavos))}`,
        detalhe: `${g.projeto} · ${formatarData(String(g.data))}`,
        excluidoEm: String(g.excluido_em),
        bloqueio: g.proj_excl ? PROJETO_NA_LIXEIRA : null,
      });
    }

    itens.sort((a, b) => b.excluidoEm.localeCompare(a.excluidoEm));
    res.json(itens);
  });

  function projetoAtivo(projetoId: number) {
    const p = db.prepare('SELECT excluido_em FROM projetos WHERE id = ?').get(projetoId);
    if (!p || p.excluido_em) throw new ErroHttp(409, PROJETO_NA_LIXEIRA);
  }

  /** Mesmo período já ocupado por outro lançamento ou atendimento ativo. */
  function verificarHorario(inicio: string, fim: string, ignorarLancamento: number, ignorarAtendimento: number) {
    const lanc = db
      .prepare(
        `SELECT l.inicio, l.fim, p.nome FROM lancamentos_horas l JOIN projetos p ON p.id = l.projeto_id
         WHERE l.excluido_em IS NULL AND p.excluido_em IS NULL AND l.id <> ? AND (l.atendimento_id IS NULL OR l.atendimento_id <> ?)
           AND l.inicio < ? AND l.fim > ? LIMIT 1`,
      )
      .get(ignorarLancamento, ignorarAtendimento, fim, inicio);
    const atend = db
      .prepare(
        `SELECT a.inicio, a.fim, p.nome FROM atendimentos_suporte a JOIN projetos p ON p.id = a.projeto_id
         WHERE a.excluido_em IS NULL AND p.excluido_em IS NULL AND a.id <> ? AND a.inicio < ? AND a.fim > ? LIMIT 1`,
      )
      .get(ignorarAtendimento, fim, inicio);
    const outro = lanc ?? atend;
    if (outro) {
      throw new ErroHttp(
        409,
        `Não é possível restaurar: o horário conflita com ${lanc ? 'o lançamento' : 'o atendimento'} de ${formatarDataHora(String(outro.inicio))}–${formatarHora(String(outro.fim))} (${outro.nome}). Exclua ou ajuste esse registro antes.`,
      );
    }
  }

  r.post('/:tipo/:id/restaurar', (req, res) => {
    const tipo = req.params.tipo as TipoLixeira;
    if (!(tipo in TABELA)) throw new ErroHttp(400, 'Tipo de registro inválido.');
    const id = idDaRota(req.params.id);
    const registro = db.prepare(`SELECT * FROM ${TABELA[tipo]} WHERE id = ? AND excluido_em IS NOT NULL`).get(id);
    if (!registro) throw new ErroHttp(404, 'Registro não encontrado na lixeira.');

    if (tipo === 'cliente') {
      const conflito = db
        .prepare(
          `SELECT nome FROM clientes WHERE excluido_em IS NULL AND id <> ? AND (
             (documento IS NOT NULL AND documento = ?) OR (email IS NOT NULL AND lower(email) = lower(?))
             OR (lower(nome) = lower(?) AND lower(COALESCE(empresa,'')) = lower(?)))`,
        )
        .get(id, registro.documento as string | null, registro.email as string | null, String(registro.nome), (registro.empresa as string) ?? '');
      if (conflito) throw new ErroHttp(409, `Não é possível restaurar: o cliente ativo "${conflito.nome}" já usa este nome, documento ou e-mail.`);
    }
    if (tipo === 'projeto') {
      const c = db.prepare('SELECT excluido_em FROM clientes WHERE id = ?').get(Number(registro.cliente_id));
      if (!c || c.excluido_em) throw new ErroHttp(409, 'O cliente está na lixeira. Restaure o cliente primeiro.');
      const dup = db
        .prepare('SELECT 1 FROM projetos WHERE cliente_id = ? AND lower(nome) = lower(?) AND excluido_em IS NULL AND id <> ?')
        .get(Number(registro.cliente_id), String(registro.nome), id);
      if (dup) throw new ErroHttp(409, 'Não é possível restaurar: o cliente já tem um projeto ativo com este nome.');
    }
    if (tipo === 'lancamento' || tipo === 'atendimento' || tipo === 'servico' || tipo === 'pagamento') {
      projetoAtivo(Number(registro.projeto_id));
    }
    if (tipo === 'lancamento') {
      if (!(CATEGORIAS_HORA as readonly string[]).includes(String(registro.categoria))) throw new ErroHttp(400, 'Registro inválido.');
      verificarHorario(String(registro.inicio), String(registro.fim), id, Number(registro.atendimento_id ?? 0));
    }
    if (tipo === 'atendimento') verificarHorario(String(registro.inicio), String(registro.fim), 0, id);
    if (tipo === 'servico') {
      const dup = db
        .prepare(
          'SELECT 1 FROM servicos_adicionais WHERE projeto_id = ? AND lower(descricao) = lower(?) AND data = ? AND excluido_em IS NULL AND id <> ?',
        )
        .get(Number(registro.projeto_id), String(registro.descricao), String(registro.data), id);
      if (dup) throw new ErroHttp(409, 'Não é possível restaurar: já existe um serviço com esta descrição e data no projeto.');
    }
    if (tipo === 'pagamento' && registro.atendimento_id !== null) {
      throw new ErroHttp(409, 'Este pagamento foi gerado por um atendimento. Restaure o atendimento.');
    }

    db.exec('BEGIN');
    try {
      db.prepare(`UPDATE ${TABELA[tipo]} SET excluido_em = NULL, atualizado_em = ? WHERE id = ?`).run(agora(), id);
      if (tipo === 'atendimento') sincronizarPagamentoAtendimento(db, relogio, id);
      db.exec('COMMIT');
    } catch (erro) {
      db.exec('ROLLBACK');
      throw erro;
    }
    res.json({ restaurado: true });
  });

  return r;
}
