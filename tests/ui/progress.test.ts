// Task 34 (R8.10): the progress steps shown while a recovery runs. The labels
// are pure so their wording is tested directly, and the step list is the order
// the shell walks through.

import { describe, it, expect } from 'vitest';
import {
  RECOVERY_STEPS,
  recoveryStepLabel,
  type RecoveryStep,
} from '../../src/ui/progress.js';

describe('recovery progress labels', () => {
  it('gives every step a plain, non-empty label', () => {
    for (const step of RECOVERY_STEPS) {
      const label = recoveryStepLabel(step);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('names the mechanism in plain language', () => {
    expect(recoveryStepLabel('contacting').toLowerCase()).toContain('archive');
    expect(recoveryStepLabel('checking').toLowerCase()).toContain('asset');
    expect(recoveryStepLabel('reading').toLowerCase()).toContain('reader');
  });

  it('lists the steps in running order', () => {
    expect(RECOVERY_STEPS).toEqual([
      'contacting',
      'retrieving',
      'rebuilding',
      'checking',
      'reading',
    ] satisfies RecoveryStep[]);
  });
});
