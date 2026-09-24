const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const usersController = require('../controllers/usersController');
const { body } = require('express-validator');

router.post('/',
    authenticateToken,
    authorizeRoles('super_admin', 'manager'),
    [
        body('clinic_id').optional({ checkFalsy: true }).isInt().withMessage('A valid clinic_id is required'),
        body('name').trim().notEmpty().withMessage('Name is required'),
        body('role').trim().notEmpty().withMessage('Select role for user'),
        body('username').notEmpty().withMessage('Uername is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    usersController.create
);

module.exports = router;