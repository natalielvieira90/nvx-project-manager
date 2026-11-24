# NVX Project Manager — Arquitetura

> NVX AI Factory (versão não lançada em 24/11/2026) · skills: `novo-projeto`, `arquiteto-de-projetos`.

## Visão geral

**Aplicativo desktop Windows (Electron)**, distribuído por um instalador NSIS (`.exe`).

```
NVX Project Manager.exe (Electron)
 ├─ Processo principal (electron/main.ts)
 │    ├─ inicia o servidor interno Express em 127.0.0.1:<porta livre>
 │    └─ node:sqlite → %APPDATA%/NVX Project Manager/dados/nvx.db (modo WAL)
 └─ Janela (React + Tailwind) ── fetch /api/* ──► servidor interno
```

- **Instância única** (`requestSingleInstanceLock`): evita dois processos gravando no mesmo banco.
- **Ao sair**, o servidor é encerrado e o banco é fechado (checkpoint do WAL) antes de o processo terminar.
- **Janela isolada** (`contextIsolation`, `sandbox`, sem `nodeIntegration`). A navegação fica restrita ao servidor interno, e links externos abrem no navegador padrão.
- **Dados em `userData`**, fora da pasta de instalação: atualizar ou desinstalar não apaga os dados (`deleteAppDataOnUninstall: false`).
- **Em desenvolvimento** (`npm run dev`), o Vite (5173) repassa `/api` para a API (3000), com o banco em `data/nvx.db`.

## Stack e justificativa

| Camada | Escolha | Motivo |
|---|---|---|
| Desktop | Electron 45 + electron-builder (NSIS) | Reaproveita toda a interface; instalador `.exe` com atalhos e pasta configurável |
| Interface | React 19 + TypeScript + Vite | Solicitado; rápido e tipado |
| Estilo | Tailwind CSS 4 com tokens em `@theme` | Identidade visual centralizada em um único arquivo |
| Rotas | React Router 7 | Navegação lateral com uma rota por módulo |
| Gráficos | Recharts | Gratuito, funciona offline |
| Ícones | lucide-react | Leve e consistente |
| Fonte | Inter (pacote local `@fontsource-variable/inter`) | Embutida no programa, sem internet |
| API interna | Express 5 (empacotado com esbuild) | A mesma API no desenvolvimento e no aplicativo |
| Banco | SQLite via `node:sqlite` (embutido no Node/Electron) | Sem módulo nativo para compilar; testado no Electron 45 (SQLite 3.54) |
| Validação | Zod (a partir da Etapa 3) | Mesmos esquemas na API e na interface |
| PDF / CSV | jsPDF 4 + jspdf-autotable 5 / gerador próprio (`src/lib/exportar.ts`) | Gerados no próprio computador; o PDF é carregado sob demanda |
| Testes | Vitest | Integrado ao Vite |

## Estrutura de pastas

```
electron/
  main.ts           processo principal: servidor interno, janela, menu, encerramento seguro
server/
  iniciar.ts        abre o banco e inicia o servidor (usado pelo Electron e pelo modo dev)
  index.ts          entrada do modo desenvolvimento
  app.ts            montagem do Express (rotas, erros, interface)
  servicos/         regras de negócio (financeiro.ts: agregação por projeto; dashboard.ts: indicadores)
  rotas/            rotas da API por módulo (clientes.ts, projetos.ts, horas.ts, atendimentos.ts, financeiro.ts, relatorios.ts, backup.ts, lixeira.ts)
  testes/apoio.ts   sobe a API com banco em memória para testes
  http.ts           ErroHttp, validação de corpo e de id
  db/conexao.ts     abertura do banco, PRAGMAs, aplicação de migrações
  db/migracoes.ts   migrações versionadas (nunca editar uma já publicada)
src/
  components/       Layout, Logo, UI básica, Modal/Confirmação, Avisos, campos de formulário
  pages/            uma página por módulo
  lib/api.ts        cliente HTTP com mensagens de erro em português
  navegacao.ts      itens do menu (fonte única para menu e rotas)
  index.css         tema NVX (cores, fonte, raios, sombras)
shared/
  formatacao.ts     R$, datas, durações e cálculo de valor × tempo
  financeiro.ts     regra única de total/pendente do projeto (dashboard, financeiro, relatórios)
  tipos.ts          tipos trocados entre API e interface
  esquemas.ts       validações Zod (mesmas regras na interface e na API)
  documentos.ts     CPF/CNPJ, telefone, busca sem acento
scripts/
build/icon.png      ícone do aplicativo e do instalador
```

