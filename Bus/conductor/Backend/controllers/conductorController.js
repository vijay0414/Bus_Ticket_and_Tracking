import Bus from '../models/Bus.js'
import { geocodeRoute } from '../utils/geocoder.js'

/**
 * Register or update bus route and metadata (ETM login step)
 */
export const registerConductor = async (req, res) => {
  const { busId, fromCity, toCity, routeCities, password } = req.body || {}
  if (!busId) return res.status(400).json({ success: false, message: 'busId required' })

  try {
    // If this is just a login (no route info provided), don't reset or overwrite route
    if (!fromCity) {
      const existing = await Bus.findOneAndUpdate(
        { busId }, 
        { isOnline: true, lastUpdated: new Date() }, 
        { new: true }
      )
      if (existing) {
        console.log(`✅ Conductor ${busId} resumed previous session and is now ONLINE`)
        // Notify all passengers that this bus is back online
        const io = req.app.get('io')
        if (io) io.emit('busUpdate', existing.toObject())
        
        return res.json({ success: true, data: existing.toObject() })
      }
    }

    // Geocode route cities dynamically
    const routeLocations = await geocodeRoute(routeCities || [fromCity, toCity].filter(Boolean))

    const updated = await Bus.findOneAndUpdate(
      { busId },
      { 
        busId,
        fromCity: fromCity || undefined,
        toCity: toCity || undefined,
        routeCities: routeCities || [],
        routeLocations: routeLocations,
        isOnline: true,            // ✅ Set online status
        lastUpdated: new Date(),
        lat: 0,
        lng: 0,
        ticketsIssued: 0,
        passengersCount: 0,        // Reset for new trip
        dropOffData: [],           // Reset drop-offs
        reachedCities: []          // Reset reached stops
      },
      { new: true, upsert: true }
    )

    const fullData = updated.toObject ? updated.toObject() : updated

    // emit route info so passengers searching that route can see this bus
    const io = req.app.get('io')
    if (io && fromCity && toCity) {
      // 1. Emit to bus room for already-joined passengers
      io.to(`bus:${busId}`).emit('routeData', { 
        busId, 
        fromCity, 
        toCity, 
        routeCities: routeCities || [],
        ...fullData
      })
      
      // 2. Query all buses for this route and emit to all passengers
      const allBuses = await Bus.find({ fromCity, toCity }).lean()
      console.log(`📡 Broadcasting ${allBuses.length} available bus(es) for ${fromCity} → ${toCity}`)
      
      // Emit to all passengers with available buses for this route
      io.emit('availableBusesUpdate', {
        fromCity,
        toCity,
        buses: allBuses,
        message: `New bus available for ${fromCity} → ${toCity}`
      })
      
      // Also emit individual bus update
      io.emit('busUpdate', fullData)
    }

    console.log(`✅ Conductor registered: ${busId} (${fromCity} → ${toCity})`)
    return res.json({ success: true, data: fullData })
  } catch (err) {
    console.error('Register error:', err)
    return res.status(500).json({ success: false, message: err.message })
  }
}

/**
 * Update location and quick status for a bus (called periodically by conductor ETM)
 */
export const updateLocation = async (req, res) => {
  const { busId, latitude, longitude, ticketsIssued, lat, lng, nextCity, dropOffPassengers, fromCity, toCity, routeCities } = req.body || {}
  if (!busId) return res.status(400).json({ success: false, message: 'busId required' })

  try {
    // Use lat/lng if provided, otherwise use latitude/longitude
    const finalLat = latitude !== undefined ? latitude : lat
    const finalLng = longitude !== undefined ? longitude : lng

    const payload = {
      busId,
      lat: finalLat,
      lng: finalLng,
      latitude: finalLat,
      longitude: finalLng,
      ticketsIssued: ticketsIssued ?? 0,
      nextCity: nextCity || undefined,
      dropOffPassengers: dropOffPassengers || 0,
      lastUpdated: new Date()
    }

    // Build update object with optional route info
    const updateObj = {
      lat: payload.lat,
      lng: payload.lng,
      ticketsIssued: payload.ticketsIssued,
      nextCity: payload.nextCity,
      lastUpdated: payload.lastUpdated
    }

    // Add route info and geocode if provided
    if (fromCity) updateObj.fromCity = fromCity
    if (toCity) updateObj.toCity = toCity
    if (routeCities && Array.isArray(routeCities)) {
      updateObj.routeCities = routeCities
      updateObj.routeLocations = await geocodeRoute(routeCities)
      
      // Reset trip data when route is updated
      updateObj.passengersCount = 0
      updateObj.dropOffData = []
      updateObj.reachedCities = []
      updateObj.ticketsIssued = 0
    }

    // update DB entry
    const updated = await Bus.findOneAndUpdate({ busId }, updateObj, { new: true, upsert: true })

    // Get full bus data to send
    const fullBusData = updated.toObject ? updated.toObject() : updated

    // emit to the bus room so only joined passengers receive it
    const io = req.app.get('io')
    if (io) {
      io.to(`bus:${busId}`).emit('busUpdate', { ...fullBusData, ...payload })
      // also emit global fallback
      io.emit('busUpdate', { ...fullBusData, ...payload })
    }

    console.log(`📍 REST location update for bus ${busId}: lat=${finalLat}, lng=${finalLng}, passengers=${fullBusData.passengersCount}, route=${fullBusData.routeCities?.join(' → ') || 'None'}`)
    return res.json({ success: true, data: { ...fullBusData, ...payload } })
  } catch (err) {
    console.error('Location update error:', err)
    return res.status(500).json({ success: false, message: err.message })
  }
}

/**
 * Logout conductor (ETM logout step) - marks bus as offline
 */
export const logoutConductor = async (req, res) => {
  const { busId } = req.body || {}
  if (!busId) return res.status(400).json({ success: false, message: 'busId required' })

  try {
    const updated = await Bus.findOneAndUpdate(
      { busId },
      { isOnline: false, lastUpdated: new Date() },
      { new: true }
    )

    if (updated) {
      const io = req.app.get('io')
      if (io) {
        // Notify all passengers that this bus is offline
        io.emit('busLogout', { busId })
        // Also emit a general update so they remove it from lists
        io.emit('busUpdate', updated.toObject())
      }
      console.log(`❌ Conductor ${busId} logged out (OFFLINE)`)
      return res.json({ success: true, message: 'Logged out successfully' })
    }
    return res.status(404).json({ success: false, message: 'Bus not found' })
  } catch (err) {
    console.error('Logout error:', err)
    return res.status(500).json({ success: false, message: err.message })
  }
}
