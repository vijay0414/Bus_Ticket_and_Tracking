import { useEffect, useState } from "react";

// Use standard backend URL pattern
const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

export default function SeatStatus({ busInfo, onSeatDataUpdate }) {
  const [seatData, setSeatData] = useState({
    totalSeats: 52,
    passengersCount: 0,
    ticketsIssued: 0,
    availableSeats: 52,
    extraPassengers: 0,
  });

  const [passengersByStop, setPassengersByStop] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const totalSeats = 52; 

    const fetchAndCompute = async () => {
      if (!busInfo || !busInfo.busId) {
        const updated = { totalSeats, passengersCount: 0, ticketsIssued: 0, availableSeats: totalSeats, extraPassengers: 0 };
        setSeatData(updated);
        setPassengersByStop([]);
        setLoading(false);
        if (onSeatDataUpdate) onSeatDataUpdate(updated);
        return;
      }

      try {
        const url = `${BACKEND}/api/tickets?busId=${encodeURIComponent(busInfo.busId)}`
        const res = await fetch(url)
        const json = res.ok ? await res.json() : { data: [] }
        const tickets = (json.data || [])

        const map = {}
        let computedPassengers = 0
        tickets.forEach(t => {
          const dest = (t.selection && t.selection.to) || t.toCity || 'Unknown'
          const count = Number(t.totalPassengers || (t.passengers?.adults || 0) + (t.passengers?.children || 0))
          map[dest] = (map[dest] || 0) + count
          computedPassengers += count
        })

        let result = Object.keys(map).map(k => ({ city: k, passengers: map[k] }))
        if (busInfo.routeCities && Array.isArray(busInfo.routeCities)) {
          const order = busInfo.routeCities
          result.sort((a,b) => (order.indexOf(a.city) - order.indexOf(b.city)))
        }

        setPassengersByStop(result)

        const passengersCount = computedPassengers || (busInfo?.passengersCount ?? 0)
        const ticketsIssued = tickets.length || (busInfo?.ticketsIssued ?? 0)
        const availableSeats = Math.max(0, totalSeats - passengersCount)
        const extraPassengers = Math.max(0, passengersCount - totalSeats)

        const updatedSeatData = { totalSeats, passengersCount, ticketsIssued, availableSeats, extraPassengers }
        setSeatData(updatedSeatData)
        setLoading(false)
        if (onSeatDataUpdate) onSeatDataUpdate(updatedSeatData)
      } catch (err) {
        console.error('Failed to load ticket breakdown:', err)
        setLoading(false)
      }
    }

    fetchAndCompute()
  }, [busInfo]);

  return (
    <div style={{
      fontFamily: "'Outfit', sans-serif",
      backgroundColor: "#fcfdfe",
      padding: "25px",
      borderRadius: "20px",
      boxShadow: "0 10px 40px rgba(0,0,0,0.04)",
      border: "1px solid rgba(0,0,0,0.02)"
    }}>
      {/* Header Section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '30px' }}>
        <div style={{ 
          width: '12px', height: '12px', backgroundColor: '#10b981', borderRadius: '50%',
          boxShadow: '0 0 12px rgba(16, 185, 129, 0.6)',
          animation: 'pulse 2s infinite'
        }}></div>
        <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "700", color: "#1f2937", letterSpacing: "-0.5px" }}>
          Live Passenger & Seat Status
        </h2>
      </div>

      <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap' }}>
        {/* Left: Drop-off Breakdown Card */}
        <div style={{ 
          flex: "1", 
          minWidth: "280px",
          background: "#ffffff",
          borderRadius: "18px",
          padding: "24px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.02)",
          border: "1px solid #f1f5f9"
        }}>
          <h3 style={{ fontSize: "14px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "20px", textAlign: "center" }}>
            Scheduled Drop-Offs
          </h3>
          
          {passengersByStop.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {passengersByStop.map((s, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: "10px 0", borderBottom: idx !== passengersByStop.length - 1 ? "1px solid #f8fafc" : "none"
                }}>
                  <span style={{ fontSize: "16px", fontWeight: "500", color: "#334155" }}>{s.city}</span>
                  <div style={{ 
                    backgroundColor: "#fef2f2", color: "#ef4444", padding: "4px 12px", 
                    borderRadius: "12px", fontSize: "14px", fontWeight: "700" 
                  }}>
                    {s.passengers}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "20px", color: "#94a3b8", fontSize: "14px", fontStyle: "italic" }}>
              {loading ? "Calculating breakdown..." : "No drop-off data available"}
            </div>
          )}
        </div>

        {/* Right: Key Stats Grid */}
        <div style={{ flex: "2", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "15px" }}>
          {[
            { label: "Total Seats", value: seatData.totalSeats, color: "#3b82f6", bg: "#eff6ff" },
            { label: "Current Passenegrs", value: seatData.passengersCount, color: "#ef4444", bg: "#fef2f2" },
            { label: "Empty Seats", value: seatData.availableSeats, color: "#10b981", bg: "#ecfdf5" },
            { 
              label: "ExtraPassengers", 
              value: seatData.extraPassengers, 
              color: seatData.extraPassengers > 0 ? "#f59e0b" : "#94a3b8", 
              bg: seatData.extraPassengers > 0 ? "#fffbeb" : "#f8fafc" 
            }
          ].map((stat, i) => (
            <div key={i} style={{
              backgroundColor: "#fff",
              borderRadius: "18px",
              padding: "20px",
              textAlign: "center",
              border: `1px solid ${stat.bg}`,
              transition: "transform 0.2s ease",
              cursor: "default"
            }}>
              <p style={{ margin: "0 0 15px 0", fontSize: "12px", fontWeight: "600", color: "#64748b", textTransform: "uppercase" }}>{stat.label}</p>
              <div style={{ 
                fontSize: "28px", fontWeight: "800", color: stat.color, 
                display: "inline-block", padding: "8px 16px", borderRadius: "14px", backgroundColor: stat.bg
              }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .fade-in { animation: fadeIn 0.5s ease-in; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
