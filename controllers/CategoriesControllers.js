const Category = require("../models/Category");

const CategoriesControllers = {
  // show list (admin)
  list(req, res) {
    Category.getAll((err, rows) => {
      if (err) {
        console.error("Category.getAll error:", err);
        req.flash("error", "DB error");
        return res.redirect("/shopping");
      }
      res.render("categories", { categories: rows });
    });
  },

  // API for sidebar usage (optional)
  getAllJson(req, res) {
    Category.getAll((err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows);
    });
  },

  // add category (admin)
  create(req, res) {
    const name = (req.body.category_name || "").trim();
    if (!name) {
      req.flash("error", "Category name cannot be empty");
      return res.redirect("/admin/categories");
    }

    Category.create(name, (err) => {
      if (err) {
        console.error("Category.create error:", err);
        req.flash("error", "Category already exists or DB error");
        return res.redirect("/admin/categories");
      }
      req.flash("success", "Category added");
      res.redirect("/admin/categories");
    });
  },

  // update category (admin)
  update(req, res) {
    const id = req.params.id;
    const name = (req.body.category_name || "").trim();
    if (!name) {
      req.flash("error", "Category name cannot be empty");
      return res.redirect("/admin/categories");
    }

    Category.update(id, name, (err) => {
      if (err) {
        console.error("Category.update error:", err);
        req.flash("error", "DB error");
        return res.redirect("/admin/categories");
      }
      req.flash("success", "Category updated");
      res.redirect("/admin/categories");
    });
  },

  // delete category (admin)
  remove(req, res) {
    const id = req.params.id;

    Category.remove(id, (err) => {
      if (err) {
        console.error("Category.remove error:", err);
        req.flash("error", "Cannot delete (category may be used by products)");
        return res.redirect("/admin/categories");
      }
      req.flash("success", "Category removed");
      res.redirect("/admin/categories");
    });
  }
};

module.exports = CategoriesControllers;
