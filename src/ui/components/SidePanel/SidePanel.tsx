import { ConflictPanel } from '../ConflictPanel/ConflictPanel';
import { Modal } from '../Modal/Modal';
import { TaskPanel } from '../TaskPanel/TaskPanel';

// PRE:  narrow says whether the side column is collapsed; open controls its drawer; onClose
//       closes it; + additional props from: TaskPanel, ConflictPanel, Modal
// POST: shows one copy of the panels, in the desktop side column or a labelled native drawer
export function SidePanel({
  narrow,
  open,
  onClose,
}: {
  narrow: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const panels = (
    <>
      <TaskPanel />
      <ConflictPanel />
    </>
  );
  return narrow ? (
    <Modal
      open={open}
      title="Tasks and conflicts"
      id="side-panels"
      className="panel-drawer"
      onClose={onClose}
    >
      <button type="button" onClick={onClose}>
        Close panels
      </button>
      {panels}
    </Modal>
  ) : (
    <aside id="side-panels" aria-label="Tasks and conflicts">
      {panels}
    </aside>
  );
}
