# DirectBill

A modern web application built with Express.js, EJS, Socket.IO, and Prisma ORM.

## Features

- User authentication with Google OAuth
- JWT-based API authentication
- Real-time updates using Socket.IO
- Service management
- Transaction tracking
- Role-based access control
- SQLite database with Prisma ORM

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Google OAuth credentials

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd direktbill
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```
Edit the `.env` file and add your configuration values:
- Get Google OAuth credentials from the Google Cloud Console
- Set secure values for SESSION_SECRET and JWT_SECRET
- Configure other variables as needed

4. Initialize the database:
```bash
npx prisma migrate dev
```

5. Generate Prisma Client:
```bash
npx prisma generate
```

## Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Project Structure

```
├── prisma/
│   └── schema.prisma    # Database schema
├── src/
│   ├── config/
│   │   └── passport.js  # Passport configuration
│   ├── routes/
│   │   └── auth.js      # Authentication routes
│   ├── views/
│   │   └── index.ejs    # Main template
│   └── server.js        # Main application file
├── .env                 # Environment variables
└── package.json         # Dependencies and scripts
```

## Authentication

The application uses Google OAuth for authentication. Users can:
1. Sign in with their Google account
2. Receive a JWT token for API authentication
3. Access protected routes using the JWT token

## Real-time Features

Socket.IO is integrated for real-time updates. Examples include:
- Transaction status updates
- Service availability changes
- User notifications

## API Endpoints

- `/auth/google` - Google OAuth login
- `/auth/google/callback` - OAuth callback
- `/auth/logout` - User logout
- `/profile` - Protected user profile route

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License. # DirektBill
