import mongoose from 'mongoose'

const ticketSchema = new mongoose.Schema({
  busId: { type: String, required: true },
  fromCity: String,
  toCity: String,
  routeCities: [String],
  selection: { from: String, to: String },
  passengers: {
    adults: { type: Number, default: 0 },
    children: { type: Number, default: 0 }
  },
  price: { type: Number, default: 0 },
  totalPassengers: { type: Number, default: 0 },
  time: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
})

export default mongoose.model('Ticket', ticketSchema)
