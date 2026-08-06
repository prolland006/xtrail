// Encodes [lat, lng] points into Google's encoded polyline format (precision 5) — the same
// format Strava returns and src/lib/polyline.ts#decodePolyline expects to read. This is the
// inverse of that function, kept seed-only: production code only ever needs to decode a
// polyline it received from Strava, never encode one.
export function encodePolyline(points: [number, number][]): string {
  let output = "";
  let prevLatE5 = 0;
  let prevLngE5 = 0;

  for (const [lat, lng] of points) {
    const latE5 = Math.round(lat * 1e5);
    const lngE5 = Math.round(lng * 1e5);
    output += encodeSignedNumber(latE5 - prevLatE5);
    output += encodeSignedNumber(lngE5 - prevLngE5);
    prevLatE5 = latE5;
    prevLngE5 = lngE5;
  }

  return output;
}

function encodeSignedNumber(num: number): string {
  const shifted = num < 0 ? ~(num << 1) : num << 1;
  return encodeUnsignedNumber(shifted);
}

function encodeUnsignedNumber(num: number): string {
  let output = "";
  let value = num;
  while (value >= 0x20) {
    output += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  output += String.fromCharCode(value + 63);
  return output;
}
