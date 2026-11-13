// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { task } from '../../tests/helpers/builders';
import { makeEngine } from '../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../tests/helpers/render';
import { App } from './App';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.accent;
});

describe('T57: appearance preferences and tags (D-12/D-13)', () => {
  it('offers neutral plus seven accents and persists appearance independently of exported calendar data', async () => {
    const engine = (await makeEngine()).engine;
    const store = storeFor(engine);
    const initialExport = store.getState().actions.exportFile().json;
    const rendered = renderWithStore(<App />, store);
    await userEvent.click(screen.getByRole('button', { name: 'Settings', exact: true }));
    const appearance = screen.getByRole('region', { name: 'Appearance', exact: true });
    const accents = within(appearance).getByRole('radiogroup', { name: 'Accent', exact: true });
    expect(
      within(accents)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label')),
    ).toEqual(['Neutral', 'Fern', 'Teal', 'Cyan', 'Indigo', 'Violet', 'Rose', 'Olive']);
    expect(within(accents).getByRole('radio', { name: 'Neutral', exact: true })).toBeChecked();
    await userEvent.click(within(accents).getByRole('radio', { name: 'Fern', exact: true }));
    await userEvent.click(within(appearance).getByRole('radio', { name: 'Dark', exact: true }));
    expect(document.documentElement.dataset.accent).toBe('fern');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('fc-accent')).toBe('fern');
    expect(localStorage.getItem('fc-theme')).toBe('dark');
    expect(store.getState().actions.exportFile().json).toBe(initialExport);
    rendered.unmount();
    renderWithStore(<App />, storeFor(engine));
    expect(document.documentElement.dataset.accent).toBe('fern');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Theme: Dark', exact: true })).toContainElement(
      screen.getByRole('img', { name: 'Dark theme' }),
    );
  });

  it('toggles the resolved light/dark theme and leaves System available in Appearance', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<App />, store);
    const toggle = screen.getByRole('button', { name: 'Theme: System', exact: true });
    expect(toggle).toContainElement(screen.getByRole('img', { name: 'Light theme' }));
    await userEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('img', { name: 'Dark theme' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Theme: Dark', exact: true }));
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => store.getState().actions.openDialog({ kind: 'settings' }));
    await userEvent.click(screen.getByRole('radio', { name: 'System', exact: true }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('fc-theme')).toBe('system');
    expect(screen.getByRole('img', { name: 'Light theme' })).toBeInTheDocument();
  });

  it('uses the event priority tag style on task rows', async () => {
    const store = storeFor(
      (
        await makeEngine({
          tasks: [task('Write', 60, ['Mon 09:00', 'Fri 18:00'], { priority: 'high' })],
        })
      ).engine,
    );
    renderWithStore(<App />, store);
    const tasks = screen.getByRole('region', { name: /^Tasks \(/ });
    expect(within(tasks).getByText('[H]')).toHaveClass('prio-high');
  });
});
