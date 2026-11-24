import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { abrir } from '../test/abrir';
import * as modo from '../modo';
import { backupRepository } from '../db/repositories/backup';
import { settingsRepository } from '../db/repositories/settings';
import { workoutPlansRepository } from '../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../db/repositories/workoutSessions';
import { restDaysRepository } from '../db/repositories/restDays';
import { exportarPacote } from '../db/repositories/pacote';
import { exercisesRepository } from '../db/repositories/exercises';

const HOJE = new Date(2026, 0, 14, 10);
let baixados: string[];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOJE);
  await db.delete();
  await db.open();
  baixados = [];
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    baixados.push(this.download);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const arquivo = (texto: string) => new File([texto], 'backup.json', { type: 'application/json' });

describe('Configurações → Backup', () => {
  it('exportar sem compartilhamento nativo: baixa o arquivo e grava a data do último backup', async () => {
    abrir('/configuracoes');
    await waitFor(() => expect(screen.getByTestId('ultimo-backup')).toHaveTextContent('Nenhum backup feito'));
    expect(screen.getByRole('region', { name: 'Backup' })).toHaveTextContent('não entram no backup');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar backup' }));
    await waitFor(() => expect(screen.getByTestId('ultimo-backup')).toHaveTextContent('Último backup: hoje'));
    expect(baixados).toEqual(['fittrack-backup-2026-01-14.json']);
  });

  it('com compartilhamento nativo: envia o arquivo; cancelar não grava a data', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {});
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { canShare: () => true, share }));
    abrir('/configuracoes');
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar backup' }));
    await waitFor(() => expect(screen.getByTestId('ultimo-backup')).toHaveTextContent('Último backup: hoje'));
    expect(share.mock.calls[0]![0].files![0]!.name).toBe('fittrack-backup-2026-01-14.json');
    expect(baixados).toEqual([]);

    await settingsRepository.update({ ultimoBackupEm: undefined });
    share.mockRejectedValueOnce(new DOMException('cancelado', 'AbortError'));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar backup' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    expect((await settingsRepository.get()).ultimoBackupEm).toBeUndefined();
  });

  it('importar: pré-visualização, backup automático dos dados atuais, substituição e recarga', async () => {
    const json = await backupRepository.exportar();
    // Depois do backup: um dia de descanso que a importação vai apagar.
    await restDaysRepository.alternar('2026-01-13');
    const recarregar = vi.spyOn(modo.pagina, 'recarregar').mockImplementation(() => {});
    abrir('/configuracoes');
    fireEvent.change(await screen.findByLabelText('Arquivo do backup'), { target: { files: [arquivo(json)] } });
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('Substituir todos os dados deste aparelho?');
    expect(within(dialogo).getByTestId('previa-backup')).toHaveTextContent('5 fichas');
    expect(dialogo).toHaveTextContent('0 dias de descanso');
    expect(dialogo).toHaveTextContent('fittrack-antes-da-importacao');
    expect(dialogo).not.toHaveTextContent('O perfil atual será mantido');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Substituir dados' }));
    await waitFor(() => expect(recarregar).toHaveBeenCalled());
    expect(baixados).toEqual(['fittrack-antes-da-importacao-2026-01-14.json']);
    expect(await restDaysRepository.list()).toHaveLength(0);
  });

  it('importar backup sem perfil (anterior à 0.19.0): a pré-visualização avisa que o perfil atual será mantido', async () => {
    const b = JSON.parse(await backupRepository.exportar());
    delete b.tabelas.profile;
    abrir('/configuracoes');
    fireEvent.change(await screen.findByLabelText('Arquivo do backup'), { target: { files: [arquivo(JSON.stringify(b))] } });
    expect(await screen.findByRole('dialog')).toHaveTextContent('O perfil atual será mantido');
  });

  it('CSV de séries e de medidas: baixa os arquivos sem mexer na data do último backup', async () => {
    abrir('/configuracoes');
    fireEvent.click(await screen.findByRole('button', { name: 'Séries (CSV)' }));
    await waitFor(() => expect(baixados).toEqual(['fittrack-series-2026-01-14.csv']));
    fireEvent.click(screen.getByRole('button', { name: 'Medidas (CSV)' }));
    await waitFor(() => expect(baixados).toHaveLength(2));
    expect(baixados[1]).toBe('fittrack-medidas-2026-01-14.csv');
    expect((await settingsRepository.get()).ultimoBackupEm).toBeUndefined();
  });

  it('importar arquivo inválido: avisa e não altera nada', async () => {
    const b = JSON.parse(await backupRepository.exportar());
    b.tabelas.exercises[0].videoUrl = 'javascript:alert(1)';
    b.tabelas.restDays = [];
    await restDaysRepository.alternar('2026-01-13');
    abrir('/configuracoes');
    fireEvent.change(await screen.findByLabelText('Arquivo do backup'), { target: { files: [arquivo(JSON.stringify(b))] } });
    const dialogo = await screen.findByRole('dialog', { name: 'Backup não importado' });
    expect(dialogo).toHaveTextContent('Exercícios, registro 1 (videoUrl)');
    expect(await restDaysRepository.list()).toHaveLength(1);
    expect(baixados).toEqual([]);
  });
});

