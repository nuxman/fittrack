import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { abrir } from '../test/abrir';
import { profileRepository } from '../db/repositories/profile';
import { backupRepository, validarBackup } from '../db/repositories/backup';
import { exportarPacote } from '../db/repositories/pacote';

// Quarta, 14 de janeiro de 2026, 10h.
const HOJE = new Date(2026, 0, 14, 10);
const foto = () => ({ blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }), mimeType: 'image/webp', largura: 512, altura: 384 });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOJE);
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('perfil (repositório)', () => {
  it('tudo opcional; limites; limpar um campo apaga o valor; foto mantida, trocada ou removida', async () => {
    expect(await profileRepository.get()).toBeUndefined();
    await profileRepository.salvar({});
    expect(await profileRepository.get()).toMatchObject({ deletedAt: null });
    await expect(profileRepository.salvar({ alturaCm: 20 })).rejects.toThrow('Altura (cm): de 50 a 250');
    await expect(profileRepository.salvar({ nascimento: '2026-01-15' })).rejects.toThrow('Data de nascimento inválida');

    await profileRepository.salvar({ nome: '  Rô  ', alturaCm: 180, sexo: 'masculino', objetivo: 'força' }, foto());
    expect(await profileRepository.get()).toMatchObject({ nome: 'Rô', alturaCm: 180, sexo: 'masculino', foto: { largura: 512 } });
    await profileRepository.salvar({ nome: 'Rô', objetivo: '' });
    const p = (await profileRepository.get())!;
    expect(p).not.toHaveProperty('alturaCm');
    expect(p).not.toHaveProperty('sexo');
    expect(p).not.toHaveProperty('objetivo');
    expect(p.foto).toBeDefined();
    await profileRepository.salvar({ nome: 'Rô' }, null);
    expect(await profileRepository.get()).not.toHaveProperty('foto');
    expect(await db.profile.count()).toBe(1);
  });

  it('entra no backup completo com a foto e não entra no pacote de exercícios', async () => {
    await profileRepository.salvar({ nome: 'Rô' }, foto());
    const json = await backupRepository.exportar();
    expect(JSON.parse(json).tabelas.profile[0].foto.blob).toBe(btoa(String.fromCharCode(1, 2, 3)));
    await db.delete();
    await db.open();
    await backupRepository.importar(validarBackup(json));
    const p = (await profileRepository.get())!;
    expect(p.nome).toBe('Rô');
    expect([...new Uint8Array(await p.foto!.blob.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(await exportarPacote({ fichas: true })).not.toContain('Rô');
    expect(JSON.parse(await exportarPacote())).not.toHaveProperty('profile');
  });

  it('backup sem perfil (anterior à 0.19.0) mantém o perfil atual e avisa; backup com perfil substitui', async () => {
    const b = JSON.parse(await backupRepository.exportar());
    b.schemaVersion = 2;
    delete b.tabelas.profile;
    await profileRepository.salvar({ nome: 'Rô' }, foto());
    const semPerfil = validarBackup(JSON.stringify(b));
    expect((await backupRepository.previa(semPerfil)).perfilMantido).toBe(true);
    await backupRepository.importar(semPerfil);
    expect(await profileRepository.get()).toMatchObject({ nome: 'Rô', foto: { largura: 512 } });

    await profileRepository.salvar({ nome: 'Outro' });
    const comPerfil = validarBackup(await backupRepository.exportar());
    await profileRepository.salvar({ nome: 'Rô' });
    expect((await backupRepository.previa(comPerfil)).perfilMantido).toBe(false);
    await backupRepository.importar(comPerfil);
    expect((await profileRepository.get())!.nome).toBe('Outro');
    expect(await db.profile.count()).toBe(1);
  });

  it('perfil inválido no backup é recusado', async () => {

    const c = JSON.parse(await backupRepository.exportar());
    c.tabelas.profile = [{ id: 'p', createdAt: 'x', updatedAt: 'x', deletedAt: null, alturaCm: 999 }];
    expect(() => validarBackup(JSON.stringify(c))).toThrow(/Perfil, registro 1 \(alturaCm\)/);
  });
});

describe('perfil (telas)', () => {
  it('sem perfil, a saudação é como antes; tocar abre "Meu perfil"; salvar mostra o nome e a foto no Início', async () => {
    const { router } = abrir('/');
    const saudacao = await screen.findByTestId('saudacao');
    await waitFor(() => expect(saudacao).toHaveTextContent(/^Bom dia! quarta-feira/));
    expect(screen.queryByAltText('Foto do perfil')).not.toBeInTheDocument();
    fireEvent.click(saudacao);
    await waitFor(() => expect(router.state.location.pathname).toBe('/perfil'));
    fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Rô' } });
    expect(screen.getByRole('heading', { name: 'Meu perfil' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '178,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Feminino' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(async () => expect(await profileRepository.get()).toMatchObject({ nome: 'Rô', alturaCm: 178.5, sexo: 'feminino' }));
    // Foto gravada fora da tela: reabre o Início para ler de novo.
    await profileRepository.salvar({ nome: 'Rô' }, foto());
    await act(() => router.navigate('/perfil'));
    await act(() => router.navigate('/'));
    await waitFor(() => expect(screen.getByTestId('saudacao')).toHaveTextContent(/^Bom dia, Rô!/));
    expect(await screen.findByAltText('Foto do perfil')).toBeInTheDocument();
  });

  it('foto escolhida é redimensionada para no máximo 512 px; altura inválida não grava', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3000, height: 4000, close() {} })));
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: (cb: (b: Blob) => void, t: string) => cb(new Blob(['r'], { type: t })) };
    const criar = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => (tag === 'canvas' ? (canvas as unknown as HTMLElement) : criar(tag)));
    abrir('/perfil');
    fireEvent.change(await screen.findByLabelText('Arquivo da foto do perfil'), { target: { files: [new File([new Uint8Array(9000)], 'eu.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByRole('button', { name: 'Trocar foto' })).toBeInTheDocument();
    expect([canvas.width, canvas.height]).toEqual([384, 512]);

    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Altura (cm): de 50 a 250');
    expect(await profileRepository.get()).toBeUndefined();

    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(async () => expect((await profileRepository.get())?.foto).toMatchObject({ largura: 384, altura: 512, mimeType: 'image/webp' }));
  });

  it('Configurações tem "Meu perfil"', async () => {
    abrir('/configuracoes');
    expect(await screen.findByRole('link', { name: /Meu perfil/ })).toHaveAttribute('href', '/perfil');
  });
});
