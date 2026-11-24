/**
 * Preenche o banco de DESENVOLVIMENTO (data/nvx.db) com dados fictícios para testar telas.
 * Uso: npm run dados-exemplo
 * Recusa-se a rodar se o banco já tiver clientes (não mistura com dados reais).
 * Nunca afeta o banco do aplicativo instalado (%APPDATA%).
 */
import { join } from 'node:path';
import { abrirBanco } from '../server/db/conexao.ts';

const caminho = process.env.CAMINHO_BANCO ?? join(import.meta.dirname, '..', 'data', 'nvx.db');
const db = abrirBanco(caminho);

if (Number(db.prepare('SELECT COUNT(*) AS n FROM clientes').get()!.n) > 0) {
  console.error(`O banco ${caminho} já possui dados. Nada foi alterado.`);
  process.exit(1);
}

const H = 3600;
const hoje = new Date();
const A = hoje.getFullYear();
const M = hoje.getMonth();
const iso = (diasAtras: number, hora: number, min = 0) => {
  const d = new Date(A, M, hoje.getDate() - diasAtras, hora, min);
  return d.toISOString();
};
const dataMesesAtras = (meses: number, dia: number) => {
  const d = new Date(A, M - meses, dia);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const run = (sql: string, ...p: (string | number | null)[]) => Number(db.prepare(sql).run(...p).lastInsertRowid);

db.exec('BEGIN');
const clientes = [
  ['Mariana Costa', 'Padaria Pão Dourado', '(11) 98888-1111', 'mariana@exemplo.com'],
  ['Roberto Lima', 'Lima Contabilidade', '(11) 97777-2222', 'roberto@exemplo.com'],
  ['Ana Souza', 'Clínica Bem Estar', '(21) 96666-3333', 'ana@exemplo.com'],
  ['Carlos Mendes', 'Mendes Autopeças', '(31) 95555-4444', 'carlos@exemplo.com'],
].map(([nome, empresa, tel, email]) =>
  run('INSERT INTO clientes (nome, empresa, telefone, email) VALUES (?, ?, ?, ?)', nome, empresa, tel, email),
);

const projeto = (cli: number, nome: string, status: string, valor: number, desconto = 0) =>
  run(
    `INSERT INTO projetos (cliente_id, nome, status, valor_fechado_centavos, estimativa_segundos,
       valor_hora_dev_centavos, valor_hora_suporte_centavos, desconto_centavos, data_inicio)
     VALUES (?, ?, ?, ?, ?, 12000, 15000, ?, ?)`,
    cli, nome, status, valor, 60 * H, desconto, dataMesesAtras(3, 5),
  );
const pSite = projeto(clientes[0], 'Site institucional', 'em_andamento', 480000, 30000);
const pSistema = projeto(clientes[1], 'Sistema de protocolos', 'em_andamento', 1250000);
const pAgenda = projeto(clientes[2], 'Agendamento online', 'pausado', 620000);
const pLoja = projeto(clientes[3], 'Loja virtual', 'concluido', 900000);
projeto(clientes[2], 'App de lembretes', 'orcamento', 750000);
projeto(clientes[0], 'Cardápio digital', 'aguardando_aprovacao', 180000);

const lanc = (p: number, cat: string, dias: number, hora: number, horas: number, sit: string, desc: string) => {
  const ini = iso(dias, hora);
  const fim = new Date(new Date(ini).getTime() + horas * H * 1000).toISOString();
  run(
    `INSERT INTO lancamentos_horas (projeto_id, categoria, descricao, inicio, fim, duracao_segundos, origem, situacao_cobranca)
     VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)`,
    p, cat, desc, ini, fim, Math.round(horas * H), sit,
  );
};
const dia = Math.max(0, hoje.getDate() - 1); // mantém os lançamentos dentro do mês atual
const d = (n: number) => Math.min(n, dia);
lanc(pSistema, 'desenvolvimento', d(1), 9, 4, 'incluido_pacote', 'Cadastro de protocolos');
lanc(pSistema, 'desenvolvimento', d(2), 9, 5.5, 'incluido_pacote', 'Relatórios');
lanc(pSistema, 'reuniao', d(3), 14, 1, 'incluido_pacote', 'Alinhamento semanal');
lanc(pSistema, 'desenvolvimento', d(5), 9, 3, 'faturavel', 'Integração extra solicitada');
lanc(pSite, 'desenvolvimento', d(2), 14, 3.5, 'incluido_pacote', 'Página de produtos');
lanc(pSite, 'correcao', d(4), 10, 1.5, 'incluido_pacote', 'Ajustes de layout');
lanc(pSite, 'planejamento', d(6), 9, 2, 'incluido_pacote', 'Mapa do site');
lanc(pAgenda, 'desenvolvimento', d(8), 9, 2.5, 'incluido_pacote', 'Tela de horários');
lanc(pLoja, 'suporte', d(3), 16, 1, 'faturavel', 'Dúvida sobre fretes');
lanc(pLoja, 'suporte', d(7), 11, 0.75, 'faturado', 'Atualização de preços');

const atend = (p: number, cli: number, dias: number, horas: number, valor: number, sit: string, problema: string) => {
  const ini = iso(dias, 15);
  const fim = new Date(new Date(ini).getTime() + horas * H * 1000).toISOString();
  run(
    `INSERT INTO atendimentos_suporte (cliente_id, projeto_id, inicio, fim, duracao_segundos, problema, solucao, valor_centavos, situacao)
     VALUES (?, ?, ?, ?, ?, ?, 'Resolvido remotamente', ?, ?)`,
    cli, p, ini, fim, Math.round(horas * H), problema, valor, sit,
  );
};
atend(pLoja, clientes[3], d(2), 1.5, 22500, 'pendente', 'Pagamento via Pix não confirmava');
atend(pLoja, clientes[3], d(9), 1, 15000, 'pago', 'Erro ao cadastrar produto');

run("INSERT INTO servicos_adicionais (projeto_id, descricao, data, valor_centavos) VALUES (?, 'Hospedagem anual configurada', ?, 45000)", pSite, dataMesesAtras(0, 1));

const pag = (p: number, meses: number, valor: number) =>
  run("INSERT INTO pagamentos (projeto_id, data, valor_centavos, forma) VALUES (?, ?, ?, 'pix')", p, dataMesesAtras(meses, 10), valor);
pag(pLoja, 9, 300000);
pag(pLoja, 7, 300000);
pag(pLoja, 5, 300000);
pag(pLoja, 4, 15000);
pag(pSite, 3, 150000);
pag(pSistema, 2, 400000);
pag(pSite, 1, 150000);
pag(pAgenda, 1, 310000);
pag(pSistema, 0, 400000);
db.exec('COMMIT');
db.close();
console.log(`Dados de exemplo criados em ${caminho}`);