describe('Configurações → pacote de exercícios', () => {
  it('exportar baixa o pacote; importar mostra a prévia, pergunta pela ficha em dia ocupado e junta sem apagar', async () => {
    abrir('/configuracoes');
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar pacote de exercícios' }));
    await waitFor(() => expect(baixados).toEqual(['fittrack-exercicios-2026-01-14.json']));

    await exercisesRepository.create({ nome: 'Exercício do pacote', tipo: 'carga', unidadeCarga: 'kg', grupoPrincipal: 'peito', gruposSecundarios: [], porLado: false });
    const json = JSON.parse(await exportarPacote({ fichas: true }));
    json.workoutPlans = json.workoutPlans.filter((p: { diaSemana: number }) => p.diaSemana === 1);
    json.workoutPlans[0].nome = 'Segunda nova';
    const ficha = (await workoutPlansRepository.list()).find((p) => p.diaSemana === 1)!;
    await exercisesRepository.remove((await exercisesRepository.list()).find((e) => e.nome === 'Exercício do pacote')!.id);

    fireEvent.change(screen.getByLabelText('Arquivo do pacote de exercícios'), { target: { files: [arquivo(JSON.stringify(json))] } });
    const previa = await screen.findByTestId('previa-pacote');
    expect(previa).toHaveTextContent('0 exercícios novos');
    expect(previa).toHaveTextContent('1 exercício excluído será restaurado');
    expect(previa).toHaveTextContent('1 ficha (1 em dia já ocupado)');
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    const conflito = await screen.findByRole('dialog', { name: `Segunda (Academia) já tem a ficha "${ficha.nome}"` });
    fireEvent.click(within(conflito).getByRole('button', { name: 'Pular esta ficha' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Pacote importado.');
    expect((await workoutPlansRepository.list()).find((p) => p.diaSemana === 1)!.nome).toBe(ficha.nome);
    expect((await exercisesRepository.list()).some((e) => e.nome === 'Exercício do pacote')).toBe(true);
  });

  it('backup completo no campo do pacote: recusa com mensagem clara', async () => {
    const json = await backupRepository.exportar();
    abrir('/configuracoes');
    fireEvent.change(await screen.findByLabelText('Arquivo do pacote de exercícios'), { target: { files: [arquivo(json)] } });
    expect(await screen.findByRole('dialog', { name: 'Pacote não importado' })).toHaveTextContent('Use "Importar backup"');
  });
});

describe('lembrete de backup no Início', () => {
  async function treinar() {
    const ficha = (await workoutPlansRepository.list())[0]!;
    const s = await sessoes.iniciar(ficha.id);
    await sessoes.finalizar(s.id, { rpe: 6, observacoes: '' });
  }

  it('sem treino registrado: não aparece', async () => {
    abrir('/');
    await screen.findByTestId('contador-semana');
    expect(screen.queryByTestId('lembrete-backup')).not.toBeInTheDocument();
  });

  it('com treino e sem backup (ou há 14 dias ou mais): aparece e leva a Configurações → Backup', async () => {
    await treinar();
    const { router } = abrir('/');
    fireEvent.click(await screen.findByTestId('lembrete-backup'));
    await waitFor(() => expect(router.state.location).toMatchObject({ pathname: '/configuracoes', hash: '#backup' }));
  });

  it('backup há 13 dias: não aparece', async () => {
    await treinar();
    await settingsRepository.update({ ultimoBackupEm: new Date(2026, 0, 1, 10).toISOString() });
    abrir('/');
    await screen.findByTestId('contador-semana');
    expect(screen.queryByTestId('lembrete-backup')).not.toBeInTheDocument();
  });
});
