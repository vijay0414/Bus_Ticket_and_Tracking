import express from 'express'
import { createTicket, getTickets } from '../controllers/ticketController.js'

const router = express.Router()

router.post('/', createTicket)
router.get('/', getTickets)

export default router
