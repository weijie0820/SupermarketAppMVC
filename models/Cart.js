const db = require('../db');

module.exports = {

    getUserCart(userId, callback) {
        const sql = `
            SELECT c.product_id,
                   c.quantity,
                   p.productName,
                   p.price,
                   p.image
            FROM cart_itemsss c
            JOIN products p ON c.product_id = p.id
            WHERE c.user_id = ?
        `;
        db.query(sql, [userId], callback);
    },

    addItem(userId, productId, quantity, callback) {
        const sql = `
            INSERT INTO cart_itemsss (user_id, product_id, quantity)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity = quantity + ?
        `;
        db.query(sql, [userId, productId, quantity, quantity], callback);
    },

    increase(userId, productId, callback) {
        db.query(
            "UPDATE cart_itemsss SET quantity = quantity + 1 WHERE user_id = ? AND product_id = ?",
            [userId, productId],
            callback
        );
    },

    decrease(userId, productId, callback) {
        db.query(
            "UPDATE cart_itemsss SET quantity = quantity - 1 WHERE user_id = ? AND product_id = ? AND quantity > 1",
            [userId, productId],
            callback
        );
    },

    remove(userId, productId, callback) {
        db.query(
            "DELETE FROM cart_itemsss WHERE user_id = ? AND product_id = ?",
            [userId, productId],
            callback
        );
    },

    clear(userId, callback) {
        db.query(
            "DELETE FROM cart_itemsss WHERE user_id = ?",
            [userId],
            callback
        );
    }
};
