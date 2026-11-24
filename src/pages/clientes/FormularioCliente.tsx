import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal.tsx';
import { Botao } from '../../components/ui.tsx';
import { CampoAreaTexto, CampoTexto } from '../../components/formulario.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { errosPorCampo, esquemaCliente } from '../../../shared/esquemas.ts';
import { formatarDocumento, formatarTelefone } from '../../../shared/documentos.ts';
import type { Cliente } from '../../../shared/tipos.ts';

type Campos = { nome: string; empresa: string; telefone: string; email: string; documento: string; observacoes: string };

const vazio: Campos = { nome: '', empresa: '', telefone: '', email: '', documento: '', observacoes: '' };

function camposDe(c?: Cliente | null): Campos {
  if (!c) return vazio;
  return {
    nome: c.nome,
    empresa: c.empresa ?? '',
    telefone: formatarTelefone(c.telefone),
    email: c.email ?? '',
    documento: formatarDocumento(c.documento),
    observacoes: c.observacoes ?? '',
  };
}

/** Modal de cadastro/edição de cliente. Sem `cliente` = novo cadastro. */
export function FormularioCliente({
  aberto,
  cliente,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  cliente?: Cliente | null;
  aoFechar: () => void;
  aoSalvar: (c: Cliente) => void;
}) {
  const [campos, setCampos] = useState<Campos>(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const aviso = useAviso();
  const edicao = Boolean(cliente);

  useEffect(() => {
    if (aberto) {
      setCampos(camposDe(cliente));
      setErros({});
    }
  }, [aberto, cliente]);

  const alterar = (campo: keyof Campos, valor: string) => {
    setCampos((c) => ({ ...c, [campo]: valor }));
    if (erros[campo]) setErros(({ [campo]: _, ...resto }) => resto);
  };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const validacao = esquemaCliente.safeParse(campos);
    if (!validacao.success) {
      setErros(errosPorCampo(validacao.error));
      return;
    }
    setSalvando(true);
    try {
      const salvo = await api<Cliente>(edicao ? `/clientes/${cliente!.id}` : '/clientes', {
        method: edicao ? 'PUT' : 'POST',
        body: JSON.stringify(campos),
      });
      aviso.sucesso(edicao ? 'Cliente atualizado.' : 'Cliente cadastrado.');
      aoSalvar(salvo);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.detalhes) setErros(erro.detalhes as Record<string, string>);
      else aviso.erro(erro instanceof ErroApi ? erro.message : 'Não foi possível salvar o cliente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      bloquearFechamento={salvando}
      titulo={edicao ? 'Editar cliente' : 'Novo cliente'}
      descricao="Campos com * são obrigatórios."
      largura="max-w-2xl"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-cliente" disabled={salvando}>
            {salvando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Cadastrar cliente'}
          </Botao>
        </>
      }
    >
      <form id="form-cliente" onSubmit={salvar} noValidate className="grid gap-4 sm:grid-cols-2">
        <CampoTexto
          rotulo="Nome do cliente"
          obrigatorio
          value={campos.nome}
          onChange={(e) => alterar('nome', e.target.value)}
          erro={erros.nome}
          maxLength={120}
          autoComplete="off"
        />
        <CampoTexto
          rotulo="Empresa"
          value={campos.empresa}
          onChange={(e) => alterar('empresa', e.target.value)}
          erro={erros.empresa}
          maxLength={120}
          autoComplete="off"
        />
        <CampoTexto
          rotulo="Telefone"
          value={campos.telefone}
          onChange={(e) => alterar('telefone', formatarTelefone(e.target.value))}
          erro={erros.telefone}
          placeholder="(00) 00000-0000"
          inputMode="tel"
          autoComplete="off"
        />
        <CampoTexto
          rotulo="E-mail"
          type="email"
          value={campos.email}
          onChange={(e) => alterar('email', e.target.value)}
          erro={erros.email}
          placeholder="nome@empresa.com.br"
          maxLength={160}
          autoComplete="off"
        />
        <CampoTexto
          rotulo="CPF/CNPJ"
          value={campos.documento}
          onChange={(e) => alterar('documento', formatarDocumento(e.target.value))}
          erro={erros.documento}
          dica="Opcional"
          inputMode="numeric"
          autoComplete="off"
        />
        <CampoAreaTexto
          rotulo="Observações"
          value={campos.observacoes}
          onChange={(e) => alterar('observacoes', e.target.value)}
          erro={erros.observacoes}
          maxLength={2000}
          className="sm:col-span-2"
        />
      </form>
    </Modal>
  );
}
