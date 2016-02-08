
/**
 * @private
 * @param {LogHandler[]} logHandlers
 * @constructor
 */
var Logger = function (logHandlers) {
  this.logHandlers = logHandlers;
  this.isDisabled = this.logHandlers.length === 0;
  if (!this.isDisabled) {
    this.loggerId = Date.now() + '-' + ((Math.random() * 1000) | 0);
    this.idIndex = {};
  }
};

/**
 * @param {String} prefix
 * @private
 */
Logger.prototype._createId = function (prefix) {
  this.idIndex[prefix] = this.idIndex[prefix] || 0;
  return this.loggerId + '-' + prefix + '-' + this.idIndex[prefix]++;
};

/**
 * @param {Logger.LogEvent} eventName
 * @param {Logger.Details} details
 * @private
 */
Logger.prototype._logToHandlers = function (eventName, details) {
  this.logHandlers.forEach(function (logHandler) { logHandler(eventName, details); });
};

/**
 * @typedef {null | { timestamp: Number, instanceId: String, parentChainInstanceId: (String|null), depth: Number }} Logger.ChainStartMemo
 */

/**
 * @param {*} initialValue
 * @param {Logger.ChainStartMemo | null} parentChainStartMemo
 * @return {Logger.ChainStartMemo}
 */
Logger.prototype.chainStart = function (initialValue, parentChainStartMemo) {
  if (this.isDisabled) return null;

  var instanceId = this._createId('chain');
  var parentChainInstanceId = parentChainStartMemo && parentChainStartMemo.instanceId;
  var depth = parentChainStartMemo ? parentChainStartMemo.depth + 1 : 0;

  /** @type {Logger.ChainStartDetails} */
  var details = {
    instanceId: instanceId,
    parentChainInstanceId: parentChainInstanceId,
    depth: depth,
    initialValue: initialValue
  };

  this._logToHandlers(Logger.LogEvent.CHAIN_START, details);
  return {
    timestamp: Date.now(),
    instanceId: instanceId,
    parentChainInstanceId: parentChainInstanceId,
    depth: depth
  };
};

/**
 * @param {Logger.ChainStartMemo} chainStartMemo
 * @param {CallContext} callContext
 */
Logger.prototype.chainEnd = function (chainStartMemo, callContext) {
  if (this.isDisabled) return;

  var runTime = chainStartMemo.timestamp ? Date.now() - chainStartMemo.timestamp : null;
  var instanceId = chainStartMemo.instanceId;
  var parentChainInstanceId = chainStartMemo.parentChainInstanceId;
  var depth = chainStartMemo.depth;
  var result = callContext.previousResult();
  var error = callContext.previousError();

  /** @type {Logger.ChainEndDetails} */
  var details = {
    runTime: runTime,
    instanceId: instanceId,
    parentChainInstanceId: parentChainInstanceId,
    depth: depth,
    result: result,
    error: error
  };

  this._logToHandlers(Logger.LogEvent.CHAIN_END, details);
};

/**
 * @typedef {null | { timestamp: Number, depth: Number, instanceId: String, chainInstanceId: String }} Logger.CallStartMemo
 */

/**
 * @param {Logger.ChainStartMemo} chainStartMemo
 * @param {CallDescriptor} callDescriptor
 * @param {*[]} evaluatedArgs
 * @param {MethodCallback} method
 * @returns {Logger.CallStartMemo} callStartMemo
 */
Logger.prototype.callStart = function (chainStartMemo, callDescriptor, evaluatedArgs, method) {
  if (this.isDisabled) return null;

  var instanceId = this._createId('chain');
  var chainInstanceId = chainStartMemo.instanceId;
  var depth = chainStartMemo.depth;
  var args = callDescriptor.args;

  /** @type {Logger.CallStartDetails} */
  var details = {
    methodName: callDescriptor.method,
    instanceId: instanceId,
    chainInstanceId: chainInstanceId,
    depth: depth,
    args: args,
    evaluatedArgs: evaluatedArgs,
    method: method
  };

  this._logToHandlers(Logger.LogEvent.CALL_START, details);
  return {
    timestamp: Date.now(),
    instanceId: instanceId,
    chainInstanceId: chainInstanceId,
    depth: depth
  };
};

/**
 * @param {Logger.CallStartMemo} callStartMemo
 * @param {CallDescriptor} callDescriptor
 * @param {*} error
 * @param {*} result
 */
Logger.prototype.callEnd = function (callStartMemo, callDescriptor, error, result) {
  if (this.isDisabled) return;
  callStartMemo = callStartMemo || {};

  var runTime = callStartMemo.timestamp ? Date.now() - callStartMemo.timestamp : null;
  var instanceId = callStartMemo.instanceId;
  var chainInstanceId = callStartMemo.chainInstanceId;
  var depth = callStartMemo.depth;

  /** @type {Logger.CallEndDetails} */
  var details = {
    methodName: callDescriptor.method,
    runTime: runTime,
    instanceId: instanceId,
    chainInstanceId: chainInstanceId,
    depth: depth,
    result: result,
    error: error
  };

  this._logToHandlers(Logger.LogEvent.CALL_END, details);
};

/**
 * @param {Logger.ChainStartMemo} chainStartMemo
 * @param {CallDescriptor} callDescriptor
 */
Logger.prototype.callSkipped = function (chainStartMemo, callDescriptor) {
  if (this.isDisabled) return;

  /** @type {Logger.CallSkippedDetails} */
  var details = {
    chainInstanceId: chainStartMemo.instanceId,
    methodName: callDescriptor.method,
    depth: chainStartMemo.depth,
    args: callDescriptor.args
  };

  this._logToHandlers(Logger.LogEvent.CALL_SKIPPED, details);
};

/**
 * @enum {string}
 */
Logger.LogEvent = {
  CHAIN_START:  'chainStart',
  CHAIN_END:    'chainEnd',
  CALL_START:   'callStart',
  CALL_END:     'callEnd',
  CALL_SKIPPED: 'callSkipped'
};

/**
 * @typedef {
 *   Logger.ChainStartDetails |
 *   Logger.ChainEndDetails |
 *   Logger.CallStartDetails |
 *   Logger.CallEndDetails |
 *   Logger.CallSkippedDetails
 * } Logger.Details
 */

/**
 * @typedef {{ instanceId: String, depth: Number, initialValue: *, parentChainInstanceId: (String|null) }} Logger.ChainStartDetails
 */

/**
 * @typedef {{ instanceId: String, depth: Number, parentChainInstanceId: (String|null), runTime: Number, result: *, error: * }} Logger.ChainEndDetails
 */

/**
 * @typedef {{ instanceId: String, depth: Number, chainInstanceId: String, methodName: String, args: *[], evaluatedArgs: *[] }} Logger.CallStartDetails
 */

/**
 * @typedef {{ instanceId: String, depth: Number, chainInstanceId: String, methodName: String, runTime: Number, result: *, error: * }} Logger.CallEndDetails
 */

/**
 * @typedef {{ methodName: String, depth: Number, }} Logger.CallSkippedDetails
 */

module.exports = Logger;
