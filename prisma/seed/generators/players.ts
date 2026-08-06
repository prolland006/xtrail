import { type Rng, randFloat } from "../lib/random";
import { PLAYER_PROFILES } from "../data/players";

export type SeedPlayerInput = {
  firstName: string;
  lastName: string;
  email: string;
  photoUrl: string;
  // Not persisted — only used to generate believable per-athlete activity durations.
  paceMinPerKm: number;
  climbFactor: number;
};

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function buildSeedPlayers(rng: Rng): SeedPlayerInput[] {
  return PLAYER_PROFILES.map(({ firstName, lastName }) => {
    const slug = slugify(`${firstName}.${lastName}`);
    return {
      firstName,
      lastName,
      // .test is IANA-reserved for testing (RFC 2606) — these addresses can never resolve.
      email: `${slug}@seed.xtrail.test`,
      photoUrl: `https://i.pravatar.cc/300?u=${slug}`,
      paceMinPerKm: randFloat(rng, 4.8, 8.2),
      climbFactor: randFloat(rng, 2.2, 4.8),
    };
  });
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z.]+/g, "");
}
