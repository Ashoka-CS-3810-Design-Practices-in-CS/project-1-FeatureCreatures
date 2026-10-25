import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Placeholder composition root; WI-18 replaces it with the bootstrap of TECH_SPEC §4.

// PRE:  the page has been parsed (module scripts run after parsing)
// POST: renders a placeholder heading into #root; throws if index.html has no #root
function renderPlaceholder(): void {
  const rootElement = document.getElementById('root');
  if (rootElement === null) {
    throw new Error('index.html must contain an element with id "root"');
  }
  createRoot(rootElement).render(
    <StrictMode>
      <h1>Interactive Calendar</h1>
    </StrictMode>,
  );
}

renderPlaceholder();
