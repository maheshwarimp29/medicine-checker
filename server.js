const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3000;

// -----------------------------
// Database
// -----------------------------

const db = new Database("medicine-checker.db");

db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS medicines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        medicine_name TEXT NOT NULL,
        company TEXT,
        price REAL NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        low_stock_limit INTEGER NOT NULL DEFAULT 10,
        category TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        medicine_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        sold_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );
`);

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

app.post("/api/register", (req, res) => {
    try {

        const {
            name,
            email,
            password
        } = req.body;

        const userName = String(name || "").trim();
        const userEmail = String(email || "").trim().toLowerCase();
        const userPassword = String(password || "");

        // Validate
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

        // Basic email validation
        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(userEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        // Check existing user
        const existingUser = db.prepare(`
            SELECT id
            FROM users
            WHERE email = ?
        `).get(userEmail);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            });
        }

        // Create user
        const result = db.prepare(`
            INSERT INTO users
            (
                name,
                email,
                password
            )
            VALUES (?, ?, ?)
        `).run(
            userName,
            userEmail,
            userPassword
        );

        const user = db.prepare(`
            SELECT
                id,
                name,
                email,
                created_at
            FROM users
            WHERE id = ?
        `).get(result.lastInsertRowid);

        res.status(201).json({
            success: true,
            message: "Registration successful.",
            user
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

app.post("/api/login", (req, res) => {
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

        const user = db.prepare(`
            SELECT
                id,
                name,
                email,
                password
            FROM users
            WHERE email = ?
        `).get(userEmail);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

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

app.post("/api/medicines", (req, res) => {
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
        const lowStockLimit = Number(low_stock_limit ?? 10);

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

        const result = db.prepare(`
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
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            medicine_name.trim(),
            company?.trim() || "",
            medicinePrice,
            medicineStock,
            lowStockLimit,
            category || "",
            notes?.trim() || ""
        );

        const medicine = db.prepare(`
            SELECT *
            FROM medicines
            WHERE id = ?
        `).get(result.lastInsertRowid);

        res.status(201).json({
            success: true,
            message: "Medicine saved successfully.",
            medicine
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

app.get("/api/medicines", (req, res) => {
    try {

        const medicines = db.prepare(`
            SELECT *
            FROM medicines
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            medicines
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

app.post("/api/sales", (req, res) => {
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
                message: "Please select a medicine and enter a valid quantity."
            });
        }

        const medicine = db.prepare(`
            SELECT *
            FROM medicines
            WHERE id = ?
        `).get(medicineId);

        if (!medicine) {
            return res.status(404).json({
                success: false,
                message: "Medicine not found."
            });
        }

        if (medicine.stock < saleQuantity) {
            return res.status(400).json({
                success: false,
                message:
                    `Only ${medicine.stock} units of ${medicine.medicine_name} are available.`
            });
        }

        const unitPrice = Number(medicine.price);

        const totalPrice =
            unitPrice * saleQuantity;

        const completeSale = db.transaction(() => {

            db.prepare(`
                UPDATE medicines
                SET stock = stock - ?
                WHERE id = ?
            `).run(
                saleQuantity,
                medicineId
            );

            const result = db.prepare(`
                INSERT INTO sales
                (
                    medicine_id,
                    quantity,
                    unit_price,
                    total_price
                )
                VALUES (?, ?, ?, ?)
            `).run(
                medicineId,
                saleQuantity,
                unitPrice,
                totalPrice
            );

            return result.lastInsertRowid;
        });

        const saleId = completeSale();

        const sale = db.prepare(`
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
            WHERE sales.id = ?
        `).get(saleId);

        res.status(201).json({
            success: true,
            message: "Sale completed successfully.",
            sale
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to complete the sale."
        });
    }
});

// -----------------------------
// Sales History
// -----------------------------

app.get("/api/sales", (req, res) => {
    try {

        const sales = db.prepare(`
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
        `).all();

        res.json({
            success: true,
            sales
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

app.get("/api/dashboard", (req, res) => {
    try {

        const totalMedicines = db.prepare(`
            SELECT COUNT(*) AS count
            FROM medicines
        `).get().count;

        const inStock = db.prepare(`
            SELECT COUNT(*) AS count
            FROM medicines
            WHERE stock > low_stock_limit
        `).get().count;

        const lowStock = db.prepare(`
            SELECT COUNT(*) AS count
            FROM medicines
            WHERE stock > 0
            AND stock <= low_stock_limit
        `).get().count;

        const outOfStock = db.prepare(`
            SELECT COUNT(*) AS count
            FROM medicines
            WHERE stock = 0
        `).get().count;

        const todaySales = db.prepare(`
            SELECT COALESCE(SUM(quantity), 0) AS count
            FROM sales
            WHERE date(sold_at, 'localtime') =
                  date('now', 'localtime')
        `).get().count;

        const todayRevenue = db.prepare(`
            SELECT COALESCE(SUM(total_price), 0) AS revenue
            FROM sales
            WHERE date(sold_at, 'localtime') =
                  date('now', 'localtime')
        `).get().revenue;

        res.json({
            success: true,

            stats: {
                totalMedicines,
                inStock,
                lowStock,
                outOfStock,
                todaySales,
                todayRevenue
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
        `Server running at: http://localhost:${PORT}`
    );

    console.log("");

});