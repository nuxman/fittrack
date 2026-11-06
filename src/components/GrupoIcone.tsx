import { Activity, Dumbbell, Footprints, Hand, HeartPulse, Shield, type LucideIcon } from 'lucide-react';
import type { GrupoMuscular } from '../db/types';

const ICONES: Record<GrupoMuscular, LucideIcon> = {
  peito: Shield,
  costas: Shield,
  ombros: Shield,
  bíceps: Dumbbell,
  tríceps: Dumbbell,
  antebraço: Hand,
  quadríceps: Footprints,
  'posterior de coxa': Footprints,
  glúteos: Footprints,
  adutores: Footprints,
  panturrilha: Footprints,
  abdômen: Activity,
  core: Activity,
  lombar: HeartPulse,
};

/** Ícone genérico pelo grupo principal, usado quando o exercício não tem foto. */
export function GrupoIcone({ grupo, size = 28 }: { grupo: GrupoMuscular; size?: number }) {
  const Icone = ICONES[grupo];
  return <Icone size={size} aria-label={grupo} className="text-primary-400" />;
}
