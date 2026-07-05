import { test } from '@playwright/test';

// Area and opening editing was previously reached through the setup wizard.
// The wizard has been replaced by the persistent sandbox editor.
// These tests are temporarily skipped until area editing is surfaced
// through the new building inspector flow.

test.skip('paints an area and attaches a south-facing window', () => {});
test.skip('supports erase mode for irregular observation areas', () => {});
