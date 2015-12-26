var curry = require('./lib/curry');
var domain = require('domain');

module.exports = function (baseOptions) {
  if (! (baseOptions.methods || baseOptions.mixins)) throw new Error('options.methods or options.mixins must be provided.');
  var passedMethods = baseOptions.methods;
  var passedMixins = baseOptions.mixins;

  var methods = {};
  var methodSources = {};

  var addMethod = function (name, method, source) {
    if (methods[name]) throw new Error('Method "' + name + '" was provided by "' + methodSources[name] + '" and "' + source + '".');
    methods[name] = method;
    methodSources[name] = source;
  };

  var addMethods = function (methodMap, source) {
    for (var name in methodMap) addMethod(name, methodMap[name], source);
  };

  addMethods(passedMethods, 'methods');
  for (i = 0; i < (baseOptions.mixins || []).length; i++) addMethods(baseOptions.mixins[i], 'mixin #' + i);

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

    // results saved for future restoration
    this._savedResults = {};

    // result provided by the last method called
    this._currentResult = undefined;

    // last provided error
    this._currentError = undefined;

    // methods that don't get skipped when an error's called
    this._errorInterceptingMethods = { _tap: true, _recover: true, _transform: true };

    // method to consume the next call that comes in instead of adding it to the chain.
    this._waitingCallConsumer = null;

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
    tapCallback.call(this, this._currentError, this._currentResult);
    this._skip(done);
  };

  /**
   * Hook that converts an error into a valid response, then
   * continues with the chain.
   *
   * @param recoverCallback
   * @param done
   * @private
   */
  Chain.prototype._recover = function (recoverCallback, done) {
    if (this.hasError()) {
      recoverCallback.call(this, this._currentError, done);
    } else {
      this._skip(done);
    }
  };

  /**
   * Hook that catches an error or transform's the current result.
   *
   * @param transformCallback {Function}
   * @param done {Function}
   * @private
   */
  Chain.prototype._transform = function (transformCallback, done) {
    transformCallback.call(this, this._currentError, this._currentResult, done);
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
    var callDescriptor = { method: methodName, args: args, skipOnError: !interceptError };

    this._callQueue.push(callDescriptor);
    if (this._waitingCallConsumer) {
      this._processCallConsumer();
    } else {
      this._maybeProcessNext();
    }
    return this;
  };

  /**
   * Pass the next call in the chain to the cb.
   *
   * @param {Function} cb
   * @private
   */
  Chain.prototype._consumeNextCall = function (cb) {
    if (this._waitingCallConsumer) throw new Error('You can\'t (yet) follow a forward-looking function with another forward-looking function.');

    this._waitingCallConsumer = cb;
    if (this._callQueue.length) {
      this._processCallConsumer();
    }
  };

  Chain.prototype._processCallConsumer = function () {
    var call = this._callQueue.shift();
    var consumer = this._waitingCallConsumer;
    this._runSafely(function () {
      // _processCallConsumer should only be called when there's a consumer and call present
      if (!call) throw new Error('_processCallConsumer called when a call wasn\'t present in the queue.');
      if (!consumer) throw new Error('_processCallConsumer called when a consumer wasn\'t present in the queue.');

      consumer.call(this, null, call);
      // set this after, so the consumer can check it's not stacked
      this._waitingCallConsumer = null;
    });
  };

  /**
   * Run a callback with the current context, capturing any thrown errors.
   *
   * @param {Function} cb
   * @private
   */
  Chain.prototype._runSafely = function (cb) { this._domain.run(cb.bind(this)); };

  /**
   * Run a call descriptor from the queue.
   *
   * @param {Object} callDescriptor
   * @param {String} callDescriptor.method
   * @param {*[]} callDescriptor.args
   * @param {Function} done
   *
   * @private
   */
  Chain.prototype._runCall = function (callDescriptor, done) {
    done = done.bind(this);
    try {
      this._runSafely(function () {
        this[ callDescriptor.method ].apply(this, callDescriptor.args.concat(done));
      });
    } catch (e) {
      done(e, undefined);
    }
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
      var callDescriptor = this._callQueue.shift();
      var skip = this.hasError() && callDescriptor.skipOnError;
      if (!skip) {
        this._runCall(callDescriptor, this._done);
      } else {
        this._skip(this._done.bind(this));
      }
    }
  };

  Chain.prototype._skip = function (done) { done(this._currentError, this._currentResult); };

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

  /**
   * Save the previous result so it can be used later.
   *
   * @param variableName {String}
   * @param done {Function}
   * @private
   */
  Chain.prototype._save = function (variableName, done) {
    this._savedResults[variableName] = this._currentResult;
    done(this._currentError, this._currentResult);
  };

  /**
   * Restore the named result so it can be accessed with .previousResult() or .saved().
   *
   * @param variableName {String}
   * @param done {Function}
   * @private
   */
  Chain.prototype._restore = function (variableName, done) {
    done(this._currentError, variableName ? this._savedResults[variableName] : this._savedResults);
  };

  /**
   * Run the next item in the chain as an iterator across the previous result.
   *
   * @param done
   * @private
   */
  Chain.prototype._mapResult = function (done) {
    this._consumeNextCall(function (err, callDescriptor) {
      if (err) return done(err);

      var previousResults = this._currentResult;
      if (!previousResults) return this._skip();
      if (! (previousResults instanceof Array)) {
        return done(new Error('Expected an Array, but got a ' + typeof previousResults + ': ' + JSON.stringify(previousResults)));
      }

      var currentResult = [];
      var error = null;

      var next = function () {
        if ((previousResults.length === 0) || error) {
          return done(error, currentResult);
        } else {
          this._currentResult = previousResults.shift();
          this._runCall(callDescriptor, function (err, result) {
            error = err;
            currentResult.push(result);
            next();
          });
        }
      }.bind(this);

      next();
    });
  };

  // Helper methods
  Chain.prototype.hasError = function () { return !!this._currentError; };
  Chain.prototype.previousError = function () { return this._currentError; };
  Chain.prototype.previousResult = function () { return this._currentResult; };
  Chain.prototype.getMethod = function (methodName) { return methods[methodName].bind(this); };
  Chain.prototype.getSaved = function (variableName) { return variableName ? this._savedResults[variableName] : this._savedResults; };

  // Add flow hooks to prototype

  Chain.prototype.tap = function (tapCallback) { return this._addToChain('_tap', tapCallback); };
  Chain.prototype.end = Chain.prototype.tap;
  Chain.prototype.recover = function (recoverCallback) { return this._addToChain('_recover', recoverCallback); };
  Chain.prototype.transform = function (transformCallback) { return this._addToChain('_transform', transformCallback); };
  Chain.prototype.save = function (variableName) { return this._addToChain('_save', variableName); };
  Chain.prototype.restore = function (variableName) { return this._addToChain('_restore', variableName); };
  Chain.prototype.with = function (variableName) { return this._addToChain('_restore', variableName); };
  Chain.prototype.mapResult = function () { return this._addToChain('_mapResult'); };
  Chain.prototype.eachResult = function () { return this._addToChain('_mapResult'); };

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
