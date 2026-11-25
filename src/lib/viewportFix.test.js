import { describe, it, expect } from 'vitest';
import { bottomShift } from './viewportFix.js';

describe('bottom bar viewport fix', () => {
  it('is 0 when bottom: 0 already sits on the visible bottom', () => {
    expect(bottomShift({ vvTop: 0, vvHeight: 800, probeBottom: 800 })).toBe(0);
    expect(bottomShift({ vvTop: 0, vvHeight: 800, probeBottom: 799 })).toBe(0); // rounding noise
  });
  it('moves the bars down when the browser thinks the screen is shorter', () => {
    expect(bottomShift({ vvTop: 0, vvHeight: 800, probeBottom: 470 })).toBe(330);
  });
  it('follows a scrolled visual viewport', () => {
    expect(bottomShift({ vvTop: 40, vvHeight: 760, probeBottom: 760 })).toBe(40);
  });
  it('holds still while the page bounces past its top or bottom', () => {
    expect(bottomShift({ vvTop: -60, vvHeight: 800, probeBottom: 800, bouncing: true, last: 0 })).toBe(0);
    expect(bottomShift({ vvTop: 0, vvHeight: 800, probeBottom: 470, bouncing: true, last: 330 })).toBe(330);
  });
  it('leaves things alone while typing (keyboard open)', () => {
    expect(bottomShift({ vvTop: 0, vvHeight: 400, probeBottom: 800, typing: true })).toBe(0);
  });
});
