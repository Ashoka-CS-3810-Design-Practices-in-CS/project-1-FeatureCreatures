// A Repository that fails on demand, for the ER5 storage-failure tests (T14, T26).

import { MemoryRepository } from '@/data/memoryRepository';
import type { ChangeSet, Repository, StoredData } from '@/data/repository';
import type { CalendarEvent, Settings, Task } from '@/shared/types';

export class FailingRepository implements Repository {
  private readonly inner = new MemoryRepository();
  private applyShouldFail = false;
  private saveSettingsShouldFail = false;

  // PRE:  none
  // POST: the next apply() rejects without storing anything; later ones succeed again
  failNextApply(): void {
    this.applyShouldFail = true;
  }

  // PRE:  none
  // POST: the next saveSettings() rejects without storing anything; later ones succeed again
  failNextSaveSettings(): void {
    this.saveSettingsShouldFail = true;
  }

  // PRE:  none
  // POST: resolves to the wrapped MemoryRepository's data
  async load(): Promise<StoredData> {
    return this.inner.load();
  }

  // PRE:  as Repository.apply
  // POST: rejects (storing nothing) if a failure was requested, otherwise behaves like MemoryRepository
  async apply(changes: ChangeSet, expectedRevision: number): Promise<void> {
    if (this.applyShouldFail) {
      this.applyShouldFail = false;
      throw new Error('Simulated storage failure (apply)');
    }
    await this.inner.apply(changes, expectedRevision);
  }

  // PRE:  as Repository.saveSettings
  // POST: rejects (storing nothing) if a failure was requested, otherwise behaves like MemoryRepository
  async saveSettings(settings: Settings, expectedRevision: number): Promise<void> {
    if (this.saveSettingsShouldFail) {
      this.saveSettingsShouldFail = false;
      throw new Error('Simulated storage failure (saveSettings)');
    }
    await this.inner.saveSettings(settings, expectedRevision);
  }

  // PRE:  as Repository.replaceAll
  // POST: behaves like MemoryRepository.replaceAll
  async replaceAll(
    data: { events: CalendarEvent[]; tasks: Task[]; settings: Settings },
    expectedRevision: number,
  ): Promise<void> {
    await this.inner.replaceAll(data, expectedRevision);
  }
}
