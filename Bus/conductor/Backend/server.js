import express from 'express'
import { geocodeRoute } from './utils/geocoder.js'
import http from 'http'
import fs from 'fs'
import dotenv from 'dotenv'
import cors from 'cors'
import mongoose from 'mongoose'
import { Server } from 'socket.io'

dotenv.config()


// MongoDB Connection
const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus'
mongoose.connect(MONGO)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((e) => console.error('❌ MongoDB error', e))

const app = express()
const server = http.createServer(app)  // ✅ Use HTTP as primary

app.use(express.json())

// ===================== CORS FIX =====================
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true) // allow mobile apps/Postman

    const allowedLocalhost = [
      'http://localhost:5174', 'http://localhost:5173',
      'https://localhost:5174', 'https://localhost:5173',
      'http://127.0.0.1:5174', 'http://127.0.0.1:5173',
      'https://127.0.0.1:5174', 'https://127.0.0.1:5173'
    ]

    const isLAN = /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)/.test(origin)

    if (allowedLocalhost.includes(origin) || isLAN) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS: ' + origin))
    }
  },
  credentials: true
}))
// =====================================================

// ===================== SOCKET.IO =====================
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)

      const allowedLocalhost = [
        'http://localhost:5174', 'http://localhost:5173',
        'https://localhost:5174', 'https://localhost:5173',
        'http://127.0.0.1:5174', 'http://127.0.0.1:5173',
        'https://127.0.0.1:5174', 'https://127.0.0.1:5173'
      ]

      const isLAN = /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)/.test(origin)

      if (allowedLocalhost.includes(origin) || isLAN) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS: ' + origin))
      }
    }
  }
})
app.set('io', io)
// =====================================================

// ROOT ROUTE
app.get("/", (req, res) => {
  res.send("Conductor backend is running (HTTP)")
})

// Routes
import conductorRoutes from './routes/conductorRoutes.js'
import ticketRoutes from './routes/ticketRoutes.js'
app.use('/api/conductor', conductorRoutes)
app.use('/api/tickets', ticketRoutes)

// Bus Model
import Bus from './models/Bus.js'

