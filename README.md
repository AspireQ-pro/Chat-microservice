# Chat Microservice

A full-stack multi-tenant chat microservice built with Node.js, Express, Socket.IO, Prisma, PostgreSQL, React, Vite, Redux Toolkit, and Material UI.

This project is designed to be embedded into other applications. A parent/project backend registers with the chat service, syncs its users through an API key, receives a short-lived chat token, and then opens the React chat UI with that token.

## Features

- Multi-project chat isolation using project API keys.
- Server-to-server user sync endpoint.
- JWT-based chat sessions for frontend users.
- One-to-one direct chats.
- Group chat creation.
- Real-time messaging with Socket.IO.
- Online user presence.
- Message history persistence with PostgreSQL.
- Basic read receipts.
- File and image upload support.
- React chat UI with responsive mobile/desktop layout.
- Docker Compose setup for database, backend, and frontend.

## Project Structure

```text
Chat-microservice/
├── Backend/
│   ├── index.js
│   ├── package.json
│   ├── Dockerfile
│   ├── prisma.config.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── uploads/
├── Frontend/
│   ├── index.html
│   ├── package.json
│   ├── Dockerfile
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── ChatPage.jsx
│       ├── main.jsx
│       ├── handler/
│       ├── provider/
│       ├── services/
│       └── components/
└── docker-compose.yml
```

## Technology Stack

### Backend

- Node.js
- Express 5
- Socket.IO
- Prisma ORM
- PostgreSQL
- JSON Web Tokens
- Multer for uploads

### Frontend

- React 18
- Vite
- Redux Toolkit
- React Redux
- React Router
- Material UI
- Socket.IO Client

### Infrastructure

- Docker
- Docker Compose
- PostgreSQL 16 Alpine

## How The System Works

1. An admin registers a project with the chat service.
2. The chat service returns an API key for that project.
3. The parent application stores this API key on its own backend.
4. When a user opens chat from the parent app, the parent backend calls the chat service `/api/users/sync` endpoint with `X-API-KEY`.
5. The chat service creates or updates the user inside that project.
6. The chat service returns a JWT token for the synced chat user.
7. The parent app opens the frontend chat URL with the token in the query string.
8. The frontend reads the token, stores user details in Redux, removes the token from the URL, and connects to the backend.
9. REST APIs load users, rooms, and messages.
10. Socket.IO handles online status and new messages in real time.

## Environment Variables

### Backend

| Variable | Purpose | Example |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma | `postgresql://postgres:password@localhost:5433/chat_service` |
| `CHAT_JWT_SECRET` | Secret used to sign and verify chat JWT tokens | `replace-with-a-long-random-secret` |
| `PORT` | Backend server port | `5000` |
| `BACKEND_URL` | Public backend URL used for upload links | `http://localhost:5000` |

Important: the backend code currently reads `CHAT_JWT_SECRET`. Make sure Docker and local env files use that exact variable name.

### Frontend

| Variable | Purpose | Example |
| --- | --- | --- |
| `VITE_API_URL` | Backend REST API base URL | `http://localhost:5000` |
| `VITE_SOCKET_URL` | Socket.IO backend URL | `http://localhost:5000` |
| `VITE_ALLOW_DEV_LOGIN` | Enables mock login in development | `true` |
| `VITE_DEV_USER_ID` | Mock user ID for local development | `dev-user-001` |
| `VITE_DEV_USER_NAME` | Mock user name for local development | `Dev User` |
| `VITE_DEV_USER_EMAIL` | Mock user email for local development | `dev@example.com` |

## Running With Docker Compose

From the project root:

```bash
docker compose up --build
```

Services:

- PostgreSQL: `localhost:5433`
- Backend: `http://localhost:5000`
- Frontend: `http://localhost:3001`

The backend container runs Prisma migrations before starting:

```bash
npx prisma migrate deploy && node index.js
```

## Running Locally

### 1. Start PostgreSQL

You can start only the database with Docker:

```bash
docker compose up chat-db
```

