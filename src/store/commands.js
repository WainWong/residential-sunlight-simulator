export function createPatchCommand(label, patch) {
  return {
    label,
    apply(state) {
      return { ...state, ...structuredClone(patch) };
    }
  };
}
