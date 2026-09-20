const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------
// Database - Supabase PostgreSQL
// -----------------------------

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// -----------------------------
// Create Database Tables
// -----------------------------

async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS medicines (
                id SERIAL PRIMARY KEY,
                medicine_name TEXT NOT NULL,
                company TEXT,
                price NUMERIC NOT NULL,
                stock INTEGER NOT NULL DEFAULT 0,
                low_stock_limit INTEGER NOT NULL DEFAULT 10,
                category TEXT,
                notes TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sales (
                id SERIAL PRIMARY KEY,
                medicine_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price NUMERIC NOT NULL,
                total_price NUMERIC NOT NULL,
                sold_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (medicine_id)
                    REFERENCES medicines(id)
            );
        `);

        console.log("Supabase PostgreSQL connected successfully.");
        console.log("Database tables are ready.");
    } catch (error) {
        console.error("Database initialization failed:", error.message);
    }
}

initializeDatabase();

// -----------------------------
// Middleware
// -----------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname));

// -----------------------------
// Test API
// -----------------------------

app.get("/api/test", (req, res) => {
    res.json({
        success: true,
        message: "Medicine Checker backend is working!"
    });
});

// -----------------------------
// Register User
// -----------------------------

app.post("/api/register", async (req, res) => {
    try {
        const {
            name,
            email,
            password
        } = req.body;

        const userName = String(name || "").trim();
        const userEmail = String(email || "").trim().toLowerCase();
        const userPassword = String(password || "");

        if (!userName || !userEmail || !userPassword) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required."
            });
        }

        if (userName.length < 2) {
            return res.status(400).json({
                success: false,
                message: "Name must contain at least 2 characters."
            });
        }

        if (userPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 6 characters."
            });
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(userEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        const existingUser = await pool.query(
            `
            SELECT id
            FROM users
            WHERE email = $1
            `,
            [userEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            });
        }

        const result = await pool.query(
            `
            INSERT INTO users
            (
                name,
                email,
                password
            )
            VALUES ($1, $2, $3)
            RETURNING id, name, email, created_at
            `,
            [
                userName,
                userEmail,
                userPassword
            ]
        );

        res.status(201).json({
            success: true,
            message: "Registration successful.",
            user: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to register user."
        });
    }
});

// -----------------------------
// Login User
// -----------------------------

app.post("/api/login", async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        const userEmail =
            String(email || "").trim().toLowerCase();

        const userPassword =
            String(password || "");

        if (!userEmail || !userPassword) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const result = await pool.query(
            `
            SELECT
                id,
                name,
                email,
                password
            FROM users
            WHERE email = $1
            `,
            [userEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const user = result.rows[0];

        if (user.password !== userPassword) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        res.json({
            success: true,
            message: "Login successful.",
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to login."
        });
    }
});

// -----------------------------
// Add Medicine
// -----------------------------

app.post("/api/medicines", async (req, res) => {
    try {
        const {
            medicine_name,
            company,
            price,
            stock,
            low_stock_limit,
            category,
            notes
        } = req.body;

        if (
            !medicine_name ||
            price === undefined ||
            stock === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "Medicine name, price and stock are required."
            });
        }

        const medicinePrice = Number(price);
        const medicineStock = Number(stock);
        const lowStockLimit =
            Number(low_stock_limit ?? 10);

        if (
            !Number.isFinite(medicinePrice) ||
            !Number.isInteger(medicineStock) ||
            !Number.isInteger(lowStockLimit) ||
            medicinePrice < 0 ||
            medicineStock < 0 ||
            lowStockLimit < 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Please enter valid price and stock values."
            });
        }

        const result = await pool.query(
            `
            INSERT INTO medicines
            (
                medicine_name,
                company,
                price,
                stock,
                low_stock_limit,
                category,
                notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            `,
            [
                medicine_name.trim(),
                company?.trim() || "",
                medicinePrice,
                medicineStock,
                lowStockLimit,
                category || "",
                notes?.trim() || ""
            ]
        );

        res.status(201).json({
            success: true,
            message: "Medicine saved successfully.",
            medicine: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to save medicine."
        });
    }
});

// -----------------------------
// Get All Medicines
// -----------------------------

app.get("/api/medicines", async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT *
            FROM medicines
            ORDER BY id DESC
            `
        );

        res.json({
            success: true,
            medicines: result.rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to load medicines."
        });
    }
});

// -----------------------------
// Sell Medicine
// -----------------------------

