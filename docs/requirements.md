# NVX Project Manager — Requisitos

> Gerado com a NVX AI Factory (skill `novo-projeto`, versão não lançada, conforme o CHANGELOG da Factory em 24/11/2026).

## Problema e resultado esperado

A NVX precisa controlar, em um só lugar, os projetos de clientes, as horas trabalhadas (desenvolvimento e suporte) e quanto cobrar de cada cliente, sem planilhas e sem custo de hospedagem.
O resultado esperado é saber a qualquer momento o que já foi faturado, o que foi recebido, o que está pendente e quais horas faturáveis ainda não foram cobradas.

## Premissas

- Um único usuário, em um único computador (sem login nesta versão).
- **Programa instalado no Windows** (não é site): instalador `.exe` que pode ser copiado e instalado em qualquer computador.
- Uso local, sem internet, sem serviços pagos.
- Interface em português do Brasil, moeda R$, datas dd/mm/aaaa.
- Identidade visual conforme o Manual de Identidade Visual NVX Digital (v1.0, 2026): cores, tipografia, logotipo e ícone oficiais.

## Requisitos funcionais (por etapa)

| Etapa | Módulo | Situação |
|---|---|---|
| 1 | Estrutura, banco, layout e identidade visual | ✅ Concluída |
| 2 | Dashboard: projetos ativos/concluídos, horas do mês (desenvolvimento e suporte), faturamento previsto/recebido/pendente, horas faturáveis não cobradas, gráficos de faturamento mensal e de horas por projeto | ✅ Concluída |
| 3 | Clientes: nome, empresa, telefone, e-mail, CPF/CNPJ (opcional), observações; um cliente tem vários projetos | ✅ Concluída |
| 4 | Projetos: nome, cliente, descrição, início, prazo, valor fechado, estimativa de horas, valor/hora de desenvolvimento e de suporte, status (orçamento, aguardando aprovação, em andamento, pausado, concluído, cancelado), observações | ✅ Concluída |
| 5 | Cronômetro (iniciar/pausar/finalizar, projeto, categoria, descrição), registro automático de data, horários e duração, lançamento manual | ✅ Concluída |
| 6 | Suporte: cliente, projeto, data, horários, tempo, problema, solução, valor, situação (pendente/faturado/pago) | ✅ Concluída |
| 7 | Financeiro: valor fechado + serviços adicionais + horas faturáveis − desconto; pagamentos; pendências; custo estimado em horas × receita | Concluída |
| 8 | Relatórios por cliente, projeto, período, tipo de hora e valores; exportação PDF/CSV; relatório de fechamento de projeto | Concluída |
| 9 | Backup manual, restauração e lixeira | Concluída |
| 10 | Testes e correções finais | Concluída |

## Regras de negócio

1. **Um cronômetro por vez.** O banco aceita no máximo um cronômetro ativo.
2. **O cronômetro sobrevive a recarregar ou fechar a página.** O tempo é calculado a partir dos horários salvos no banco, nunca de um contador em memória.
3. **Situação de cobrança de cada lançamento:** `incluído no pacote`, `faturável` ou `faturado`. Horas incluídas no pacote **nunca** são cobradas à parte.
4. **Separação automática** entre horas de desenvolvimento (desenvolvimento, reunião, planejamento, correção) e horas de suporte.
5. **Valor de horas** = segundos × valor/hora ÷ 3600, arredondado ao centavo.
6. **Total do projeto** = valor fechado + serviços adicionais + horas faturáveis − desconto. **Pendente** = total − pagamentos recebidos.
7. **Sem duplicidade:** CPF/CNPJ e e-mail únicos entre clientes ativos; nome de projeto único por cliente; aviso de horários sobrepostos.
8. **Proteção contra perda:** exclusão lógica (lixeira) e confirmação antes de excluir.

## Definições dos indicadores do dashboard

