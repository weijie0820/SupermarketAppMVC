// ...existing code...
const db = require('../db');

module.exports = {
    // Get all products
    getAll: function(callback) {
        const sql = 'SELECT id, producName, quantiy, price, image FROM products';
        db.query(sql, function(err, results) {
            callback(err, results);
        });
    },

    // Get a single product by ID
    getById: function(id, callback) {
        const sql = 'SELECT id, producName, quantiy, price, image FROM products WHERE id = ? LIMIT 1';
        db.query(sql, [id], function(err, results) {
            if (err) return callback(err);
            callback(null, results[0] || null);
        });
    },

    // Add a new product
    // product should be an object: { producName, quantiy, price, image }
    add: function(product, callback) {
        const sql = 'INSERT INTO products (producName, quantiy, price, image) VALUES (?, ?, ?, ?)';
        const params = [product.producName, product.quantiy, product.price, product.image];
        db.query(sql, params, function(err, result) {
            callback(err, result);
        });
    },

    // Update an existing product by ID
    // product should be an object: { producName, quantiy, price, image }
    update: function(id, product, callback) {
        const sql = 'UPDATE products SET producName = ?, quantiy = ?, price = ?, image = ? WHERE id = ?';
        const params = [product.producName, product.quantiy, product.price, product.image, id];
        db.query(sql, params, function(err, result) {
            callback(err, result);
        });
    },

    // Delete a product by ID
    delete: function(id, callback) {
        const sql = 'DELETE FROM products WHERE id = ?';
        db.query(sql, [id], function(err, result) {
            callback(err, result);
        });
    }
};
// ...existing code...