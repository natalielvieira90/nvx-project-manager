# Manual de uso — NVX Project Manager

Sistema interno da NVX para controlar clientes, projetos, horas, suporte, cobranças e relatórios. Funciona **só no seu computador**, sem internet, sem mensalidade e sem hospedagem.

## 1. Instalação

1. Copie o arquivo `NVX-Project-Manager-Setup-<versão>.exe` para o computador (pen drive, nuvem, e-mail…).
2. Dê dois cliques e siga o instalador. Você pode escolher a pasta de instalação.
3. Na primeira vez, o Windows pode mostrar **"O Windows protegeu o computador"** (o programa não tem certificado digital pago). Clique em **Mais informações → Executar assim mesmo**.
4. O programa aparece no menu Iniciar e na área de trabalho como **NVX Project Manager**.

**Atualizar:** instale a versão nova por cima. Os dados são mantidos.
**Desinstalar:** pelo Painel de Controle. Os dados **não** são apagados (ficam em `%APPDATA%\NVX Project Manager\dados`).

## 2. Primeiros passos

1. **Clientes → Novo cliente.** Só o nome é obrigatório. CPF/CNPJ, e-mail e telefone são validados e não podem se repetir entre clientes.
2. **Projetos → Novo projeto.** Escolha o cliente e informe, se houver:
   - **valor fechado** (preço do pacote);
   - **valor da hora de desenvolvimento** e **de suporte** (para horas cobradas à parte);
   - **estimativa de horas**, datas e status.
3. Pronto: já dá para registrar horas, atendimentos e pagamentos.

## 3. Controle de horas

- **Cronômetro:** escolha projeto, categoria (desenvolvimento, reunião, planejamento, correção, suporte) e, se quiser, uma descrição. Use **Iniciar, Pausar, Retomar e Finalizar**. As pausas não contam.
  - O tempo continua certo mesmo se você fechar o programa ou desligar o computador.
  - Só existe um cronômetro por vez. Ele aparece no menu lateral e no título da janela.
- **Lançamento manual:** para horas que você esqueceu de cronometrar. Não aceita horário sobreposto a outro registro nem horário no futuro.
- **Cobrança de cada lançamento:**
  - **Incluído no pacote:** coberto pelo valor fechado; não é cobrado à parte.
  - **Faturável:** será cobrado e ainda não foi.
  - **Faturado:** já entrou numa cobrança.

  O sistema sugere a situação (projeto com valor fechado → incluído no pacote; suporte e projeto por hora → faturável). Você pode mudar um a um ou vários de uma vez.

## 4. Suporte

- **Registrar atendimento:** cliente, projeto, horários, problema, solução, valor (sugerido pelo tempo × valor da hora de suporte) e situação (**pendente, faturado ou pago**).
- **Horas de suporte do cronômetro** aparecem em "Horas de suporte sem atendimento". Use **Criar atendimento** para transformá-las em atendimento, sem contar duas vezes.
- Marcar um atendimento como **pago** registra o pagamento no projeto automaticamente.

## 5. Financeiro

- **Na tela de cada projeto:** resumo financeiro, **desconto**, **serviços adicionais** (cobranças à parte do valor fechado) e **pagamentos recebidos**.
- **Total do projeto** = valor fechado + serviços adicionais + horas cobradas à parte + atendimentos − desconto.
- **Pendente** = total − recebido (só para projetos em andamento, pausados ou concluídos).
- **A faturar** = extras ainda não cobrados. Ao enviar a cobrança ao cliente, use **Marcar como faturados**.
- **Custo estimado × receita:** todas as horas trabalhadas pelo valor/hora, comparado com o total, e o **valor efetivo por hora** do projeto.
- **Tela Financeiro:** totais gerais, a situação de cada projeto e a lista de pagamentos por mês. Um pagamento igual a outro (mesmo projeto, data e valor) pede confirmação, para evitar duplicidade.

## 6. Relatórios

Escolha o relatório, ajuste os filtros (período, cliente, projeto, tipo de hora, cobrança, status) e clique em **PDF** ou **CSV**. O Windows pergunta onde salvar.

- **Horas trabalhadas:** desenvolvimento e suporte, com cobrança e valor.
- **Por projeto / Por cliente:** horas e recebido no período, mais total, faturado, a faturar e pendente.
- **Valores recebidos:** pagamentos do período.
- **Fechamento de projeto:** documento completo para entregar ao cliente ao encerrar o projeto (também pelo botão **Fechamento** na tela do projeto).

O CSV abre direto no Excel, com acentos e valores prontos para somar.

## 7. Backup e lixeira

- **Fazer backup:** em **Backup → Fazer backup**. Guarde o arquivo fora do computador (pen drive, HD externo, nuvem). Recomendado: uma vez por semana e antes de formatar ou trocar de computador.
- **Backups automáticos:** o sistema faz um por dia (guarda os últimos 14) e um antes de cada restauração.
- **Restaurar:** em **Backup → Restaurar um backup**, escolha o arquivo. Os dados atuais são substituídos, mas antes o sistema guarda uma cópia deles.
- **Trocar de computador:** faça o backup, instale o programa no computador novo e restaure o arquivo.
- **Lixeira:** tudo o que é excluído vai para a lixeira e pode ser restaurado. Ao restaurar um projeto, todos os registros dele voltam junto.

## 8. Dúvidas frequentes

**Fechei o programa com o cronômetro rodando. Perdi as horas?**
Não. Ao abrir de novo, ele continua contando a partir do horário em que foi iniciado.

**Por que um projeto em orçamento não mostra valor pendente?**
Pendência só existe depois que o projeto foi contratado (em andamento, pausado ou concluído).

**Excluí algo sem querer.**
Vá em **Backup → Lixeira** e clique em **Restaurar**.

**Onde ficam meus dados?**
Em `%APPDATA%\NVX Project Manager\dados` (atalho: menu **Arquivo → Abrir pasta dos dados**). O arquivo principal é `nvx.db`; os backups automáticos ficam na pasta `backups`.

**Preciso de internet?**
Não. Tudo funciona no próprio computador.
