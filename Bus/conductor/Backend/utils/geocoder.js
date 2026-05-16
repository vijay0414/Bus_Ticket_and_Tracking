/**
 * Geocoding utility using Nominatim (OpenStreetMap)
 * No API key required for low volume.
 */

export async function geocodeCity(cityName) {
  if (!cityName) return null;
  try {
    // Nominatim requires a user-agent
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}&limit=1`;
    const res = await fetch(url, { 
      headers: { 'User-Agent': 'SmartBusTracker/1.0' } 
    });
    const data = await res.json();
    if (data && data.length > 0) {
      return { 
        name: cityName,
        lat: parseFloat(data[0].lat), 
        lng: parseFloat(data[0].lon) 
      };
    }
  } catch (err) {
    console.error(`❌ Geocoding failed for ${cityName}:`, err);
  }
  return null;
}

export async function geocodeRoute(cities) {
  if (!cities || !Array.isArray(cities)) return [];
  const locations = [];
  for (const city of cities) {
    const loc = await geocodeCity(city);
    if (loc) locations.push(loc);
  }
  return locations;
}
