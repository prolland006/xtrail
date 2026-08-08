import { type Rng, randFloat } from "./random";
import type { RiderProfile } from "../data/riderProfiles";

/**
 * Derives a plausible moving time from the route's real distance/D+/D- and the player's rider
 * profile — replaces the old flat paceMinPerKm/climbFactor formula, which didn't distinguish
 * "how fast on the flat" from "how much a climb costs", so a flat route and a mountain route
 * of the same distance got roughly the same duration.
 *
 * Model: flat-equivalent time for the distance, plus extra time for the total climb (at the
 * profile's vertical-ascent speed), minus a partial time credit for the descent (faster than
 * flat, scaled by descentSpeedFactor) — deliberately simple (no per-segment grade breakdown)
 * since the app only stores one movingTimeSeconds figure per activity, not a pace curve.
 * Pauses are folded into the same field, matching how the old generator did it too.
 */
export function estimateMovingTimeSeconds(
  rng: Rng,
  distanceMeters: number,
  elevationGainMeters: number,
  elevationLossMeters: number,
  profile: RiderProfile
): number {
  const flatSpeedKmh = randFloat(rng, ...profile.flatSpeedKmh);
  const climbVam = randFloat(rng, ...profile.climbVamMetersPerHour);
  const descentFactor = randFloat(rng, ...profile.descentSpeedFactor);

  const baseHours = distanceMeters / 1000 / flatSpeedKmh;
  const climbExtraHours = elevationGainMeters / climbVam;
  const descentCreditHours = (elevationLossMeters / climbVam) * (1 - 1 / descentFactor);

  // Never let climb/descent adjustments push the pace below what a dead sprint on the flat
  // would take — guards against a pathological all-descent route implying negative time.
  const flatFloorHours = distanceMeters / 1000 / (flatSpeedKmh * 1.5);
  const movingHours = Math.max(baseHours + climbExtraHours - descentCreditHours, flatFloorHours);

  const pausesPerHour = randFloat(rng, ...profile.pausesPerHour);
  const pauseMinutesEach = randFloat(rng, ...profile.pauseDurationMinutes);
  const totalPauseMinutes = movingHours * pausesPerHour * pauseMinutesEach;

  return Math.round(movingHours * 3600 + totalPauseMinutes * 60);
}
