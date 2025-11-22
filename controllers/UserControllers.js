const connection = require('../db');
const randomstring = require('randomstring');
const nodemailer = require('nodemailer');

// =========================
// Email OTP Helper Functions
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
    const role = "user";  // Always default to user

    // Check duplicate email
    connection.query(
        "SELECT * FROM users WHERE email = ?",
        [email],
        (err, results) => {
            if (err) throw err;

            if (results.length > 0) {
                req.flash("error", "Email already registered.");
                req.flash("formData", req.body);
                return res.redirect("/register");
            }

            // Insert new user with default role
            const sql = `
                INSERT INTO users (username, email, password, address, contact, role, verified)
                VALUES (?, ?, SHA1(?), ?, ?, ?, 0)
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

        const sql = "SELECT * FROM users WHERE email = ? AND password = SHA1(?)";

        connection.query(sql, [email, password], (err, results) => {
            if (err) throw err;

            if (results.length === 0) {
                req.flash("error", "Invalid email or password");
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


    // ---------- List All Users (Admin Only) ----------
    listUsers(req, res) {
        connection.query("SELECT id, username, email, role FROM users", (err, users) => {
            if (err) return res.status(500).send("Database error");
            res.render("admin_users", { users, user: req.session.user });
        });
    },


    // ---------- Update Role (Admin Only) ----------
    updateRole(req, res) {
        const { user_id, new_role } = req.body;

        if (req.session.user.id == user_id) {
            req.flash("error", "You cannot change your own role.");
            return res.redirect("/admin/users");
        }

        connection.query("UPDATE users SET role = ? WHERE id = ?", [new_role, user_id], () => {
            req.flash("success", "Role updated successfully.");
            res.redirect("/admin/users");
        });
    },


    // ---------- Delete User (Admin Only) ----------
    deleteUser(req, res) {
        const { user_id } = req.body;

        if (req.session.user.id == user_id) {
            req.flash("error", "You cannot delete your own account.");
            return res.redirect("/admin/users");
        }

        connection.query("DELETE FROM users WHERE id = ?", [user_id], () => {
            req.flash("success", "User deleted.");
            res.redirect("/admin/users");
        });
    },


    // ---------- Logout ----------
    logout(req, res) {
        req.session.destroy();
        res.redirect("/");
    }
};


module.exports = UserControllers;
