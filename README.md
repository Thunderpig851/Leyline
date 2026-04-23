# Leyline

Leyline is a browser-based remote tabletop companion for Magic: The Gathering play. It combines live room management, video table play, in-game state tracking, chat, and card recognition into one app so a pod can sit down, stream their board, and actually run a game together.

This project includes:

- A React + Vite frontend for the lobby, join flow, live game UI, chat, card log, and OCR interactions
- A Node/Express backend for auth, rooms, live game state, chat, and card identification proxying
- An OCR microservice for card title extraction
- Live video/signaling infrastructure built around mediasoup and Socket.IO

Leyline is a fan-built project and is not affiliated with Wizards of the Coast.

## What Leyline Does

- Create and join public or private game rooms
- Run live Commander or duel-style tables in the browser
- Track seat state like ready, AFK, monarch, initiative, day/night, life, poison, energy, and experience
- Manage commanders, commander damage, and seat ordering
- Chat in-room while playing
- Click a card on a player stream and identify it with OpenCV + OCR
- Log recognized cards and link out to Scryfall and TCGplayer

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Tailwind, Socket.IO client
- Backend: Node.js, Express, Mongoose, Socket.IO, mediasoup
- OCR: Node + `@gutenye/ocr-node`
- Data: MongoDB

## Project Layout

```text
leyline/
├── web/                 # React frontend
├── server/              # Express API + live game + mediasoup signaling
├── ocr-service/         # OCR service used by card identification
├── docker-compose.yaml  # Local development stack
└── docker-compose.prod.yaml
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Docker + Docker Compose if you want the easiest local startup
- A MongoDB instance you can point `MONGO_URI` at

### 1. Create the server env file

Create `server/.env` with at least:

```env
PORT=3001
MONGO_URI=mongodb://127.0.0.1:27017/leyline
JWT_SECRET=change-me
CLIENT_ORIGIN=http://localhost:5173
OCR_SERVICE_URL=http://localhost:8000
REQUEST_BODY_LIMIT=50mb
OCR_PROXY_TIMEOUT_MS=30000
```

Optional mediasoup/network tuning:

```env
MEDIASOUP_ANNOUNCED_IP=127.0.0.1
MEDIASOUP_INITIAL_OUTGOING_BITRATE=6000000
MEDIASOUP_MAX_INCOMING_BITRATE=6000000
```

`web/.env` exists, but for local development it can stay empty unless you want to add frontend-specific overrides.

### 2. Install dependencies

There is no root workspace package. Install dependencies per service:

```bash
cd web && npm install
cd ../server && npm install
cd ../ocr-service && npm install
```

### 3. Start the project

#### Option A: Docker Compose

This is the easiest way to run everything together in development:

```bash
docker compose up --build
```

That starts:

- Web app on `http://localhost:5173`
- API server on `http://localhost:3001`
- OCR service on `http://localhost:8000`

Note: the local compose file does not start MongoDB. Your `MONGO_URI` still needs to point to a running database.

#### Option B: Run each service manually

In three terminals:

```bash
cd ocr-service && npm run dev
```

```bash
cd server && npm run dev
```

```bash
cd web && npm run dev
```

## Useful Commands

### Frontend

```bash
cd web
npm run dev
npm run build
npm run lint
```

### Server

```bash
cd server
npm run dev
npm start
```

### OCR service

```bash
cd ocr-service
npm run dev
npm start
```

## Production Notes

The production stack is defined in `docker-compose.prod.yaml`.

It runs:

- `web` behind nginx
- `server`
- `ocr-service`

Production currently expects:

- `server/.env` to exist on the host
- TLS certificates mounted from `/etc/letsencrypt`
- mediasoup ports `40000-40100` open for UDP/TCP if you need external connectivity

Typical deploy flow:

```bash
docker compose -f docker-compose.prod.yaml down
docker compose -f docker-compose.prod.yaml up -d --build
docker compose -f docker-compose.prod.yaml ps
```

## A Few Things Worth Calling Out

- Card recognition is assistive, not authoritative. OCR can be wrong, especially on low-quality or angled captures.
- Scryfall and TCGplayer links are integrations, not first-party Leyline data sources.
- The app is built around live game rooms, not just static card lookup. The combination of stream interaction, table state, and OCR is the point.

## If You’re Exploring the Codebase

- Start in [web/src/pages/GamePage.tsx](/Users/camestep/Desktop/App%20State/Capstone/leyline/web/src/pages/GamePage.tsx) for the main in-game experience
- Check [server/src/api/games/index.js](/Users/camestep/Desktop/App%20State/Capstone/leyline/server/src/api/games/index.js) for live game state APIs
- Check [server/src/middleware/liveGamePresence.js](/Users/camestep/Desktop/App%20State/Capstone/leyline/server/src/middleware/liveGamePresence.js) for connection/away handling
- Check [web/src/card-id/identifyCard.ts](/Users/camestep/Desktop/App%20State/Capstone/leyline/web/src/card-id/identifyCard.ts) and [ocr-service/index.js](/Users/camestep/Desktop/App%20State/Capstone/leyline/ocr-service/index.js) for the card identification pipeline
