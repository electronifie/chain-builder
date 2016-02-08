var domain = require('domain');

/**
 * @memberof CallQueue
 * @typedef {Object} CallDescriptor
 * @property {String}    method      - name of the method to run
 * @property {Array.<*>} args        - arguments to call the method with
 * @property {CallQueue} subqueue    - subqueue for $endSubchain methods
 * @property {Boolean}   skipOnError - should the method be skipped if the chain is in an error state
 */

/**
 * @private
 * @param {Object}                    options
 * @param {Logger}                    options.logger  - logger instance
 * @param {MethodMap}                 options.methods - all runnable methods
 * @param {?CallQueue.CallDescriptor} options.queue   - initial method queue
 * @param {function():Chain}          options.Chain   - Chain constructor
 * @param {function():Context}        options.Context - Context constructor
 * @constructor
 */
var CallQueue = function (options) {
  this._methods = options.methods;
  this._queue = options.queue || [];
  this._logger = options.logger;
  this._chainStartMemo = null;
  this._Chain = options.Chain;
  this._Context = options.Context;
  this._isStarted = false;
  this._isProcessing = false;
  this._currentPosition = 0;
  this._whenDone = null;
  this._parentQueue = null;
  this._context = new this._Context({
    methods: this._methods,
    createChain: this._createChain.bind(this)
  });
  this._domain = domain.create();

  this._subqueue = null;
  this._subqueueType = null;
  this._subqueueDepth = null;

  this._domain.on('error', function (error) { this._callDone(error); }.bind(this));
};

/**
 * Create a copy of this call queue.
 *
 * @returns {CallQueue}
 */
CallQueue.prototype.clone = function () {
  var clone = new CallQueue({
    Chain: this._Chain,
    Context: this._Context,
    methods: this._methods,
    logger: this._logger,
    queue: this._queue
  });
  if (this._parentQueue) clone._setParent(this._parentQueue);
  return clone;
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
  var method = this._methods[methodName];

  var createdSubqueue = this._maybeOpenSubqueue(method);
  var subqueue = this._maybeCloseSubqueue(method);

  if (this._subqueue && !createdSubqueue) {
    this._subqueue.add(methodName, args, skipOnError);
  } else {
    this._queue.push({ method: methodName, subqueue: subqueue, args: args, skipOnError: skipOnError });
    this._maybeProcessNext();
  }
};

/**
 * Start processing the calls in the queue.
 *
 * @param {*}              initialResult
 * @param {ResultCallback} cb
 */
CallQueue.prototype.start = function (initialResult, cb) {
  this._chainStartMemo = this._logger.chainStart(initialResult, this._parentQueue && this._parentQueue._chainStartMemo);
  this._isStarted = true;
  this._whenDone = cb;
  this._context.setResult(initialResult);
  this._maybeProcessNext();
};

CallQueue.prototype._setParent = function (queue) {
  this._parentQueue = queue;
  this._context.parent = queue._context;
};

/**
 * Create a copy of this queue one level deep and without the methods.
 *
 * @returns {CallQueue}
 * @private
 */
CallQueue.prototype._newChildQueue = function () {
  var child = new CallQueue({
    methods: this._methods,
    logger: this._logger,
    Chain: this._Chain,
    Context: this._Context
  });
  child._setParent(this);
  return child;
};

/**
 * Handle the opening of a subqueue if this method has $beginSubchain set.
 *
 * @param {MethodCallback} method
 * @returns {boolean} whether an immediate subqueue was created
 * @private
 */
CallQueue.prototype._maybeOpenSubqueue = function (method) {
  var subqueueType = method.$beginSubchain;
  if (typeof subqueueType === 'undefined') return false;

  this._subqueueDepth++;

  if (!this._subqueue) {
    this._subqueueType = subqueueType;

    this._subqueue = this._newChildQueue();
    return true;
  } else {
    return false;
  }
};

/**
 * Handle the closing of a subqueue if this method has $endSubchain set.
 *
 * @param {MethodCallback} method
 * @returns {SubQueue|undefined} the closed subqueue
 * @private
 */
