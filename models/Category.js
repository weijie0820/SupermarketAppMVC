const db = require("../db"); 
// ⚠️ change "../db" to your actual DB connection export file
// (example: "../database" or "../config/db")

const Category = {
  getAll(callback) {
    const sql = `SELECT category_id, category_name FROM categories ORDER BY category_name ASC`;
    db.query(sql, callback);
  },

  getById(categoryId, callback) {
    const sql = `SELECT category_id, category_name FROM categories WHERE category_id = ?`;
    db.query(sql, [categoryId], callback);
  },

  create(categoryName, callback) {
    const sql = `INSERT INTO categories (category_name) VALUES (?)`;
    db.query(sql, [categoryName], callback);
  },

  update(categoryId, categoryName, callback) {
    const sql = `UPDATE categories SET category_name = ? WHERE category_id = ?`;
    db.query(sql, [categoryName, categoryId], callback);
  },

  remove(categoryId, callback) {
    const sql = `DELETE FROM categories WHERE category_id = ?`;
    db.query(sql, [categoryId], callback);
  }
};

module.exports = Category;
