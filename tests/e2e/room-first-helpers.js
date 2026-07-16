import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOM_FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/room-first-v2.json'
);

export const ROOM_PROJECT = JSON.parse(readFileSync(ROOM_FIXTURE_PATH, 'utf8'));

export async function seedRoomProject(page) {
  await page.addInitScript(project => {
    localStorage.setItem('residential-sunlight-simulator:draft:v2', JSON.stringify(project));
  }, ROOM_PROJECT);
}

export async function dragRoomRect(page) {
  const box = await page.locator('#scene-canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.58, { steps: 8 });
  await page.mouse.up();
}
