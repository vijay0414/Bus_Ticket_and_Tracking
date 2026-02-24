import mongoose from 'mongoose'

const busSchema = new mongoose.Schema({
  busId: { type: String, required: true, unique: true },
  lat: Number,
  lng: Number,
  ticketsIssued: { type: Number, default: 0 },
  passengersCount: { type: Number, default: 0 },
  fromCity: String,
  toCity: String,
  routeCities: [String],
  nextCity: String,
  lastUpdated: { type: Date, default: Date.now }
})

export default mongoose.model('Bus', busSchema)
