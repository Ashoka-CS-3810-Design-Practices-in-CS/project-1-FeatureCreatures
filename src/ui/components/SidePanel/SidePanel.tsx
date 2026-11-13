import { ConflictPanel } from '../ConflictPanel/ConflictPanel';
import { Modal } from '../Modal/Modal';
import { TaskPanel } from '../TaskPanel/TaskPanel';
import { BarredSlotsPanel } from '../BarredSlotsPanel/BarredSlotsPanel';
import { ReplanPanel } from '../ReplanDialog/ReplanPanel';
import { useAppStore } from '../../store/appStore';

// PRE: narrow controls the <1280px layout; open/onClose control the right drawer;
//      StoreProvider supplies tasksOpen, snapshot/currentMinute and setTasksOpen
//      + additional props from: TaskPanel, ConflictPanel, ReplanPanel, BarredSlotsPanel, Modal
// POST: shows one Tasks column and one right column; narrow uses separate mutually exclusive
//       native drawers while retaining exactly one mounted copy of each region
export function SidePanel({
  narrow,
  open,
  onClose,
}: {
  narrow: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const tasksOpen = useAppStore((state) => state.tasksOpen);
  const setTasksOpen = useAppStore((state) => state.actions.setTasksOpen);
  const panels = (
    <>
      <ConflictPanel />
      <ReplanPanel />
      <BarredSlotsPanel />
    </>
  );
  return narrow ? (
    <>
      <Modal
        open={tasksOpen}
        title="Tasks"
        id="task-drawer"
        className="panel-drawer"
        onClose={() => setTasksOpen(false)}
      >
        <TaskPanel />
      </Modal>
      <Modal
        open={open}
        title="Conflicts"
        id="side-panels"
        className="panel-drawer"
        onClose={onClose}
      >
        {panels}
      </Modal>
    </>
  ) : (
    <>
      <aside className="task-column" aria-label="Tasks column">
        <TaskPanel />
      </aside>
      <aside id="side-panels" className="right-column" aria-label="Planning column">
        {panels}
      </aside>
    </>
  );
}
