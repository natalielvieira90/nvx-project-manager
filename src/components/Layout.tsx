import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Logo } from './Logo.tsx';
import { cx } from './ui.tsx';
import { gruposNavegacao } from '../navegacao.ts';
import { useCronometro } from '../lib/cronometro.tsx';
import { formatarCronometro } from '../../shared/formatacao.ts';

/** Estrutura principal: menu lateral fixo no desktop e gaveta no celular. */
export function Layout() {
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();

  // Fecha a gaveta ao trocar de página (celular).
  useEffect(() => setMenuAberto(false), [local.pathname]);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Barra superior no celular */}
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 bg-marca-900 px-4 lg:hidden">
        <Logo compacto />
        <IndicadorCronometro compacto />
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          className="grid size-10 place-items-center rounded-lg text-white hover:bg-white/10"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {menuAberto && (
        <div className="fixed inset-0 z-40 bg-marca-950/60 lg:hidden" onClick={() => setMenuAberto(false)} aria-hidden="true" />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-marca-900 transition-transform lg:translate-x-0',
          menuAberto ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Menu principal"
      >
        <div className="flex h-24 items-center justify-between px-5">
          <Logo />
          <button
            type="button"
            onClick={() => setMenuAberto(false)}
            className="grid size-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {gruposNavegacao.map((grupo) => (
            <div key={grupo.titulo} className="mb-6">
              <div className="rotulo px-3 pb-2 text-[10px] text-lavanda-300/80">
                {grupo.titulo}
              </div>
              <ul className="space-y-0.5">
                {grupo.itens.map(({ rota, rotulo, icone: Icone }) => (
                  <li key={rota}>
                    <NavLink
                      to={rota}
                      end={rota === '/'}
                      className={({ isActive }) =>
                        cx(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5 hover:text-white',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-destaque-400" aria-hidden="true" />
                          )}
                          <Icone
                            className={cx('size-[18px]', isActive ? 'text-destaque-400' : 'text-white/45 group-hover:text-white/80')}
                            aria-hidden="true"
                          />
                          {rotulo}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <IndicadorCronometro />

        <div className="border-t border-white/10 px-5 py-4 text-[11px] leading-relaxed text-lavanda-300/80">
          NVX Digital
          <br />
          Tecnologia que conecta. Soluções que evoluem.
        </div>
      </aside>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}

/** Mostra o cronômetro em andamento em qualquer tela; clicar leva ao controle de horas. */
function IndicadorCronometro({ compacto = false }: { compacto?: boolean }) {
  const { cronometro, segundos } = useCronometro();
  if (!cronometro) return null;
  const rodando = Boolean(cronometro.segmentoIniciadoEm);
  const ponto = (
    <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
      {rodando && <span className="absolute inline-flex size-full animate-ping rounded-full bg-destaque-400 opacity-60" />}
      <span className={cx('relative inline-flex size-2.5 rounded-full', rodando ? 'bg-destaque-400' : 'bg-amber-400')} />
    </span>
  );
  const rotulo = `Cronômetro ${rodando ? 'em andamento' : 'pausado'}: ${formatarCronometro(segundos)}, ${cronometro.projetoNome}`;

  if (compacto) {
    return (
      <Link to="/horas" aria-label={rotulo} className="ml-auto flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5">
        {ponto}
        <span className="tabular text-sm font-semibold text-white">{formatarCronometro(segundos)}</span>
      </Link>
    );
  }
  return (
    <Link
      to="/horas"
      aria-label={rotulo}
      className="mx-3 mb-3 block rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:bg-white/10"
    >
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-white/50">
        {ponto}
        {rodando ? 'Em andamento' : 'Pausado'}
      </div>
      <p className="tabular mt-1 text-xl font-semibold text-white">{formatarCronometro(segundos)}</p>
      <p className="truncate text-xs text-white/60">{cronometro.projetoNome}</p>
    </Link>
  );
}
