# 🌱 Uddyog Server - Social Development Events Platform API

## 🚀 Project Purpose

**Uddyog Server** is the backend infrastructure powering the Uddyog social development events platform. Built with Node.js, Express, MongoDB, and Firebase Authentication, this robust RESTful API enables communities to create, join, and manage social service events like road cleaning, tree plantation, and donation drives in their local areas.

#### **Live API URL**: [https://uddyog-server.vercel.app](https://uddyog-server.vercel.app)

#### **Live Frontend URL**: [https://uddyog-client.vercel.app](https://uddyog-client.vercel.app)

## 🌟 Key Features

- 🎯 **Event Management**

  - Complete CRUD operations for social development events
  - Upcoming events filtering with search and type-based queries
  - Event joining system with user tracking
  - Creator-based event ownership and management
  - Date validation to ensure only future events

- 🔐 **Authentication & Security**

  - Firebase Authentication integration
  - JWT token-based authorization
  - Protected routes for authenticated users
  - User email verification for secure operations
  - Environment variable protection for sensitive data

- 📊 **Advanced Filtering & Search**

  - Search events by title with regex pattern matching
  - Filter events by type (Cleanup, Plantation, Donation, etc.)
  - Pagination support for large datasets
  - Date-based sorting for upcoming events

- 🔄 **User Event Tracking**

  - Track events created by individual users
  - Monitor events joined by users
  - Prevent duplicate event joining
  - User-specific event management capabilities

- ⭐ **Event Rating & Review System**

  - **5-Star Rating System** - Users can rate events from 1-5 stars
  - **Post-Event Reviews** - Detailed review submission after event completion
  - **Review Validation** - Only event participants can submit reviews
  - **Rating Analytics** - Calculate average ratings and distribution statistics
  - **Review Management** - Users can update their existing reviews
  - **Review Security** - JWT authentication and permission validation
  - **Review Aggregation** - MongoDB aggregation for rating calculations

- 🛠️ **Server Configuration**
  - Firebase Admin SDK integration
  - MongoDB native driver with ServerApiVersion v1
  - CORS enabled for cross-origin requests
  - Comprehensive error handling and validation

## 🔧 Used Technologies

### 📦 Core Packages

| Package          | Purpose                         |
| ---------------- | ------------------------------- |
| `express`        | Web server framework            |
| `mongodb`        | MongoDB native driver           |
| `firebase-admin` | Firebase authentication service |
| `jsonwebtoken`   | JWT token management            |
| `cors`           | Cross-origin resource sharing   |
| `dotenv`         | Environment variable management |

## 📝 API Endpoints

### 🎪 Event Routes

| Method | Endpoint           | Description                    | Access    |
| ------ | ------------------ | ------------------------------ | --------- |
| GET    | `/events`          | Get all events with count      | Public    |
| POST   | `/events`          | Create new event               | Protected |
| GET    | `/events/upcoming` | Get upcoming events (filtered) | Public    |
| GET    | `/events/joined`   | Get user's joined events       | Protected |
| GET    | `/events/created`  | Get user's created events      | Protected |
| GET    | `/events/:id`      | Get event by ID                | Protected |
| PUT    | `/events/:id`      | Update existing event          | Protected |
| DELETE | `/events/:id`      | Delete an event                | Protected |
| POST   | `/events/:id/join` | Join an event                  | Protected |

### ⭐ Review Routes

| Method | Endpoint                 | Description                   | Access    |
| ------ | ------------------------ | ----------------------------- | --------- |
| POST   | `/events/:id/review`     | Submit/update event review    | Protected |
| GET    | `/events/:id/reviews`    | Get all reviews for an event  | Public    |
| GET    | `/events/:id/rating`     | Get rating analytics          | Public    |
| GET    | `/events/:id/review/mine`| Get user's review for event   | Protected |

### 🔍 Query Parameters

#### `/events/upcoming`

