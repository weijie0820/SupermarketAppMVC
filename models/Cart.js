// models/Cart.js
const db = require('../db');

module.exports = {

    // -------------------------------------------------------------
    // Get user's cart (DB)
    // -------------------------------------------------------------
    getUserCart(userId, callback) {
        const sql = `
            SELECT c.product_id,
                   c.quantity,
                   p.productName,
                   p.price,
                   p.image,
                   p.quantity AS stock
            FROM cart_itemsss c
            JOIN products p ON c.product_id = p.id
            WHERE c.user_id = ?
        `;
        db.query(sql, [userId], callback);
    },

    // -------------------------------------------------------------
    // Helper — get product info
    // -------------------------------------------------------------
    getProductById(productId, callback) {
        db.query(`SELECT * FROM products WHERE id = ?`, [productId], (err, result) => {
            callback(err, result);
        });
    },

    // -------------------------------------------------------------
    // Helper — get cart item
    // -------------------------------------------------------------
    getCartItem(userId, productId, callback) {
        db.query(
            `SELECT * FROM cart_itemsss WHERE user_id = ? AND product_id = ?`,
            [userId, productId],
            callback
        );
    },

    // -------------------------------------------------------------
    // ADD TO CART
    // -------------------------------------------------------------
    addItem(userId, productId, qty, callback) {
        this.getProductById(productId, (err, result) => {
            if (err || result.length === 0)
                return callback({ error: "Product not found." });

            const stock = result[0].quantity;

            this.getCartItem(userId, productId, (err, cartItem) => {
                if (err) return callback({ error: "Database error." });

                let currentQty = cartItem.length > 0 ? cartItem[0].quantity : 0;
                let newQty = currentQty + qty;

                if (newQty > stock) {
                    return callback({
                        error: `Cannot add more. Only ${stock} left in stock.`
                    });
                }

                if (cartItem.length > 0) {
                    db.query(
                        `UPDATE cart_itemsss SET quantity = ? WHERE user_id = ? AND product_id = ?`,
                        [newQty, userId, productId],
                        err => callback(err ? { error: "Database error." } : null)
                    );
                } else {
                    db.query(
                        `INSERT INTO cart_itemsss (user_id, product_id, quantity)
                         VALUES (?, ?, ?)`,
                        [userId, productId, qty],
                        err => callback(err ? { error: "Database error." } : null)
                    );
                }
            });
        });
    },

    // -------------------------------------------------------------
    // INCREASE (+1)
    // -------------------------------------------------------------
    increase(userId, productId, callback) {
        this.getProductById(productId, (err, result) => {
            if (err) return callback({ error: "DB error" });

            const stock = result[0].quantity;

            this.getCartItem(userId, productId, (err, cartItem) => {
                if (err) return callback({ error: "DB error" });

                const currentQty = cartItem[0].quantity;

                if (currentQty >= stock) {
                    return callback({
                        error: `Cannot increase. Only ${stock} available.`
                    });
                }

                db.query(
                    `UPDATE cart_itemsss SET quantity = quantity + 1 
                     WHERE user_id = ? AND product_id = ?`,
                    [userId, productId],
                    err => callback(err ? { error: "DB error" } : null)
                );
            });
        });
    },

    // -------------------------------------------------------------
    // DECREASE (-1)
    // -------------------------------------------------------------
    decrease(userId, productId, callback) {
        this.getCartItem(userId, productId, (err, result) => {
            if (err) return callback({ error: "DB error" });

            const currentQty = result[0].quantity;

            if (currentQty <= 1) {
                db.query(
                    `DELETE FROM cart_itemsss WHERE user_id = ? AND product_id = ?`,
                    [userId, productId],
                    callback
                );
            } else {
                db.query(
                    `UPDATE cart_itemsss SET quantity = quantity - 1
                     WHERE user_id = ? AND product_id = ?`,
                    [userId, productId],
                    callback
                );
            }
        });
    },

    // -------------------------------------------------------------
    // Update typed quantity
    // -------------------------------------------------------------
    updateQuantity(userId, productId, newQty, callback) {
        if (newQty < 1) newQty = 1;

        this.getProductById(productId, (err, result) => {
            if (err) return callback({ error: "DB error" });

            const stock = result[0].quantity;

            if (newQty > stock) {
                return callback({
                    error: `Stock limit reached. Only ${stock} available.`
                });
            }

            db.query(
                `UPDATE cart_itemsss SET quantity = ? 
                 WHERE user_id = ? AND product_id = ?`,
                [newQty, userId, productId],
                err => callback(err ? { error: "DB error" } : null)
            );
        });
    },

    remove(userId, productId, callback) {
        db.query(
            "DELETE FROM cart_itemsss WHERE user_id = ? AND product_id = ?",
            [userId, productId],
            callback
        );
    },

    clear(userId, callback) {
        db.query("DELETE FROM cart_itemsss WHERE user_id = ?", [userId], callback);
    }
};
