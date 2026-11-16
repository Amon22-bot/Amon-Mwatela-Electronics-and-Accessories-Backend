const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

// Load environment variables.
dotenv.config({
    path: path.join(__dirname, ".env")
});

// Route imports. Folder name is Routes with a capital R.
const productRoutes = require("./Routes/productRoutes");
const orderRoutes = require("./Routes/orderRoutes");
const siteAssetRoutes = require("./Routes/siteAssetRoutes");

const app = express();
const server = http.createServer(app);


// =========================================================
// CORS CONFIGURATION
// =========================================================

const allowedOrigins = new Set([
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    ...(process.env.FRONTEND_ORIGINS || "")
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean)
]);

const corsOptions = {
    origin(origin, callback) {

        if (
            !origin ||
            allowedOrigins.has(origin) ||
            (
                origin === "null" &&
                process.env.NODE_ENV !== "production"
            )
        ) {
            return callback(null, true);
        }

        return callback(
            new Error("This website origin is not allowed by CORS.")
        );
    },

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ]
};


// =========================================================
// MIDDLEWARE
// =========================================================

app.use(cors(corsOptions));

app.use(express.json({
    limit: "8mb"
}));


// =========================================================
// SOCKET.IO
// =========================================================

const io = new Server(server, {
    cors: corsOptions
});

app.set("io", io);


// =========================================================
// HEALTH CHECK
// =========================================================

app.get("/health", (req, res) => {

    res.status(200).json({
        success: true,
        message: "AM Electronics backend is running."
    });

});


// =========================================================
// API ROUTES
// =========================================================

// Product management
app.use("/api/products", productRoutes);

// Order management and admin authentication
app.use("/api/orders", orderRoutes);

// Central website image management using MongoDB GridFS
app.use("/api/site-assets", siteAssetRoutes);


// =========================================================
// STATIC FRONTEND SERVING
// =========================================================

const clientDirectory = path.join(__dirname, "..", "client");

app.get("/", (req, res) => {

    res.sendFile(
        path.join(clientDirectory, "Index.html")
    );

});

app.use(express.static(clientDirectory, {

    setHeaders(res, filePath) {

        if (
            path.extname(filePath).toLowerCase() === ".enc"
        ) {
            res.setHeader(
                "Content-Type",
                "image/webp"
            );
        }

    }

}));


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

        if (!process.env.MONGO_URI) {

            throw new Error(
                "MONGO_URI is missing. Check your server/.env configuration."
            );

        }

        await mongoose.connect(process.env.MONGO_URI);

        console.log(
            "Successfully connected to MongoDB."
        );

        const PORT = process.env.PORT || 5000;

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

        process.exitCode = 1;

    }

}

startServer();



