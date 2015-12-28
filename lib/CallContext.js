var CallContext = function (options) {
  this._methods = options.methods;
  this._currentResult = undefined;
  this._currentError = undefined;
};

CallContext.prototype.setResult = function (result) { this._currentResult = result; };
CallContext.prototype.setError = function (result) { this._currentError = result; };

CallContext.prototype.hasError = function () { return !!this._currentError; };
CallContext.prototype.previousResult = function () { return this._currentResult; };
CallContext.prototype.previousError = function () { return this._currentError; };
CallContext.prototype.getMethod = function (methodName) { return this._methods[methodName].bind(this); };
CallContext.prototype.skip = function (cb) { cb(this.previousError(), this.previousResult()); };

module.exports = CallContext;
