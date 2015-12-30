var CallContext = require('./CallContext');
var domain = require('domain');
var log = require('./log');

var CallQueue = function (options) {
  this._methods = options.methods;
  this._queue = options.queue || [];
  this._depth = options.depth || 0;
  this._Chain = options.Chain;
  this._isStarted = false;
  this._isProcessing = false;
  this._currentPosition = 0;
  this._whenDone = null;
  this._context = new CallContext({
    methods: this._methods,
    createChain: this._createChain.bind(this)
  });
  this._domain = domain.create();

  this._domain.on('error', function (error) { this._callDone(error); }.bind(this));
};

CallQueue.prototype.clone = function () {
  return new CallQueue({
    Chain: this._Chain,
    methods: this._methods,
    queue: this._queue,
    depth: this._depth
  });
};

CallQueue.prototype.add = function (methodName, args, skipOnError) {
  this._queue.push({ method: methodName, args: args, skipOnError: skipOnError });
  this._maybeProcessNext();
};

CallQueue.prototype.start = function (initialResult, cb) {
  log.started(this._depth, initialResult);
  this._isStarted = true;
  this._whenDone = cb;
  this._context.setResult(initialResult);
  this._maybeProcessNext();
};

CallQueue.prototype._createChain = function (initialResult) {
  return new this._Chain({
    initialResult: initialResult,
    depth: this._depth + 1
  });
};

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
 * Run a call descriptor from the queue.
 *
 * @param {Object} callDescriptor
 * @param {String} callDescriptor.method
 * @param {*[]} callDescriptor.args
 * @param {Function} cb
 *
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

/**
 * Run a callback with the current context, capturing any thrown errors.
 *
 * @param {Function} cb
 * @private
 */
CallQueue.prototype._runSafely = function (cb) { this._domain.run(cb.bind(this)); };

CallQueue.prototype._skip = function (done) { this._context.skip(done); };

/**
 * Process the next method in the queue.
 *
 * @private
 */
CallQueue.prototype._callDone = function (error, result) {
  this._context.setError(error);
  this._context.setResult(this._context.hasError() ? undefined : result);
  this._isProcessing = false;
  this._maybeProcessNext();
};

CallQueue.prototype.toLogString = function () { return 'Queue(size=' + this._queue.length + ')' };

module.exports = CallQueue;