### 2. Install Backend Dependencies

```bash
cd Backend
npm install
```

### 3. Configure Backend Environment

Create a backend environment file with values similar to:

```env
DATABASE_URL=postgresql://postgres:Yogesh@1234@localhost:5433/chat_service
CHAT_JWT_SECRET=replace-with-a-long-random-secret
BACKEND_URL=http://localhost:5000
PORT=5000
```

### 4. Generate Prisma Client And Run Migrations

```bash
npx prisma generate
npx prisma migrate deploy
```

### 5. Start Backend

```bash
npm run dev
```

### 6. Install Frontend Dependencies

```bash
cd ../Frontend
npm install
```

### 7. Start Frontend

```bash
npm run dev
```

Frontend should be available at:

```text
http://localhost:3001
```

## Backend API

### Health Check

```http
GET /
```

Returns:

```json
{
  "status": "Chat service is running"
}
```

### Register Project

```http
POST /api/projects
Content-Type: application/json
```

Body:

```json
{
  "name": "Society Management"
}
```

Returns a project ID and API key:

```json
{
  "id": "project-id",
  "name": "Society Management",
  "apiKey": "ck_generated_api_key"
}
```

### Sync User

Called by the parent application's backend.

```http
POST /api/users/sync
X-API-KEY: ck_generated_api_key
Content-Type: application/json
```

Body:

```json
{
  "id": "external-user-id",
  "name": "John Doe",
  "email": "john@example.com"
}
```

Returns:

