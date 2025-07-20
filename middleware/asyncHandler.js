/**
 * Async handler to wrap async route handlers and middleware
 * Eliminates the need for try/catch blocks in route handlers
 * 
 * @param {Function} fn - The async function to wrap
 * @returns {Function} Express middleware function that handles errors
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;