var domain = require('domain');
var log = require('./log');

/**
 * @memberof CallQueue
 * @typedef {Object} CallDescriptor
 * @property {String}    methodName  - name of the method to run
 * @property {Array.<*>} args        - arguments to call the method with
 * @property {Boolean}   skipOnError - should the method be skipped if the chain is in an error state
 */

/**
 * @private
 * @param {Object}                    options
 * @param {MethodMap}                 options.methods - all runnable methods
 * @param {?CallQueue.CallDescriptor} options.queue   - initial method queue
 * @param {?Number}                   options.depth   - depth the queue is embedded in other chains (for logging)
 * @param {function():Chain}          options.Chain   - Chain constructor
 * @param {function():Context}        options.Context - Context constructor
 * @constructor
 */
var CallQueue = function (options) {
  this._methods = options.methods;
  this._queue = options.queue || [];
  this._depth = options.depth || 0;
  this._Chain = options.Chain;
  this._Context = options.Context;
  this._isStarted = false;
  this._isProcessing = false;
  this._currentPosition = 0;
  this._whenDone = null;
  this._context = new this._Context({
    methods: this._methods,
    createChain: this._createChain.bind(this)
  });
  this._domain = domain.create();

  this._domain.on('error', function (error) { this._callDone(error); }.bind(this));
};

/**
 * Create a copy of this call queue.
 *
 * @returns {CallQueue}
 */
CallQueue.prototype.clone = function () {
  return new CallQueue({
    Chain: this._Chain,
    Context: this._Context,
    methods: this._methods,
    queue: this._queue,
    depth: this._depth
  });
};

/**
 * Add a call to the queue.
 *
 * @param {String}    methodName  - name of the method to run
 * @param {Array.<*>} args        - arguments to call the method with
 * @param {Boolean}   skipOnError - should the method be skipped if the chain is in an error state
 * @returns {undefined}
 */
CallQueue.prototype.add = function (methodName, args, skipOnError) {
  this._queue.push({ method: methodName, args: args, skipOnError: skipOnError });
  this._maybeProcessNext();
};

/**
 * Start processing the calls in the queue.
 *
 * @param {*}              initialResult
 * @param {ResultCallback} cb
 */
CallQueue.prototype.start = function (initialResult, cb) {
  log.started(this._depth, initialResult);
  this._isStarted = true;
  this._whenDone = cb;
  this._context.setResult(initialResult);
  this._maybeProcessNext();
};

/**
 * Creates a new chain.
 *
 * @private
 * @param {*} initialResult
 * @returns {Chain}
 */
CallQueue.prototype._createChain = function (initialResult) {
  return new this._Chain({
    initialResult: initialResult,
    depth: this._depth + 1
  });
};

/**
 * Process the next item in the queue if the queue's started and idle.
 *
 * @private
 * @returns {undefined}
 */
CallQueue.prototype._maybeProcessNext = function () {

  // maybeProcessNext() will be called once the currently processing method completes
  if (this._isProcessing || !this._isStarted) return;

  if (this._currentPosition < this._queue.length) {
    this._isProcessing = true;
    var callDescriptor = this._queue[this._currentPosition++];
    var skip = this._context.hasError() && callDescriptor.skipOnError;
    if (!skip) {
      this._runCall(callDescriptor, this._callDone);
    } else {
      log.callSkipped(this._depth, callDescriptor);
      this._skip(this._callDone.bind(this));
    }
  } else if (this._whenDone) {
    log.finished(this._depth, this._context.previousError(), this._context.previousResult());
    this._whenDone(this._context.previousError(), this._context.previousResult());
  }
};

/**
 *
 * @param {CallDescriptor} callDescriptor
 * @param cb
 * @private
 */
CallQueue.prototype._runCall = function (callDescriptor, cb) {
  var method = this._methods[ callDescriptor.method ];
  var start = Date.now();

  var done = function (error, result) {
    var end = Date.now();
    if (!method.$beginSubchain) {
      log.callFinished(this._depth, start, end, callDescriptor, error, result);
    }

    cb.call(this, error, result);
  }.bind(this);

  try {
    this._runSafely(function () {
      if (!method.$endSubchain) {
        log.callStarted(this._depth, callDescriptor);
      }
      method.apply(this._context, callDescriptor.args.concat(done));
    });
  } catch (e) {
    done(e, undefined);
  }
};

CallQueue.prototype._runSafely = function (cb) { this._domain.run(cb.bind(this)); };

CallQueue.prototype._skip = function (done) { this._context.skip(done); };

CallQueue.prototype._callDone = function (error, result) {
  this._context.setError(error);
  this._context.setResult(this._context.hasError() ? undefined : result);
  this._isProcessing = false;
  this._maybeProcessNext();
};

CallQueue.prototype.toLogString = function () { return 'Queue(size=' + this._queue.length + ')' };

module.exports = CallQueue;
