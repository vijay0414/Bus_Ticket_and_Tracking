import React, { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

// Use HTTP for development as primary
const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'
const socket = io(BACKEND, { transports: ['websocket'] })

export default function App() {
  const [step, setStep] = useState(1)
  const stepRef = useRef(1)
  const [busId, setBusId] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [locationStatus, setLocationStatus] = useState({ enabled: false, label: 'Off' })
  const [locationError, setLocationError] = useState('')

  const [fromCity, setFromCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [cityError, setCityError] = useState('')

  const [intermediates, setIntermediates] = useState([])
  const [newCity, setNewCity] = useState('')

  const [passengersFrom, setPassengersFrom] = useState('')
  const [passengersTo, setPassengersTo] = useState('')
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [price, setPrice] = useState(50)
  const [ticketsIssued, setTicketsIssued] = useState(0)

  const [showMenu, setShowMenu] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const lastCoordsRef = useRef(null)
  const watchIdRef = useRef(null)
  const intervalIdRef = useRef(null)

  // Cleanup on unmount
  useEffect(() => {
    socket.on('connect', () => {
      console.log('✅ Conductor connected to backend:', socket.id)
    })

    socket.on('error', (err) => {
      console.error('❌ Socket error:', err)
    })

    return () => {
      // Stop watching position (cleanup)
      try {
        if (watchIdRef.current != null) {
          navigator.geolocation.clearWatch(watchIdRef.current)
          watchIdRef.current = null
        }
        if (intervalIdRef.current != null) {
          clearInterval(intervalIdRef.current)
          intervalIdRef.current = null
        }
      } catch (e) {
        console.warn('Failed to clear geolocation watcher on unmount', e)
      }

      socket.off('connect')
      socket.off('error')
    }
  }, [])

  // Persist state to sessionStorage so tab changes or reloads don't lose data
  useEffect(() => {
    try {
      const savedStep = sessionStorage.getItem('conductor_step')
      if (savedStep) {
        const num = Number(savedStep)
        if (!Number.isNaN(num)) {
          setStep(num)
          stepRef.current = num
        }
      }

      const savedBusId = sessionStorage.getItem('conductor_busId')
      if (savedBusId) setBusId(savedBusId)

      const savedFrom = sessionStorage.getItem('conductor_fromCity')
      if (savedFrom) setFromCity(savedFrom)

      const savedTo = sessionStorage.getItem('conductor_toCity')
      if (savedTo) setToCity(savedTo)

      const savedIntermediates = sessionStorage.getItem('conductor_intermediates')
      if (savedIntermediates) setIntermediates(JSON.parse(savedIntermediates))

      const savedLoggedIn = sessionStorage.getItem('conductor_isLoggedIn')
      if (savedLoggedIn === 'true') setIsLoggedIn(true)

    } catch (e) {
      console.error('Failed to load session state', e)
    }
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem('conductor_step', String(step))
      sessionStorage.setItem('conductor_busId', busId)
      sessionStorage.setItem('conductor_fromCity', fromCity)
      sessionStorage.setItem('conductor_toCity', toCity)
      sessionStorage.setItem('conductor_intermediates', JSON.stringify(intermediates))
      sessionStorage.setItem('conductor_isLoggedIn', String(isLoggedIn))
    } catch (e) {}
    stepRef.current = step
  }, [step, busId, fromCity, toCity, intermediates, isLoggedIn])

  // Join bus room when logged in
  useEffect(() => {
    if (isLoggedIn && busId) {
      socket.emit('joinBus', busId)
      console.log(`🚍 Joined bus room: ${busId}`)
      return () => {
        socket.emit('leaveBus', busId)
      }
    }
  }, [isLoggedIn, busId])

  // Step 1: Login
  const handleLogin = async () => {
    if (!busId.trim() || !password.trim()) {
      setLoginError('Bus ID and Password are required')
      return
    }
    setLoginError('')

    // Register bus with backend
    try {
      const res = await fetch(`${BACKEND}/api/conductor/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busId: busId.trim(),
          password,
          fromCity: '',
          toCity: '',
          routeCities: []
        })
      })

      if (res.ok) {
        const result = await res.json()
        const existingBus = result.data

        console.log('🏁 Login successful. Existing data:', existingBus)

        setIsLoggedIn(true)
        setSuccessMessage(`✅ Logged in as Bus ${busId}`)
        
        // If bus already has a route, populate state and skip to step 5
        if (existingBus && existingBus.fromCity && existingBus.toCity) {
          console.log(`📍 Resuming session: ${existingBus.fromCity} → ${existingBus.toCity}`)
          
          setFromCity(existingBus.fromCity)
          setToCity(existingBus.toCity)
          
          // routeCities includes from and to, so slice the middle
          if (existingBus.routeCities && existingBus.routeCities.length > 2) {
            const stops = existingBus.routeCities.slice(1, -1)
            console.log('🛑 Restoring intermediate stops:', stops)
            setIntermediates(stops)
          } else {
            setIntermediates([])
          }
          
          setTicketsIssued(existingBus.ticketsIssued || 0)
          
          // Pre-set ticketing dropdowns for convenience
          setPassengersFrom(existingBus.fromCity)
          setPassengersTo(existingBus.toCity)
          
          // Auto-enable location if it was off
          if (!locationStatus.enabled) {
            enableLocation()
          }
          
          console.log('🚀 Skipping to Step 5 (Ticketing)')
          setStep(5) 
        } else {
          console.log('🆕 No existing route found, starting fresh flow.')
          setStep(2) 
        }

        setTimeout(() => setSuccessMessage(''), 3000)
      } else {
        setLoginError('❌ Login failed')
      }
    } catch (err) {
      setLoginError(`❌ Connection error: ${err.message}`)
    }
  }

  // Step 2: Enable Location
  const enableLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationError('Geolocation not supported in this browser')
      return
    }
    setLocationError('')

    // Use watchPosition for continuous location tracking
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = pos.coords
        lastCoordsRef.current = coords
        
        // Set location as enabled only once
        setLocationStatus((prev) => {
          if (prev.enabled === false) {
            setSuccessMessage('✅ Real-time location tracking enabled')
            setTimeout(() => setSuccessMessage(''), 3000)
          }
          return { enabled: true, label: 'On' }
        })

        // Send location update immediately
        sendLocationUpdate(coords)
      },
      (err) => {
        setLocationError(`❌ Location error: ${err.message}`)
        console.error('Geolocation error:', err)
      },
      {
        enableHighAccuracy: true,  // Use GPS for high accuracy
        timeout: 5000,             // 5 second timeout
        maximumAge: 0              // Always get fresh location (no caching)
      }
    )

    // Store watch ID for cleanup
    watchIdRef.current = watchId
    
    // Set up interval to send location every 1 second (essential for second-by-second requirement)
    const intervalId = setInterval(() => {
      if (lastCoordsRef.current) {
        sendLocationUpdate(lastCoordsRef.current)
      }
    }, 1000)
    
    // Store interval for cleanup
    intervalIdRef.current = intervalId
    
    // Only set step to 3 when clicking the button, not on every location update
    setLocationStatus({ enabled: true, label: 'On' })
  }

  const sendLocationUpdate = async (coords) => {
    try {
      const allCities = [fromCity, ...intermediates, toCity]
      const locationData = {
        busId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        ticketsIssued,
        lat: coords.latitude,
        lng: coords.longitude,
        fromCity: fromCity || undefined,
        toCity: toCity || undefined,
        routeCities: (fromCity && toCity) ? allCities : undefined
      }

      // Send via REST API
      fetch(`${BACKEND}/api/conductor/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locationData)
      }).catch(() => {})

      // Also emit via Socket.IO for real-time updates
      socket.emit('sendLocationUpdate', locationData)
    } catch (err) {
      console.error('Location update failed', err)
    }
  }

  // Step 3: Add Cities
  const handleAddCities = async () => {
    if (!fromCity.trim() || !toCity.trim()) {
      setCityError('Both cities are required')
      return
    }
    if (fromCity === toCity) {
      setCityError('From and To cities must be different')
      return
    }
    setCityError('')

    // Update bus route in backend
    try {
      const allCities = [fromCity, ...intermediates, toCity]
      await fetch(`${BACKEND}/api/conductor/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busId,
          fromCity,
          toCity,
          routeCities: allCities
        })
      })
    } catch (err) {
      console.error('Route update error:', err)
    }

    setSuccessMessage(`✅ Route: ${fromCity} → ${toCity}`)
    setTimeout(() => setSuccessMessage(''), 3000)
    setStep(4)
  }

  // Step 4: Intermediate Cities
  const addIntermediate = () => {
    if (!newCity.trim()) return
    if (newCity === fromCity || newCity === toCity || intermediates.includes(newCity)) {
      return
    }
    setIntermediates([...intermediates, newCity])
    setNewCity('')
    setSuccessMessage(`✅ Added ${newCity}`)
    setTimeout(() => setSuccessMessage(''), 2000)
  }

  const removeIntermediate = (idx) => {
    setIntermediates(intermediates.filter((_, i) => i !== idx))
  }

  const proceedToTickets = () => {
    setSuccessMessage('✅ Route confirmed')
    setTimeout(() => setSuccessMessage(''), 3000)
    setStep(5)
  }

  // Step 5: Issue Tickets
  const issueTicket = async () => {
    if (!passengersFrom || !passengersTo) {
      setSuccessMessage('❌ Please select passenger cities')
      return
    }
    if (adults + children === 0) {
      setSuccessMessage('❌ At least one passenger required')
      return
    }

    const totalPassengers = adults + children
    const totalPrice = price * totalPassengers
    const allCities = [fromCity, ...intermediates, toCity]

    const ticketData = {
      busId,
      fromCity,
      toCity,
      routeCities: allCities,
      selection: { from: passengersFrom, to: passengersTo },
      passengers: { adults, children },
      price: totalPrice,
      totalPassengers: totalPassengers,
      time: new Date().toLocaleString()
    }

    try {
      const res = await fetch(`${BACKEND}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketData)
      })

      if (res.ok) {
        const newTicketCount = ticketsIssued + 1
        setTicketsIssued(newTicketCount)
        
        // Emit ticket issued event via Socket.IO with passenger count included
        socket.emit('ticketIssued', {
          busId,
          ticketsIssued: newTicketCount,
          passengersCount: totalPassengers,
          ...ticketData
        })

        setSuccessMessage(`✅ Ticket issued! Total: ${newTicketCount} | Passengers: ${totalPassengers} | Price: ₹${totalPrice}`)
        setAdults(1)
        setChildren(0)
        setPassengersFrom('')
        setPassengersTo('')
        setTimeout(() => setSuccessMessage(''), 4000)
      } else {
        setSuccessMessage('❌ Failed to issue ticket')
      }
    } catch (err) {
      setSuccessMessage(`❌ Error: ${err.message}`)
    }
  }

  // Logout
  const handleLogout = async () => {
    // Call backend to set bus as offline
    try {
      await fetch(`${BACKEND}/api/conductor/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ busId })
      });
    } catch (e) {
      console.error('Logout API error', e);
    }

    // Emit logout event via Socket.IO
    socket.emit('busLogout', { busId });
    socket.emit('leaveBus', busId);
    // Emit logout event via Socket.IO
    socket.emit('busLogout', { busId })
    socket.emit('leaveBus', busId)

    // Reset all state
    setBusId('')
    setPassword('')
    setStep(1)
    setLocationStatus({ enabled: false, label: 'Off' })
    setFromCity('')
    setToCity('')
    setIntermediates([])
    setPassengersFrom('')
    setPassengersTo('')
    setAdults(1)
    setChildren(0)
    setTicketsIssued(0)  // ✅ Reset ticket count to 0
    setIsLoggedIn(false)
    setShowMenu(false)
    setSuccessMessage('✅ Session ended and logged out successfully')
    setTimeout(() => setSuccessMessage(''), 3000)

    // Clear sessionStorage to reset step on logout
    try {
      sessionStorage.removeItem('conductor_step')
    } catch (e) {}

    // Stop location updates
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current)
      intervalIdRef.current = null
    }
  }

  return (
    <div className="conductor-app">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="logo">TN</div>
          <div>
            <h1>TNSTC ETM Machine</h1>
            <p className="subtitle">Electronic Ticketing Machine</p>
          </div>
        </div>
        <div className="menu-icon" onClick={() => setShowMenu(!showMenu)}>
          ⋮
          {showMenu && (
            <div className="dropdown-menu">
              <button onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      </header>

      {/* Success Message */}
      {successMessage && <div className="success-banner">{successMessage}</div>}

      {/* Main Content */}
      <main className="main-content">
        {/* Step 1: Login */}
        {step === 1 && (
          <div className="step-card step-1">
            <div className="step-number">Step 1</div>
            <h2>Login to ETM Machine</h2>
            <div className="step-content">
              <div className="form-group">
                <label>Bus ID</label>
                <input
                  type="text"
                  placeholder="Enter bus ID (e.g., TN01)"
                  value={busId}
                  onChange={(e) => setBusId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
              {loginError && <div className="error-message">{loginError}</div>}
              <button className="btn-primary" onClick={handleLogin}>
                Login
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Location */}
        {step === 2 && (
          <div className="step-card step-2">
            <div className="step-number">Step 2</div>
            <h2>Enable Location</h2>
            <div className="step-content">
              <div className="status-indicator">
                <span className={`dot ${locationStatus.enabled ? 'active' : ''}`}></span>
                <span>Location: {locationStatus.label}</span>
              </div>
              {!locationStatus.enabled ? (
                <>
                  {locationError && <div className="error-message">{locationError}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" onClick={enableLocation}>
                      Turn On Location
                    </button>
                    <button className="btn-secondary" onClick={() => setStep(1)}>
                      Previous
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="check-mark">✓</div>
                  <p className="hint">Location is enabled and being tracked</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" onClick={() => setStep(3)}>
                      Next
                    </button>
                    <button className="btn-secondary" onClick={() => setStep(1)}>
                      Previous
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Cities */}
        {step === 3 && (
          <div className="step-card step-3">
            <div className="step-number">Step 3</div>
            <h2>Route Information</h2>
            <div className="step-content">
              <div className="form-row">
                <div className="form-group">
                  <label>From City</label>
                  <input
                    type="text"
                    placeholder="e.g., Chennai"
                    value={fromCity}
                    onChange={(e) => setFromCity(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>To City</label>
                  <input
                    type="text"
                    placeholder="e.g., Bangalore"
                    value={toCity}
                    onChange={(e) => setToCity(e.target.value)}
                  />
                </div>
              </div>
              {cityError && <div className="error-message">{cityError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={handleAddCities}>
                  Confirm Cities
                </button>
                <button className="btn-secondary" onClick={() => setStep(2)}>
                  Previous
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Intermediates */}
        {step === 4 && (
          <div className="step-card step-4">
            <div className="step-number">Step 4</div>
            <h2>Intermediate Cities</h2>
            <div className="step-content">
              <div className="add-city-form">
                <input
                  type="text"
                  placeholder="Add intermediate city"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addIntermediate()}
                />
                <button className="btn-secondary" onClick={addIntermediate}>
                  Add
                </button>
              </div>

              <div className="cities-list" style={{ marginTop: '20px' }}>
                <h3 style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>Current Route Progression:</h3>
                <div className="route-display" style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  alignItems: 'center', 
                  gap: '10px',
                  padding: '15px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #e9ecef'
                }}>
                  <span className="city" style={{ fontWeight: 'bold', color: '#2196F3' }}>{fromCity}</span>
                  
                  {intermediates.map((city, idx) => (
                    <React.Fragment key={idx}>
                      <span className="arrow" style={{ color: '#adb5bd' }}>→</span>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '5px', 
                        backgroundColor: '#fff', 
                        padding: '4px 10px', 
                        borderRadius: '20px',
                        border: '1px solid #dee2e6',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                      }}>
                        <span className="city">{city}</span>
                        <button
                          className="btn-remove"
                          onClick={() => removeIntermediate(idx)}
                          style={{ 
                            border: 'none', 
                            background: 'none', 
                            color: '#ff4d4d', 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            fontSize: '18px',
                            padding: '0 5px'
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </React.Fragment>
                  ))}
                  
                  <span className="arrow" style={{ color: '#adb5bd' }}>→</span>
                  <span className="city" style={{ fontWeight: 'bold', color: '#4CAF50' }}>{toCity}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={proceedToTickets}>
                  Next - Issue Tickets
                </button>
                <button className="btn-secondary" onClick={() => setStep(3)}>
                  Previous
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Issue Tickets */}
        {step === 5 && (
          <div className="step-card step-5">
            <div className="step-number">Step 5</div>
            <h2>Issue Ticket</h2>
            <div className="step-content">
              {/* Route Summary */}
              <div className="route-summary">
                <p>
                  <strong>Route:</strong> {fromCity} → {toCity}
                </p>
                {intermediates.length > 0 && (
                  <p>
                    <strong>Via:</strong> {intermediates.join(' → ')}
                  </p>
                )}
              </div>

              {/* Passenger Details */}
              <div className="form-row">
                <div className="form-group">
                  <label>Passenger From</label>
                  <select
                    value={passengersFrom}
                    onChange={(e) => setPassengersFrom(e.target.value)}
                  >
                    <option value="">Select</option>
                    <option value={fromCity}>{fromCity}</option>
                    {intermediates.map((city, idx) => (
                      <option key={idx} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Passenger To</label>
                  <select
                    value={passengersTo}
                    onChange={(e) => setPassengersTo(e.target.value)}
                  >
                    <option value="">Select</option>
                    {intermediates.includes(passengersFrom) && (
                      <>
                        {intermediates
                          .slice(intermediates.indexOf(passengersFrom) + 1)
                          .map((city, idx) => (
                            <option key={idx} value={city}>
                              {city}
                            </option>
                          ))}
                        <option value={toCity}>{toCity}</option>
                      </>
                    )}
                    {passengersFrom === fromCity && (
                      <>
                        {intermediates.map((city, idx) => (
                          <option key={idx} value={city}>
                            {city}
                          </option>
                        ))}
                        <option value={toCity}>{toCity}</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Passenger Count */}
              <div className="form-row">
                <div className="form-group counter">
                  <label>Adults</label>
                  <div className="counter-control">
                    <button onClick={() => setAdults(Math.max(0, adults - 1))}>−</button>
                    <span>{adults}</span>
                    <button onClick={() => setAdults(adults + 1)}>+</button>
                  </div>
                </div>
                <div className="form-group counter">
                  <label>Children</label>
                  <div className="counter-control">
                    <button onClick={() => setChildren(Math.max(0, children - 1))}>−</button>
                    <span>{children}</span>
                    <button onClick={() => setChildren(children + 1)}>+</button>
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="form-group">
                <label>Price per Ticket (₹)</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  min="1"
                />
              </div>

              {/* Fare Calculation */}
              {adults + children > 0 && (
                <div className="fare-summary">
                  <p>
                    <strong>Total Passengers:</strong> {adults + children}
                  </p>
                  <p>
                    <strong>Fare per Ticket:</strong> ₹{price}
                  </p>
                  <p className="total">
                    <strong>Total Fare:</strong> ₹{price * (adults + children)}
                  </p>
                </div>
              )}

              {/* Tickets Counter */}
              <div className="tickets-counter">
                <strong>Tickets Issued Today:</strong> {ticketsIssued}
              </div>

              {/* Issue Button */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary btn-issue" onClick={issueTicket}>
                  Pay & Issue Ticket
                </button>
                <button className="btn-secondary" onClick={() => setStep(4)}>
                  Edit Stops
                </button>
                <button 
                  className="btn-secondary" 
                  style={{ backgroundColor: '#ff9800', color: 'white' }}
                  onClick={() => setStep(3)}
                >
                  Change Route
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>TNSTC Smart Bus Ticketing System v1.0</p>
      </footer>
    </div>
  )
}