```json
{
  "token": "jwt-chat-token",
  "user": {
    "id": "chat-user-id",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### Search Users

```http
GET /users?excludeId=user-id&q=john
Authorization: Bearer jwt-chat-token
```

Returns all matching users in the authenticated project.

### List Rooms For User

```http
GET /users/:userId/rooms
Authorization: Bearer jwt-chat-token
```

Returns direct and group rooms for the user.

### Create Or Get Direct Room

```http
POST /rooms/direct
Authorization: Bearer jwt-chat-token
Content-Type: application/json
```

Body:

```json
{
  "userId1": "current-user-id",
  "userId2": "other-user-id"
}
```

Returns an existing or newly created one-to-one room.

### Create Group Room

```http
POST /rooms/group
Authorization: Bearer jwt-chat-token
Content-Type: application/json
```

Body:

```json
{
  "name": "Block A Residents",
  "creatorId": "current-user-id",
  "memberIds": ["user-id-1", "user-id-2"]
}
```

Returns the created group room.

### Get Room Details

```http
GET /rooms/:roomId
Authorization: Bearer jwt-chat-token
```

Returns room metadata and members.

### Get Room Messages

```http
GET /rooms/:roomId/messages
Authorization: Bearer jwt-chat-token
```

Returns messages ordered by creation time.

### Mark Messages As Read

```http
POST /messages/read
Authorization: Bearer jwt-chat-token
Content-Type: application/json
```

Body:

```json
{
  "roomId": "room-id",
  "userId": "current-user-id"
}
```

### Upload File

```http
POST /upload
Authorization: Bearer jwt-chat-token
Content-Type: multipart/form-data
```

Form field:

```text
file
```

Returns:

```json
{
  "fileUrl": "http://localhost:5000/uploads/file-name",
  "fileType": "image"
}
```

## Socket.IO Events

The client connects with the JWT token:

```js
io("http://localhost:5000", {
  auth: {
    token: "jwt-chat-token"
  }
})
```

### Client To Server

| Event | Payload | Purpose |
| --- | --- | --- |
| `user_online` | `userId` | Marks a user as online and updates `lastSeenAt`. |
| `get_online_users` | none | Requests online users for the project. |
| `join_room` | `roomId` | Joins a Socket.IO room. |
| `send_message` | `{ roomId, senderId, content, fileUrl, fileType }` | Sends a text, image, or file message. |

### Server To Client

| Event | Payload | Purpose |
| --- | --- | --- |
| `online_users` | `string[]` | List of online user IDs for the project. |
| `new_message` | message object | Broadcasts a newly created message. |
| `error` | `{ message }` | Emits socket-level errors. |

## Database Models

### Project

Represents an external application or tenant using this chat service.

Fields include:

- `id`
- `name`
- `apiKey`
- `isActive`
- `createdAt`

### ChatUser

Represents a synced user from a project.

Fields include:

- `id`
- `projectId`
- `externalUserId`
- `name`
- `email`
- `avatarUrl`
- `lastSeenAt`
- `createdAt`

### ChatRoom

Represents a direct or group room.

Fields include:

- `id`
- `projectId`
- `name`
- `isGroup`
- `lastMessageAt`
- `lastMessagePreview`
- `createdAt`

### ChatRoomMember

Join table between rooms and users.

Fields include:

- `roomId`
- `userId`
- `joinedAt`

### Message

Represents a chat message.

Fields include:

- `id`
- `roomId`
- `senderId`
- `content`
- `messageType`
- `fileUrl`
- `fileType`
- `isRead`
- `readAt`
- `createdAt`

## Frontend Overview

### Main Files

- `src/App.jsx` sets up theme, routing, and authentication handling.
- `src/ChatPage.jsx` composes the chat layout.
- `src/handler/useSSOAuth.js` reads the token from the URL and stores auth state.
- `src/handler/chat.js` contains the main chat UI logic.
- `src/provider/authSlice.js` stores user and token data.
- `src/provider/chatSlice.js` stores contacts, rooms, messages, unread counts, and socket status.
- `src/services/socket.js` creates and manages the Socket.IO client.

### UI Components

- `ContactPanel` displays people and groups.
- `ContactItem` displays one-to-one contacts.
- `GroupItem` displays group rooms.
- `ChatWindow` displays the active chat and message input.
- `MessageBubble` renders text, image, and file messages.
- `CreateGroupDialog` creates group chats.
- `GroupMembersDialog` displays group members.
- `RegisterProject` provides a simple project registration page.

## Frontend Routes

| Route | Purpose |
| --- | --- |
| `/` | Main chat page. Requires a chat token unless development mock login is enabled. |
| `/register` | Project registration page. |

## Parent App Integration Example

The parent application's backend should call:

```http
POST http://chat-backend-url/api/users/sync
X-API-KEY: project-api-key
Content-Type: application/json
```

Then redirect or open the chat frontend:

```text
http://chat-frontend-url/?token=jwt-chat-token
```

The frontend removes the token from the address bar after reading it.

## Build Commands

### Backend

```bash
cd Backend
npm install
npm run dev
```

### Frontend

```bash
cd Frontend
npm install
npm run build
npm run preview
```

## Current Known Issues

- Prisma migrations appear to be older than the current Prisma schema. Fresh deployments should be checked carefully.
- `docker-compose.yml` currently uses `JWT_SECRET`, but the backend expects `CHAT_JWT_SECRET`.
- Frontend upload requests should include the bearer token because `/upload` is authenticated.
- Several backend routes and socket events trust user IDs supplied by the client. They should use the authenticated JWT user ID instead.
- Socket room joins and message sends should verify room membership.
- File uploads do not currently enforce size limits or MIME allowlists.
- Uploaded file URLs are currently generated with `localhost` instead of the configured public backend URL.
- Project registration is public and should be protected before production use.
- There is no automated test suite yet.

## Production Recommendations

- Store secrets in environment variables or a secret manager.
- Use a strong stable `CHAT_JWT_SECRET`.
- Protect project registration with admin authentication.
- Restrict CORS origins instead of using `origin: "*"`.
- Add file size limits and file type validation.
- Store uploads in object storage for production deployments.
- Add API rate limiting.
- Add request validation for all routes.
- Add structured logging.
- Add backend integration tests for auth, tenancy, rooms, messages, and uploads.
- Add frontend tests for major chat flows.
- Add CI checks for linting, builds, Prisma validation, and tests.

## License

The backend package currently declares the `ISC` license.
