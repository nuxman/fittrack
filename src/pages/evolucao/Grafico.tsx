import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ddmm } from './dados';

// Âmbar 600: passa no validador de paleta contra o fundo do card (#171717); o amarelo 400 dos botões é claro demais para linha.
const COR = '#d97706';
const SUPERFICIE = '#171717';
const GRADE = '#262626';
const TEXTO = '#a3a3a3';

/** Uma série por gráfico (o título nomeia o dado, sem legenda): linha de 2 px, pontos com anel da cor do fundo e tooltip. */
export function Grafico<P extends { data: string }>({ titulo, pontos, valor, formatar, altura = 'h-44' }: {
  titulo: string;
  pontos: P[];
  valor: (p: P) => number | null;
  formatar: (v: number) => string;
  altura?: string;
}) {
  const dados = pontos.map((p) => ({ data: ddmm(p.data), v: valor(p) })).filter((d) => d.v != null);
  return (
    <figure className="space-y-1" aria-label={titulo}>
      <figcaption className="font-semibold text-neutral-200">{titulo}</figcaption>
      <div className={altura} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRADE} strokeWidth={1} vertical={false} />
            <XAxis dataKey="data" tick={{ fill: TEXTO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRADE }} minTickGap={16} />
            <YAxis tick={{ fill: TEXTO, fontSize: 12 }} tickLine={false} axisLine={false} width={48} domain={['auto', 'auto']} allowDecimals />
            <Tooltip
              cursor={{ stroke: TEXTO, strokeWidth: 1 }}
              contentStyle={{ background: GRADE, border: 'none', borderRadius: 12, color: '#f5f5f5' }}
              labelStyle={{ color: TEXTO }}
              formatter={(v: number) => [formatar(v), titulo]}
            />
            <Line
              type="linear"
              dataKey="v"
              stroke={COR}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={{ r: 4, fill: COR, stroke: SUPERFICIE, strokeWidth: 2 }}
              activeDot={{ r: 6, fill: COR, stroke: SUPERFICIE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
