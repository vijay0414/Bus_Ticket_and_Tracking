import mongoose from 'mongoose'

const busSchema = new mongoose.Schema({
  busId: { type: String, required: true, unique: true },
  lat: Number,
  lng: Number,
  isOnline: { type: Boolean, default: false }, // ✅ track if conductor is active
  ticketsIssued: { type: Number, default: 0 },
  passengersCount: { type: Number, default: 0 },
  fromCity: String,
  toCity: String,
  routeCities: [String],
  routeLocations: [{
    name: String,
    lat: Number,
    lng: Number
  }],
  nextCity: String,
  totalSeats: { type: Number, default: 52 },
  dropOffData: [{
    city: String,
    count: { type: Number, default: 0 }
  }],
  reachedCities: { type: [String], default: [] },
  lastUpdated: { type: Date, default: Date.now }
})

export default mongoose.model('Bus', busSchema)
