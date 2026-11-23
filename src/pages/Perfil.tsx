import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Trash2, UserRound } from 'lucide-react';
import { Page } from '../components/Page';
import { FotoAmpliavel } from '../components/FotoAmpliavel';
import { num } from '../components/CampoSerie';
import { useAsync } from '../useAsync';
import { useAvisoNaoSalvo } from '../useAvisoNaoSalvo';
import { LIMITES_ALTURA, MAX_FOTO_PERFIL, profileRepository, type FotoPerfil } from '../db/repositories/profile';
import { resizeImage } from '../image';
import { lerMedida } from '../medidas';
import { chaveDia } from '../semana';
import { SEXOS, type Profile, type Sexo } from '../db/types';

const NOME_SEXO: Record<Sexo, string> = { feminino: 'Feminino', masculino: 'Masculino', outro: 'Outro' };

/** /perfil: "Meu perfil", um por aparelho. Todos os campos opcionais; sem IMC nem cálculo de saúde. */
export function Perfil() {
  const [dados] = useAsync(async () => ({ p: await profileRepository.get() }));
  if (!dados) return <Page title="Meu perfil" voltar>Carregando…</Page>;
  return <Formulario p={dados.p} />;
}

function Formulario({ p }: { p?: Profile }) {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState(p?.nome ?? '');
  const [nascimento, setNascimento] = useState(p?.nascimento ?? '');
  const [altura, setAltura] = useState(p?.alturaCm != null ? num(p.alturaCm) : '');
  const [sexo, setSexo] = useState<Sexo | undefined>(p?.sexo);
  const [objetivo, setObjetivo] = useState(p?.objetivo ?? '');
  // undefined = foto não mexida; null = removida.
  const [foto, setFoto] = useState<FotoPerfil | null | undefined>(undefined);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [sujo, setSujo] = useState(false);
  const liberar = useAvisoNaoSalvo(sujo);
  const mexeu = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSujo(true);
    setErro('');
  };
  const fotoAtual = foto === undefined ? p?.foto : foto ?? undefined;

  const escolherFoto = async (f: File) => {
    setOcupado(true);
    try {
      setFoto(await resizeImage(f, MAX_FOTO_PERFIL)); // nunca o original
      setSujo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao processar a imagem');
    } finally {
      setOcupado(false);
    }
  };

  const salvar = async () => {
    setOcupado(true);
    try {
      await profileRepository.salvar(
        { nome, nascimento: nascimento || undefined, alturaCm: lerMedida(altura, 'Altura (cm)', ...LIMITES_ALTURA) ?? undefined, sexo, objetivo },
        foto,
      );
      liberar();
      navigate(-1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Page title="Meu perfil" voltar>
      <p className="text-sm text-neutral-400">Tudo é opcional e fica só neste aparelho.</p>
      <section className="flex items-center gap-4" aria-label="Foto do perfil">
        {fotoAtual ? (
          <FotoAmpliavel blob={fotoAtual.blob} className="h-24 w-24 !rounded-full" cobrir alt="Foto do perfil" rotulo="Ampliar foto do perfil" />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-surface-raised">
            <UserRound size={44} className="text-neutral-500" aria-hidden />
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Arquivo da foto do perfil"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void escolherFoto(f);
            }}
          />
          <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => input.current?.click()}>
            <Camera size={20} /> {fotoAtual ? 'Trocar foto' : 'Adicionar foto'}
          </button>
          {fotoAtual && (
            <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => mexeu(setFoto)(null)}>
              <Trash2 size={20} /> Remover foto
            </button>
          )}
        </div>
      </section>
      <label className="block">
        <span className="text-lg font-semibold">Nome</span>
        <input className="input mt-2" value={nome} autoComplete="given-name" onChange={(e) => mexeu(setNome)(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-lg font-semibold">Data de nascimento</span>
        <input className="input mt-2" type="date" max={chaveDia(new Date())} value={nascimento} onChange={(e) => mexeu(setNascimento)(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-lg font-semibold">Altura (cm)</span>
        <input className="input mt-2" inputMode="decimal" value={altura} onChange={(e) => mexeu(setAltura)(e.target.value)} />
      </label>
      <fieldset>
        <legend className="text-lg font-semibold">Sexo (opcional)</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SEXOS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sexo === s}
              className={sexo === s ? 'btn-primary px-2' : 'btn-secondary px-2'}
              onClick={() => mexeu(setSexo)(sexo === s ? undefined : s)}
            >
              {NOME_SEXO[s]}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="text-lg font-semibold">Objetivo</span>
        <textarea className="input mt-2 min-h-24 py-3" value={objetivo} onChange={(e) => mexeu(setObjetivo)(e.target.value)} />
      </label>
      {erro && <p role="alert" className="text-red-400">{erro}</p>}
      <button type="button" className="btn-primary w-full" disabled={ocupado} onClick={() => void salvar()}>
        <Check size={22} /> Salvar
      </button>
    </Page>
  );
}
