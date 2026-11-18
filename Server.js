```javascript
// =========================================================
// AM ELECTRONICS AND ACCESSORIES
// MAIN BACKEND SERVER
// =========================================================

const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

// =========================================================
// LOAD ENVIRONMENT VARIABLES
// =========================================================

dotenv.config();


// =========================================================
// IMPORT API ROUTES
// =========================================================

const productRoutes = require("./Routes/productRoutes");
const orderRoutes = require("./Routes/orderRoutes");
const siteAssetRoutes = require("./Routes/siteAssetRoutes");


// =========================================================
// INITIALIZE EXPRESS AND HTTP SERVER
// =========================================================

const app = express();

const server = http.createServer(app);


// =========================================================
// CORS CONFIGURATION
// =========================================================

const allowedOrigins = new Set([

    // Local development
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://localhost:3000",

    // Production frontend origins
    ...(process.env.FRONTEND_ORIGINS || "")
        .split(",")
        .map(origin => origin.trim().replace(/\/$/, ""))
        .filter(Boolean)

]);


const corsOptions = {

    origin(origin, callback) {

        // Allow requests without an origin, such as server-to-server requests.
        if (!origin) {
            return callback(null, true);
        }

        // Allow configured website origins.
        if (allowedOrigins.has(origin)) {
            return callback(null, true);
        }

        // Allow null origins only during local development.
        if (
            origin === "null" &&
            process.env.NODE_ENV !== "production"
        ) {
            return callback(null, true);
        }

        return callback(
            new Error("This website origin is not allowed by CORS.")
        );

    },

    methods: [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS"
    ],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ],

    credentials: true

};


// =========================================================
// GLOBAL MIDDLEWARE
// =========================================================

app.use(cors(corsOptions));

app.use(express.json({
    limit: "8mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "8mb"
}));


// =========================================================
// SOCKET.IO CONFIGURATION
// =========================================================

const io = new Server(server, {

    cors: corsOptions

});


// Make Socket.IO available inside API routes.
app.set("io", io);


// =========================================================
// HEALTH CHECK
// =========================================================

app.get("/health", (req, res) => {

    const databaseConnected = mongoose.connection.readyState === 1;

    res.status(200).json({

        success: true,

        message: "AM Electronics backend is running.",

        database: databaseConnected
            ? "Connected"
            : "Disconnected",

        timestamp: new Date().toISOString()

    });

});


// =========================================================
// API ROUTES
// =========================================================

// Product management and product retrieval.
app.use("/api/products", productRoutes);


// Customer orders and admin order management.
app.use("/api/orders", orderRoutes);


// Website assets, hero images and image management.
app.use("/api/site-assets", siteAssetRoutes);


// =========================================================
// API ROOT
// =========================================================

app.get("/", (req, res) => {

    res.status(200).json({

        success: true,

        name: "AM Electronics and Accessories API",

        message: "Welcome to the AM Electronics backend.",

        endpoints: {

            health: "/health",

            products: "/api/products",

            orders: "/api/orders",

            siteAssets: "/api/site-assets"

        }

    });

});


// =========================================================
// 404 HANDLER
// =========================================================

app.use((req, res) => {

    res.status(404).json({

        success: false,

        message: "The requested API endpoint was not found."

    });

});


// =========================================================
// GLOBAL ERROR HANDLER
// =========================================================

app.use((err, req, res, next) => {

    console.error("Backend error:", err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(err.status || 500).json({

        success: false,

        message: process.env.NODE_ENV === "production"
            ? "An unexpected server error occurred."
            : err.message

    });

});


// =========================================================
// SOCKET.IO CONNECTION HANDLER
// =========================================================

io.on("connection", (socket) => {

    console.log(
        "A client connected:",
        socket.id
    );


    socket.on("disconnect", () => {

        console.log(
            "A client disconnected:",
            socket.id
        );

    });

});


// =========================================================
// START SERVER AFTER MONGODB CONNECTION
// =========================================================

async function startServer() {

    try {

        // Check MongoDB connection string.
        if (!process.env.MONGO_URI) {

            throw new Error(
                "MONGO_URI is missing. Configure it in Render environment variables."
            );

        }


        // Connect to MongoDB.
        await mongoose.connect(process.env.MONGO_URI);


        console.log(
            "Successfully connected to MongoDB."
        );


        // Render automatically provides the PORT environment variable.
        const PORT = process.env.PORT || 5000;


        // Start HTTP and Socket.IO server.
        server.listen(PORT, "0.0.0.0", () => {

            console.log(
                `AM Electronics backend running on port ${PORT}`
            );

        });

    } catch (error) {

        console.error(
            "Backend startup failed:",
            error.message
        );

        process.exit(1);

    }

}


// =========================================================
// HANDLE UNEXPECTED SERVER ERRORS
// =========================================================

process.on("unhandledRejection", (reason) => {

    console.error(
        "Unhandled promise rejection:",
        reason
    );

});


// =========================================================
// START APPLICATION
// =========================================================

startServer();
```
