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

  addItem: function (userId, productId, qty, callback) {
    // check stock
    db.query(`SELECT quantity FROM products WHERE id = ?`, [productId], (err, stockResult) => {
        if (err) return callback(err);

        const stock = stockResult[0].quantity;

        // check existing cart quantity
        db.query(
            `SELECT quantity FROM cart_itemsss WHERE user_id = ? AND product_id = ?`,
            [userId, productId],
            (err, cartResult) => {
                if (err) return callback(err);

                let currentQty = cartResult.length > 0 ? cartResult[0].quantity : 0;
                let newQty = currentQty + qty;

                // limit quantity to stock
                if (newQty > stock) newQty = stock;

                if (cartResult.length > 0) {
                    // update existing
                    db.query(
                        `UPDATE cart_itemsss SET quantity = ? WHERE user_id = ? AND product_id = ?`,
                        [newQty, userId, productId],
                        callback
                    );
                } else {
                    // insert new
                    db.query(
                        `INSERT INTO cart_itemsss (user_id, product_id, quantity)
                         VALUES (?, ?, ?)`,
                        [userId, productId, newQty],
                        callback
                    );
                }
            }
        );
    });
},


 increase: function (userId, productId, callback) {
    // 1. Check product stock first
    db.query(`SELECT quantity FROM products WHERE id = ?`, [productId], (err, stockResult) => {
        if (err) return callback(err);

        const stock = stockResult[0].quantity;

        // 2. Get current quantity inside cart
        db.query(
            `SELECT quantity FROM cart_itemsss WHERE user_id = ? AND product_id = ?`,
            [userId, productId],
            (err, cartResult) => {
                if (err) return callback(err);

                const currentQty = cartResult[0].quantity;

                // 3. STOP if cart quantity already hits stock
                if (currentQty >= stock) {
                    return callback(null); // Do nothing
                }

                // 4. Increase quantity by 1
                db.query(
                    `UPDATE cart_itemsss SET quantity = quantity + 1 
                     WHERE user_id = ? AND product_id = ?`,
                    [userId, productId],
                    callback
                );
            }
        );
    });
},

decrease: function (userId, productId, callback) {

    // 1. Get current cart quantity
    db.query(
        `SELECT quantity FROM cart_itemsss WHERE user_id = ? AND product_id = ?`,
        [userId, productId],
        (err, result) => {
            if (err) return callback(err);

            if (result.length === 0) return callback(null); 

            const currentQty = result[0].quantity;

            // 2. If quantity = 1 → remove item
            if (currentQty <= 1) {
                db.query(
                    `DELETE FROM cart_itemsss WHERE user_id = ? AND product_id = ?`,
                    [userId, productId],
                    callback
                );
            } 
            
            // 3. Otherwise decrease by 1
            else {
                db.query(
                    `UPDATE cart_itemsss SET quantity = quantity - 1
                     WHERE user_id = ? AND product_id = ?`,
                    [userId, productId],
                    callback
                );
            }
        }
    );
},


updateQuantity: function(userId, productId, newQty, callback) {

    if (newQty < 1) newQty = 1; // safety check

    // Get stock
    db.query(`SELECT quantity FROM products WHERE id = ?`, [productId], (err, stockResult) => {
        if (err) return callback(err);

        const stock = stockResult[0].quantity;

        if (newQty > stock) newQty = stock; // never exceed stock

        db.query(
            `UPDATE cart_itemsss 
             SET quantity = ?
             WHERE user_id = ? AND product_id = ?`,
            [newQty, userId, productId],
            callback
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
        db.query(
            "DELETE FROM cart_itemsss WHERE user_id = ?",
            [userId],
            callback
        );
    }
};

