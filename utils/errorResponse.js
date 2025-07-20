/**
 * Custom error class for API responses
 * Extends the built-in Error class to include a status code
 */
class ErrorResponse extends Error {
  /**
   * Create a new ErrorResponse
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {Object} [data] - Optional additional data about the error
   */
  constructor(message, statusCode, data = null) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
    this.isOperational = true; // Indicates this is an expected operational error
    
    // Capture stack trace (maintains proper stack trace for where Error was thrown)
    Error.captureStackTrace(this, this.constructor);
  }
}

export default ErrorResponse;