import { type Rng, randFloat, pickWeighted } from "../lib/random";
import { PLAYER_PROFILES } from "../data/players";
import { RIDER_PROFILES, type RiderProfile } from "../data/riderProfiles";

export type SeedPlayerInput = {
  firstName: string;
  lastName: string;
  email: string;
  photoUrl: string;
  // Not persisted — drives which routes/pace/duration this player's activities get.
  profile: RiderProfile;
  // Relative frequency this player is picked for one of the TOTAL_FAKE_ACTIVITIES activities —
  // some players are just more active than others (spec point 11/12 variability).
  activityWeight: number;
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
      profile: pickWeighted(rng, RIDER_PROFILES),
      activityWeight: randFloat(rng, 1, 5),
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
