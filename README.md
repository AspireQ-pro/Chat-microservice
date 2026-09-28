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
- Per-member read-through receipts for direct and group chats.
- First-contact message requests that require recipient acceptance.
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

### Society Header Chat Notifications

The chat frontend publishes `chat:notification-count` updates to its opener (or
parent frame) whenever unread messages or pending message requests change. The
payload contains `unreadMessages`, `pendingRequests`, and `total`. The society
application listens for this event while the Chat iframe is open. Its dashboard
header also maintains an authenticated Socket.IO connection and refreshes the
same count when the iframe is closed.

Set the optional frontend variable `VITE_SOCIETY_ORIGIN` to the society
application's origin to restrict outgoing messages to that origin. The chat
frontend otherwise uses the document referrer origin, with `*` as a fallback.
The society listener must still validate `event.origin` against the deployed
chat frontend origin.

Example listener for the society application:

```js
const CHAT_FRONTEND_ORIGIN = "https://chat.example.com";

window.addEventListener("message", (event) => {
  if (event.origin !== CHAT_FRONTEND_ORIGIN) return;
  if (event.data?.source !== "chat-microservice") return;
  if (event.data?.type !== "chat:notification-count") return;

  setChatUnreadCount(event.data.total);
});
```

## Environment Variables

### Backend

| Variable                      | Purpose                                                   | Example                                                           |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                | PostgreSQL connection string used by Prisma               | `postgresql://postgres:password@localhost:5433/chat_service`      |
| `CHAT_JWT_SECRET`             | Stable, high-entropy secret used to sign/verify chat JWTs | Generate at least 32 random characters                            |
| `MESSAGE_ENC_KEY`             | Separate, stable secret for message encryption at rest    | Generate independently; never rotate without a re-encryption plan |
| `PROJECT_REGISTRATION_SECRET` | Secret required by `POST /api/projects`                   | Generate independently                                            |
| `CHAT_FRONTEND_URL`           | Public Chat UI URL returned with session tokens           | `https://chat.example.com`                                        |
| `CORS_ORIGIN`                 | Comma-separated Chat and Society HTTPS origins            | `https://chat.example.com,https://society.example.com`            |
| `PORT`                        | Backend server port                                       | `5000`                                                            |
| `BACKEND_URL`                 | Public backend URL used for upload links                  | `http://localhost:5000`                                           |

Production startup fails if secrets, HTTPS URLs, or explicit CORS origins are missing. Do not use placeholder values. Copy the root `.env.example` to `.env`, fill it locally, and keep `.env` out of source control.

### Frontend

| Variable               | Purpose                                                                  | Example                       |
| ---------------------- | ------------------------------------------------------------------------ | ----------------------------- |
| `VITE_API_URL`         | Backend REST API base URL                                                | `http://localhost:5000`       |
| `VITE_SOCKET_URL`      | Socket.IO backend URL                                                    | `http://localhost:5000`       |
| `VITE_SOCIETY_ORIGIN`  | Optional allowed origin for chat notification messages to the parent app | `https://society.example.com` |
| `VITE_ALLOW_DEV_LOGIN` | Enables mock login in development                                        | `true`                        |
| `VITE_DEV_USER_ID`     | Mock user ID for local development                                       | `dev-user-001`                |
| `VITE_DEV_USER_NAME`   | Mock user name for local development                                     | `Dev User`                    |
| `VITE_DEV_USER_EMAIL`  | Mock user email for local development                                    | `dev@example.com`             |

## Running With Docker Compose

From the project root, first configure every required value in `.env` (the example hostnames must be replaced with your actual HTTPS domains):

```bash
docker compose up --build
```

Services:

- PostgreSQL: `localhost:5433`
- Backend: `http://localhost:5000`
- Frontend: `http://localhost:3001`

The backend container runs Prisma migrations before starting. **Do not deploy until the checked-in migration history has been reconciled with the actual database and a clean-database migration test passes.** The current target in `Backend/.env` returned `P1003: Database chatdb does not exist` during read-only status inspection, so production migration status and backup have not been verified.

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
X-REGISTRATION-SECRET: project-registration-secret
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

