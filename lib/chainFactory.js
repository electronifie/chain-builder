var CallQueue = require('./CallQueue');
var curry = require('./curry');

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

    this._depth = options.depth || 0;
    this._callQueueStack = [];
    this._callQueueNameStack = [];

    // queue of calls to be processed
    this._callQueue = options.callQueue || this._newCallQueue();

    if (options.initialResult !== undefined) {
      this._callQueue.start(options.initialResult);
    }
  };

  Chain.prototype._newCallQueue = function (levelsUp) {
    return new CallQueue({
      methods: this._methods,
      onBeginSubchain: this._beginSubchain.bind(this),
      onEndSubchain: this._endSubchain.bind(this),
      depth: this._depth + (levelsUp || 0),
      Chain: Chain
    });
  };

  Chain.prototype._beginSubchain = function (subchainName) {
    this._callQueueStack.push(this._callQueue);
    this._callQueueNameStack.push(subchainName);
    this._callQueue = this._newCallQueue(1);
  };

  Chain.prototype._endSubchain = function (subchainName) {
    if (this._callQueueStack === 0) throw new Error('Attempting to close a "' + subchainName + '" block when none is open.');

    var currentSubchainName = this._callQueueNameStack.pop();
    if (currentSubchainName !== subchainName) throw new Error('Attempting to close a "' + subchainName + '" block when there\'s an open "' + currentSubchainName + '" block.' );

    var subqueue = this._callQueue;
    this._callQueue = this._callQueueStack.pop();
    return new Chain({ callQueue: subqueue });
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
    var method = this._methods[ methodName ];
    if (!method) throw new Error('Method not present on object: ' + methodName);

    var args = Array.prototype.slice.call(arguments, 1);
    var interceptError = !!method.$interceptErrors;

    if (method.$endSubchain) {
      var subchain = this._endSubchain(method.$endSubchain);
      args.unshift(subchain);
    }

    this._callQueue.add(methodName, args, !interceptError);

    if (method.$beginSubchain) {
      this._beginSubchain(method.$beginSubchain);
    }

    return this;
  };

  Chain.prototype._methods = mixinMethods;

  Chain.prototype.clone = function () {
    if (this._callQueueStack.length > 0) throw new Error('Cannot clone while there are open blocks.');
    return new Chain({ callQueue: this._callQueue.clone() });
  };

  Chain.prototype.run = function (initialResult, cb) {
    if (this._callQueueStack.length > 0) throw new Error('Cannot run while there are open blocks: ' + this._callQueueNameStack.join(','));
    if (!cb) {
      cb = initialResult;
      initialResult = null;
    }
    this._callQueue.clone().start(initialResult, cb);
  };


  Chain.prototype.toLogString = function () { return 'Chain(links=' + this._callQueue._queue.length + ')' };

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
