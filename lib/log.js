var debug, logFlow;
var format = require('util').format;
var TIMESTAMP_ALIGN = 120;
var displayDetailed = process.env.CB_VERBOSE === 'true';

try {
  debug = require('debug');
  logFlow = debug('chainbuilder:flow');
} catch (e) {
  debug = null;
}

var stringify = function (o) {
  if (o instanceof Error) {
    return o.toString();
  } else if (typeof o === 'function') {
    return '[Function]';
  } else {
    return format('%j', o);
  }
};
var stringOfSize = function (length) {
  if (length < 0) return '  ';
  return new Array(length + 1).join(' ');
};
var depthPadding = function (depth) { return new Array(depth + 1).join(' │'); };

var log = function (depth, message, rightAlign) {
  message = message || '';
  rightAlign = rightAlign || '';
  var indent = depthPadding(depth);
  var padding = stringOfSize(TIMESTAMP_ALIGN - indent.length - message.length - rightAlign.length);
  logFlow(indent + message + padding + rightAlign);
};

var logMethods = {
  started: function (depth, initialResult) {
    var message = ' ┬ ';
    if (displayDetailed && typeof initialResult !== 'undefined') {
      message += format('⟸  %s', stringify(initialResult));
    }
    log(depth, message);

    if (displayDetailed) log(depth + 1)
  },

  finished: function (depth, error, result) {

    var resultString = displayDetailed ? ((error ? ' ✕ ' : '⟹  ') + stringify(error || result)) : ' ';
    var message = format(' ┴ %s', resultString);
    log(depth, message);
  },

  callSkipped: function (depth, callDescriptor) { logMethods.callStarted(depth, callDescriptor, true); },

  callStarted: function (depth, callDescriptor, skipped) {
    if (callDescriptor.method == 'end') return;

    var resultSymbol = skipped ? ' │⤸' : ' ├→' ;
    var signature = '...';
    if (displayDetailed) {
      var args = (callDescriptor.args || []).map(function (arg) {
        return ( typeof (arg && arg.toLogString) === 'function' ) ? arg.toLogString() : stringify(arg);
      });
      signature = args.join(', ');
    }
    var methodName = format('%s(%s)', callDescriptor.method, signature);

    var message = format('%s %s', resultSymbol, methodName);
    log(depth, message);

    if (skipped) log(depth, ' │');
  },

  callFinished: function (depth, startTime, endTime, callDescriptor, error, result) {
    if (callDescriptor.method == 'end') {
      return logMethods.finished(depth, error, result);
    }

    var timeMs = endTime - startTime;
    var time = timeMs > 800 ? ((timeMs / 1000).toFixed(2) + 's') : (timeMs + 'ms');

    var showResult = displayDetailed && (error || typeof result !== 'undefined');
    var resultMessage = showResult ? stringify(error || result) : '';
    var symbol = error ? '✕' : '←';

    var message = format(' │%s %s', symbol, resultMessage);
    log(depth, message, time);

    if (displayDetailed) log(depth, ' │');
  }
};

if (debug) {
  module.exports = logMethods;
} else {
  for (var k in logMethods) if (logMethods.hasOwnProperty(k)) module.exports[k] = function () { /* no-op */ };
}
