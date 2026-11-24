import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarDuracao, formatarMoeda } from '../../../shared/formatacao.ts';
import type { IndicadoresDashboard } from '../../../shared/tipos.ts';
import { CartaoGrafico, GraficoVazio, ItemLegenda, nomeDoMes } from './componentes.tsx';

const COR_DEV = 'var(--color-serie-dev)';
const COR_SUPORTE = 'var(--color-serie-suporte)';
const COR_GRADE = 'var(--color-grade)';
const COR_EIXO = 'var(--color-texto-suave)';

const moedaCompacta = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const estiloEixo = { fontSize: 12, fill: COR_EIXO };

function CaixaDica({ titulo, linhas }: { titulo: string; linhas: { cor?: string; rotulo: string; valor: string }[] }) {
  return (
    <div className="rounded-lg border border-borda bg-superficie px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-texto">{titulo}</p>
      {linhas.map((l) => (
        <p key={l.rotulo} className="flex items-center gap-2 text-texto-suave">
          {l.cor && <span className="size-2 rounded-sm" style={{ background: l.cor }} aria-hidden="true" />}
          <span>{l.rotulo}</span>
          <span className="tabular ml-auto pl-3 font-medium text-texto">{l.valor}</span>
        </p>
      ))}
    </div>
  );
}

const classeTabela = 'w-full text-sm [&_td]:py-2 [&_th]:pb-2 [&_th]:text-xs [&_th]:font-medium [&_th]:text-texto-suave';

// ---------------------------------------------------------------------------

export function GraficoFaturamentoMensal({ dados }: { dados: IndicadoresDashboard['faturamentoMensal'] }) {
  const [emTabela, setEmTabela] = useState(false);
  const total = dados.reduce((s, d) => s + d.recebidoCentavos, 0);
  const serie = dados.map((d) => ({ ...d, rotulo: nomeDoMes(d.mes, true).split("/")[0], valor: d.recebidoCentavos / 100 }));

  return (
    <CartaoGrafico
      titulo="Faturamento mensal"
      descricao={`Valores recebidos nos últimos 12 meses · total ${formatarMoeda(total)}`}
      emTabela={emTabela}
      onAlternar={() => setEmTabela((v) => !v)}
      className="xl:col-span-3"
      podeAlternar={total > 0}
    >
      {total === 0 ? (
        <GraficoVazio texto="Nenhum pagamento registrado nos últimos 12 meses." />
      ) : emTabela ? (
        <table className={classeTabela}>
          <thead>
            <tr className="text-left">
              <th>Mês</th>
              <th className="text-right">Recebido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {serie.map((d) => (
              <tr key={d.mes}>
                <td>{nomeDoMes(d.mes)}</td>
                <td className="tabular text-right">{formatarMoeda(d.recebidoCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke={COR_GRADE} />
              <XAxis dataKey="rotulo" tick={estiloEixo} tickLine={false} axisLine={false} interval="equidistantPreserveStart" minTickGap={4} />
              <YAxis
                tick={estiloEixo}
                tickLine={false}
                axisLine={false}
                width={78}
                tickFormatter={(v: number) => moedaCompacta.format(v).replace(/ /g, ' ')}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-fundo)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <CaixaDica
                      titulo={nomeDoMes(payload[0].payload.mes)}
                      linhas={[{ rotulo: 'Recebido', valor: formatarMoeda(payload[0].payload.recebidoCentavos) }]}
                    />
                  ) : null
                }
              />
              <Bar dataKey="valor" fill={COR_DEV} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </CartaoGrafico>
  );
}

// ---------------------------------------------------------------------------

const MAX_PROJETOS = 7;

export function GraficoHorasPorProjeto({ dados, mes }: { dados: IndicadoresDashboard['horasPorProjeto']; mes: string }) {
  const [emTabela, setEmTabela] = useState(false);

  // Mais de 7 projetos: os menores são agrupados em "Outros".
  const principais = dados.slice(0, MAX_PROJETOS);
  const resto = dados.slice(MAX_PROJETOS);
  const linhas = [
    ...principais.map((d) => ({ nome: d.projeto, cliente: d.cliente, dev: d.desenvolvimentoSegundos, sup: d.suporteSegundos })),
    ...(resto.length
      ? [{
          nome: `Outros (${resto.length})`,
          cliente: 'Vários clientes',
          dev: resto.reduce((s, d) => s + d.desenvolvimentoSegundos, 0),
          sup: resto.reduce((s, d) => s + d.suporteSegundos, 0),
        }]
      : []),
  ].map((l) => ({ ...l, devH: l.dev / 3600, supH: l.sup / 3600 }));

  return (
    <CartaoGrafico
      titulo="Horas por projeto"
      descricao={nomeDoMes(mes)}
      emTabela={emTabela}
      onAlternar={() => setEmTabela((v) => !v)}
      className="xl:col-span-2"
      podeAlternar={linhas.length > 0}
      legenda={
        linhas.length > 0 && (
          <div className="flex gap-4">
            <ItemLegenda cor={COR_DEV} rotulo="Desenvolvimento" />
            <ItemLegenda cor={COR_SUPORTE} rotulo="Suporte" />
          </div>
        )
      }
    >
      {linhas.length === 0 ? (
        <GraficoVazio texto="Nenhuma hora registrada neste mês." />
      ) : emTabela ? (
        <table className={classeTabela}>
          <thead>
            <tr className="text-left">
              <th>Projeto</th>
              <th className="text-right">Desenv.</th>
              <th className="text-right">Suporte</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.map((l) => (
              <tr key={l.nome}>
                <td>
                  {l.nome}
                  <span className="block text-xs text-texto-suave">{l.cliente}</span>
                </td>
                <td className="tabular text-right">{formatarDuracao(l.dev)}</td>
                <td className="tabular text-right">{formatarDuracao(l.sup)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ height: Math.max(160, linhas.length * 44 + 24) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={linhas} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
              <CartesianGrid horizontal={false} stroke={COR_GRADE} />
              <XAxis
                type="number"
                tick={estiloEixo}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tickFormatter={(v: number) => `${v}h`}
              />
              <YAxis
                type="category"
                dataKey="nome"
                tickLine={false}
                axisLine={false}
                width={128}
                // Rótulo em uma única linha (o padrão da biblioteca quebra o texto).
                tick={({ x, y, payload }) => {
                  const v = String(payload.value);
                  return (
                    <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={COR_EIXO}>
                      <title>{v}</title>
                      {v.length > 17 ? `${v.slice(0, 16)}…` : v}
                    </text>
                  );
                }}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-fundo)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const l = payload[0].payload as (typeof linhas)[number];
                  return (
                    <CaixaDica
                      titulo={`${l.nome} · ${l.cliente}`}
                      linhas={[
                        { cor: COR_DEV, rotulo: 'Desenvolvimento', valor: formatarDuracao(l.dev) },
                        { cor: COR_SUPORTE, rotulo: 'Suporte', valor: formatarDuracao(l.sup) },
                        { rotulo: 'Total', valor: formatarDuracao(l.dev + l.sup) },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="devH" stackId="h" fill={COR_DEV} stroke="var(--color-superficie)" strokeWidth={1} />
              <Bar dataKey="supH" stackId="h" fill={COR_SUPORTE} stroke="var(--color-superficie)" strokeWidth={1} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </CartaoGrafico>
  );
}
