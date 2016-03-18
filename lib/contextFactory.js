var cleanStack = require('./cleanStack');
/**
 * @module contextFactory
 * @private
 */

/**
 * @private
 * @param {MethodMap} methods
 * @returns {CallContextConstructor}
 */
module.exports = function (methods) {
  /**
   * @private
   * @param {Object}                               options
   * @param {MethodMap}                            options.methods
   * @param {module:chainbuilder~ChainConstructor} options.createChain
   * @constructor
   */
  var CallContext = function (options) {
    /**
     * The parent context (if this is a subchain).
     *
     * @memberof CallContext
     * @type {CallContext|null}
     */
    this.parent = null;
    this._methods = options.methods;
    this._newChain = options.createChain;
    this._currentResult = undefined;
    this._currentError = undefined;
    this._callDescriptor = undefined;
  };

  /**
   * Set the call descriptor for the next call in the chain.
   *
   * @protected
   * @memberof CallContext
   * @param {CallDescriptor} callDescriptor
   * @returns {undefined}
   */
  CallContext.prototype.setCallDescriptor = function (callDescriptor) { this._callDescriptor = callDescriptor; };

  /**
   * Set the result for the next call in the chain.
   *
   * @protected
   * @memberof CallContext
   * @param {*} result
   * @returns {undefined}
   */
  CallContext.prototype.setResult = function (result) { this._currentResult = result; };

  /**
   * Set the error for the next call in the chain.
   *
   * @protected
   * @memberof CallContext
   * @param {*} error
   * @returns {undefined}
   */
  CallContext.prototype.setError = function (error) { this._currentError = error; };

  /**
   * Whether the chain is in an erroring state.
   *
   * @memberof CallContext
   * @returns {boolean}
   */
  CallContext.prototype.hasError = function () { return !!this._currentError; };

  /**
   * Get the result of the previous call.
   *
   * @memberof CallContext
   * @returns {*}
   */
  CallContext.prototype.previousResult = function () { return this._currentResult; };

  /**
   * Get the current error if the chain is in an erroring state.
   *
   * @memberof CallContext
   * @returns {undefined|*}
   */
  CallContext.prototype.previousError = function () { return this._currentError; };

  /**
   * Get a chain-attached method. Note, the method is returned in its provided form without
   * context attached. You will need to provide both the context, and a callback as its final
   * parameter.
   *
   * @memberof CallContext
   * @param {String} name - the name of the method to get
   * @returns {MethodCallback}
   */
  CallContext.prototype.getMethod = function (name) { return this._methods[ name ].bind(this); };

  /**
   * Pass the result/error from the previous call on to the next one.
   *
   * @memberof CallContext
   * @param {ResultCallback} cb
   * @returns {undefined}
   */
  CallContext.prototype.skip = function (cb) { cb(this.previousError(), this.previousResult()); };

  /**
   * Create a new empty chain.
   *
   * Using this instead of constructing the chain directly will help preserve call depth in logging.
   *
   * @memberof CallContext
   * @param {*} initialValue
   * @returns {Chain}
   */
  CallContext.prototype.newChain = function (initialValue) { return this._newChain(initialValue); };

  /**
   * Get a stack for the current call without chainbuilder cruft. Note, callStack requires enableStack to be set.
   *
   * return.callStack is the origin location of the call (e.g. where `.methodWithStackCall(...)` is)
   * return.execStack is the return location of the method (e.g. where `this.stack()` is called from within `function methodWithStackCall() {...}`)
   *
   * @memberof CallContext
   * @returns {{
   *   callStack: (Array.<String>),
   *   execStack: Array.<String>
   * }}
   */
  CallContext.prototype.cleanStacks = function () {
    return {
      callStack: this._callDescriptor && this._callDescriptor.stack,
      execStack: cleanStack()
    };
  };

  // Methods from mixins
  for (var methodName in methods) {
    if (!methods.hasOwnProperty(methodName)) continue;
    if (CallContext.prototype[methodName]) throw new Error('Context method name already used: ' + methodName);
    CallContext.prototype[methodName] = methods[methodName];
  }

  return CallContext;
};
