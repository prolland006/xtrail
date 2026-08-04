// Diameter (corner-to-corner) of each hexagon drawn on the activity map, in meters.
// H3 only supports a fixed set of resolutions (0-15), so this value is mapped to the
// closest matching resolution — see resolutionForDiameterMeters() in lib/h3.ts.
export const HEX_DIAMETER_METERS = 250;
