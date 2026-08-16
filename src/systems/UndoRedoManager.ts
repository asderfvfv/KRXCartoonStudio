export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  lastLabel?: string;
  lastCommitAt: number;
}

const DEFAULT_LIMIT = 60;
const COALESCE_MS = 900;

export class UndoRedoManager<T> {
  private state: HistoryState<T>;
  private recentUndoLabel: string | null = null;
  private recentRedoLabel: string | null = null;

  constructor(
    initial: T,
    private clone: (value: T) => T = (value) => structuredClone(value),
    private limit = DEFAULT_LIMIT,
  ) {
    this.state = { past: [], present: this.clone(initial), future: [], lastCommitAt: 0 };
  }

  commit(next: T, label: string, options?: { forceNew?: boolean }): T {
    const now = Date.now();
    const canCoalesce = !options?.forceNew
      && Boolean(this.state.lastLabel)
      && this.state.lastLabel === label
      && this.state.past.length > 0
      && now - this.state.lastCommitAt < COALESCE_MS;

    if (canCoalesce) {
      this.state = {
        ...this.state,
        present: this.clone(next),
        lastLabel: label,
        lastCommitAt: now,
        future: [],
      };
      this.recentUndoLabel = null;
      this.recentRedoLabel = null;
      return this.clone(this.state.present);
    }

    const past = [...this.state.past, this.clone(this.state.present)];
    while (past.length > this.limit) past.shift();
    this.state = {
      past,
      present: this.clone(next),
      future: [],
      lastLabel: label,
      lastCommitAt: now,
    };
    this.recentUndoLabel = null;
    this.recentRedoLabel = null;
    return this.clone(this.state.present);
  }

  undo(): T {
    const previous = this.state.past.at(-1);
    if (!previous) return this.clone(this.state.present);
    this.recentUndoLabel = this.state.lastLabel ?? "правка";
    this.recentRedoLabel = null;
    this.state = {
      past: this.state.past.slice(0, -1),
      present: this.clone(previous),
      future: [this.clone(this.state.present), ...this.state.future],
      lastLabel: undefined,
      lastCommitAt: 0,
    };
    return this.clone(this.state.present);
  }

  redo(): T {
    const next = this.state.future[0];
    if (!next) return this.clone(this.state.present);
    this.recentRedoLabel = "повтор";
    this.recentUndoLabel = null;
    this.state = {
      past: [...this.state.past, this.clone(this.state.present)],
      present: this.clone(next),
      future: this.state.future.slice(1),
      lastLabel: "Повтор",
      lastCommitAt: Date.now(),
    };
    return this.clone(this.state.present);
  }

  reset(value: T): T {
    this.state = { past: [], present: this.clone(value), future: [], lastCommitAt: 0 };
    this.recentUndoLabel = null;
    this.recentRedoLabel = null;
    return this.clone(this.state.present);
  }

  canUndo(): boolean { return this.state.past.length > 0; }
  canRedo(): boolean { return this.state.future.length > 0; }
  /** Label of the action that Ctrl+Z will reverse. */
  peekUndoLabel(): string | null {
    return this.canUndo() ? (this.state.lastLabel ?? "последняя правка") : null;
  }
  takeRecentUndoLabel(): string | null {
    const label = this.recentUndoLabel;
    this.recentUndoLabel = null;
    return label;
  }
  takeRecentRedoLabel(): string | null {
    const label = this.recentRedoLabel;
    this.recentRedoLabel = null;
    return label;
  }
}
