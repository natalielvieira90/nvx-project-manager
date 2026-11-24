import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, CircleAlert, Plus, SearchX, Users } from 'lucide-react';
import { Botao, CabecalhoPagina, Cartao, EstadoVazio, Etiqueta } from '../../components/ui.tsx';
import { CampoBusca } from '../../components/formulario.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { formatarDocumento, formatarTelefone } from '../../../shared/documentos.ts';
import type { ClienteResumo } from '../../../shared/tipos.ts';
import { FormularioCliente } from './FormularioCliente.tsx';

export function ListaClientes() {
  const [busca, setBusca] = useState('');
  const [clientes, setClientes] = useState<ClienteResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const navegar = useNavigate();

  // Busca com pequena espera para não consultar a cada tecla.
  useEffect(() => {
    let ativo = true;
    const t = setTimeout(() => {
      api<ClienteResumo[]>(`/clientes?busca=${encodeURIComponent(busca)}`)
        .then((l) => {
          if (!ativo) return;
          setClientes(l);
          setErro(null);
        })
        .catch((e: unknown) => ativo && setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar clientes.'));
    }, busca ? 250 : 0);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [busca, recarregar]);

  const semCadastro = clientes !== null && clientes.length === 0 && !busca;

  return (
    <>
      <CabecalhoPagina
        titulo="Clientes"
        descricao={clientes && !semCadastro ? `${clientes.length} cliente(s)${busca ? ' encontrados' : ''}` : 'Cadastro de clientes e seus contatos.'}
        acoes={
          <Botao icone={Plus} onClick={() => setFormAberto(true)}>
            Novo cliente
          </Botao>
        }
      />

      {erro ? (
        <Cartao>
          <EstadoVazio
            icone={CircleAlert}
            titulo="Não foi possível carregar os clientes"
            descricao={erro}
            acao={<Botao onClick={() => setRecarregar((n) => n + 1)}>Tentar novamente</Botao>}
          />
        </Cartao>
      ) : semCadastro ? (
        <Cartao>
          <EstadoVazio
            icone={Users}
            titulo="Nenhum cliente cadastrado"
            descricao="Cadastre seu primeiro cliente para começar a registrar projetos e horas."
            acao={
              <Botao icone={Plus} onClick={() => setFormAberto(true)}>
                Cadastrar cliente
              </Botao>
            }
          />
        </Cartao>
      ) : (
        <Cartao>
          <div className="border-b border-borda p-4">
            <CampoBusca
              valor={busca}
              aoMudar={setBusca}
              placeholder="Buscar nome, empresa, telefone, CPF…"
              rotulo="Buscar clientes"
            />
          </div>

          {clientes === null ? (
            <div className="space-y-3 p-4" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-fundo" />
              ))}
            </div>
          ) : clientes.length === 0 ? (
            <EstadoVazio icone={SearchX} titulo="Nenhum cliente encontrado" descricao={`Nada corresponde a "${busca}".`} />
          ) : (
            <>
              {/* Tabela (telas médias e grandes) */}
              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-borda text-left text-xs font-medium text-texto-suave">
                    <th className="px-5 py-3 font-medium">Cliente</th>
                    <th className="px-5 py-3 font-medium">Contato</th>
                    <th className="px-5 py-3 font-medium">CPF/CNPJ</th>
                    <th className="px-5 py-3 font-medium">Projetos</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {clientes.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => navegar(`/clientes/${c.id}`)}
                      className="group cursor-pointer transition-colors hover:bg-fundo/70"
                    >
                      <td className="px-5 py-3">
                        <a
                          href={`/clientes/${c.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navegar(`/clientes/${c.id}`);
                          }}
                          className="font-medium hover:underline"
                        >
                          {c.nome}
                        </a>
                        {c.empresa && <p className="text-xs text-texto-suave">{c.empresa}</p>}
                      </td>
                      <td className="px-5 py-3 text-texto-suave">
                        {c.telefone && <p className="tabular">{formatarTelefone(c.telefone)}</p>}
                        {c.email && <p className="text-xs">{c.email}</p>}
                        {!c.telefone && !c.email && '—'}
                      </td>
                      <td className="tabular px-5 py-3 text-texto-suave">{c.documento ? formatarDocumento(c.documento) : '—'}</td>
                      <td className="px-5 py-3">
                        <ResumoProjetos c={c} />
                      </td>
                      <td className="pr-4 text-texto-suave/50 group-hover:text-texto-suave">
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Cartões (celular) */}
              <ul className="divide-y divide-borda md:hidden">
                {clientes.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navegar(`/clientes/${c.id}`)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fundo/70"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.nome}</p>
                        <p className="truncate text-xs text-texto-suave">
                          {[c.empresa, c.telefone && formatarTelefone(c.telefone)].filter(Boolean).join(' · ') || c.email || '—'}
                        </p>
                      </div>
                      <ResumoProjetos c={c} />
                      <ChevronRight className="size-4 shrink-0 text-texto-suave/60" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>
      )}

      <FormularioCliente
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        aoSalvar={(c) => {
          setFormAberto(false);
          navegar(`/clientes/${c.id}`);
        }}
      />
    </>
  );
}

function ResumoProjetos({ c }: { c: ClienteResumo }) {
  if (c.qtdProjetos === 0) return <span className="text-xs text-texto-suave">Nenhum</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {c.qtdProjetosAtivos > 0 && <Etiqueta tom="destaque">{c.qtdProjetosAtivos} ativo(s)</Etiqueta>}
      <span className="text-xs text-texto-suave">{c.qtdProjetos} no total</span>
    </span>
  );
}
