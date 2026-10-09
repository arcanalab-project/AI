const EARTH_KM = 6371;

export function haversineKm(
  a: [number, number],
  b: [number, number],
): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function centerSphereRadians(km: number): number {
  return km / 6378.1;
}

export function assertLngLat(coordinates: [number, number], city: string): void {
  const [lng, lat] = coordinates;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new Error(`Invalid GeoJSON coordinates for ${city}: [${lng}, ${lat}]`);
  }
  // Italy bounding-box sanity for this demo dataset
  if (lng < 6 || lng > 19 || lat < 36 || lat > 48) {
    throw new Error(`Coordinates for ${city} are not in the expected Italy range`);
  }
}
