import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, ChevronRight, CircleAlert, Plus, SearchX } from 'lucide-react';
import { Botao, CabecalhoPagina, Cartao, EstadoVazio, cx } from '../../components/ui.tsx';
import { CampoBusca } from '../../components/formulario.tsx';
import { api, ErroApi } from '../../lib/api.ts';
import { STATUS_PROJETO } from '../../lib/rotulos.ts';
import { STATUS_PROJETO_VALORES } from '../../../shared/esquemas.ts';
import { formatarDuracaoCurta, formatarMoeda } from '../../../shared/formatacao.ts';
import { STATUS_CONTRATADOS } from '../../../shared/financeiro.ts';
import type { ProjetoResumo, StatusProjeto } from '../../../shared/tipos.ts';
import { FormularioProjeto } from './FormularioProjeto.tsx';
import { EtiquetaStatus, Prazo, ProgressoHoras } from './componentes.tsx';

/** Pendência só faz sentido em projeto contratado (orçamento/cancelado não devem nada). */
const temPendencia = (p: ProjetoResumo) =>
  (STATUS_CONTRATADOS as readonly string[]).includes(p.status) && p.financeiro.pendenteCentavos > 0;

export function ListaProjetos() {
  const [parametros, setParametros] = useSearchParams();
  const status = (parametros.get('status') ?? '') as StatusProjeto | '';
  const [busca, setBusca] = useState('');
  const [projetos, setProjetos] = useState<ProjetoResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const navegar = useNavigate();

  useEffect(() => {
    let ativo = true;
    const t = setTimeout(() => {
      const q = new URLSearchParams();
      if (busca) q.set('busca', busca);
      if (status) q.set('status', status);
      api<ProjetoResumo[]>(`/projetos?${q}`)
        .then((l) => ativo && (setProjetos(l), setErro(null)))
        .catch((e: unknown) => ativo && setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar projetos.'));
    }, busca ? 250 : 0);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [busca, status, recarregar]);

  const filtrando = Boolean(busca || status);
  const semCadastro = projetos !== null && projetos.length === 0 && !filtrando;
  const abrir = (id: number) => navegar(`/projetos/${id}`);

  return (
    <>
      <CabecalhoPagina
        titulo="Projetos"
        descricao={projetos && !semCadastro ? `${projetos.length} projeto(s)${filtrando ? ' encontrados' : ''}` : 'Projetos, prazos, valores e status.'}
        acoes={
          <Botao icone={Plus} onClick={() => setFormAberto(true)}>
            Novo projeto
          </Botao>
        }
      />

      {erro ? (
        <Cartao>
          <EstadoVazio
            icone={CircleAlert}
            titulo="Não foi possível carregar os projetos"
            descricao={erro}
            acao={<Botao onClick={() => setRecarregar((n) => n + 1)}>Tentar novamente</Botao>}
          />
        </Cartao>
      ) : semCadastro ? (
        <Cartao>
          <EstadoVazio
            icone={Briefcase}
            titulo="Nenhum projeto cadastrado"
            descricao="Cadastre um projeto para começar a controlar horas e cobranças."
            acao={
              <Botao icone={Plus} onClick={() => setFormAberto(true)}>
                Cadastrar projeto
              </Botao>
            }
          />
        </Cartao>
      ) : (
        <Cartao>
          <div className="flex flex-col gap-3 border-b border-borda p-4">
            <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar projeto ou cliente" rotulo="Buscar projetos" />
            {/* Filtro por status */}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label="Filtrar por status">
              {(['', ...STATUS_PROJETO_VALORES] as const).map((s) => (
                <button
                  key={s || 'todos'}
                  type="button"
                  aria-pressed={status === s}
                  onClick={() => setParametros(s ? { status: s } : {}, { replace: true })}
                  className={cx(
                    'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    status === s
                      ? 'border-marca-800 bg-marca-800 text-white'
                      : 'border-borda text-texto-suave hover:border-texto-suave/40 hover:text-texto',
                  )}
                >
                  {s ? STATUS_PROJETO[s].rotulo : 'Todos'}
                </button>
              ))}
            </div>
          </div>

          {projetos === null ? (
            <div className="space-y-3 p-4" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-fundo" />
              ))}
            </div>
          ) : projetos.length === 0 ? (
            <EstadoVazio icone={SearchX} titulo="Nenhum projeto encontrado" descricao="Ajuste a busca ou o filtro de status." />
          ) : (
            <>
              <div className="hidden xl:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-borda text-left text-xs text-texto-suave">
                      <th className="px-5 py-3 font-medium">Projeto</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Prazo</th>
                      <th className="px-5 py-3 font-medium">Horas</th>
                      <th className="px-5 py-3 text-right font-medium">Total</th>
                      <th className="px-5 py-3 text-right font-medium">Pendente</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {projetos.map((p) => (
                      <tr key={p.id} onClick={() => abrir(p.id)} className="group cursor-pointer hover:bg-fundo/70">
                        <td className="px-5 py-3">
                          <a
                            href={`/projetos/${p.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              abrir(p.id);
                            }}
                            className="font-medium hover:underline"
                          >
                            {p.nome}
                          </a>
                          <p className="text-xs text-texto-suave">{p.clienteNome}</p>
                        </td>
                        <td className="px-5 py-3">
                          <EtiquetaStatus status={p.status} />
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <Prazo prazo={p.prazoEntrega} status={p.status} />
                        </td>
                        <td className="px-5 py-3">
                          <ProgressoHoras trabalhadas={p.horas.totalSegundos} estimativa={p.estimativaSegundos} compacto />
                        </td>
                        <td className="tabular whitespace-nowrap px-5 py-3 text-right">{formatarMoeda(p.financeiro.totalCentavos)}</td>
                        <td className={cx('tabular whitespace-nowrap px-5 py-3 text-right', temPendencia(p) ? 'font-medium' : 'text-texto-suave')}>
                          {temPendencia(p) ? formatarMoeda(p.financeiro.pendenteCentavos) : '—'}
                        </td>
                        <td className="pr-4 text-texto-suave/50 group-hover:text-texto-suave">
                          <ChevronRight className="size-4" aria-hidden="true" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-borda xl:hidden">
                {projetos.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => abrir(p.id)} className="w-full px-4 py-3.5 text-left hover:bg-fundo/70">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.nome}</p>
                          <p className="truncate text-xs text-texto-suave">{p.clienteNome}</p>
                        </div>
                        <EtiquetaStatus status={p.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                        <span>
                          <Prazo prazo={p.prazoEntrega} status={p.status} />
                          <span className="tabular text-texto-suave">
                            {' · '}
                            {formatarDuracaoCurta(p.horas.totalSegundos)}
                            {p.estimativaSegundos > 0 && ` de ${formatarDuracaoCurta(p.estimativaSegundos)}`}
                          </span>
                        </span>
                        <span className="tabular">
                          {formatarMoeda(p.financeiro.totalCentavos)}
                          {temPendencia(p) && (
                            <span className="text-texto-suave"> · pendente {formatarMoeda(p.financeiro.pendenteCentavos)}</span>
                          )}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>
      )}

      <FormularioProjeto
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        aoSalvar={(p) => {
          setFormAberto(false);
          navegar(`/projetos/${p.id}`);
        }}
      />
    </>
  );
}