### Look Up An Existing Direct Room

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

Returns an existing room. It does not create an empty room; an absent conversation returns 404.

### Send The First Direct Message

Contact selection is local-only. The first message creates the room, stores the opening message, and notifies the recipient in one transaction:

```http
POST /api/rooms/direct/request
Authorization: Bearer jwt-chat-token
Content-Type: application/json
```

```json
{ "userId2": "other-user-id", "content": "Hello" }
```

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
  "memberIds": ["user-id-1", "user-id-2"]
}
```

The creator is always taken from the authenticated JWT. All group members receive a `group_created` socket event.

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
  "roomId": "room-id"
}
```

Group read state is tracked using each member's `lastReadAt`; message responses include `readBy` and `recipientCount` derived from those read-through timestamps.

### Upload An Attachment

Uploads are limited to 10 MiB and JPEG, PNG, GIF, WebP, or PDF. The caller must be a member of the room. The returned URL is private and requires the same Chat JWT when loaded.

```http
POST /api/rooms/:roomId/upload
Authorization: Bearer jwt-chat-token
Content-Type: multipart/form-data
```

Form field: `file`. Images render in the conversation; PDFs open in a new tab.

## Socket.IO Events

The client connects with the JWT token:

```js
io("http://localhost:5000", {
  auth: {
    token: "jwt-chat-token",
  },
});
```

### Client To Server

| Event              | Payload                                            | Purpose                                          |
| ------------------ | -------------------------------------------------- | ------------------------------------------------ |
| `user_online`      | `userId`                                           | Marks a user as online and updates `lastSeenAt`. |
| `get_online_users` | none                                               | Requests online users for the project.           |
| `join_room`        | `roomId`                                           | Joins a Socket.IO room.                          |
| `send_message`     | `{ roomId, senderId, content, fileUrl, fileType }` | Sends a text, image, or file message.            |

### Server To Client

| Event          | Payload        | Purpose                                  |
| -------------- | -------------- | ---------------------------------------- |
| `online_users` | `string[]`     | List of online user IDs for the project. |
| `new_message`  | message object | Broadcasts a newly created message.      |
| `error`        | `{ message }`  | Emits socket-level errors.               |

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

| Route       | Purpose                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| `/`         | Main chat page. Requires a chat token unless development mock login is enabled. |
| `/register` | Project registration page.                                                      |

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

- The migration chain does not create the current `Project`/`ChatUser` schema; fresh database deployment remains blocked pending reconciliation with the actual database and a clean-database test.
- The production database target in `Backend/.env` currently reports `P1003: Database chatdb does not exist`; no production backup or migration was attempted.
- There is no automated test suite yet.
- Existing `Message.isRead` remains as a legacy direct-chat compatibility field; group read state and group read receipts use `ChatRoomMember.lastReadAt`.
- Single attachments are supported through the authenticated room upload route; production deployments should move files to private object storage and add malware scanning/retention policy.

## Production Recommendations

- Store `CHAT_JWT_SECRET`, `MESSAGE_ENC_KEY`, database credentials, and `PROJECT_REGISTRATION_SECRET` in a secret manager.
- Keep the encryption key stable; changing it makes existing encrypted rows unreadable without re-encryption.
- Back up the actual production DB and reconcile migrations before any deploy.
- Use only public HTTPS URLs and allowlisted HTTPS CORS origins.
- Store uploads in private object storage and add malware scanning/retention policy for production deployments.
- Add API rate limiting.
- Add request validation for all routes.
- Add structured logging.
- Add backend integration tests for auth, tenancy, rooms, messages, and uploads.
- Add frontend tests for major chat flows.
- Add CI checks for linting, builds, Prisma validation, and tests.

### Project registration

`POST /api/projects` requires the `X-REGISTRATION-SECRET` header. Configure
`PROJECT_REGISTRATION_SECRET` on the backend and never expose it in a production
browser. The `/register` page is available only in development.

## License

The backend package currently declares the `ISC` license.
