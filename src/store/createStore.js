const HISTORY_LIMIT = 50;

export function createStore(initialState) {
  let state = structuredClone(initialState);
  let analysis = null;
  let analysisRequestId = 0;
  const listeners = new Set();
  const undoStack = [];
  const redoStack = [];

  const notify = () => {
    for (const listener of listeners) listener(state);
  };
  const setState = nextState => {
    state = structuredClone(nextState);
    notify();
  };

  return {
    getState: () => state,
    getAnalysis: () => analysis,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    execute(command) {
      const previous = structuredClone(state);
      const next = command.apply(structuredClone(state));
      if (next == null) return false;
      undoStack.push({ label: command.label, state: previous });
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack.length = 0;
      setState(next);
      return true;
    },
    // Dry-run a command against a snapshot: true if it would commit (apply
    // returns non-null), false if it would abort validation. Nothing is
    // mutated and no history entry is made. Lets callers (e.g. drag gizmos
    // previewing validity mid-gesture) ask "would this be valid?" without
    // reaching into the command's apply protocol or the state shape.
    canExecute(command) {
      return command.apply(structuredClone(state)) != null;
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) return false;
      redoStack.push({ label: entry.label, state: structuredClone(state) });
      setState(entry.state);
      return true;
    },
    redo() {
      const entry = redoStack.pop();
      if (!entry) return false;
      undoStack.push({ label: entry.label, state: structuredClone(state) });
      setState(entry.state);
      return true;
    },
    replaceProject(project) {
      undoStack.length = 0;
      redoStack.length = 0;
      analysis = null;
      setState(project);
    },
    setView(patch) {
      setState({ ...state, view: { ...state.view, ...structuredClone(patch) } });
    },
    beginAnalysis() {
      analysisRequestId += 1;
      return analysisRequestId;
    },
    completeAnalysis(requestId, result) {
      if (requestId !== analysisRequestId) return false;
      analysis = structuredClone(result);
      notify();
      return true;
    }
  };
}
