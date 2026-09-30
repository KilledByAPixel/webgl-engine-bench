import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim2D, Sim3D, W, H, SPRITE_SIZE, BOX } from '../harness/sim.js';

test('object i starts the same regardless of setCount history', () => {
  const a = new Sim2D(7); a.setCount(10);
  const b = new Sim2D(7); b.setCount(3); b.setCount(1); b.setCount(10);
  for (let i = 0; i < 10; i++) {
    assert.equal(a.x[i], b.x[i]); assert.equal(a.frame[i], b.frame[i]); assert.equal(a.r[i], b.r[i]);
  }
});

test('different seeds give different objects', () => {
  const a = new Sim2D(1), b = new Sim2D(2); a.setCount(1); b.setCount(1);
  assert.notEqual(a.x[0], b.x[0]);
});

test('sprites stay inside the canvas after many steps', () => {
  const s = new Sim2D(3); s.setCount(500);
  for (let f = 0; f < 2000; f++) s.update();
  const h = SPRITE_SIZE / 2;
  for (let i = 0; i < 500; i++) {
    assert.ok(s.x[i] >= h && s.x[i] <= W - h, 'x ' + s.x[i]);
    assert.ok(s.y[i] >= h && s.y[i] <= H - h, 'y ' + s.y[i]);
  }
});

test('sprite attributes are in range', () => {
  const s = new Sim2D(4); s.setCount(1000);
  for (let i = 0; i < 1000; i++) {
    assert.ok(Number.isInteger(s.frame[i]) && s.frame[i] >= 0 && s.frame[i] < 64);
    assert.ok(s.a[i] >= .5 && s.a[i] <= 1);
    assert.ok(s.r[i] >= .5 && s.r[i] <= 1);
  }
});

test('growing past capacity keeps existing state', () => {
  const s = new Sim2D(5); s.setCount(100); s.update();
  const x = s.x[50];
  s.setCount(100000);
  assert.equal(s.x[50], x);
  assert.equal(s.count, 100000);
});

test('cubes stay inside the box', () => {
  const s = new Sim3D(6); s.setCount(300);
  for (let f = 0; f < 3000; f++) s.update();
  for (let i = 0; i < 300; i++) {
    assert.ok(Math.abs(s.x[i]) <= BOX.x && Math.abs(s.y[i]) <= BOX.y);
    assert.ok(s.z[i] >= BOX.zMin && s.z[i] <= BOX.zMax);
  }
});

test('update is deterministic', () => {
  const a = new Sim3D(9), b = new Sim3D(9); a.setCount(50); b.setCount(50);
  for (let f = 0; f < 100; f++) { a.update(); b.update(); }
  assert.deepEqual([...a.rx], [...b.rx]);
});
