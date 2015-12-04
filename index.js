var _ = require('lodash');
var curry = require('./lib/curry');
var domain = require('domain');

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
    this._currentResult = undefined;

    // last provided error
    this._currentError = undefined;

    // methods that don't get skipped when an error's called
    this._errorInterceptingMethods = { _tap: true };

    // for intercepting errors thrown asynchronously
    this._domain = domain.create();
    this._domain.on('error', function (error) { this._done(error); }.bind(this));
  };

  /**
   * Hook that stops execution.
   *
   * @param tapCallback {Function}
   * @param done {Function}
   * @private
   */
  Chain.prototype._tap = function (tapCallback, done) {
    tapCallback(this._currentError, this._currentResult);
    done(this._currentError, this._currentResult);
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
    var interceptError = this._errorInterceptingMethods[methodName];
    this._callQueue.push({ method: methodName, args: args, skipOnError: !interceptError });
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
      var skip = this.hasError() && call.skipOnError;
      if (!skip) {
        try {
          this._domain.run(function () {
            this[call.method].apply(this, call.args.concat(done));
          }.bind(this));
        } catch (e) {
          done(e, undefined);
        }
      } else {
        done(this._currentError, this._currentResult);
      }
    }
  };

  /**
   * Process the next method in the queue.
   *
   * @private
   */
  Chain.prototype._done = function (error, result) {
    this._currentError = error;
    this._currentResult = this._currentError ? undefined : result;
    this._isProcessing = false;
    this._maybeProcessNext();
  };

  // Helper methods
  Chain.prototype.hasError = function () { return !!this._currentError; };
  Chain.prototype.previousError = function () { return this._currentError; };
  Chain.prototype.previousResult = function () { return this._currentResult; };

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
