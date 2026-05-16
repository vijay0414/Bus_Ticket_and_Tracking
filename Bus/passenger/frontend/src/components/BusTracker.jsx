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

  // Open Google Maps centered on the bus coordinates
  const handleOpenLiveLocation = () => {
    if (!busInfo) return;

    const lat = busInfo.lat ?? busInfo.latitude;
    const lng = busInfo.lng ?? busInfo.longitude;

    if (lat !== undefined && lng !== undefined && lat !== null) {
      const url = `https://www.google.com/maps?q=${lat},${lng}&z=15`;
      console.log('📍 Opening Google Maps at live coordinates:', { lat, lng });
      window.open(url, '_blank');
    } else {
      alert("Waiting for live GPS signal...");
    }
  };

  // Open Google Maps with the full route directions
  const handleOpenRoute = () => {
    let route = null;
    if (routeData) {
      route = Array.isArray(routeData) ? routeData : (routeData.routeCities || []);
    }
    if (!route || route.length === 0) {
      route = busInfo?.routeCities || [];
    }
    if (route.length < 2 && busInfo?.fromCity && busInfo?.toCity) {
      route = [busInfo.fromCity, ...(busInfo.intermediates || []), busInfo.toCity];
    }

    if (route.length >= 2) {
      const origin = encodeURIComponent(route[0]);
      const destination = encodeURIComponent(route[route.length - 1]);
      const waypoints = route.length > 2 ? route.slice(1, -1).map(encodeURIComponent).join('|') : '';
      let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
      if (waypoints) url += `&waypoints=${waypoints}`;
      window.open(url, '_blank');
    }
  };

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              backgroundColor: '#4CAF50',
              borderRadius: '50%',
              boxShadow: '0 0 5px #4CAF50'
            }}></span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#4CAF50', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Live Tracking
            </span>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <p style={{ margin: "8px 0" }}>
              <strong>Bus ID:</strong> {busInfo.busId || "N/A"}
            </p>
            <p style={{ margin: "8px 0" }}>
              <strong>Latitude:</strong> {busInfo.lat !== undefined && busInfo.lat !== null ? busInfo.lat : "Waiting for GPS..."}
            </p>
            <p style={{ margin: "8px 0" }}>
              <strong>Longitude:</strong> {busInfo.lng !== undefined && busInfo.lng !== null ? busInfo.lng : "Waiting for GPS..."}
            </p>
            {busInfo.lastUpdated && (
              <p style={{ margin: "8px 0", fontSize: "12px", color: "#666" }}>
                <strong>Last Updated:</strong> {new Date(busInfo.lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </div>

          {hasRoute ? (
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handleOpenLiveLocation}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  backgroundColor: loading ? "#ccc" : "#2196F3",
                  color: "white",
                  borderRadius: "4px",
                  cursor: loading ? "not-allowed" : "pointer",
                  border: "none",
                  fontSize: "14px"
                }}
              >
                📍 {loading ? "Loading..." : "Live Location"}
              </button>

              <button
                onClick={handleOpenRoute}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#4CAF50",
                  color: "white",
                  borderRadius: "4px",
                  cursor: "pointer",
                  border: "none",
                  fontSize: "14px"
                }}
              >
                🗺️ Open Route in Google Maps
              </button>
            </div>
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
