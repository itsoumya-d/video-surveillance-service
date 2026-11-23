/**
 * Optical 3D motion and kinematic trajectory tracking engine for camera vision systems.
 *
 * Ingests spatial tracking vectors, computes smoothed velocity/acceleration profiles,
 * and detects optical tracking anomalies (occlusion, jitter, displacement anomalies).
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface MotionSample {
  timestampMs: number;
  position: Vector3D;
  confidence: number;
}

export interface KinematicMetric {
  timestampMs: number;
  smoothedPosition: Vector3D;
  velocity: number; // m/s magnitude
  acceleration: number; // m/s^2 magnitude
  confidence: number;
  isAnomaly: boolean;
  anomalyReason?: string;
}

export interface TrackingSeriesSummary {
  sampleCount: number;
  durationMs: number;
  peakVelocity: number;
  averageVelocity: number;
  peakAcceleration: number;
  dropoutCount: number;
  averageConfidence: number;
}

export class OpticalMotionTracker {
  private smoothingAlpha: number;
  private maxVelocityThreshold: number; // m/s physical plausibility limit

  constructor(smoothingAlpha = 0.7, maxVelocityThreshold = 15.0) {
    this.smoothingAlpha = Math.max(0.1, Math.min(1.0, smoothingAlpha));
    this.maxVelocityThreshold = maxVelocityThreshold;
  }

  public processSamples(samples: MotionSample[]): { metrics: KinematicMetric[]; summary: TrackingSeriesSummary } {
    if (samples.length === 0) {
      return {
        metrics: [],
        summary: {
          sampleCount: 0,
          durationMs: 0,
          peakVelocity: 0,
          averageVelocity: 0,
          peakAcceleration: 0,
          dropoutCount: 0,
          averageConfidence: 0,
        },
      };
    }

    const sorted = [...samples].sort((a, b) => a.timestampMs - b.timestampMs);
    const metrics: KinematicMetric[] = [];

    let prevPos = sorted[0].position;
    let prevSmoothed = sorted[0].position;
    let prevVel = 0;
    let prevTime = sorted[0].timestampMs;
    let totalVel = 0;
    let peakVel = 0;
    let peakAcc = 0;
    let dropouts = 0;
    let totalConfidence = 0;

    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      totalConfidence += s.confidence;

      if (i === 0) {
        metrics.push({
          timestampMs: s.timestampMs,
          smoothedPosition: s.position,
          velocity: 0,
          acceleration: 0,
          confidence: s.confidence,
          isAnomaly: false,
        });
        continue;
      }

      const dt = (s.timestampMs - prevTime) / 1000.0;
      if (dt <= 0) continue; // Skip redundant identical timestamps

      // Exponential moving average for 3D coordinate smoothing
      const smoothedPos: Vector3D = {
        x: this.smoothingAlpha * s.position.x + (1 - this.smoothingAlpha) * prevSmoothed.x,
        y: this.smoothingAlpha * s.position.y + (1 - this.smoothingAlpha) * prevSmoothed.y,
        z: this.smoothingAlpha * s.position.z + (1 - this.smoothingAlpha) * prevSmoothed.z,
      };

      const dx = smoothedPos.x - prevSmoothed.x;
      const dy = smoothedPos.y - prevSmoothed.y;
      const dz = smoothedPos.z - prevSmoothed.z;
      const displacement = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const velocity = displacement / dt;
      const acceleration = Math.abs(velocity - prevVel) / dt;

      let isAnomaly = false;
      let anomalyReason: string | undefined;

      if (s.confidence < 0.6) {
        isAnomaly = true;
        anomalyReason = 'Low optical confidence / partial occlusion';
        dropouts++;
      } else if (velocity > this.maxVelocityThreshold) {
        isAnomaly = true;
        anomalyReason = `Velocity ${velocity.toFixed(2)} m/s exceeds threshold ${this.maxVelocityThreshold}`;
      }

      if (!isAnomaly) {
        totalVel += velocity;
        if (velocity > peakVel) peakVel = velocity;
        if (acceleration > peakAcc) peakAcc = acceleration;
      }

      metrics.push({
        timestampMs: s.timestampMs,
        smoothedPosition: smoothedPos,
        velocity: Math.round(velocity * 100) / 100,
        acceleration: Math.round(acceleration * 100) / 100,
        confidence: s.confidence,
        isAnomaly,
        anomalyReason,
      });

      prevPos = s.position;
      prevSmoothed = smoothedPos;
      prevVel = velocity;
      prevTime = s.timestampMs;
    }

    const validCount = sorted.length - dropouts;
    const avgVel = validCount > 0 ? totalVel / validCount : 0;
    const durationMs = sorted[sorted.length - 1].timestampMs - sorted[0].timestampMs;

    return {
      metrics,
      summary: {
        sampleCount: sorted.length,
        durationMs,
        peakVelocity: Math.round(peakVel * 100) / 100,
        averageVelocity: Math.round(avgVel * 100) / 100,
        peakAcceleration: Math.round(peakAcc * 100) / 100,
        dropoutCount: dropouts,
        averageConfidence: Math.round((totalConfidence / sorted.length) * 100) / 100,
      },
    };
  }
}