**Saídas de build (não versionadas):** `dist/` (interface), `dist-electron/main.cjs` (processo principal + API empacotados) e `instalador/` (o `.exe` final).

## Modelo de dados (migração 1)

| Tabela | Papel |
|---|---|
| `clientes` | Cadastro; CPF/CNPJ e e-mail únicos entre clientes ativos |
| `projetos` | Valores (centavos), estimativa (segundos), status, desconto |
| `lancamentos_horas` | Horas do cronômetro ou manuais; categoria; situação de cobrança; vínculo opcional com atendimento |
| `cronometro_ativo` | Cronômetro em andamento; `CHECK (id = 1)` garante no máximo um |
| `atendimentos_suporte` | Problema, solução, horários, valor, situação (pendente/faturado/pago) |
| `servicos_adicionais` | Serviços extras cobrados no projeto |
| `pagamentos` | Valores recebidos por projeto |
| `configuracoes` | Valores padrão (ex.: valor/hora) |
| `schema_migracoes` | Controle das versões aplicadas |

**Migração 3:** `pagamentos.atendimento_id` (pagamento gerado ao marcar atendimento como pago) e índices de vínculo.

**Convenções:**
- dinheiro em centavos (`INTEGER`) e tempo em segundos;
- horários em ISO 8601 UTC e datas puras em `AAAA-MM-DD`;
- exclusão lógica por `excluido_em`;
- tabelas `STRICT` e `foreign_keys = ON`.

### Cronômetro

- Migração 2 adiciona `pausado_em` (horário final de cronômetro finalizado em pausa).
- A interface mantém o estado em `src/lib/cronometro.tsx` (contexto global): recarrega do servidor ao focar a janela e a cada 60 s, e redesenha o relógio a cada 250 ms corrigindo a diferença entre o relógio da tela e o do servidor.
- Nos testes, a API recebe um relógio controlável (`relogio` em `criarApp`) para simular a passagem do tempo.

- **Iniciar:** grava `iniciado_em` e `segmento_iniciado_em = agora`.
- **Pausar:** `segundos_acumulados += agora − segmento_iniciado_em`; `segmento_iniciado_em = NULL`.
- **Retomar:** `segmento_iniciado_em = agora`.
- **Tempo exibido:** `segundos_acumulados + (agora − segmento_iniciado_em)`.
- **Finalizar:** cria o lançamento em `lancamentos_horas` e apaga o cronômetro **na mesma transação**.

## API

