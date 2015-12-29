
/**
 * Hook that stops execution.
 *
 * @param {Function} tapCallback
 * @param {Function} done
 */
module.exports.tap = function (tapCallback, done) {
  tapCallback.call(this, this.previousError(), this.previousResult());
  this.skip(done);
};
module.exports.tap.$interceptErrors = true;
module.exports.end = module.exports.tap; // Alias

/**
 * Hook that converts an error into a valid response, then
 * continues with the chain.
 *
 * @param {Function} recoverCallback
 * @param {Function} done
 */
module.exports.recover = function (recoverCallback, done) {
  if (this.hasError()) {
    recoverCallback.call(this, this.previousError(), done);
  } else {
    this.skip(done);
  }
};
module.exports.recover.$interceptErrors = true;

/**
 * Hook that catches an error or transform's the current result.
 *
 * @param {Function} transformCallback
 * @param {Function} done
 */
module.exports.transform = function (transformCallback, done) {
  transformCallback.call(this, this._currentError, this._currentResult, done);
};
module.exports.transform.$interceptErrors = true;

/**
 * Hook that makes a value available to the next call.
 *
 * @param {*} value
 * @param {Function} done
 * */
module.exports.inject = function (value, done) { done(null, value); };
