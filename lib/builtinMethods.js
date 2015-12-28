module.exports = {
  /**
   * Hook that stops execution.
   *
   * @param tapCallback {Function}
   * @param done {Function}
   * @private
   */
  tap: function (tapCallback, done) {
    tapCallback.call(this, this.previousError(), this.previousResult());
    this.skip(done);
  },

  end: function (endCallback, done) {
    this.getMethod('tap')(endCallback, done);
  },

  /**
   * Hook that converts an error into a valid response, then
   * continues with the chain.
   *
   * @param recoverCallback
   * @param done
   * @private
   */
  recover: function (recoverCallback, done) {
    if (this.hasError()) {
      recoverCallback.call(this, this.previousError(), done);
    } else {
      this.skip(done);
    }
  },

  /**
   * Hook that catches an error or transform's the current result.
   *
   * @param transformCallback {Function}
   * @param done {Function}
   * @private
   */
  transform: function (transformCallback, done) {
    transformCallback.call(this, this._currentError, this._currentResult, done);
  }
};
