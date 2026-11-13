import { NavLink, useLocation } from 'react-router-dom';
import { Dumbbell, History, House, Settings, TrendingUp } from 'lucide-react';

const ITENS = [
  { to: '/', label: 'Início', Icon: House },
  { to: '/treinar', label: 'Treinar', Icon: Dumbbell },
  { to: '/historico', label: 'Histórico', Icon: History },
  { to: '/evolucao', label: 'Evolução', Icon: TrendingUp },
  { to: '/configuracoes', label: 'Configurações', Icon: Settings },
];

export function BottomNav() {
  // Durante a sessão a barra inferior dá lugar ao rodapé da sessão ("Concluir série", "Finalizar treino").
  const { pathname } = useLocation();
  if (pathname.startsWith('/sessao') || pathname.startsWith('/cardio')) return null;
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-800 bg-surface safe-bottom"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {ITENS.map(({ to, label, Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex h-[var(--nav-h)] flex-col items-center justify-center gap-1 text-xs font-medium ${
                  isActive ? 'text-primary-400' : 'text-neutral-400'
                }`
              }
            >
              <Icon size={26} aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
