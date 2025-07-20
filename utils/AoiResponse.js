/**
 * ApiResponse class for standardizing API responses
 * @class ApiResponse
 */
class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Create a successful response
   * @param {number} statusCode - HTTP status code
   * @param {Object} data - Response data
   * @param {string} message - Response message
   * @returns {ApiResponse} Response object
   */
  static success(data, message = "Success", statusCode = 200) {
    return new ApiResponse(statusCode, data, message);
  }

  /**
   * Create a paginated response
   * @param {Array} data - Array of items
   * @param {number} page - Current page number
   * @param {number} limit - Items per page
   * @param {number} total - Total number of items
   * @param {string} message - Response message
   * @returns {ApiResponse} Response object
   */
  static paginated(data, page, limit, total, message = "Success") {
    const totalPages = Math.ceil(total / limit);
    return new ApiResponse(200, {
      docs: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }, message);
  }

  /**
   * Transform the response to plain object
   * @returns {Object} Plain response object
   */
  toJSON() {
    return {
      success: this.success,
      statusCode: this.statusCode,
      message: this.message,
      data: this.data,
      timestamp: this.timestamp
    };
  }

  /**
   * Send the response
   * @param {Object} res - Express response object
   */
  send(res) {
    res.status(this.statusCode).json(this.toJSON());
  }
}

export default ApiResponse;