app.post("/api/sales", async (req, res) => {
    const client = await pool.connect();

    try {
        const {
            medicine_id,
            quantity
        } = req.body;

        const medicineId = Number(medicine_id);
        const saleQuantity = Number(quantity);

        if (
            !Number.isInteger(medicineId) ||
            !Number.isInteger(saleQuantity) ||
            saleQuantity <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Please select a medicine and enter a valid quantity."
            });
        }

        await client.query("BEGIN");

        const medicineResult = await client.query(
            `
            SELECT *
            FROM medicines
            WHERE id = $1
            FOR UPDATE
            `,
            [medicineId]
        );

        if (medicineResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Medicine not found."
            });
        }

        const medicine = medicineResult.rows[0];

        if (medicine.stock < saleQuantity) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    `Only ${medicine.stock} units of ${medicine.medicine_name} are available.`
            });
        }

        const unitPrice = Number(medicine.price);
        const totalPrice = unitPrice * saleQuantity;

        await client.query(
            `
            UPDATE medicines
            SET stock = stock - $1
            WHERE id = $2
            `,
            [
                saleQuantity,
                medicineId
            ]
        );

        const saleResult = await client.query(
            `
            INSERT INTO sales
            (
                medicine_id,
                quantity,
                unit_price,
                total_price
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id
            `,
            [
                medicineId,
                saleQuantity,
                unitPrice,
                totalPrice
            ]
        );

        const saleId = saleResult.rows[0].id;

        const finalSale = await client.query(
            `
            SELECT
                sales.id,
                sales.medicine_id,
                medicines.medicine_name,
                medicines.company,
                sales.quantity,
                sales.unit_price,
                sales.total_price,
                sales.sold_at
            FROM sales
            INNER JOIN medicines
                ON medicines.id = sales.medicine_id
            WHERE sales.id = $1
            `,
            [saleId]
        );

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            message: "Sale completed successfully.",
            sale: finalSale.rows[0]
        });

    } catch (error) {

        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(rollbackError);
        }

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to complete the sale."
        });

    } finally {
        client.release();
    }
});

// -----------------------------
// Sales History
// -----------------------------

app.get("/api/sales", async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                sales.id,
                sales.medicine_id,
                medicines.medicine_name,
                medicines.company,
                sales.quantity,
                sales.unit_price,
                sales.total_price,
                sales.sold_at
            FROM sales
            INNER JOIN medicines
                ON medicines.id = sales.medicine_id
            ORDER BY sales.id DESC
            `
        );

        res.json({
            success: true,
            sales: result.rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to load sales history."
        });
    }
});

// -----------------------------
// Dashboard Statistics
// -----------------------------

app.get("/api/dashboard", async (req, res) => {
    try {

        const totalMedicinesResult = await pool.query(
            `
            SELECT COUNT(*)::INTEGER AS count
            FROM medicines
            `
        );

        const inStockResult = await pool.query(
            `
            SELECT COUNT(*)::INTEGER AS count
            FROM medicines
            WHERE stock > low_stock_limit
            `
        );

        const lowStockResult = await pool.query(
            `
            SELECT COUNT(*)::INTEGER AS count
            FROM medicines
            WHERE stock > 0
            AND stock <= low_stock_limit
            `
        );

        const outOfStockResult = await pool.query(
            `
            SELECT COUNT(*)::INTEGER AS count
            FROM medicines
            WHERE stock = 0
            `
        );

        const todaySalesResult = await pool.query(
            `
            SELECT COALESCE(SUM(quantity), 0)::INTEGER AS count
            FROM sales
            WHERE (sold_at AT TIME ZONE 'Asia/Kolkata')::DATE =
                  (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE
            `
        );

        const todayRevenueResult = await pool.query(
            `
            SELECT COALESCE(SUM(total_price), 0)::NUMERIC AS revenue
            FROM sales
            WHERE (sold_at AT TIME ZONE 'Asia/Kolkata')::DATE =
                  (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE
            `
        );

        res.json({
            success: true,

            stats: {
                totalMedicines:
                    totalMedicinesResult.rows[0].count,

                inStock:
                    inStockResult.rows[0].count,

                lowStock:
                    lowStockResult.rows[0].count,

                outOfStock:
                    outOfStockResult.rows[0].count,

                todaySales:
                    todaySalesResult.rows[0].count,

                todayRevenue:
                    Number(todayRevenueResult.rows[0].revenue)
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to load dashboard statistics."
        });
    }
});

// -----------------------------
// Start Server
// -----------------------------

app.listen(PORT, () => {

    console.log("");

    console.log("======================================");
    console.log(" Medicine Availability Checker");
    console.log("======================================");

    console.log(
        `Server running on port: ${PORT}`
    );

    console.log("");
});
