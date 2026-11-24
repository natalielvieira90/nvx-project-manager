import { useEffect, useState } from 'react';
import {
  Briefcase,
  CircleAlert,
  CircleCheckBig,
  Clock,
  Hourglass,
  Landmark,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Botao, CabecalhoPagina, Cartao, EstadoVazio } from '../components/ui.tsx';
import { api, ErroApi } from '../lib/api.ts';
import { formatarDuracao, formatarMoeda } from '../../shared/formatacao.ts';
import type { IndicadoresDashboard } from '../../shared/tipos.ts';
import { Indicador, ItemLegenda, SeletorMes, nomeDoMes } from './dashboard/componentes.tsx';
import { GraficoFaturamentoMensal, GraficoHorasPorProjeto } from './dashboard/graficos.tsx';

function mesCorrente() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function Dashboard() {
  const [mes, setMes] = useState(mesCorrente);
  const [dados, setDados] = useState<IndicadoresDashboard | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    setErro(null);
    api<IndicadoresDashboard>(`/dashboard?mes=${mes}`)
      .then((d) => ativo && setDados(d))
      .catch((e: unknown) => ativo && setErro(e instanceof ErroApi ? e.message : 'Erro inesperado ao carregar o dashboard.'));
    return () => {
      ativo = false;
    };
  }, [mes, tentativa]);

  return (
    <>
      <CabecalhoPagina
        titulo="Dashboard"
        descricao="Visão geral dos projetos, horas e faturamento."
        acoes={<SeletorMes mes={mes} onChange={setMes} />}
      />

      {erro ? (
        <Cartao>
          <EstadoVazio
            icone={CircleAlert}
            titulo="Não foi possível carregar os indicadores"
            descricao={erro}
            acao={<Botao onClick={() => setTentativa((t) => t + 1)}>Tentar novamente</Botao>}
          />
        </Cartao>
      ) : !dados ? (
        <Esqueleto />
      ) : (
        <Conteudo dados={dados} />
      )}
    </>
  );
}

function Conteudo({ dados }: { dados: IndicadoresDashboard }) {
  const { projetos, horasMes, faturamento, naoCobrado } = dados;
  const pctDev = horasMes.totalSegundos ? (horasMes.desenvolvimentoSegundos / horasMes.totalSegundos) * 100 : 0;
  const mesNome = nomeDoMes(dados.mes).toLowerCase();

  return (
    <div className="space-y-6">
      {/* Financeiro */}
      <section aria-label="Faturamento" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          destaque
          rotulo="Faturamento previsto"
          valor={formatarMoeda(faturamento.previstoCentavos)}
          complemento="Total dos projetos contratados"
          icone={TrendingUp}
        />
        <Indicador
          rotulo="Faturamento recebido"
          valor={formatarMoeda(faturamento.recebidoCentavos)}
          complemento={`${formatarMoeda(faturamento.recebidoNoMesCentavos)} em ${mesNome}`}
          icone={Landmark}
        />
        <Indicador
          rotulo="Valores pendentes"
          valor={formatarMoeda(faturamento.pendenteCentavos)}
          complemento="A receber dos projetos contratados"
          icone={Wallet}
        />
        <Indicador
          rotulo="Horas faturáveis não cobradas"
          valor={formatarDuracao(naoCobrado.segundos)}
          complemento={`${formatarMoeda(naoCobrado.valorCentavos)} em horas e atendimentos a faturar`}
          icone={Hourglass}
        />
      </section>

      {/* Operação */}
      <section aria-label="Projetos e horas" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo="Projetos ativos"
          valor={String(projetos.ativos)}
          complemento={
            projetos.emOrcamento
              ? `${projetos.emOrcamento} em orçamento ou aguardando aprovação`
              : 'Em andamento ou pausados'
          }
          icone={Briefcase}
        />
        <Indicador
          rotulo="Projetos concluídos"
          valor={String(projetos.concluidos)}
          complemento="Desde o início"
          icone={CircleCheckBig}
        />
        <Indicador
          rotulo={`Horas trabalhadas em ${mesNome}`}
          valor={formatarDuracao(horasMes.totalSegundos)}
          icone={Clock}
          className="sm:col-span-2"
        >
          {/* Divisão desenvolvimento × suporte */}
          <div className="mt-4">
            <div
              className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-fundo"
              role="img"
              aria-label={`Desenvolvimento ${formatarDuracao(horasMes.desenvolvimentoSegundos)}, suporte ${formatarDuracao(horasMes.suporteSegundos)}`}
            >
              {horasMes.desenvolvimentoSegundos > 0 && (
                <div className="rounded-full bg-serie-dev" style={{ width: `${pctDev}%` }} />
              )}
              {horasMes.suporteSegundos > 0 && <div className="flex-1 rounded-full bg-serie-suporte" />}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <ItemLegenda cor="var(--color-serie-dev)" rotulo="Desenvolvimento" />
                <p className="tabular mt-0.5 text-base font-semibold">{formatarDuracao(horasMes.desenvolvimentoSegundos)}</p>
              </div>
              <div>
                <ItemLegenda cor="var(--color-serie-suporte)" rotulo="Suporte" />
                <p className="tabular mt-0.5 text-base font-semibold">{formatarDuracao(horasMes.suporteSegundos)}</p>
              </div>
            </div>
          </div>
        </Indicador>
      </section>

      {/* Gráficos */}
      <section aria-label="Gráficos" className="grid gap-4 xl:grid-cols-5">
        <GraficoFaturamentoMensal dados={dados.faturamentoMensal} />
        <GraficoHorasPorProjeto dados={dados.horasPorProjeto} mes={dados.mes} />
      </section>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando indicadores">
      {[0, 1].map((linha) => (
        <div key={linha} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[118px] animate-pulse rounded-cartao border border-borda bg-superficie" />
          ))}
        </div>
      ))}
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="h-80 animate-pulse rounded-cartao border border-borda bg-superficie xl:col-span-3" />
        <div className="h-80 animate-pulse rounded-cartao border border-borda bg-superficie xl:col-span-2" />
      </div>
    </div>
  );
}
