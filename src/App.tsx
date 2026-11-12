import { useState } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { PROVIDER_FUTURE, ROTAS, ROUTER_FUTURE } from './rotas';

export function App() {
  // Data router (createHashRouter): mesmas URLs com #; permite useBlocker.
  const [router] = useState(() => createHashRouter(ROTAS, { future: ROUTER_FUTURE }));
  return <RouterProvider router={router} future={PROVIDER_FUTURE} />;
}
