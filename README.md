# ✨ Shine Beauty

AI-Powered Foundation Recommendation App

Shine Beauty uses LLM technology to provide personalized foundation recommendations through natural conversation. Users describe their skin type, concerns, and preferences, and the AI matches them with the best-suited products.

## Tech Stack

- **Frontend**: React Native + Expo
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **AI**: OpenAI GPT-4o-mini

## Project Structure

```
shine-beauty/
├── backend/
│   ├── config/
│   │   └── db.js              # MongoDB connection
│   ├── controllers/
│   │   ├── chatController.js   # LLM chat logic
│   │   ├── favoriteController.js
│   │   └── productController.js
│   ├── data/
│   │   ├── foundations.js      # 60 product seed data
│   │   └── seed.js             # Database seeder
│   ├── models/
│   │   ├── Foundation.js       # Product schema
│   │   └── Favorite.js         # Favorites schema
│   ├── routes/
│   │   ├── chat.js
│   │   ├── favorites.js
│   │   └── products.js
│   ├── server.js               # Express entry point
│   ├── .env                    # Environment variables
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ProductCard.js  # Reusable product card
│   │   ├── constants/
│   │   │   └── theme.js        # Colors, fonts, spacing
│   │   ├── screens/
│   │   │   ├── ChatScreen.js   # AI chat interface
│   │   │   ├── BrowseScreen.js # Product browsing + filters
│   │   │   └── FavoritesScreen.js
│   │   └── services/
│   │       ├── api.js          # API client
│   │       └── userId.js       # Device user ID
│   ├── App.js                  # Root with tab navigation
│   └── package.json
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (free tier)
- OpenAI API key
- Expo Go app on your phone (for testing)

### 1. Backend Setup

```bash
cd backend
npm install

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI and OpenAI API key

# Seed the database
npm run seed

# Start the server
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install

# Start Expo
npx expo start
```

Scan the QR code with Expo Go (Android) or Camera app (iOS) to preview on your phone.

### 3. Connect Frontend to Backend

Edit `frontend/src/services/api.js` and update the base URL to your computer's local IP address:

```js
// Find your IP: run `ipconfig` (Windows) or `ifconfig` (Mac)
return "http://YOUR_IP_ADDRESS:5000/api";
```

## Features

- 💬 **AI Chat**: Natural language foundation recommendations
- 🔍 **Browse**: Filter by finish, skin type, coverage
- ❤️ **Favorites**: Save products you love
- 🎯 **Smart Matching**: LLM analyzes skin needs against product database

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products | List products with filters |
| GET | /api/products/:id | Get product details |
| GET | /api/products/search/:query | Text search |
| GET | /api/products/brands | List all brands |
| POST | /api/chat | Send chat message to AI |
| GET | /api/favorites/:userId | Get user favorites |
| POST | /api/favorites | Add favorite |
| DELETE | /api/favorites/:userId/:foundationId | Remove favorite |
