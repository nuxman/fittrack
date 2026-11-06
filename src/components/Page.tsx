import type { ReactNode } from 'react';

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 pb-28 pt-6">
      <h1 className="mb-4 text-3xl font-bold text-primary-400">{title}</h1>
      <div className="space-y-4">{children}</div>
    </main>
  );
}