| Indicador | Como é calculado |
|---|---|
| Projetos ativos | Status *em andamento* ou *pausado* |
| Projetos concluídos | Status *concluído* |
| Horas trabalhadas no mês | Lançamentos + atendimentos com início no mês (horário local) |
| Horas de desenvolvimento | Lançamentos de desenvolvimento, reunião, planejamento e correção |
| Horas de suporte | Atendimentos + lançamentos de *suporte* sem atendimento vinculado (os vinculados não contam em dobro) |
| Faturamento previsto | Soma do total (regra 6) dos projetos *em andamento*, *pausados* e *concluídos*. Orçamentos e cancelados não entram |
| Faturamento recebido | Regime de caixa: todos os pagamentos registrados, inclusive de projeto cancelado (ex.: sinal retido) |
| Valores pendentes | Soma, por projeto contratado, de total − recebido (nunca negativo) |
| Horas faturáveis não cobradas | Lançamentos *faturáveis* (não *faturados*) + atendimentos *pendentes*, com o valor correspondente |
| Faturamento mensal | Pagamentos por mês, nos 12 meses até o mês selecionado |
| Horas por projeto | Horas do mês selecionado, separadas em desenvolvimento e suporte; acima de 7 projetos, os menores viram "Outros" |

## Requisitos não funcionais

- Valores em centavos inteiros e durações em segundos (sem erro de ponto flutuante).
- Servidor escuta apenas em `127.0.0.1` (não fica exposto na rede).
- Validação de dados no servidor (Zod) e consultas SQL parametrizadas.
- Interface responsiva (celular, tablet e desktop) e acessível (foco visível, rótulos).

## Riscos

| Risco | Mitigação |
|---|---|
| Perda do arquivo do banco (disco, exclusão) | Backup manual (Etapa 9) e orientação para guardar cópias fora do computador |
| `node:sqlite` ainda é marcado como "release candidate" no Node | API estável na prática; o acesso ao banco fica isolado em `server/db`, e trocar por `better-sqlite3` exige poucas mudanças |
| Fuso horário em datas | Horários gravados em UTC (ISO 8601) e exibidos no horário local; datas puras (AAAA-MM-DD) nunca são convertidas |

## Regras de clientes

- **Nome obrigatório**; os demais campos são opcionais.
- **Telefone:** com DDD, 10 ou 11 dígitos (aceita +55). Guardado só com dígitos e exibido como (00) 00000-0000.
- **E-mail:** formato válido, guardado em minúsculas.
- **CPF/CNPJ:** dígitos verificadores conferidos; guardado só com dígitos e exibido com máscara.
- **Duplicidade bloqueada:** mesmo CPF/CNPJ, mesmo e-mail, ou mesmo nome + empresa (sem diferenciar maiúsculas) entre clientes ativos.
- **Exclusão:** pede confirmação e manda para a lixeira. É bloqueada se o cliente tiver projetos.
- **Busca:** ignora acentos e maiúsculas; procura em nome, empresa, e-mail e observações, e por dígitos de telefone e CPF/CNPJ (a partir de 3 dígitos).

## Regras de projetos

- **Obrigatórios:** nome e cliente. O nome não se repete no mesmo cliente, mas pode existir em clientes diferentes.
- **Datas:** a data precisa existir no calendário (31/02 é rejeitado) e o prazo não pode ser anterior ao início.
- **Valores:** digitados em R$ (aceita "1.500", "1500,50" etc.) e guardados em centavos, nunca negativos.
- **Estimativa:** aceita "40", "12,5", "12:30" ou "12h30".
- **Status:** pode ser trocado direto no detalhe, sem abrir o formulário.
- **Pendência:** só aparece para projetos contratados (em andamento, pausado ou concluído).
- **Prazo:** destacado quando está atrasado ou vence em até 7 dias (exceto em projetos concluídos ou cancelados).
- **Exclusão:** pede confirmação e informa quantos registros o projeto tem. É bloqueada se houver cronômetro em andamento no projeto.
- **Desconto:** é aplicado no resumo financeiro do projeto ("Aplicar desconto"); editar o projeto não altera o desconto.

## Regras do controle de horas

