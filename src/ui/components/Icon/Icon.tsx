import type { ReactNode } from 'react';

const ICONS = {
  undo: <path d="M9 5 3 11l6 6M3 11h11a7 7 0 0 1 7 7v2" />,
  redo: <path d="m15 5 6 6-6 6m6-6H10a7 7 0 0 0-7 7v2" />,
  unlock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 7-2m-3 9v3" />
    </>
  ),
  edit: <path d="m15 4 5 5M4 20l4-1L21 6l-5-5L3 14l-1 7Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </>
  ),
  moon: <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z" />,
  fixed: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
    </>
  ),
  flexible: <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />,
  task: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  barred: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m6 6 12 12" />
    </>
  ),
} satisfies Record<string, ReactNode>;

// PRE: name identifies a built-in icon; label optionally gives a meaningful accessible image name
// POST: renders a font-independent line icon, decorative unless a label is supplied
export function Icon({ name, label }: { name: keyof typeof ICONS; label?: string }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      {ICONS[name]}
    </svg>
  );
}
