import express from 'express'
import { registerConductor, updateLocation } from '../controllers/conductorController.js'

const router = express.Router()

router.post('/register', registerConductor)
router.post('/location', updateLocation)

export default router
