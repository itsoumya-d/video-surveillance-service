import { describe, it, expect } from 'vitest';
import { OpticalMotionTracker, MotionSample } from '../src/motion_tracking.js';

describe('OpticalMotionTracker', () => {
  it('handles empty sample stream gracefully', () => {
    const tracker = new OpticalMotionTracker();
    const result = tracker.processSamples([]);
    expect(result.metrics.length).toBe(0);
    expect(result.summary.sampleCount).toBe(0);
    expect(result.summary.peakVelocity).toBe(0);
  });

  it('correctly tracks smooth linear trajectory and velocity', () => {
    const tracker = new OpticalMotionTracker(1.0, 20.0); // No smoothing, alpha=1.0 for exact kinematics
    const samples: MotionSample[] = [
      { timestampMs: 0, position: { x: 0, y: 0, z: 0 }, confidence: 0.95 },
      { timestampMs: 1000, position: { x: 3, y: 4, z: 0 }, confidence: 0.95 }, // Displacement = 5m, v = 5 m/s
      { timestampMs: 2000, position: { x: 6, y: 8, z: 0 }, confidence: 0.95 }, // Displacement = 5m, v = 5 m/s
    ];

    const result = tracker.processSamples(samples);
    expect(result.metrics.length).toBe(3);
    expect(result.summary.sampleCount).toBe(3);
    expect(result.summary.durationMs).toBe(2000);
    expect(result.metrics[1].velocity).toBe(5.0);
    expect(result.metrics[2].velocity).toBe(5.0);
    expect(result.summary.peakVelocity).toBe(5.0);
    expect(result.summary.dropoutCount).toBe(0);
  });

  it('flags low optical confidence dropout and unrealistic velocity anomaly', () => {
    const tracker = new OpticalMotionTracker(0.8, 10.0);
    const samples: MotionSample[] = [
      { timestampMs: 0, position: { x: 0, y: 0, z: 0 }, confidence: 0.9 },
      { timestampMs: 100, position: { x: 0.2, y: 0.1, z: 0 }, confidence: 0.4 }, // Low confidence occlusion
      { timestampMs: 200, position: { x: 50.0, y: 50.0, z: 0 }, confidence: 0.9 }, // Jump to 70m in 100ms (~700 m/s >> 10)
    ];

    const result = tracker.processSamples(samples);
    expect(result.summary.dropoutCount).toBe(1);
    expect(result.metrics[1].isAnomaly).toBe(true);
    expect(result.metrics[1].anomalyReason).toContain('Low optical confidence');
    expect(result.metrics[2].isAnomaly).toBe(true);
    expect(result.metrics[2].anomalyReason).toContain('exceeds threshold');
  });
});
