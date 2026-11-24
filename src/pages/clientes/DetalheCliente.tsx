import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, Building2, ChevronRight, CircleAlert, FileText, IdCard, Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { Botao, Cartao, EstadoVazio, Etiqueta } from '../../components/ui.tsx';
import { Confirmacao } from '../../components/Modal.tsx';
import { useAviso } from '../../components/Avisos.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { STATUS_PROJETO } from '../../lib/rotulos.ts';
import { formatarDocumento, formatarTelefone } from '../../../shared/documentos.ts';
import { formatarData, formatarMoeda } from '../../../shared/formatacao.ts';
import type { ClienteDetalhe } from '../../../shared/tipos.ts';
import { FormularioCliente } from './FormularioCliente.tsx';
import { FormularioProjeto } from '../projetos/FormularioProjeto.tsx';

export function DetalheCliente() {
  const { id } = useParams();
  const navegar = useNavigate();
  const aviso = useAviso();
  const [cliente, setCliente] = useState<ClienteDetalhe | null>(null);
  const [erro, setErro] = useState<{ texto: string; status: number } | null>(null);
  const [editando, setEditando] = useState(false);
  const [novoProjeto, setNovoProjeto] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    let ativo = true;
    api<ClienteDetalhe>(`/clientes/${id}`)
      .then((c) => ativo && (setCliente(c), setErro(null)))
      .catch((e: unknown) =>
        ativo && setErro(e instanceof ErroApi ? { texto: e.message, status: e.status } : { texto: 'Erro inesperado.', status: 0 }),
      );
    return () => {
      ativo = false;
    };
  }, [id, recarregar]);

  async function excluir() {
    if (!cliente) return;
    setExcluindo(true);
    try {
      await api(`/clientes/${cliente.id}`, { method: 'DELETE' });
      aviso.sucesso(`"${cliente.nome}" foi movido para a lixeira.`);
      navegar('/clientes');
    } catch (e) {
      aviso.erro(e instanceof ErroApi ? e.message : 'Não foi possível excluir o cliente.');
      setConfirmandoExclusao(false);
    } finally {
      setExcluindo(false);
    }
  }

  const voltar = (
    <Link to="/clientes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-texto-suave hover:text-texto">
      <ArrowLeft className="size-4" aria-hidden="true" /> Clientes
    </Link>
  );

  if (erro) {
    return (
      <>
        {voltar}
        <Cartao>
          <EstadoVazio
            icone={CircleAlert}
            titulo={erro.status === 404 ? 'Cliente não encontrado' : 'Não foi possível carregar o cliente'}
            descricao={erro.status === 404 ? 'Ele pode ter sido excluído.' : erro.texto}
            acao={erro.status !== 404 && <Botao onClick={() => setRecarregar((n) => n + 1)}>Tentar novamente</Botao>}
          />
        </Cartao>
      </>
    );
  }

  if (!cliente) {
    return (
      <>
        {voltar}
        <div className="h-24 animate-pulse rounded-cartao bg-superficie" aria-busy="true" />
      </>
    );
  }

  const temProjetos = cliente.projetos.length > 0;

  return (
    <>
      {voltar}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-marca-800 text-lg font-semibold text-white" aria-hidden="true">
            {iniciais(cliente.nome)}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{cliente.nome}</h1>
            {cliente.empresa && <p className="text-sm text-texto-suave">{cliente.empresa}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Botao variante="secundario" icone={Pencil} onClick={() => setEditando(true)}>
            Editar
          </Botao>
          <Botao variante="secundario" icone={Trash2} onClick={() => setConfirmandoExclusao(true)} className="text-perigo">
            Excluir
          </Botao>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-3">
        <Cartao className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Dados do cliente</h2>
          <dl className="space-y-3.5 text-sm">
            <Info icone={Phone} rotulo="Telefone" valor={cliente.telefone && formatarTelefone(cliente.telefone)} />
            <Info
              icone={Mail}
              rotulo="E-mail"
              valor={
                cliente.email && (
                  <a href={`mailto:${cliente.email}`} className="text-destaque-700 hover:underline">
                    {cliente.email}
                  </a>
                )
              }
            />
            <Info icone={Building2} rotulo="Empresa" valor={cliente.empresa} />
            <Info icone={IdCard} rotulo="CPF/CNPJ" valor={cliente.documento && formatarDocumento(cliente.documento)} />
          </dl>
          {cliente.observacoes && (
            <div className="mt-5 border-t border-borda pt-4">
              <p className="mb-1 flex items-center gap-2 text-xs font-medium text-texto-suave">
                <FileText className="size-3.5" aria-hidden="true" /> Observações
              </p>
              <p className="whitespace-pre-wrap text-sm">{cliente.observacoes}</p>
            </div>
          )}
          <p className="mt-5 border-t border-borda pt-4 text-xs text-texto-suave">
            Cadastrado em {formatarData(cliente.criadoEm)}
          </p>
        </Cartao>

        <Cartao className="xl:col-span-2">
          <div className="flex items-center justify-between border-b border-borda px-5 py-4">
            <h2 className="text-sm font-semibold">
              Projetos
              {temProjetos && <span className="ml-2 font-normal text-texto-suave">({cliente.projetos.length})</span>}
            </h2>
            <Botao variante="secundario" icone={Plus} onClick={() => setNovoProjeto(true)} className="h-8 px-3 text-xs">
              Novo projeto
            </Botao>
          </div>
          {temProjetos ? (
            <ul className="divide-y divide-borda">
              {cliente.projetos.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/projetos/${p.id}`}
                    className="group flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-fundo/70"
                  >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium group-hover:underline">{p.nome}</p>
                    <p className="text-xs text-texto-suave">
                      {p.prazoEntrega ? `Prazo: ${formatarData(p.prazoEntrega)}` : 'Sem prazo definido'}
                    </p>
                  </div>
                  <span className="tabular text-sm">{formatarMoeda(p.valorFechadoCentavos)}</span>
                  <Etiqueta tom={STATUS_PROJETO[p.status].tom}>{STATUS_PROJETO[p.status].rotulo}</Etiqueta>
                  <ChevronRight className="size-4 text-texto-suave/50 group-hover:text-texto-suave" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EstadoVazio
              icone={Briefcase}
              titulo="Nenhum projeto ainda"
              descricao="Cadastre o primeiro projeto deste cliente."
              acao={
                <Botao icone={Plus} onClick={() => setNovoProjeto(true)}>
                  Novo projeto
                </Botao>
              }
            />
          )}
        </Cartao>
      </div>

      <FormularioCliente
        aberto={editando}
        cliente={cliente}
        aoFechar={() => setEditando(false)}
        aoSalvar={() => {
          setEditando(false);
          setRecarregar((n) => n + 1);
        }}
      />

      <FormularioProjeto
        aberto={novoProjeto}
        clienteIdInicial={cliente.id}
        aoFechar={() => setNovoProjeto(false)}
        aoSalvar={(p) => {
          setNovoProjeto(false);
          navegar(`/projetos/${p.id}`);
        }}
      />

      <Confirmacao
        aberto={confirmandoExclusao}
        titulo={temProjetos ? 'Não é possível excluir' : 'Excluir cliente?'}
        apenasAviso={temProjetos}
        processando={excluindo}
        aoCancelar={() => setConfirmandoExclusao(false)}
        aoConfirmar={excluir}
        mensagem={
          temProjetos ? (
            <>
              <strong className="text-texto">{cliente.nome}</strong> possui {cliente.projetos.length} projeto(s) e não pode ser
              excluído. Exclua ou transfira os projetos primeiro.
            </>
          ) : (
            <>
              <strong className="text-texto">{cliente.nome}</strong> será movido para a lixeira. Você poderá restaurá-lo depois
              pela área de Backup.
            </>
          )
        }
      />
    </>
  );
}

function Info({ icone: Icone, rotulo, valor }: { icone: typeof Phone; rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icone className="mt-0.5 size-4 shrink-0 text-texto-suave" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs text-texto-suave">{rotulo}</dt>
        <dd className="break-words">{valor || <span className="text-texto-suave">—</span>}</dd>
      </div>
    </div>
  );
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}
