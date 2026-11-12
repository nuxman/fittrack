import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { PROVIDER_FUTURE, ROTAS, ROUTER_FUTURE } from '../rotas';

/** Abre o app numa rota com o mesmo data router do app (em memória). Devolve o router para navegar (ex.: voltar). */
export function abrir(rota = '/') {
  const router = createMemoryRouter(ROTAS, { initialEntries: [rota], future: ROUTER_FUTURE });
  return { router, ...render(<RouterProvider router={router} future={PROVIDER_FUTURE} />) };
}