- `type` - Filter by event type (Cleanup, Plantation, Donation, etc.)
- `search` - Search events by title
- `page` - Page number for pagination (default: 1)
- `limit` - Items per page (default: 10)

## 📊 Data Structure

### Event Document

```javascript
{
  _id: ObjectId,
  title: String,           // Event title
  description: String,     // Detailed event description
  type: String,           // Event type (Cleanup, Plantation, Donation, etc.)
  thumbnail: String,      // Event thumbnail image URL
  location: String,       // Event location
  date: Date,            // Event date (must be future date)
  creator: String,       // Creator's email address
  joinedUsers: String[]  // Array of joined user emails
}
```

### Review Document

```javascript
{
  _id: ObjectId,
  eventId: ObjectId,      // Reference to event
  userEmail: String,      // Reviewer's email
  userName: String,       // Reviewer's display name
  rating: Number,         // Rating from 1-5
  comment: String,        // Optional review text
  createdAt: Date,        // Review creation timestamp
  updatedAt: Date         // Last update timestamp
}
```

### Rating Analytics Response

```javascript
{
  averageRating: Number,           // Average rating (0-5, rounded to 1 decimal)
  totalReviews: Number,            // Total number of reviews
  ratingDistribution: {            // Count of each rating
    1: Number,
    2: Number,
    3: Number,
    4: Number,
    5: Number
  }
}
```

### Authentication Headers

```javascript
{
  "Authorization": "Bearer <firebase_id_token>"
}
```

## 🔐 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/uddyog

# JWT Configuration
JWT_SECRET=your_jwt_secret_key

# Firebase Admin SDK Configuration
TYPE=service_account
PROJECT_ID=your_project_id
PRIVATE_KEY_ID=your_private_key_id
PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
CLIENT_EMAIL=your_client_email
CLIENT_ID=your_client_id
AUTH_URI=https://accounts.google.com/o/oauth2/auth
TOKEN_URI=https://oauth2.googleapis.com/token
AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
CLIENT_CERT_URL=your_client_cert_url
UNIVERSE_DOMAIN=googleapis.com
```

## 📝 How to Run Locally

```bash
# Clone the repository
git clone https://github.com/sabbirosa/uddyog-server.git

# Navigate to project directory
cd uddyog-server

# Install dependencies
npm install

# Create environment file
touch .env

# Configure environment variables (see above section)
# Add all required Firebase and MongoDB credentials

# Start the development server
npm start
# or
node server.js
```

## 🚀 Deployment

### Prerequisites

- MongoDB Atlas account with database setup
- Firebase project with Authentication enabled
- Environment variables configured on hosting platform

### Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
vercel

# Set environment variables in Vercel dashboard
# Configure MongoDB and Firebase credentials
```

## 🔒 Security Features

- **Firebase Token Verification**: All protected routes verify Firebase ID tokens
- **User Authorization**: Users can only modify their own created events
- **Email Verification**: Server validates user email against token claims
- **Future Date Validation**: Events must be scheduled for future dates only
- **Environment Protection**: All sensitive data stored in environment variables
- **Review Security**: 
  - Only event participants can submit reviews
  - Reviews only allowed after event completion
  - Users can only edit their own reviews
  - Rating validation (1-5 stars only)

## 🎯 Assignment Requirements Fulfilled

- ✅ **Authentication**: Firebase authentication with JWT integration
- ✅ **CRUD Operations**: Complete event management system
- ✅ **Filtering & Search**: MongoDB-based filtering and search functionality
- ✅ **Private Routes**: Protected endpoints with token verification
- ✅ **User Management**: Track created and joined events per user
- ✅ **Data Validation**: Future date validation and input sanitization
- ✅ **Responsive API**: RESTful design with proper status codes

## 📱 Frontend Integration

This API is designed to work with a React-based frontend featuring:

- Event creation and management interfaces
- User authentication with Firebase
- Event discovery with filtering and search
- Responsive design for mobile, tablet, and desktop
- Real-time event updates and notifications
