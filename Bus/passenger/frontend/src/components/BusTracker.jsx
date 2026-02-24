import { useEffect, useState } from "react";

// BusTracker now receives `busInfo` from parent App to avoid multiple socket connections.
function BusTracker({ busInfo, routeData }) {
  const BACKEND = import.meta.env.VITE_BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:5000`
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (busInfo) {
      console.log("🟢 Bus Update (BusTracker):", {
        busId: busInfo.busId,
        lat: busInfo.lat,
        lng: busInfo.lng,
        latitude: busInfo.latitude,
        longitude: busInfo.longitude,
        ticketsIssued: busInfo.ticketsIssued,
        fullData: busInfo
      });
    }
  }, [busInfo]);

  // Fetch latest conductor coordinates from backend and open Google Maps with full route
  const handleOpenGoogleMaps = async () => {
    if (!busInfo || !busInfo.busId) return;
    
    setLoading(true);
    try {
      // Fetch latest conductor coordinates from backend
      const res = await fetch(`${BACKEND}/api/buses/${busInfo.busId}`);
      if (!res.ok) throw new Error('Failed to fetch bus location');
      const data = await res.json();
      
      const conductorLat = data.data?.lat ?? data.data?.latitude;
      const conductorLng = data.data?.lng ?? data.data?.longitude;
      
      // Get route cities (prefer busInfo.routeCities, fallback to from/to, fallback to routeData)
      let route = null;
      if (busInfo?.routeCities && Array.isArray(busInfo.routeCities)) {
        route = busInfo.routeCities;
      } else if (busInfo?.fromCity && busInfo?.toCity) {
        route = [busInfo.fromCity, ...(busInfo.intermediates || []), busInfo.toCity];
      } else if (routeData) {
        route = Array.isArray(routeData) ? routeData : routeData.routeCities;
      }

      if (conductorLat !== undefined && conductorLng !== undefined && conductorLat !== null && conductorLng !== null) {
        // Build Google Maps URL with conductor's live location as origin and full route with intermediates
        if (route && Array.isArray(route) && route.length >= 2) {
          // Use conductor's live coordinates as origin
          const origin = `${conductorLat},${conductorLng}`;
          const destination = encodeURIComponent(route[route.length - 1]);
          
          // Build waypoints including all intermediate cities except the last (destination)
          const waypoints = route.length > 1 ? route.slice(0, -1).map(encodeURIComponent).join('|') : '';
          
          let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
          if (waypoints) url += `&waypoints=${waypoints}`;
          
          console.log('📍 Opening Google Maps with route:', { origin, waypoints, destination });
          window.open(url, '_blank');
        } else {
          // No route, just show conductor location
          window.open(`https://www.google.com/maps?q=${conductorLat},${conductorLng}`, '_blank');
        }
      } else {
        // Fallback to route without live coordinates
        throw new Error('Coordinates not available');
      }
    } catch (err) {
      console.warn('Could not fetch live coordinates, falling back to route:', err);
      
      // Fallback: use route or local coordinates
      let route = null;
      if (routeData) {
        route = Array.isArray(routeData) ? routeData : routeData.routeCities;
      }
      if (!route && busInfo?.routeCities) {
        route = busInfo.routeCities;
      }
      if (!route && busInfo?.fromCity && busInfo?.toCity) {
        route = [busInfo.fromCity, ...(busInfo.intermediates || []), busInfo.toCity];
      }

      if (route && Array.isArray(route) && route.length >= 2) {
        const origin = encodeURIComponent(route[0]);
        const destination = encodeURIComponent(route[route.length - 1]);
        const waypoints = route.length > 2 ? route.slice(1, -1).map(encodeURIComponent).join('|') : '';
        let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
        if (waypoints) url += `&waypoints=${waypoints}`;
        window.open(url, '_blank');
      } else if (busInfo?.lat && busInfo?.lng) {
        window.open(`https://www.google.com/maps?q=${busInfo.lat},${busInfo.lng}`, '_blank');
      }
    } finally {
      setLoading(false);
    }
  };

  // Determine if we have a usable route to show (prefer route data over raw bus coords)
  const routeFromProps = routeData && (Array.isArray(routeData) ? routeData : routeData.routeCities)
  const hasRoute = (routeFromProps && routeFromProps.length >= 2) || (busInfo && Array.isArray(busInfo.routeCities) && busInfo.routeCities.length >= 2) || (busInfo && busInfo.fromCity && busInfo.toCity)

  return (
    <div style={{ 
      backgroundColor: "#fff", 
      padding: "20px", 
      borderRadius: "8px", 
      border: "1px solid #ddd",
      textAlign: "left"
    }}>
      {busInfo ? (
        <>
          <div style={{ marginBottom: "12px" }}>
            <p style={{ margin: "8px 0" }}>
              <strong>Bus ID:</strong> {busInfo.busId || "N/A"}
            </p>
            <p style={{ margin: "8px 0" }}>
              <strong>Latitude:</strong> {busInfo.lat !== undefined && busInfo.lat !== null ? Number(busInfo.lat).toFixed(6) : "Waiting for GPS..."}
            </p>
            <p style={{ margin: "8px 0" }}>
              <strong>Longitude:</strong> {busInfo.lng !== undefined && busInfo.lng !== null ? Number(busInfo.lng).toFixed(6) : "Waiting for GPS..."}
            </p>
            {/* <p style={{ margin: "8px 0" }}>
              <strong>Tickets Issued:</strong> {busInfo.ticketsIssued || 0}
            </p> */}
            <p style={{ margin: "8px 0" }}>
              <strong>Passengers Count:</strong> {busInfo.passengersCount || 0}
            </p>
            {busInfo.lastUpdated && (
              <p style={{ margin: "8px 0", fontSize: "12px", color: "#666" }}>
                <strong>Last Updated:</strong> {new Date(busInfo.lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </div>
          
          {hasRoute ? (
            // Build Google Maps Directions URL using route data (routeData preferred, then busInfo.routeCities)
            (() => {
              // Normalize route source: prefer explicit `routeData` from App (could be array or object),
              // otherwise use `busInfo.routeCities`, and finally fall back to from/to + intermediates.
              let route = null

              if (routeData) {
                // routeData can be an array (routeCities) or an object containing routeCities
                if (Array.isArray(routeData)) {
                  route = routeData
                } else if (routeData.routeCities && Array.isArray(routeData.routeCities)) {
                  route = routeData.routeCities
                }
              }

              if (!route && busInfo && Array.isArray(busInfo.routeCities)) {
                route = busInfo.routeCities
              }

              if (!route && busInfo && busInfo.fromCity && busInfo.toCity) {
                route = [busInfo.fromCity, ...(busInfo.intermediates || []), busInfo.toCity]
              }

              // Ensure route elements are strings and trim whitespace
              if (route && Array.isArray(route)) {
                route = route.map((r) => (typeof r === 'string' ? r.trim() : String(r))).filter(Boolean)
              }

              if (route && route.length >= 2) {
                return (
                  <button
                    onClick={handleOpenGoogleMaps}
                    disabled={loading}
                    style={{
                      display: "inline-block",
                      padding: "8px 16px",
                      backgroundColor: loading ? "#ccc" : "#2196F3",
                      color: "white",
                      borderRadius: "4px",
                      textDecoration: "none",
                      cursor: loading ? "not-allowed" : "pointer",
                      marginTop: "10px",
                      border: "none",
                      fontSize: "14px"
                    }}
                  >
                    🗺️ {loading ? "Loading..." : "View Route on Google Maps"}
                  </button>
                )
              }

              // Fallback: open coordinates if route not available
              return (
                <button
                  onClick={handleOpenGoogleMaps}
                  disabled={loading}
                  style={{
                    display: "inline-block",
                    padding: "8px 16px",
                    backgroundColor: loading ? "#ccc" : "#2196F3",
                    color: "white",
                    borderRadius: "4px",
                    textDecoration: "none",
                    cursor: loading ? "not-allowed" : "pointer",
                    marginTop: "10px",
                    border: "none",
                    fontSize: "14px"
                  }}
                >
                  🗺️ {loading ? "Loading..." : "View on Google Maps"}
                </button>
              )
            })()
          ) : (
            <p style={{ color: "#FF9800", fontStyle: "italic", marginTop: "10px" }}>
              ⏳ Waiting for route data. Please search and select a bus or wait for conductor to register route.
            </p>
          )}
        </>
      ) : (
        <p style={{ color: "#999" }}>Loading live bus data...</p>
      )}
    </div>
  );
}

export default BusTracker;
