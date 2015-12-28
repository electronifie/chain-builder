var CallQueue = require('./CallQueue');
var curry = require('./curry');

var ERROR_INTERCEPTING_METHODS = { end: true, tap: true, recover: true, transform: true };

module.exports = function (mixinMethods) {
  /**
   * The base Chain object. Keeps track of pending calls and
   * contains all the provided methods as well as methods for
   * async flow control.
   *
   * @param options {{ initialResult: * }}
   * @constructor
   */
  var Chain = function (options) {
    options = options || {};

    // queue of calls to be processed
    this._callQueue = new CallQueue({ methods: this._methods });

    if (options.initialResult !== undefined) {
      this.run(options.initialResult);
    }
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
    if (!this._methods[methodName]) throw new Error('Method not present on object: ' + methodName);

    var args = Array.prototype.slice.call(arguments, 1);
    var interceptError = ERROR_INTERCEPTING_METHODS[methodName];
    this._callQueue.add(methodName, args, !interceptError);

    return this;
  };

  Chain.prototype._methods = mixinMethods;

  Chain.prototype.run = function (initialResult, cb) {
    this._callQueue.start(initialResult, cb);
  };

  // Add provided methods to prototype

  // Adds two methods to the Chain prototype for each provide method:
  //  - Chain.prototype._myMethod is the actual method
  //  - Chain.prototype.myMethod is a wrapper that adds a call to _myMethod to _callChain
  for (methodName in mixinMethods) {

    if (Chain.prototype[methodName]) throw new Error('Method name already used: ' + methodName);

    Chain.prototype[methodName] = curry(Chain.prototype._addToChain, methodName);
  }

  return Chain;
};