- **Um cronômetro por vez:** garantido pelo banco (chave fixa) e pela API.
- **Tempo à prova de fechamento:** o tempo é recalculado dos horários salvos. Recarregar a página, fechar o programa ou desligar o computador não afeta a contagem; o tempo segue contando enquanto o programa está fechado.
- **Pausas não contam:** a duração do lançamento é só o tempo trabalhado. O horário final de um cronômetro finalizado em pausa é o da pausa.
- **Ajustes sem parar:** projeto, categoria e descrição podem ser alterados com o cronômetro rodando.
- **Finalizar** grava o lançamento e encerra o cronômetro na mesma transação. **Descartar** pede confirmação.
- **Cobrança sugerida:** suporte → faturável; projeto com valor fechado → incluído no pacote; projeto sem valor fechado (por hora) → faturável. Pode ser trocada ao finalizar ou depois, inclusive em lote.
- **Lançamento manual:** data, início e fim. Se o fim for menor que o início, entende que termina no dia seguinte. Limite de 24h; não aceita horas no futuro (tolerância de 5 min).
- **Sem duplicidade:** não aceita horários sobrepostos a outro lançamento (encostados são permitidos).
- **Edição** de lançamento do cronômetro mantém a duração original (com as pausas descontadas) se os horários não forem alterados.
- **Projeto cancelado** não recebe horas.
- O cronômetro em andamento aparece **no menu lateral e no título da janela** em qualquer tela.

## Regras de suporte

- **Cliente e projeto:** o cliente é sempre o dono do projeto. O formulário filtra os projetos pelo cliente escolhido.
- **Valor sugerido:** tempo × valor da hora de suporte do projeto. Pode ser alterado (inclusive para R$ 0,00).
- **Situação:**
  - **pendente:** ainda não cobrado; entra em "horas faturáveis não cobradas" no dashboard.
  - **faturado:** cobrado, aguardando pagamento.
  - **pago:** registra automaticamente um pagamento vinculado no projeto. Ao voltar para outra situação ou excluir o atendimento, esse pagamento vai para a lixeira, e mudar o valor atualiza o pagamento. Assim recebido e pendente ficam sempre corretos.
- **Horas de suporte registradas no cronômetro ou manualmente** aparecem em "Horas de suporte sem atendimento" e podem virar atendimento:
  - os horários vêm do lançamento, com pausas descontadas, e ficam travados;
  - o lançamento passa a pertencer ao atendimento e não é contado duas vezes, nem em horas nem em valor;
  - ele só pode ser alterado pela tela de Suporte;
  - excluir o atendimento devolve o lançamento como hora de suporte avulsa.
- **Sem duplicidade:** atendimento não pode se sobrepor a outro atendimento nem a outro lançamento de horas (e vice-versa). Não aceita horário no futuro e tem limite de 24h.
- **Separação automática:** horas de suporte = atendimentos + lançamentos de suporte avulsos. Desenvolvimento = demais categorias.

## Regras do financeiro

- **Total do projeto** = valor fechado + serviços adicionais + horas de desenvolvimento faturáveis/faturadas × valor/hora + horas de suporte avulsas faturáveis/faturadas × valor/hora de suporte + atendimentos − desconto (nunca negativo).
- **Horas incluídas no pacote** nunca são cobradas à parte.
- **Recebido** = soma dos pagamentos (inclusive os gerados por atendimento pago). **Pendente** = total − recebido, só para projetos contratados e nunca negativo.
- **A faturar** = extras ainda não cobrados: horas faturáveis, serviços adicionais "a faturar" e atendimentos pendentes. "Marcar como faturados" passa tudo isso para faturado de uma vez, sem mudar o total e sem tocar nas horas do pacote.
- **Custo estimado das horas** = todas as horas trabalhadas (inclusive as do pacote) × valor/hora do projeto. Comparado com o total e com o recebido, mostra se o projeto rendeu acima ou abaixo do valor/hora combinado. **Valor efetivo por hora** = total ÷ horas trabalhadas.
- **Desconto** não pode passar do valor do projeto antes do desconto.
- **Serviços adicionais:** descrição, data, valor (> 0) e situação (a faturar ou faturado). Não aceita outro serviço com a mesma descrição e data no mesmo projeto.
- **Pagamentos:** data (não pode ser futura), valor (> 0), forma (Pix, transferência, boleto, cartão, dinheiro ou outro) e observações. Pagamento igual a outro (mesmo projeto, data e valor) só é gravado depois de confirmar "registrar mesmo assim".
- **Pagamentos via atendimento** aparecem no financeiro, mas só podem ser alterados pelo módulo Suporte.
- **Exclusões** (serviço, pagamento) pedem confirmação e vão para a lixeira.

## Regras dos relatórios

