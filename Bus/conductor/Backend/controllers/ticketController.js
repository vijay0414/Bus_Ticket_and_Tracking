import Ticket from '../models/Ticket.js'
import Bus from '../models/Bus.js'

/** Create ticket and emit updated counts to bus room */
export const createTicket = async (req, res) => {
  try {
    const payload = req.body || {}
    const ticket = await Ticket.create(payload)

    // recompute totals for the bus
    const tickets = await Ticket.find({ busId: ticket.busId })
    const ticketsIssued = tickets.length
    
    // Calculate total passengers from all tickets (adults + children)
    const passengersCount = tickets.reduce((acc, t) => {
      const adults = t.passengers?.adults || 0
      const children = t.passengers?.children || 0
      const ticketPassengers = adults + children
      console.log(`  Ticket: ${adults} adults + ${children} children = ${ticketPassengers} passengers`)
      return acc + ticketPassengers
    }, 0)

    console.log(`📊 Bus ${ticket.busId} totals: ${ticketsIssued} tickets, ${passengersCount} passengers`)

    // update Bus counters
    await Bus.findOneAndUpdate(
      { busId: ticket.busId }, 
      { 
        ticketsIssued, 
        passengersCount,
        lastUpdated: new Date()
      }, 
      { upsert: true }
    )

    const io = req.app.get('io')
    const updatePayload = { 
      busId: ticket.busId, 
      ticketsIssued, 
      passengersCount,
      lastUpdated: new Date()
    }
    
    if (io) {
      // Emit to all passengers on this bus
      io.to(`bus:${ticket.busId}`).emit('busUpdate', updatePayload)
      // Also emit globally as fallback
      io.emit('busUpdate', updatePayload)
      
      console.log(`✅ Emitted busUpdate: ${ticketsIssued} tickets, ${passengersCount} passengers`)
    }

    return res.status(201).json({ success: true, data: { ...ticket.toObject(), ticketsIssued, passengersCount } })
  } catch (err) {
    console.error('❌ Ticket creation error:', err)
    return res.status(500).json({ success: false, message: err.message })
  }
}

export const getTickets = async (req, res) => {
  try {
    const { busId } = req.query
    const filter = busId ? { busId } : {}
    const tickets = await Ticket.find(filter).lean()
    return res.json({ success: true, data: tickets })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}
