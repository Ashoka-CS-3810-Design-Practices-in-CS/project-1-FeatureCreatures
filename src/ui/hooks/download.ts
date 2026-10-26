// Browser download of an export file, shared by the Settings Data section and the crash screen.

export const EXPORT_MIME_TYPE = 'application/json';

// PRE:  fileName is the download's name; json is its content
// POST: makes the browser download json as fileName (Blob + object URL, TECH_SPEC §9.4)
export function downloadJson(fileName: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: EXPORT_MIME_TYPE }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoking on the next tick lets the browser start the download first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
