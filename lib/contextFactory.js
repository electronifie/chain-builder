module.exports = function (mixinMethods) {
  var CallContext = function (options) {
    this._methods = options.methods;
    this._newChain = options.createChain;
    this._currentResult = undefined;
    this._currentError = undefined;
  };

  CallContext.prototype.setResult = function (result) { this._currentResult = result; };
  CallContext.prototype.setError = function (result) { this._currentError = result; };

  CallContext.prototype.hasError = function () { return !!this._currentError; };
  CallContext.prototype.previousResult = function () { return this._currentResult; };
  CallContext.prototype.previousError = function () { return this._currentError; };
  CallContext.prototype.getMethod = function (methodName) { return this._methods[ methodName ].bind(this); };
  CallContext.prototype.skip = function (cb) { cb(this.previousError(), this.previousResult()); };
  CallContext.prototype.newChain = function (options) { return this._newChain(options); };

  for (var methodName in mixinMethods) {
    if (!mixinMethods.hasOwnProperty(methodName)) continue;
    if (CallContext.prototype[methodName]) throw new Error('Context method name already used: ' + methodName);
    CallContext.prototype[methodName] = mixinMethods[methodName];
  }

  return CallContext;
};