- **Tipos:** horas trabalhadas (detalhado), por projeto, por cliente, valores recebidos e fechamento de projeto.
- **Filtros:** período (de/até, com atalhos), cliente, projeto, tipo de hora (desenvolvimento/suporte), cobrança (incluídas no pacote, a faturar, faturadas) e status do projeto.
- **Horas trabalhadas:** lançamentos avulsos + atendimentos. Hora de suporte convertida em atendimento aparece uma vez só. Horas do pacote aparecem com valor R$ 0,00.
- **Por projeto/cliente:** colunas "(período)" (horas e recebido nas datas escolhidas) e posição de hoje (total, extras faturados, a faturar, recebido total, pendente só de contratados).
- **Fechamento de projeto:** composição do valor, horas por tipo, todas as horas e atendimentos, serviços adicionais, pagamentos e saldo.
- **Exportação local:** PDF (jsPDF) e CSV gerados no próprio computador, sem serviços externos. O CSV usa ";" e vírgula decimal, UTF-8 com BOM e valores sem "R$" (para somar na planilha). No aplicativo, o Windows pergunta onde salvar (começa em Downloads).
- A prévia na tela, o PDF e o CSV usam as mesmas colunas, por isso mostram os mesmos números.

## Regras de backup e lixeira

- **Backup manual:** "Fazer backup" gera um arquivo `.db` com todos os dados (cópia consistente, pode ser feita com o programa aberto) e o Windows pergunta onde salvar.
- **Backups automáticos:** um por dia, ao abrir o programa ou durante o uso (mantém os 14 mais recentes), e um antes de cada restauração (mantém os 10 mais recentes). Ficam em `%APPDATA%\NVX Project Manager\dados\backups`. Podem ser baixados ou restaurados pela tela.
- **Restauração:** de um arquivo escolhido ou de um backup automático, com confirmação. O arquivo é validado (formato, integridade, tabelas do sistema e versão). Backup de versão mais nova do programa é recusado; de versão anterior é atualizado automaticamente. A troca dos dados acontece numa única transação: se algo falhar, nada muda. O arquivo escolhido nunca é alterado.
- **Lixeira:** lista clientes, projetos, horas, atendimentos, serviços e pagamentos excluídos, com a data da exclusão, e permite restaurá-los. Projeto restaurado traz todos os seus registros. Não restaura se o "pai" estiver na lixeira (ex.: projeto de cliente excluído), se criar duplicidade ou horário sobreposto. Pagamentos gerados por atendimento voltam com o atendimento.
- **Sem exclusão definitiva** pela interface, para não haver perda de registros.

## Critérios de aceite da Etapa 10

- [x] Teste de ponta a ponta: do cadastro ao fechamento, conferindo que projeto, dashboard, financeiro, relatórios e fechamento mostram os mesmos valores.
- [x] Teste de volume: 15.000 lançamentos e 30 projetos; dashboard, financeiro, projetos e relatórios respondem em menos de 70 ms (limite do teste: 2 s).
- [x] Todas as telas abertas sem erros no console; telas com layout conferido no celular.
- [x] Revisão de segurança: SQL sempre parametrizado (nomes de tabela só de listas fixas), validação na API, servidor só em 127.0.0.1, backup com proteção contra acesso a arquivos fora da pasta.
- [x] Auditoria de dependências: os únicos alertas (moderados) estão no `electron-builder`, usado só para gerar o instalador; não vão para o programa instalado.
- [x] Sobras removidas (tela "em construção") e manual de uso em `docs/manual-de-uso.md`.

## Critérios de aceite da Etapa 9

- [x] Backup manual com escolha de onde salvar.
- [x] Restauração validada, com backup automático do estado atual antes de restaurar.
- [x] Backups automáticos diários com limite de quantidade.
- [x] Lixeira com restauração respeitando vínculos, duplicidades e horários.
- [x] Regras cobertas por testes automatizados (inclusive arquivo inválido, versão mais nova e versão anterior).

## Critérios de aceite da Etapa 8

- [x] Relatórios por cliente, projeto, período, desenvolvimento, suporte, horas trabalhadas, valores faturados, recebidos e pendentes.
- [x] Exportação em PDF e CSV.
- [x] Relatório de fechamento de projeto com todas as horas trabalhadas e os serviços realizados (atalho "Fechamento" na tela do projeto).
- [x] Regras cobertas por testes automatizados.

