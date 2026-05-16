import express from 'express'
import { registerConductor, updateLocation, logoutConductor } from '../controllers/conductorController.js'

const router = express.Router()

router.post('/register', registerConductor)
router.post('/location', updateLocation)
router.post('/logout', logoutConductor)

export default router
