import express from 'express'
import https from 'https'
import fs from 'fs'
import dotenv from 'dotenv'
import cors from 'cors'
import mongoose from 'mongoose'
import { Server } from 'socket.io'

dotenv.config()

// ==================== SSL CERTIFICATES ====================
const sslOptions = {
  key: fs.readFileSync("./cert/server.key"),
  cert: fs.readFileSync("./cert/server.crt"),
  ca: fs.readFileSync("./cert/rootCA.pem")
};

console.log("🔐 HTTPS certificates loaded successfully");
// ==========================================================

// MongoDB Connection
const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus'
mongoose.connect(MONGO)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((e) => console.error('❌ MongoDB error', e))

const app = express()
const server = https.createServer(sslOptions, app)  // ✅ Use HTTPS as primary

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
  res.send("Conductor backend is running (HTTPS)")
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

// ===================== DELETE BUS =====================
app.delete('/api/buses/:busId', async (req, res) => {
  try {
    const { busId } = req.params

    const Ticket = (await import('./models/Ticket.js')).default

    const deletedBus = await Bus.deleteOne({ busId })
    const deletedTickets = await Ticket.deleteMany({ busId })

    console.log(`🗑️  Deleted bus ${busId}: ${deletedBus.deletedCount} bus record(s)`)
    console.log(`🗑️  Deleted tickets for ${busId}: ${deletedTickets.deletedCount} ticket(s)`)

    const io = app.get('io')
    if (io) {
      io.emit('busLogout', { busId })
      io.to(`bus:${busId}`).emit('busUpdate', {
        busId,
        ticketsIssued: 0,
        passengersCount: 0,
        deleted: true
      })
    }

    return res.json({
      success: true,
      message: 'Bus data deleted',
      data: {
        busDeleted: deletedBus.deletedCount,
        ticketsDeleted: deletedTickets.deletedCount
      }
    })
  } catch (err) {
    console.error('❌ Delete error:', err)
    return res.status(500).json({ success: false, message: err.message })
  }
})
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
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id)

  socket.on('joinBus', (busId) => {
    if (!busId) return
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
      // Build update object with location and optional route info
      const updateObj = {
        lat: finalLat,
        lng: finalLng,
        ticketsIssued: data.ticketsIssued || 0,
        lastUpdated: new Date()
      }

      // Add route info if provided
      if (data.fromCity) updateObj.fromCity = data.fromCity
      if (data.toCity) updateObj.toCity = data.toCity
      if (data.routeCities && Array.isArray(data.routeCities)) updateObj.routeCities = data.routeCities

      const updated = await Bus.findOneAndUpdate(
        { busId: data.busId },
        updateObj,
        { new: true, upsert: true }
      )

      const fullBusData = updated.toObject ? updated.toObject() : updated

      // Emit to bus room
      io.to(`bus:${data.busId}`).emit('busUpdate', {
        ...fullBusData,
        lat: finalLat,
        lng: finalLng,
        latitude: finalLat,
        longitude: finalLng,
        lastUpdated: new Date()
      })

      // Also emit globally
      io.emit('busUpdate', {
        ...fullBusData,
        lat: finalLat,
        lng: finalLng,
        latitude: finalLat,
        longitude: finalLng,
        lastUpdated: new Date()
      })

      console.log(`📍 Socket location update for bus ${data.busId}: lat=${finalLat}, lng=${finalLng}, route=${data.routeCities?.join(' → ') || 'N/A'}`)
    } catch (err) {
      console.error(`❌ Error updating location for bus ${data.busId}:`, err)
    }
  })

  socket.on('ticketIssued', (data) => {
    if (!data || !data.busId) return

    io.to(`bus:${data.busId}`).emit('busUpdate', {
      busId: data.busId,
      ticketsIssued: data.ticketsIssued,
      lastUpdated: new Date()
    })

    io.emit('busUpdate', {
      busId: data.busId,
      ticketsIssued: data.ticketsIssued,
      lastUpdated: new Date()
    })
  })

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected:', socket.id)
  })
})
// =====================================================

const PORT = process.env.PORT || 5000

// ===================== START HTTPS SERVER =====================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🔐 HTTPS Server running on port ${PORT}`)
  console.log(`📌 Access from: https://10.194.216.102:${PORT} (LAN IP)`)
  console.log(`📌 Access from: https://localhost:${PORT} (if SAN includes localhost)`)
})
// ===============================================================