CallQueue.prototype._maybeCloseSubqueue = function (method) {
  var subqueueType = method.$endSubchain;
  if (typeof subqueueType === 'undefined') return;
  if (!this._subqueue) {
    throw new Error('Closing a "' + method.$endSubchain + '" block that wasn\'t opened.');
  }

  this._subqueueDepth--;
  if (this._subqueueDepth > 0) return;

  if (method.$endSubchain !== this._subqueueType) {
    throw new Error('Closing a "' + method.$endSubchain + '" block when there\'s an open "' + this._subqueueType + '" block.');
  }

  var subqueue = this._subqueue;
  this._subqueue = null;
  this._subqueueType = null;

  return subqueue;
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
    callQueue: this._newChildQueue()
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
      this._logger.callSkipped(this._chainStartMemo, callDescriptor);
      this._skip(this._callDone.bind(this));
    }
  } else if (this._whenDone) {
    this._logger.chainEnd(this._chainStartMemo, this._context);
    this._whenDone(this._context.previousError(), this._context.previousResult());
  }
};

/**
 * @param {CallDescriptor} callDescriptor
 * @param cb
 * @private
 */
CallQueue.prototype._runCall = function (callDescriptor, cb) {
  var method = this._methods[ callDescriptor.method ];
  var callStartMemo;

  var done = function (error, result) {
    if (callStartMemo) this._logger.callEnd(callStartMemo, callDescriptor, error, result);
    cb.call(this, error, result);
  }.bind(this);

  try {
    this._runSafely(function () {
      var args;
      if (callDescriptor.subqueue) {
        var subqueue = callDescriptor.subqueue.clone();
        subqueue._setParent(this);
        var subchain = new this._Chain({ callQueue: subqueue });
        args = [subchain].concat(callDescriptor.args);
      } else {
        args = callDescriptor.args;
      }
      if (method.$previousResult) {
        this._validatePreviousResult(method.$previousResult);
      }
      if (method.$args) {
        args = this._validateAndPopulateArgs(args, method.$args);
      }
      if (callDescriptor.method === 'end') {
        this._logger.chainEnd(this._chainStartMemo, this._context);
      } else {
        callStartMemo = this._logger.callStart(this._chainStartMemo, callDescriptor, args, method);
      }
      method.apply(this._context, args.concat(done));
    }.bind(this));
  } catch (e) {
    done(e, undefined);
  }
};

CallQueue.prototype._validatePreviousResult = function (previousResultSpec) {
  var previousResult = this._context.previousResult();

  if (previousResultSpec.instanceOf && ( !(previousResult instanceof previousResultSpec.instanceOf) )) {
    throw new Error('Validation Error. Expected previousResult to be an instance of <' + (previousResultSpec.instanceOf.name || 'Unnamed Class') + '>');
  }

  if (previousResultSpec.type && (typeof previousResult !== previousResultSpec.type)) {
    throw new Error('Validation Error. Expected previousResult to be "' + previousResultSpec.type + '" but was "' + typeof previousResult + '": ' + previousResult);
  }
};

CallQueue.prototype._validateAndPopulateArgs = function (args, argSpec) {
  var argsWithDefaults = [];

  if (args.length > argSpec.length) {
    throw new Error('Validation Error. Expected ' + argSpec.length + ' arguments, but got ' + args.length);
  }

  var noMoreArgs, currentArg, currentArgSpec, arg;
  for (var i = 0; i < argSpec.length; i++) {
    noMoreArgs = i >= args.length;
    currentArg = args[i];
    currentArgSpec = argSpec[i];

    arg = currentArg;
    if (noMoreArgs) {
      if (currentArgSpec.required) {
        throw new Error('Validation Error. Argument ' + (i + 1) + ' is required but was not provided.');
      }
      arg = currentArgSpec.defaultToPreviousResult ? this._context.previousResult() : currentArgSpec['default'];
    }


    if (
      (typeof arg === 'function') &&
      (
        currentArgSpec.instanceOf ||
        ( currentArgSpec.type && (currentArgSpec.type !== 'function') )
      )
    ) {
      arg = arg.call(this._context, this._context.previousResult())
    }

    if (currentArgSpec.type && (typeof arg !== currentArgSpec.type) ) {
      throw new Error('Validation Error. Expected "' + typeof arg + '" to be "' + currentArgSpec.type + '" for: ' + arg);
    }

    if (currentArgSpec.instanceOf && ( !(arg instanceof currentArgSpec.instanceOf) )) {
      throw new Error('Validation Error. Expected argument ' + (i + 1) + ' to be an instance of <' + (currentArgSpec.instanceOf.name || 'Unnamed Class') + '>');
    }

    argsWithDefaults.push(arg);
  }

  return argsWithDefaults;
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
