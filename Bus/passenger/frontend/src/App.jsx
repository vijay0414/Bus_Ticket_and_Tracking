import React, { useState, useEffect } from "react";
import MapView from "./components/MapView";
import SeatStatus from "./components/SeatStatus";
import { io } from "socket.io-client";
import BusTracker from "./components/BusTracker";

// Use HTTPS backend for network location access, use current page hostname to avoid cert mismatch
const BACKEND = import.meta.env.VITE_BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:5000`
const socket = io(BACKEND, {
  transports: ["websocket"], // force WebSocket
  rejectUnauthorized: false  // Accept self-signed certificates
});

export default function App() {
  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");
  const [busInfo, setBusInfo] = useState(null);
  const [message, setMessage] = useState("");
  const [routeData, setRouteData] = useState(null);
  const [buses, setBuses] = useState([]);
  const [error, setError] = useState("");
  const [nextStop, setNextStop] = useState("");
  const [dropOffPassengers, setDropOffPassengers] = useState(0);
  const [showStatus, setShowStatus] = useState(false); // ✅ added missing state

  // ✅ Socket event listeners
  useEffect(() => {
    socket.on("connect", () => {
      console.log("✅ Connected to backend socket:", socket.id);
    });

    socket.on("busUpdate", (data) => {
      // Normalize incoming coordinates: prefer explicit latitude/longitude, fallback to lat/lng
      const finalLat = data.latitude !== undefined ? data.latitude : data.lat
      const finalLng = data.longitude !== undefined ? data.longitude : data.lng

      console.log("📡 Received busUpdate:", {
        busId: data.busId,
        lat: finalLat,
        lng: finalLng,
        fromCity: data.fromCity,
        toCity: data.toCity,
        routeCities: data.routeCities,
        ticketsIssued: data.ticketsIssued,
        passengersCount: data.passengersCount,
        timestamp: new Date().toLocaleTimeString()
      })

      // Merge update into existing busInfo, ensuring lat/lng fields are kept consistent
      setBusInfo((prev) => {
        const base = prev && prev.busId === data.busId ? { ...(prev || {}) } : { ...(prev || {}) }
        const updated = {
          ...base,
          ...(data || {}),
          lat: finalLat,
          lng: finalLng,
          latitude: finalLat,
          longitude: finalLng,
        }

        console.log(`📊 New busInfo state:`, {
          ticketsIssued: updated.ticketsIssued,
          passengersCount: updated.passengersCount,
          lat: updated.lat,
          lng: updated.lng,
          fromCity: updated.fromCity,
          toCity: updated.toCity,
          routeCities: updated.routeCities,
        })

        return updated
      })
    });

    socket.on("routeData", (data) => {
      // When a conductor logs in and emits routeData, clear previous passenger-side tracking
      // and start fresh for the newly registered conductor route.
      setRouteData(data);
      // Reset tracked bus and lists so passenger view starts fresh for this conductor login
      setBuses([])
      setBusInfo(null)
      setShowStatus(false)
      setMessage((data && data.busId) ? `🔄 Conductor ${data.busId} logged in — refreshed data` : '🔄 New route available')
    });

    socket.on("cityUpdate", (data) => {
      setMessage(`🚌 Bus has reached ${data.currentCity}. Next city: ${data.nextCity}`);
      setNextStop(data.nextCity);
      setDropOffPassengers(data.dropOffPassengers || 0);
    });

    socket.on("availableBusesUpdate", (data) => {
      if (fromCity && toCity && data.fromCity === fromCity && data.toCity === toCity) {
        setBuses(data.buses || []);
        setMessage(`✅ ${data.buses.length} bus(es) available for ${fromCity} → ${toCity}`);
      }
    });

    // Handle bus logout: remove from lists and stop tracking if needed
    socket.on('busLogout', (data) => {
      try {
        const { busId } = data || {};
        if (!busId) return;
        console.log('🔔 Received busLogout for', busId);

        // Remove from buses list
        setBuses((prev) => (prev || []).filter((b) => b.busId !== busId));

        // If we were tracking this bus, stop tracking and hide status
        setBusInfo((prev) => {
          if (prev && prev.busId === busId) {
            setShowStatus(false);
            return null;
          }
          return prev;
        });
      } catch (e) {
        console.error('Error handling busLogout:', e);
      }
    });

    return () => {
      socket.off("connect");
      socket.off("busUpdate");
      socket.off("routeData");
      socket.off("cityUpdate");
      socket.off("availableBusesUpdate");
      socket.off('busLogout');
    };
  }, [fromCity, toCity]);

  // ✅ On mount: fetch all registered buses so passengers see available buses immediately
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/buses`)
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
        const data = await res.json()
        if (data && data.success) {
          setBuses(data.data || [])
          if ((data.data || []).length > 0) {
            setMessage(`✅ ${data.data.length} bus(es) available`)
          }
        }
      } catch (err) {
        console.warn('Unable to fetch initial buses:', err)
      }
    }
    fetchAll()
  }, [])

  // ✅ Join specific bus room
  useEffect(() => {
    if (busInfo && busInfo.busId) {
      socket.emit("joinBus", busInfo.busId);
      return () => {
        socket.emit("leaveBus", busInfo.busId);
      };
    }
  }, [busInfo?.busId]);

  // ✅ Seat status
  const seatStatus = async () => {
    if (!busInfo || !busInfo.busId) {
      setError("Please select a bus to view seat status");
      return;
    }
    try {
      console.log("Bus Info:", busInfo);
      setError("");
      setShowStatus(true);
    } catch (error) {
      console.error("Error fetching seat status:", error);
      setError("Unable to fetch seat status");
    }
  };

  // ✅ Handle tracking a specific bus (called when user clicks Track Bus)
  const handleTrackBus = (b) => {
    if (!b || !b.busId) return;

    // If currently tracking another bus, leave its room — the socket effect will also handle cleanup
    if (busInfo && busInfo.busId && busInfo.busId !== b.busId) {
      try {
        socket.emit('leaveBus', busInfo.busId);
      } catch (e) {
        // ignore
      }
    }

    // Merge existing live coordinates if available to avoid overwriting with stale API data
    setBusInfo((prev) => {
      const prevCoords = prev && prev.busId === b.busId ? { lat: prev.lat, lng: prev.lng, latitude: prev.latitude, longitude: prev.longitude } : {}
      const apiCoords = { lat: b.lat ?? b.latitude, lng: b.lng ?? b.longitude }
      const finalLat = prevCoords.lat ?? prevCoords.latitude ?? apiCoords.lat ?? null
      const finalLng = prevCoords.lng ?? prevCoords.longitude ?? apiCoords.lng ?? null
      return {
        ...b,
        ...(finalLat !== null ? { lat: finalLat, latitude: finalLat } : {}),
        ...(finalLng !== null ? { lng: finalLng, longitude: finalLng } : {}),
      }
    })
    setShowStatus(true);
    setMessage(`🔎 Now tracking bus ${b.busId} (${b.fromCity} → ${b.toCity})`);
  }

  // ✅ Search function
  const handleSearch = async () => {
    if (!fromCity || !toCity) {
      setError("Please enter both cities");
      return;
    }

    try {
      setError("");
      setMessage("🔍 Searching for buses...");
      const params = new URLSearchParams({ fromCity, toCity });
      const url = `${BACKEND}/api/buses?${params.toString()}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();

      if (data.success) {
        setBuses(data.data || []);
        if (data.data && data.data.length > 0) {
          setRouteData(data.data[0].routeCities || [fromCity, toCity]);
          // Auto-select the first bus in results but do not start tracking automatically
          setBusInfo((prev) => prev && prev.busId === data.data[0].busId ? prev : data.data[0]);
          setMessage(`🔍 Found ${data.data.length} bus(es) for ${fromCity} → ${toCity}`);
          // leave showStatus as-is (user should click Track Bus to view live data)
        } else {
          setRouteData([fromCity, toCity]);
          setMessage("No buses found for this route yet");
          // Stop tracking if previously tracking a bus from a different route
          if (busInfo && busInfo.busId) {
            try { socket.emit('leaveBus', busInfo.busId); } catch (e) {}
          }
          setBusInfo(null);
          setShowStatus(false);
        }
      } else {
        setRouteData(null);
        setError("❌ No buses found for this route");
        setBuses([]);
        // ensure tracking is stopped when search fails
        if (busInfo && busInfo.busId) {
          try { socket.emit('leaveBus', busInfo.busId); } catch (e) {}
        }
        setBusInfo(null);
        setShowStatus(false);
      }
    } catch (err) {
      console.error("Search error:", err);
      setRouteData(null);
      setBuses([]);
      setError(`❌ Connection error: ${err.message}. Make sure backend is running on port 5000.`);
    }
  };

  // ✅ Final UI (only one return!)
  return (
    <div>
      <header
        style={{
          backgroundColor: "#1565C0",
          color: "#fff",
          padding: "10px 20px",
          textAlign: "center",
        }}
      >
        <h1>🚌 Real-Time Bus Passenger Dashboard</h1>
      </header>

      <main style={{ padding: "20px" }}>
        {/* 🔍 Search Section */}
        <section>
          <h2>🗺️ City Route Search</h2>
          <div style={{ display: "flex", gap: "10px", margin: "10px 0 20px" }}>
            <input
              type="text"
              placeholder="From City"
              value={fromCity}
              onChange={(e) => setFromCity(e.target.value)}
              style={{ padding: "8px", width: "200px" }}
            />
            <input
              type="text"
              placeholder="To City"
              value={toCity}
              onChange={(e) => setToCity(e.target.value)}
              style={{ padding: "8px", width: "200px" }}
            />
            <button
              onClick={handleSearch}
              style={{
                padding: "8px 16px",
                backgroundColor: "#2196F3",
                color: "white",
                border: "none",
                cursor: "pointer",
              }}
            >
              Search
            </button>
          </div>
          {error && <p style={{ color: "red" }}>{error}</p>}
          {message && <p>{message}</p>}
        </section>

        {/* 🚍 Bus List */}
        {buses.length > 0 && (
          <section style={{ marginTop: 12 }}>
            <h3>🚍 Matching Buses</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {buses.map((b) => (
                <div
                  key={b.busId}
                  style={{
                    border: "1px solid #ddd",
                    padding: 16,
                    borderRadius: 8,
                    backgroundColor: busInfo?.busId === b.busId ? "#e3f2fd" : "white",
                    minWidth: "250px",
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: "bold", color: "#1565C0" }}>
                    Bus ID: {b.busId}
                  </div>
                  <div>
                    <strong>Route:</strong> {b.fromCity} → {b.toCity}
                  </div>
                  {b.routeCities && b.routeCities.length > 2 && (
                    <div style={{ fontSize: 14, color: "#666" }}>
                      {/* <strong>Stops:</strong>{" "}
                      {b.routeCities.filter(c => c !== b.fromCity && c !== b.toCity).join(" → ")} */}
                    </div>
                  )}
                  {/* <div>
                    <strong>Current Status:</strong>
                    <div style={{ display: "flex", gap: "16px", marginTop: "4px" }}>
                      <span>🎫 {b.ticketsIssued || 0} tickets</span>
                      <span>👥 {b.passengersCount || 0} passengers</span>
                    </div>
                  </div> */}

                  <button
                    onClick={() => handleTrackBus(b)}
                    style={{
                      backgroundColor: busInfo?.busId === b.busId ? "#33a84e" : "#1c87de",
                      color: "white",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      width: "100%",
                      marginTop: "10px",
                    }}
                  >
                    {busInfo?.busId === b.busId ? "✓ Tracking" : "Track Bus"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ✅ Show seat & tracker info when a bus is selected */}
        {showStatus && busInfo && (
          <>
            <section style={{ marginTop: 20 }}>
              <SeatStatus busInfo={busInfo} />
            </section>

            <section
              style={{
                marginTop: "20px",
                backgroundColor: "#f0f0f0",
                padding: "15px",
                borderRadius: "10px",
              }}
            >
              {/* <h3>📍 Next Stop Information</h3>
              <p>
                <strong>Next City:</strong> {nextStop || "Waiting for update..."}
              </p>
              <p>
                <strong>Dropped Passengers:</strong>{" "}
                {dropOffPassengers > 0 ? dropOffPassengers : "No passengers dropped"}
              </p> */}
            </section>

            <section
              style={{
                marginTop: "30px",
                backgroundColor: "#E3F2FD",
                padding: "15px",
                borderRadius: "10px",
                textAlign: "center",
              }}
            >
              <h2>🚍 Live Bus Tracker</h2>
              <BusTracker busInfo={busInfo} routeData={routeData} />
            </section>
          </>
        )}
        <section>
          <MapView busInfo={busInfo} routeData={routeData} buses={buses} />
        </section>
      </main>
    </div>
  );
}