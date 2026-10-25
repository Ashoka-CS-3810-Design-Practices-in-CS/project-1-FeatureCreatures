import { useAppStore } from '../../store/appStore';
import { Modal } from '../Modal/Modal';

// PRE:  rendered under StoreProvider; busy is the active loading message or null
//       + additional props from: Modal
// POST: while busy, shows a non-dismissible spinner dialog and announces the operation
export function BusyOverlay() {
  const busy = useAppStore((state) => state.busy);
  return (
    <Modal open={busy !== null} title="Loading calendar" dismissible={false} onClose={() => {}}>
      <p role="status">
        <span className="spinner" aria-hidden="true" /> {busy}
      </p>
    </Modal>
  );
}
