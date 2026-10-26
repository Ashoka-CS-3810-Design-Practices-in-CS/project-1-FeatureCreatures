// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

// PRE:  none
// POST: always throws while rendering, like the WI-35 select-mirror crash did
function Crashing(): never {
  throw new TypeError("Cannot read properties of undefined (reading 'map')");
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React reports every caught render error on the console; the tests expect them.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders its children while nothing throws', () => {
    render(
      <ErrorBoundary onReload={vi.fn()} onExport={vi.fn()}>
        <p>Calendar</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('replaces a crashed app with Something went wrong, Reload and Export data', async () => {
    const onReload = vi.fn();
    const onExport = vi.fn();
    render(
      <ErrorBoundary onReload={onReload} onExport={onExport}>
        <Crashing />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(onExport).toHaveBeenCalledOnce();
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('says so when the export itself fails', async () => {
    const onExport = vi.fn(() => {
      throw new Error('engine unavailable');
    });
    render(
      <ErrorBoundary onReload={vi.fn()} onExport={onExport}>
        <Crashing />
      </ErrorBoundary>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));

    expect(screen.getByRole('alert')).toHaveTextContent('The export failed too.');
  });
});
