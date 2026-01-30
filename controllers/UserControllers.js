const connection = require('../db');
const randomstring = require('randomstring');
const nodemailer = require('nodemailer');

// =========================
// Email OTP Helper
// =========================


const otpCache = {};

function setOTP(email, otp, ttl = 3 * 60 * 1000) {
    otpCache[email] = { code: otp, expiresAt: Date.now() + ttl };
    setTimeout(() => {
        if (otpCache[email] && otpCache[email].expiresAt <= Date.now()) {
            delete otpCache[email];
        }
    }, ttl + 1000);
}

function generateOTP() {
    return randomstring.generate({ length: 6, charset: 'numeric' });
}

async function sendOTP(email, otp) {
    const transport = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    return transport.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "OTP Verification",
        html: `<h3>Your OTP: <b>${otp}</b></h3>`
    });
}


// =====================================
//         USER CONTROLLER OBJECT
// =====================================
const UserControllers = {

    // ---------- Render Register Page ----------
    renderRegister(req, res) {
        res.render("register", {
            messages: req.flash("error"),
            formData: req.flash("formData")[0]
        });
    },

    // ---------- Register User ----------
    register(req, res) {
        const { username, email, password, address, contact } = req.body;
        const role = "user";  // default role

        // Check duplicate email
        connection.query(
            "SELECT * FROM users WHERE email = ? AND is_deleted = 0",
            [email],
            (err, results) => {
                if (err) throw err;

                if (results.length > 0) {
                    req.flash("error", "Email already registered.");
                    req.flash("formData", req.body);
                    return res.redirect("/register");
                }

                // Insert new user
                const sql = `
                    INSERT INTO users (username, email, password, address, contact, role, verified, is_deleted)
                    VALUES (?, ?, SHA1(?), ?, ?, ?, 0, 0)
                `;

                connection.query(sql,
                    [username, email, password, address, contact, role],
                    async (err2) => {
                        if (err2) throw err2;

                        const otp = generateOTP();
                        setOTP(email, otp);
                        await sendOTP(email, otp);

                        req.flash("success", "Registration successful! Check your email for OTP.");
                        res.redirect(`/otp?email=${email}&sent=1`);
                    }
                );
            }
        );
    },


    // ---------- Render Login Page ----------
    renderLogin(req, res) {
        res.render("login", {
            messages: req.flash("success"),
            errors: req.flash("error"),
            query: req.query
        });
    },

    // ---------- Login ----------
    login(req, res) {
        const { email, password } = req.body;

        const sql = `
            SELECT * FROM users 
            WHERE email = ? AND password = SHA1(?) AND is_deleted = 0
        `;

        connection.query(sql, [email, password], (err, results) => {
            if (err) throw err;

            if (results.length === 0) {
                req.flash("error", "Invalid email or password.");
                return res.redirect("/login");
            }

            const user = results[0];

            if (user.verified === 0) {
                req.flash("error", "Please verify your email before logging in.");
                return res.redirect(`/otp?email=${email}`);
            }

            req.session.user = user;

            return user.role === "admin"
                ? res.redirect("/inventory")
                : res.redirect("/shopping");
        });
    },

    // ---------- Request OTP Again ----------
    async requestOTP(req, res) {
        const email = req.body.email;

        const otp = generateOTP();
        setOTP(email, otp);
        await sendOTP(email, otp);

        res.redirect(`/otp?email=${email}&sent=1`);
    },

    // ---------- Verify OTP ----------
    verifyOTP(req, res) {
        const { email, otp } = req.body;

        const record = otpCache[email];
        if (!record || Date.now() > record.expiresAt) {
            return res.redirect(`/otp?email=${email}&error=OTP expired or invalid`);
        }

        if (record.code !== otp) {
            return res.redirect(`/otp?email=${email}&error=Invalid OTP`);
        }

        delete otpCache[email];

        connection.query(
            "UPDATE users SET verified = 1 WHERE email = ?",
            [email],
            () => res.redirect("/login?verified=1")
        );
    },

    // ---------- List Users ----------
    listUsers(req, res) {
        connection.query(
            "SELECT id, username, email, role FROM users WHERE is_deleted = 0",
            (err, users) => {
                if (err) return res.status(500).send("Database error");
                res.render("admin_users", { users, user: req.session.user });
            }
        );
    },

    // ---------- Update Role ----------
    updateRole(req, res) {
        const { user_id, new_role } = req.body;

        if (req.session.user.id == user_id) {
            req.flash("error", "You cannot change your own role.");
            return res.redirect("/admin/users");
        }

        connection.query(
            "UPDATE users SET role = ? WHERE id = ? AND is_deleted = 0",
            [new_role, user_id],
            () => {
                req.flash("success", "Role updated successfully.");
                res.redirect("/admin/users");
            }
        );
    },

    // ---------- SOFT DELETE USER ----------
    deleteUser(req, res) {
        const { user_id } = req.body;

        if (req.session.user.id == user_id) {
            req.flash("error", "You cannot delete your own account.");
            return res.redirect("/admin/users");
        }

        // Soft Delete → mark user as deleted
        connection.query(
            "UPDATE users SET is_deleted = 1 WHERE id = ?",
            [user_id],
            () => {
                req.flash("success", "User removed from system.");
                res.redirect("/admin/users");
            }
        );
    },

    // ---------- Admin: List ALL orders ----------
        adminListOrders(req, res) {
        const q = (req.query.q || "").trim();

        const sql = `
            SELECT
            o.order_id,
            o.order_date,
            o.total_amount,
            o.status,
            o.payment_method,
            o.invoice_number,
            o.refund_status,
            u.id AS user_id,
            u.username,
            u.email
            FROM orders o
            JOIN users u ON u.id = o.user_id
            WHERE u.is_deleted = 0
            AND (
                ? = ''
                OR o.order_id = ?
                OR u.username LIKE ?
                OR u.email LIKE ?
            )
            ORDER BY o.order_date DESC
        `;

        const params = [q, q, "%" + q + "%", "%" + q + "%"];

        connection.query(sql, params, (err, rows) => {
            if (err) {
            console.log("adminListOrders SQL error:", err);
            return res.status(500).send(err.sqlMessage || "DB error");
            }

            res.render("adminorder", {
            orders: rows,
            q,
            user: req.session.user
            });
        });
        },


        // ---------- Admin: Order details ----------
        adminOrderDetails(req, res) {
        const orderId = Number(req.params.orderId);

        const orderSql = `
            SELECT
            o.order_id,
            o.user_id,
            o.order_date,
            o.total_amount,
            o.status,
            o.payment_method,
            o.invoice_number,
            o.paid_at,
            o.updated_at,
            o.refund_status,
            o.refund_reason,
            o.refund_request_at,
            o.refund_decision_at,
            o.refund_decision_by,
            o.refund_reject_reason,
            u.username,
            u.email
            FROM orders o
            JOIN users u ON u.id = o.user_id
            WHERE o.order_id = ?
            LIMIT 1
        `;

        const itemsSql = `
            SELECT
                oi.order_item_id,
                oi.order_id,
                oi.product_id,
                p.productName,
                p.image,
                oi.quantity,
                oi.price_per_unit,
                (oi.quantity * oi.price_per_unit) AS line_total,
                oi.created_at
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ?
            `;


        const txnSql = `
            SELECT
            t.transaction_id,
            t.order_id,
            t.user_id,
            t.payment_method,
            t.payment_status,
            t.amount,
            t.currency,
            t.paypal_order_id,
            t.paypal_capture_id,
            t.nets_reference,
            t.hitpay_request_id,
            t.payer_email,
            t.paid_datetime,
            t.created_at
            FROM \`transaction\` t
            WHERE t.order_id = ?
            ORDER BY t.transaction_id DESC
            LIMIT 1
        `;

        connection.query(orderSql, [orderId], (err, orderRows) => {
            if (err) {
            console.log("adminOrderDetails orderSql error:", err);
            return res.status(500).send(err.sqlMessage || "DB error (order)");
            }
            if (!orderRows || !orderRows[0]) return res.status(404).send("Order not found");

            const order = orderRows[0];

            connection.query(itemsSql, [orderId], (err2, itemRows) => {
            if (err2) {
                console.log("adminOrderDetails itemsSql error:", err2);
                return res.status(500).send(err2.sqlMessage || "DB error (items)");
            }

            connection.query(txnSql, [orderId], (err3, txnRows) => {
                if (err3) {
                console.log("adminOrderDetails txnSql error:", err3);
                return res.status(500).send(err3.sqlMessage || "DB error (transaction)");
                }

                res.render("adminorder_details", {
                order,
                items: itemRows,
                txn: (txnRows && txnRows[0]) ? txnRows[0] : null,
                user: req.session.user
                });
            });
            });
        });
        },



    // ---------- Logout ----------
    logout(req, res) {
        req.session.destroy();
        res.redirect("/");
    }
};




module.exports = UserControllers;
