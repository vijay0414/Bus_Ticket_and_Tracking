import { useEffect, useState } from "react";

// Use HTTPS backend for network location access
const BACKEND = import.meta.env.VITE_BACKEND_URL || 'https://localhost:5000'

export default function SeatStatus({ busInfo, onSeatDataUpdate }) {
  const [seatData, setSeatData] = useState({
    totalSeats: 52,
    passengersCount: 0,
    ticketsIssued: 0,
    availableSeats: 52,
    extraPassengers: 0,
  });

  const [passengersByStop, setPassengersByStop] = useState([])

  useEffect(() => {
    const totalSeats = 52; // assume fixed capacity

    // Fetch ticket breakdown by destination for this bus and compute totals from tickets
    const fetchAndCompute = async () => {
      if (!busInfo || !busInfo.busId) {
        const updated = {
          totalSeats,
          passengersCount: 0,
          ticketsIssued: 0,
          availableSeats: totalSeats,
          extraPassengers: 0,
        }
        setSeatData(updated)
        setPassengersByStop([])
        if (onSeatDataUpdate) onSeatDataUpdate(updated)
        return
      }

      try {
        const url = `${BACKEND}/api/tickets?busId=${encodeURIComponent(busInfo.busId)}`
        const res = await fetch(url)
        const json = res.ok ? await res.json() : { data: [] }
        const tickets = (json.data || [])

        // Group by destination (prefer selection.to, fallback to toCity)
        const map = {}
        let computedPassengers = 0
        tickets.forEach(t => {
          const dest = (t.selection && t.selection.to) || t.toCity || t.selection?.to || 'Unknown'
          const count = (t.totalPassengers != null) ? Number(t.totalPassengers) : ((t.passengers?.adults||0) + (t.passengers?.children||0))
          const safeCount = Number.isFinite(count) ? count : 0
          map[dest] = (map[dest] || 0) + safeCount
          computedPassengers += safeCount
        })

        // Convert to sorted array (keep original route order if available)
        let result = Object.keys(map).map(k => ({ city: k, passengers: map[k] }))
        if (busInfo.routeCities && Array.isArray(busInfo.routeCities)) {
          const order = busInfo.routeCities
          result.sort((a,b) => (order.indexOf(a.city) - order.indexOf(b.city)))
        } else if (busInfo.toCity) {
          result.sort((a,b) => (a.city === busInfo.toCity ? 1 : (b.city === busInfo.toCity ? -1 : 0)))
        }

        setPassengersByStop(result)

        // Use computedPassengers from tickets if available; fallback to busInfo.passengersCount
        const passengersCount = computedPassengers || (busInfo?.passengersCount ?? 0)
        const ticketsIssued = tickets.length || (busInfo?.ticketsIssued ?? 0)

        const availableSeats = passengersCount <= totalSeats ? totalSeats - passengersCount : 0
        const extraPassengers = passengersCount > totalSeats ? passengersCount - totalSeats : 0

        const updatedSeatData = {
          totalSeats,
          passengersCount,
          ticketsIssued,
          availableSeats,
          extraPassengers,
        }

        setSeatData(updatedSeatData)
        if (onSeatDataUpdate) onSeatDataUpdate(updatedSeatData)
      } catch (err) {
        console.error('Failed to load ticket breakdown:', err)
        // Fallback to using busInfo values
        const passengersCount = busInfo?.passengersCount ?? 0
        const ticketsIssued = busInfo?.ticketsIssued ?? 0
        const availableSeats = passengersCount <= totalSeats ? totalSeats - passengersCount : 0
        const extraPassengers = passengersCount > totalSeats ? passengersCount - totalSeats : 0
        const updatedSeatData = { totalSeats, passengersCount, ticketsIssued, availableSeats, extraPassengers }
        setSeatData(updatedSeatData)
        setPassengersByStop([])
        if (onSeatDataUpdate) onSeatDataUpdate(updatedSeatData)
      }
    }

    fetchAndCompute()
  }, [busInfo]);

  return (
    <div className="seat-status fade-in">
      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
        <span className="live-indicator"></span>
        <span style={{ fontSize: "22px", fontWeight: "600", color: "#222" }}>
          Live Passenger & Seat Data
        </span>
      </h2>

      <div className="seat-status" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Left: passenger breakdown by stop */}
        <div className="seat-card passenger-by-stop" style={{ minWidth: 180 }}>
          <p>Passengers Drop-Off at Each Stops</p>
          {passengersByStop && passengersByStop.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {passengersByStop.map((s, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#333' }}>{s.city}</span>
                  <strong style={{ color: '#FF6B6B' }}>{s.passengers}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#777', fontSize: 13 }}>No ticket breakdown available</div>
          )}
        </div>
       
        <center>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="seat-card">
            <p>Total Seats</p>
            <span className="total-seats">{seatData.totalSeats}</span>
          </div>
          
          {/* <div className="seat-card">
            <p>Tickets Issued</p>
            <span className="tickets-issued">{seatData.ticketsIssued}</span>
          </div> */}

          <div className="seat-card">
            <p>Passengers</p>
            <span className="passengers-count" style={{ color: "#c20f0fff", fontWeight: "bold" }}>
              {seatData.passengersCount}
            </span>
          </div>

          <div className="seat-card">
            <p>Available Seats</p>
            <span className="available-seats">{seatData.availableSeats}</span>
          </div>

          <div className="seat-card">
            <p>Extra Passengers</p>
            <span className={`extra-passengers ${seatData.extraPassengers > 0 ? "extra-alert" : ""}`}>
              {seatData.extraPassengers}
            </span>
          </div>
        </div>
        </center>
      </div>
    </div>
  );
}
