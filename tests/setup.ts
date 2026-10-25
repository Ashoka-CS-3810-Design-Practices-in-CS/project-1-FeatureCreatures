import '@testing-library/jest-dom/vitest';

// PRE:  none (runs in both the node and the jsdom test environments)
// POST: if HTMLDialogElement exists, its prototype has showModal() and close(); a polyfilled
//       showModal() sets open, and a polyfilled close() clears open and dispatches 'close'
function polyfillDialog(): void {
  if (typeof HTMLDialogElement === 'undefined') {
    return;
  }
  const dialogPrototype = HTMLDialogElement.prototype;

  if (typeof dialogPrototype.showModal !== 'function') {
    dialogPrototype.showModal = function showModal(this: HTMLDialogElement): void {
      this.open = true;
    };
  }
  if (typeof dialogPrototype.close !== 'function') {
    // The native close() fires 'close'; the Modal wrapper relies on it to sync its state.
    dialogPrototype.close = function close(this: HTMLDialogElement): void {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }
}

// Inert stand-in: jsdom has no layout engine, so there is never a size change to report.
class ResizeObserverStub {
  // PRE:  none
  // POST: does nothing
  observe(): void {}

  // PRE:  none
  // POST: does nothing
  unobserve(): void {}

  // PRE:  none
  // POST: does nothing
  disconnect(): void {}
}

// PRE:  none
// POST: if window exists and lacks ResizeObserver, window.ResizeObserver is ResizeObserverStub
function stubResizeObserver(): void {
  if (typeof window === 'undefined' || typeof window.ResizeObserver === 'function') {
    return;
  }
  window.ResizeObserver = ResizeObserverStub;
}

// PRE:  query is a media query string
// POST: returns a MediaQueryList for query that never matches and never fires change events
function createNonMatchingMediaQueryList(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
}

// PRE:  none
// POST: if window exists and lacks matchMedia, window.matchMedia returns non-matching lists
function stubMatchMedia(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia === 'function') {
    return;
  }
  window.matchMedia = createNonMatchingMediaQueryList;
}

polyfillDialog();
stubResizeObserver();
stubMatchMedia();
