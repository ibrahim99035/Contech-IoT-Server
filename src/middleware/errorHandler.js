function errorHandler(err, req, res, next) {
    // Handle the error
    res.status(500).json({ message: err.message });
}

module.exports = { errorHandler };