// ===================== BUS SEARCH =====================
app.get('/api/buses', async (req, res) => {
  const { fromCity, toCity } = req.query
  const filter = {}
  const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  if (fromCity) filter.fromCity = { $regex: new RegExp(`^${escapeRegex(fromCity)}$`, 'i') }
  if (toCity) filter.toCity = { $regex: new RegExp(`^${escapeRegex(toCity)}$`, 'i') }

  filter.isOnline = true

  try {
    const buses = await Bus.find(filter).lean()
    console.log(`🔍 Passenger searched for buses: ${fromCity} → ${toCity}, Found: ${buses.length}`)

    if (fromCity && toCity && buses.length > 0) {
      io.emit('availableBusesUpdate', {
        fromCity,
        toCity,
        buses,
        message: `${buses.length} bus(es) available for ${fromCity} → ${toCity}`
      })
    }

    return res.json({ success: true, data: buses })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
})
// =====================================================

// ===================== GET SPECIFIC BUS =====================
app.get('/api/buses/:busId', async (req, res) => {
  try {
    const { busId } = req.params
    const bus = await Bus.findOne({ busId }).lean()

    if (!bus) {
      return res.status(404).json({ success: false, message: 'Bus not found' })
    }

    console.log(`📍 Fetched bus ${busId} coordinates: lat=${bus.lat}, lng=${bus.lng}`)
    return res.json({ success: true, data: bus })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
})
// ============================================================

/*
// ===================== DELETE BUS =====================
// Deprecated: Use logout endpoint instead. This block is intentionally disabled
app.delete('/api/buses/:busId', async (req, res) => {
  try {
    const { busId } = req.params;
    const Ticket = (await import('./models/Ticket.js')).default;

    const deletedBus = await Bus.deleteOne({ busId });
    const deletedTickets = await Ticket.deleteMany({ busId });

    console.log(`🗑️  Deleted bus ${busId}: ${deletedBus.deletedCount} bus record(s)`);
    console.log(`🗑️  Deleted tickets for ${busId}: ${deletedTickets.deletedCount} ticket(s)`);

    const io = app.get('io');
    if (io) {
      io.emit('busLogout', { busId });
      io.to(`bus:${busId}`).emit('busUpdate', {
        busId,
        ticketsIssued: 0,
        passengersCount: 0,
        deleted: true
      });
    }

    return res.json({
      success: true,
      message: 'Bus data deleted',
      data: {
        busDeleted: deletedBus.deletedCount,
        ticketsDeleted: deletedTickets.deletedCount
      }
    });
  } catch (err) {
    console.error('❌ Delete error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});
// */
// =====================================================

// ===================== QUICK BUS UPDATE =====================
app.post('/api/bus/update', async (req, res) => {
  const { busId, latitude, longitude, ticketsIssued, nextCity, dropOffPassengers } = req.body || {}
  if (!busId) return res.status(400).json({ success: false, message: 'busId required' })

  try {
    const payload = { busId, lat: latitude, lng: longitude, ticketsIssued: ticketsIssued || 0, nextCity, dropOffPassengers }
    await Bus.findOneAndUpdate(
      { busId },
      {
        lat: payload.lat,
        lng: payload.lng,
        ticketsIssued: payload.ticketsIssued,
        nextCity: payload.nextCity,
        lastUpdated: new Date()
      },
      { new: true, upsert: true }
    )

    io.to(`bus:${busId}`).emit('busUpdate', payload)
    io.emit('busUpdate', payload)

    return res.json({ success: true, data: payload })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
})
// =====================================================

// ===================== SOCKET.IO EVENTS =====================
// ===================== GEOFENCING UTILS =====================

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // in meters
}

async function processGeofencing(bus) {
  if (!bus.lat || !bus.lng || !bus.routeLocations || bus.routeLocations.length === 0) return false;
  let updated = false;

  for (const loc of bus.routeLocations) {
    if (bus.reachedCities.includes(loc.name)) continue;

    const distance = calculateDistance(bus.lat, bus.lng, loc.lat, loc.lng);
    
    // If bus is within 500 meters of the stop
    if (distance < 500) {
      console.log(`🎯 Bus ${bus.busId} reached stop: ${loc.name}`);
      bus.reachedCities.push(loc.name);
      
      // Reduce passenger count based on dropOffData for this city
      const dropOff = bus.dropOffData.find(d => d.city === loc.name);
      if (dropOff && dropOff.count > 0) {
        console.log(`📉 Reducing count by ${dropOff.count} passengers at ${loc.name}`);
        bus.passengersCount = Math.max(0, bus.passengersCount - dropOff.count);
      }
      updated = true;
    }
  }
  return updated;
}
// ============================================================

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id)

  socket.on('joinBus', (busId) => {
    if (!busId) return
    socket.busId = busId // ✅ Store for disconnect handling
    socket.join(`bus:${busId}`)
    console.log(`✅ ${socket.id} joined bus room: bus:${busId}`)
  })

  socket.on('leaveBus', (busId) => {
    if (!busId) return
    socket.leave(`bus:${busId}`)
    console.log(`❌ ${socket.id} left bus room: bus:${busId}`)
  })

  socket.on('sendLocationUpdate', async (data) => {
    if (!data || !data.busId) return

    const finalLat = data.latitude !== undefined ? data.latitude : data.lat
    const finalLng = data.longitude !== undefined ? data.longitude : data.lng

    try {
      const updateObj = { 
        lat: finalLat, 
        lng: finalLng, 
        lastUpdated: new Date() 
      }

      const updatedBus = await Bus.findOneAndUpdate(
        { busId: data.busId },
        updateObj,
        { new: true, upsert: true }
      )

      if (updatedBus) {
        const geofenceChanged = await processGeofencing(updatedBus);
        if (geofenceChanged) await updatedBus.save();

        const fullBusData = updatedBus.toObject();
        io.to(`bus:${data.busId}`).emit('busUpdate', fullBusData);
        io.emit('busUpdate', fullBusData);
        console.log(`📍 Socket update for ${data.busId}: lat=${finalLat}, lng=${finalLng}, passengers=${fullBusData.passengersCount}`);
      }
    } catch (err) {
      console.error('❌ Socket update error:', err);
    }
  })
  socket.on('ticketIssued', async (data) => {
    if (!data || !data.busId) return

    try {
      // Find the bus and update passengersCount and dropOffData
      const bus = await Bus.findOne({ busId: data.busId })
      if (bus) {
        bus.ticketsIssued = data.ticketsIssued
        bus.passengersCount = (bus.passengersCount || 0) + (data.totalPassengers || 0)
        
        // Update dropOffData
        if (data.selection?.to) {
          const dropOffCity = data.selection.to
          const cityIndex = bus.dropOffData.findIndex(item => item.city === dropOffCity)
          if (cityIndex > -1) {
            bus.dropOffData[cityIndex].count += (data.totalPassengers || 0)
          } else {
            bus.dropOffData.push({ city: dropOffCity, count: data.totalPassengers || 0 })
          }
        }
        
        bus.lastUpdated = new Date()
        await bus.save()

        const fullData = bus.toObject()
        io.to(`bus:${data.busId}`).emit('busUpdate', fullData)
        io.emit('busUpdate', fullData)
      }
    } catch (err) {
      console.error('❌ Error processing ticketIssued:', err)
    }
  })

  socket.on('disconnect', async () => {
    console.log('❌ Socket disconnected:', socket.id)
    
    if (socket.busId) {
      const busId = socket.busId;
      // Wait 5 seconds before marking offline to handle momentary refreshes
      setTimeout(async () => {
        // Re-check if a new socket has joined for this busId in the meantime
        // (This is a simplified check, ideally track active connections per busId)
        const sockets = await io.in(`bus:${busId}`).fetchSockets();
        if (sockets.length === 0) {
          try {
            await Bus.findOneAndUpdate({ busId }, { isOnline: false });
            io.emit('busLogout', { busId });
            console.log(`🔌 Bus ${busId} marked OFFLINE due to disconnect`);
          } catch (e) {
            console.error('Error in disconnect offline update', e);
          }
        }
      }, 5000);
    }
  })
})
// =====================================================

const PORT = process.env.PORT || 5000

// ===================== START HTTP SERVER =====================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 HTTP Server running on port ${PORT}`)
  console.log(`📌 Access from: http://localhost:${PORT}`)
})
// ===============================================================
