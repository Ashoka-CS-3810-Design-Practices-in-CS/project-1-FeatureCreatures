// @vitest-environment jsdom
// T45 — the priority filter, the status line and List's empty state agree (report #10, WI-44).
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { ev } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { App } from '../../App';
import type { AppStore } from '../../store/appStore';
import { CalendarView } from './CalendarView';

const EVENTS = [
  ev('Lecture', 'Mon 10:00', 'Mon 11:00', { priority: 'high' }),
  ev('Exam', 'Tue 10:00', 'Tue 11:00', { priority: 'high' }),
  ev('Meeting', 'Mon 10:30', 'Mon 11:30', { priority: 'medium' }),
  ev('Gym', 'Wed 18:00', 'Wed 19:00', { priority: 'low' }),
];
const HIDDEN_TEXT = 'All events in this range are hidden by the priority filter';

// PRE:  store is rendered
// POST: hides every priority in the store's calendar filter
function hideAll(store: AppStore): void {
  act(() => {
    const { toggleEventPriority } = store.getState().actions;
    toggleEventPriority('high');
    toggleEventPriority('medium');
    toggleEventPriority('low');
  });
}

describe('T45: priority filter vs counts and List', () => {
  it('the status line counts visible events and how many the filter hides; conflicts count all', async () => {
    const store = storeFor((await makeEngine({ events: EVENTS })).engine);
    renderWithStore(<App />, store);
    const statusLine = () => document.querySelector('.status-line');
    expect(statusLine()).toHaveTextContent(/^4 events · 0 tasks · 1 conflict$/);

    act(() => store.getState().actions.toggleEventPriority('low'));
    expect(statusLine()).toHaveTextContent(
      /^3 events \(1 hidden by filter\) · 0 tasks · 1 conflict$/,
    );

    act(() => {
      const { toggleEventPriority } = store.getState().actions;
      toggleEventPriority('low');
      toggleEventPriority('high');
      toggleEventPriority('medium');
    });
    expect(store.getState().eventPriorityFilter).toEqual(['low']);
    expect(statusLine()).toHaveTextContent(
      /^1 event \(3 hidden by filter\) · 0 tasks · 1 conflict$/,
    );
  });

  it('List says every event in range is hidden and Show all brings them back', async () => {
    const store = storeFor((await makeEngine({ events: EVENTS })).engine);
    act(() => store.setState({ view: { ...store.getState().view, type: 'listWeek' } }));
    renderWithStore(<CalendarView calendarRef={createRef()} />, store);
    expect(await screen.findByText('Lecture')).toBeInTheDocument();

    hideAll(store);

    expect(await screen.findByText(HIDDEN_TEXT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(store.getState().eventPriorityFilter).toEqual(['high', 'medium', 'low']);
    expect(await screen.findByText('Lecture')).toBeInTheDocument();
    expect(screen.queryByText(HIDDEN_TEXT)).not.toBeInTheDocument();
  });

  it('a range with no events at all keeps the plain empty message', async () => {
    const store = storeFor((await makeEngine()).engine);
    act(() => store.setState({ view: { ...store.getState().view, type: 'listWeek' } }));
    renderWithStore(<CalendarView calendarRef={createRef()} />, store);

    expect(await screen.findByText('No events to display')).toBeInTheDocument();
    expect(screen.queryByText(HIDDEN_TEXT)).not.toBeInTheDocument();
  });
});
