import { describe, expect, it } from 'vitest';
import { deriveScenePreview } from '../../src/scene/scenePreview.js';

describe('deriveScenePreview', () => {
  it('previews (blueprint) only in building editor mode', () => {
    expect(deriveScenePreview({ selectedBuildingId: 'b1', editorMode: 'building' }))
      .toEqual({ previewBuildingId: 'b1', highlightBuildingId: null });
  });
  it('highlights when selected but not editing params', () => {
    expect(deriveScenePreview({ selectedBuildingId: 'b1', editorMode: 'none' }))
      .toEqual({ previewBuildingId: null, highlightBuildingId: 'b1' });
    expect(deriveScenePreview({ selectedBuildingId: 'b1', editorMode: 'areas' }))
      .toEqual({ previewBuildingId: null, highlightBuildingId: 'b1' });
  });
  it('neither when nothing selected', () => {
    expect(deriveScenePreview({ selectedBuildingId: null, editorMode: 'none' }))
      .toEqual({ previewBuildingId: null, highlightBuildingId: null });
  });
});
