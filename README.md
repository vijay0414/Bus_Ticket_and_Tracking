# SmartBus - Real-time Bus Ticketing & Tracking System

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)

SmartBus is a comprehensive, real-time ecosystem designed to modernize public transportation. It consists of a **Conductor ETM (Electronic Ticketing Machine)** and a **Passenger Tracking App**, connected via a high-performance backend using WebSockets for instantaneous updates.

---

##  Key Features

###  For Conductors (ETM Module)
- **Live GPS Broadcasting**: Real-time location sharing with passengers.
- **Digital Ticketing**: Seamlessly issue tickets for adults and children.
- **Smart Geofencing**: Automatic passenger count reduction when the bus reaches a stop.
- **Route Management**: Easy registration of starting, ending, and intermediate cities.
- **Persistent Sessions**: Conductor data remains safe even after logout or refresh.

###  For Passengers
- **Real-time Tracking**: See exactly where your bus is on the map.
- **Seat Availability**: Live updates on how many seats are remaining.
- **Dynamic Search**: Find buses based on your origin and destination.
- **Smart Notifications**: Instant alerts for bus arrivals and ticket updates.

---

##  Technology Stack

- **Backend**: Node.js, Express.js
- **Frontend**: React (Vite), CSS3
- **Database**: MongoDB (Mongoose)
- **Real-time**: Socket.IO
- **Geolocation**: Browser Geolocation API + Custom Geofencing Logic

---

##  Project Structure

```text
Bus_Ticket_and_Tracking/
├── Bus/
│   ├── conductor/
│   │   ├── Backend/      # Express server + Socket.io logic
│   │   └── frontend/     # Conductor ETM React App
│   └── passenger/
│       └── frontend/     # Passenger Tracking React App
└── README.md
```

---

##  Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.x or higher)
- [MongoDB](https://www.mongodb.com/try/download/community) installed and running locally
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### 1. Clone the Repository
```bash
git clone https://github.com/vijay0414/Bus_Ticket_and_Tracking.git
cd Bus_Ticket_and_Tracking
```

### 2. Setup the Backend
```bash
cd Bus/conductor/Backend
npm install
npm start
```
*The server will run on `http://localhost:5000`*

### 3. Setup Conductor Frontend
```bash
cd Bus/conductor/frontend
npm install
npm run dev
```
*Open `http://localhost:5173` to access the ETM interface.*

### 4. Setup Passenger Frontend
```bash
cd Bus/passenger/frontend
npm install
npm run dev
```
*Open `http://localhost:5174` to track your bus.*

---

##  API & WebSocket Events

### REST API (Port 5000)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/buses` | `GET` | Search for online buses by route |
| `/api/tickets` | `POST` | Issue a new digital ticket |
| `/api/bus/update` | `POST` | Manually update bus location/state |

### Socket.IO Events
| Event | Direction | Payload |
| :--- | :--- | :--- |
| `joinBus` | Client → Server | `{ busId }` |
| `busUpdate` | Server → Client | `{ lat, lng, passengersCount, ticketsIssued ... }` |
| `availableBusesUpdate` | Server → Client | List of buses for a specific route |

---

##  Roadmap
- [ ] **Authentication**: Secure login for conductors.
- [ ] **Payments**: Integrated UPI/Card payments for tickets.
- [ ] **Admin Dashboard**: Analytics for bus fleet management.

---