| Rota | Descrição |
|---|---|
| `GET /api/saude` | Estado do servidor e versão do banco |
| `GET /api/dashboard?mes=AAAA-MM` | Indicadores e séries dos gráficos (mês padrão: atual) |
| `GET /api/clientes?busca=` | Lista de clientes ativos com contagem de projetos |
| `GET /api/clientes/:id` | Cliente com seus projetos |
| `POST /api/clientes` · `PUT /api/clientes/:id` | Cadastro e edição (validação Zod + duplicidade) |
| `DELETE /api/clientes/:id` | Exclusão lógica; 409 se houver projetos |
| `GET /api/projetos?busca=&status=&cliente=` | Lista com horas e resumo financeiro |
| `GET /api/projetos/:id` | Detalhe: financeiro, horas, cobrança, contagem de registros, cronômetro |
| `POST /api/projetos` · `PUT /api/projetos/:id` | Cadastro e edição (o desconto não é alterado aqui) |
| `PATCH /api/projetos/:id/status` | Troca rápida de status |
| `DELETE /api/projetos/:id` | Exclusão lógica; 409 se houver cronômetro ativo |
| `GET /api/cronometro` | Cronômetro ativo (ou `null`) com segundos decorridos e hora do servidor |
| `POST /api/cronometro/iniciar` · `/pausar` · `/retomar` · `/finalizar` | Ciclo do cronômetro (409 se já houver um ativo) |
| `PUT /api/cronometro` · `DELETE /api/cronometro` | Ajustar sem parar · descartar |
| `GET /api/lancamentos?de=&ate=&projeto=&categoria=&situacao=` | Lançamentos (período em ISO) |
| `POST /api/lancamentos` · `PUT /api/lancamentos/:id` · `DELETE /api/lancamentos/:id` | Manual, edição e exclusão lógica (409 em horário sobreposto) |
| `PATCH /api/lancamentos/situacao` | Situação de cobrança em lote (ignora lançamentos vinculados a atendimento) |
| `GET /api/atendimentos?de=&ate=&cliente=&projeto=&situacao=` | Atendimentos de suporte |
| `POST /api/atendimentos` | Novo atendimento; com `lancamentoId`, converte um lançamento de suporte |
| `PUT /api/atendimentos/:id` · `DELETE /api/atendimentos/:id` | Edição (horários travados se veio de lançamento) e exclusão lógica |
| `PATCH /api/atendimentos/situacao` | Situação em lote; "pago" sincroniza o pagamento automático |
| `GET /api/financeiro?status=contratados\|todos\|<status>&busca=&cliente=` | Projetos com total, recebido, pendente, a faturar, custo estimado e valor/hora efetivo, mais os totais |
| `POST /api/financeiro/projetos/:id/faturar` | Marca horas faturáveis, serviços a faturar e atendimentos pendentes do projeto como faturados |
| `PATCH /api/projetos/:id/desconto` | Desconto do projeto (não pode passar do valor bruto) |
| `GET /api/servicos?projeto=` · `POST` · `PUT /:id` · `DELETE /:id` | Serviços adicionais (409 se repetir descrição e data no projeto) |
| `GET /api/pagamentos?projeto=&cliente=&de=&ate=` | Pagamentos (datas AAAA-MM-DD) |
| `POST /api/pagamentos` · `PUT /:id` · `DELETE /:id` | 409 em possível duplicidade (reenvie com `permitirDuplicado: true`) e para pagamentos gerados por atendimento |
| `GET /api/relatorios/horas?de=&ate=&cliente=&projeto=&tipo=&cobranca=` | Horas trabalhadas (lançamentos avulsos + atendimentos) com totais |
| `GET /api/relatorios/projetos?de=&ate=&cliente=&projeto=&status=` | Por projeto: horas/recebido no período + posição atual |
| `GET /api/relatorios/clientes?de=&ate=&cliente=&status=` | O mesmo, somado por cliente |
| `GET /api/relatorios/fechamento/:id` | Fechamento: detalhe do projeto, horas, horas por tipo, serviços e pagamentos |
| `GET /api/backup` | Versão do banco, pasta e lista de backups automáticos |
| `GET /api/backup/baixar` | Cópia completa do banco (`VACUUM INTO`) como arquivo `nvx-backup-AAAA-MM-DD-HHMM.db` |
| `GET /api/backup/automaticos/:nome` · `POST /api/backup/automaticos/:nome/restaurar` | Baixar ou restaurar um backup automático |
| `POST /api/backup/restaurar` | Restaurar arquivo enviado (`application/octet-stream`, até 500 MB) |
| `GET /api/lixeira` · `POST /api/lixeira/:tipo/:id/restaurar` | Itens excluídos e restauração (409 se houver vínculo, duplicidade ou conflito de horário) |

### Backup e restauração

`server/servicos/backup.ts`. A restauração valida o arquivo, atualiza uma cópia temporária com as migrações, guarda um backup do estado atual e então, com `foreign_keys` desligado e o arquivo anexado (`ATTACH`), apaga e recopia as tabelas de dados numa única transação, conferindo `foreign_key_check` antes do `COMMIT`. A conexão do servidor continua a mesma (não é preciso reiniciar o programa).

Datas dos relatórios em AAAA-MM-DD, inclusivas, no fuso do computador.

**Respostas de erro:** `{ erro, detalhes? }`, em que `detalhes` traz `{ campo: mensagem }`. Códigos: 400 (validação), 404 (não encontrado) e 409 (duplicidade ou bloqueio).

### Cálculo financeiro

`shared/financeiro.ts` é a fonte única das fórmulas (total, pendente, a faturar, custo estimado, valor/hora efetivo). `server/servicos/financeiro.ts` agrega os números de cada projeto numa única consulta e é usado por dashboard, projetos e financeiro, para os três mostrarem sempre os mesmos valores.

## Segurança

- Servidor interno escuta somente em `127.0.0.1`, em porta aleatória. `x-powered-by` desativado e limite de 1 MB no corpo JSON.
- SQL sempre com parâmetros (`prepare(...).run(?)`).
- Erros internos não expõem detalhes na interface.
- Ferramentas de desenvolvedor ficam desativadas no aplicativo instalado.
- Instalador sem assinatura digital: o Windows SmartScreen mostra um aviso na primeira execução. Um certificado de assinatura de código é pago, por isso ficou fora do escopo.

## Decisões em aberto

- Atualização automática: não implementada, pois exigiria hospedar as versões. Para atualizar, basta instalar a nova versão por cima; os dados são preservados.
