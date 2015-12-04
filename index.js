var _ = require('lodash');
var curry = require('./lib/curry');

module.exports = function (baseOptions) {
  if (!baseOptions.methods) throw new Error('options.methods is required');
  var methods = baseOptions.methods;

  /**
   * The base Chain object. Keeps track of pending calls and
   * contains all the provided methods as well as methods for
   * async flow control.
   *
   * @param options {{ }}
   * @constructor
   */
  var Chain = function (options) {
    // whether a chained method is currently being executed
    this._isProcessing = false;

    // queue of calls to be processed
    this._callQueue = [];

    // result provided by the last method called
    this._lastResult = undefined;
  };

  /**
   * Hook that stops execution.
   *
   * @param endCallback {Function}
   * @private
   */
  Chain.prototype._tap = function (tapCallback, done) {
    tapCallback(null, this._lastResult);
    done();
  };

  /**
   * Queue up a call to the method.
   *
   * @param methodName {String} name of the method to be executed
   * @param ...
   * @returns {Chain}
   * @private
   */
  Chain.prototype._addToChain = function (methodName/*, ... */) {
    if (!this[methodName]) throw new Error('Method not present on object: ' + methodName);

    var args = Array.prototype.slice.call(arguments, 1);
    this._callQueue.push({ method: methodName, args: args });
    this._maybeProcessNext();
    return this;
  };

  /**
   * Execute the next method in the queue if idle.
   *
   * @private
   */
  Chain.prototype._maybeProcessNext = function () {
    if (this._isProcessing) return; // this method will be called once the currently processing method completes

    if (this._callQueue.length) {
      this._isProcessing = true;
      var call = this._callQueue.shift();
      var done = this._done.bind(this);
      this[call.method].apply(this, call.args.concat(done));
    }
  };

  /**
   * Process the next method in the queue.
   *
   * @private
   */
  Chain.prototype._done = function (error, result) {
    this._lastResult = result;
    this._isProcessing = false;
    this._maybeProcessNext();
  };

  // Add flow hooks to prototype

  Chain.prototype.tap = function (tapCallback) { return this._addToChain('_tap', tapCallback); };
  Chain.prototype.end = Chain.prototype.tap;

  // Add provided methods to prototype

  // Adds two methods to the Chain prototype for each provide method:
  //  - Chain.prototype._myMethod is the actual method
  //  - Chain.prototype.myMethod is a wrapper that adds a call to _myMethod to _callChain
  for (methodName in methods) {
    if (methodName[0] === '_') throw new Error('Methods cannot start with _ (underscore).');

    var deferredMethodName = '_' + methodName;
    if (Chain.prototype[methodName] || Chain.prototype[deferredMethodName]) throw new Error('Method name already used: ' + methodName);

    Chain.prototype[methodName] = curry(Chain.prototype._addToChain, deferredMethodName);
    Chain.prototype[deferredMethodName] = methods[methodName];
  }

  // Return a constructor for the chain
  return function (options) { return new Chain(options); };
};
