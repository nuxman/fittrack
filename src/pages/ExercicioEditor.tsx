import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Page, useVoltar } from '../components/Page';
import { ImageField } from '../components/ImageField';
import { useDialog } from '../components/ConfirmDialog';
import { useAsync } from '../useAsync';
import { GRUPOS_MUSCULARES, type Exercise, type GrupoMuscular, type NewRecord } from '../db/types';
import {
  ExercicioEmUsoError, exerciseSchema, exercisesRepository, NomeDuplicadoError,
} from '../db/repositories/exercises';
import { exerciseImagesRepository } from '../db/repositories/exerciseImages';
import { resizeImage } from '../image';

type Form = NewRecord<Exercise>;

const VAZIO: Form = {
  nome: '', tipo: 'carga', unidadeCarga: 'kg', grupoPrincipal: '' as GrupoMuscular,
  gruposSecundarios: [], porLado: false, videoUrl: '', anotacoes: '',
};

const TIPOS = [['carga', 'Carga'], ['peso_corporal', 'Peso corporal'], ['tempo', 'Tempo']] as const;

export function ExercicioEditor() {
  const { id } = useParams();
  const novo = id === undefined;
  const navigate = useNavigate();
  const voltar = useVoltar('/exercicios');
  const { confirmar, avisar } = useDialog();

  const [exercicio] = useAsync(() => (id ? exercisesRepository.get(id) : Promise.resolve(undefined)), [id]);
  const [imagem, recarregarImagem] = useAsync(
    () => (id ? exerciseImagesRepository.getForExercise(id) : Promise.resolve(undefined)), [id],
  );
  const [form, setForm] = useState<Form>(VAZIO);
  const [erros, setErros] = useState<string[]>([]);
  const [processandoFoto, setProcessandoFoto] = useState(false);

  useEffect(() => {
    if (exercicio) setForm({ ...VAZIO, ...exercicio, videoUrl: exercicio.videoUrl ?? '', anotacoes: exercicio.anotacoes ?? '' });
  }, [exercicio]);

  if (!novo && exercicio === undefined) return <Page title="Exercício" voltar>Carregando…</Page>;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErros([]);
  };

  async function salvar() {
    const v = exerciseSchema.safeParse(form);
    if (!v.success) return setErros(v.error.issues.map((i) => i.message));
    try {
      if (novo) {
        const criado = await exercisesRepository.create(form);
        navigate(`/exercicios/${criado.id}`, { replace: true });
      } else {
        await exercisesRepository.update(id, form);
        voltar();
      }
    } catch (e) {
      if (e instanceof NomeDuplicadoError && e.excluido) {
        if (await confirmar('Exercício excluído', `Já existiu "${e.existente.nome}". Restaurar em vez de criar outro? O histórico dele volta junto.`, `Restaurar "${e.existente.nome}"`)) {
          const r = await exercisesRepository.restore(e.existente.id);
          navigate(`/exercicios/${r.id}`, { replace: true });
        }
        return;
      }
      setErros([e instanceof Error ? e.message : 'Erro ao salvar']);
    }
  }

  async function excluir() {
    if (!exercicio) return;
    if (!(await confirmar('Excluir exercício?', `"${exercicio.nome}" sai do catálogo. O histórico é mantido.`, 'Excluir', true))) return;
    try {
      await exercisesRepository.remove(exercicio.id);
      voltar();
    } catch (e) {
      if (e instanceof ExercicioEmUsoError) await avisar('Exercício em uso', e.message);
      else throw e;
    }
  }

  async function trocarFoto(file: File) {
    if (!id) return;
    setProcessandoFoto(true);
    try {
      await exerciseImagesRepository.setForExercise(id, await resizeImage(file));
      recarregarImagem();
    } catch (e) {
      await avisar('Foto não salva', e instanceof Error ? e.message : 'Erro ao processar a imagem');
    } finally {
      setProcessandoFoto(false);
    }
  }

  async function removerFoto() {
    if (!id || !(await confirmar('Remover foto?', undefined, 'Remover', true))) return;
    await exerciseImagesRepository.removeForExercise(id);
    recarregarImagem();
  }

  return (
    <Page title={novo ? 'Novo exercício' : 'Editar exercício'} voltar>
      <label className="block space-y-1">
        <span className="text-sm text-neutral-400">Nome</span>
        <input className="input" value={form.nome} onChange={(e) => set('nome', e.target.value)} />
      </label>

      <fieldset className="space-y-1">
        <legend className="text-sm text-neutral-400">Tipo</legend>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map(([v, rotulo]) => (
            <button key={v} type="button" aria-pressed={form.tipo === v} className={form.tipo === v ? 'btn-primary px-2' : 'btn-secondary px-2'} onClick={() => set('tipo', v)}>
              {rotulo}
            </button>
          ))}
        </div>
      </fieldset>

      {form.tipo === 'carga' && (
        <label className="block space-y-1">
          <span className="text-sm text-neutral-400">Unidade de carga</span>
          <select className="input" value={form.unidadeCarga} onChange={(e) => set('unidadeCarga', e.target.value as Form['unidadeCarga'])}>
            <option value="kg">kg</option>
            <option value="placa">placa (número da placa no aparelho)</option>
          </select>
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-sm text-neutral-400">Grupo principal</span>
        <select className="input" value={form.grupoPrincipal} onChange={(e) => set('grupoPrincipal', e.target.value as GrupoMuscular)}>
          <option value="">Escolha…</option>
          {GRUPOS_MUSCULARES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>

      <fieldset className="space-y-1">
        <legend className="text-sm text-neutral-400">Grupos secundários</legend>
        <div className="flex flex-wrap gap-2">
          {GRUPOS_MUSCULARES.filter((g) => g !== form.grupoPrincipal).map((g) => {
            const marcado = form.gruposSecundarios.includes(g);
            return (
              <button key={g} type="button" aria-pressed={marcado}
                className={`min-h-12 rounded-full px-4 ${marcado ? 'bg-primary-400 text-neutral-950' : 'bg-surface-raised text-neutral-300'}`}
                onClick={() => set('gruposSecundarios', marcado ? form.gruposSecundarios.filter((x) => x !== g) : [...form.gruposSecundarios, g])}>
                {g}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex min-h-14 items-center gap-3">
        <input type="checkbox" className="h-6 w-6 accent-amber-400" checked={form.porLado} onChange={(e) => set('porLado', e.target.checked)} />
        <span className="text-lg">Registrar por lado (esquerdo/direito)</span>
      </label>

      <section className="space-y-2">
        <h2 className="text-sm text-neutral-400">Foto</h2>
        {novo ? (
          <p className="card text-neutral-400">Salve o exercício para adicionar uma foto.</p>
        ) : (
          <>
            <ImageField imagem={imagem} grupo={form.grupoPrincipal || 'peito'} ocupado={processandoFoto} onEscolher={trocarFoto} onRemover={removerFoto} />
            <p className="text-xs text-neutral-500">A foto é salva na hora, reduzida para no máximo 1024 px.</p>
          </>
        )}
      </section>

      <label className="block space-y-1">
        <span className="text-sm text-neutral-400">Link do vídeo de execução (https://)</span>
        <input className="input" type="url" inputMode="url" placeholder="https://" value={form.videoUrl ?? ''} onChange={(e) => set('videoUrl', e.target.value)} />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-neutral-400">Minhas anotações</span>
        <textarea className="input min-h-28 py-3" value={form.anotacoes ?? ''} onChange={(e) => set('anotacoes', e.target.value)} />
      </label>

      {erros.length > 0 && (
        <ul role="alert" className="card space-y-1 text-red-400">
          {erros.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <button type="button" className="btn-primary w-full" onClick={salvar}>Salvar</button>
      {!novo && (
        <button type="button" className="btn w-full text-red-400" onClick={excluir}>
          <Trash2 size={22} /> Excluir exercício
        </button>
      )}
    </Page>
  );
}