## Critérios de aceite da Etapa 7

- [x] Valor fixo, valor/hora de desenvolvimento e de suporte (no projeto), desconto, pagamentos recebidos e valores pendentes.
- [x] Serviços adicionais somando ao total; horas do pacote não cobradas; cada lançamento continua marcável como incluído, faturável ou faturado.
- [x] Custo estimado em horas e receita obtida por projeto, com valor efetivo por hora.
- [x] Tela Financeiro com totais, visão por projeto (busca e filtro de status) e pagamentos por mês.
- [x] Proteção contra pagamento duplicado e contra edição de pagamento gerado por atendimento.
- [x] Regras cobertas por testes automatizados.

## Critérios de aceite da Etapa 6

- [x] Atendimento com cliente, projeto, data, horários, tempo total, problema, solução, valor e situação.
- [x] Lista mensal com filtros (cliente e situação), totais por situação e troca rápida de situação.
- [x] Conversão de horas de suporte (cronômetro ou manual) em atendimento sem contagem dupla.
- [x] "Pago" mantém o recebido e o pendente do projeto corretos.
- [x] Validação, conflito de horário e confirmação antes de excluir.

## Critérios de aceite da Etapa 5

- [x] Iniciar, pausar, retomar, finalizar e descartar, com seleção de projeto, categoria e descrição.
- [x] Registro automático de data, horário inicial, horário final, duração, projeto e categoria.
- [x] Lançamento manual com validação de horários, conflito e futuro.
- [x] Dois cronômetros simultâneos impossíveis.
- [x] Cronômetro correto após recarregar a página e após fechar e reabrir o programa (testado no app empacotado).
- [x] Lista mensal com filtros (projeto, categoria, cobrança), totais e troca de cobrança individual ou em lote.

## Critérios de aceite da Etapa 4

- [x] Cadastro com todos os campos pedidos, edição, troca rápida de status e exclusão para a lixeira.
- [x] Lista com busca (projeto ou cliente, sem acento) e filtro por status. Mostra prazo, horas × estimativa, total e pendente.
- [x] Detalhe com resumo financeiro (mesma regra do dashboard), horas por tipo e por situação de cobrança, além das informações do projeto.
- [x] Integração com clientes: "Novo projeto" com o cliente já selecionado e links para cada projeto.
- [x] Validações na interface e na API, com testes automatizados.

## Critérios de aceite da Etapa 3

- [x] Cadastrar, editar, buscar, ver detalhes (com os projetos do cliente) e excluir clientes.
- [x] Validação na interface e de novo na API, com mensagens em português em cada campo.
- [x] Duplicidades bloqueadas com mensagem dizendo a qual cliente o dado já pertence.
- [x] Confirmação antes de excluir; cliente com projetos não pode ser excluído.
- [x] Layout em tabela no computador e em lista no celular; estados de carregamento, vazio, sem resultado e erro.

## Critérios de aceite da Etapa 2

- [x] Os 9 indicadores pedidos aparecem no dashboard, com seletor de mês.
- [x] Gráfico de faturamento mensal e gráfico de horas por projeto (desenvolvimento × suporte), com dica ao passar o mouse e versão em tabela.
- [x] Horas incluídas no pacote não entram no valor; horas vinculadas a atendimento não são contadas duas vezes.
- [x] Projetos excluídos, cancelados e em orçamento não entram no faturamento previsto.
- [x] Estados de carregamento, erro (com "tentar novamente") e mês sem dados.
- [x] Cálculos cobertos por testes automatizados com cenário completo.

## Critérios de aceite da Etapa 1

- [x] `npm run instalador` gera `NVX-Project-Manager-Setup-<versão>.exe`.
- [x] O aplicativo empacotado abre em janela própria, cria o banco em `%APPDATA%` e fecha sem deixar processos nem WAL pendente.
- [x] `npm run dev` abre a interface e a API responde em `/api/saude`.
- [x] O banco é criado automaticamente e as migrações rodam uma única vez.
- [x] Menu lateral com todos os módulos; navegação funciona no desktop e no celular (gaveta).
- [x] Rotas inexistentes mostram a página "não encontrada".
- [x] Testes automatizados de formatação brasileira e de restrições do banco passando.
