import { body, param, validationResult } from 'express-validator';

/**
 * Middleware to check validation results and return formatted error response
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0];
    return res.status(400).json({
      success: false,
      message: firstError.msg,
      errors: errors.array(),
    });
  }
  next();
};

/**
 * Validation rules for user registration
 */
export const validateRegister = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 50 })
    .withMessage('Name cannot exceed 50 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  handleValidationErrors,
];

/**
 * Validation rules for user login
 */
export const validateLogin = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

/**
 * Validation rules for room creation
 */
export const validateCreateRoom = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Room name is required')
    .isLength({ min: 2, max: 80 })
    .withMessage('Room name must be between 2 and 80 characters'),
  handleValidationErrors,
];

/**
 * Validation rules for room settings
 */
export const validateRoomSettings = [
  body('anyoneCanControlTimer')
    .optional()
    .isBoolean()
    .withMessage('anyoneCanControlTimer must be a boolean'),
  handleValidationErrors,
];

/**
 * Validation for 6-character room code in params
 */
export const validateRoomCode = [
  param('code')
    .trim()
    .notEmpty()
    .withMessage('Room code is required')
    .isLength({ min: 6, max: 6 })
    .withMessage('Room code must be exactly 6 characters')
    .toUpperCase(),
  handleValidationErrors,
];
