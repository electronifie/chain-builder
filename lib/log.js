var debug, logFlow;
var format = require('util').format;
var TIMESTAMP_ALIGN = 100;
var displayDetailed = process.env.CB_VERBOSE === 'true';

try {
  debug = require('debug');
  logFlow = debug('chainbuilder:flow');
} catch (e) {
  debug = null;
}

var stringOfSize = function (length) {
  if (length < 0) return '  ';
  return new Array(length + 1).join(' ');
};
var depthPadding = function (depth) { return new Array(depth + 1).join(' │'); };

var logMethods = {
  started: function (depth, initialResult) {
    var indent = depthPadding(depth);

    if (depth > 0) {
      var leadPadding = stringOfSize(TIMESTAMP_ALIGN - indent.length);
      var leadMessage = format('%s %s    ', indent, leadPadding);
      logFlow(leadMessage);
    }

    var resultSymbol = '';
    var resultMessage = '';
    if (displayDetailed && typeof initialResult !== 'undefined') {
      resultSymbol = '←';
      resultMessage = JSON.stringify(initialResult);
    }

    var padding = stringOfSize(TIMESTAMP_ALIGN - indent.length - resultSymbol.length - resultMessage.length);

    var message = format('%s─┐%s %s  %s', indent, resultSymbol, resultMessage, padding);
    logFlow(message);

    if (displayDetailed) {
      var tailPadding = stringOfSize(TIMESTAMP_ALIGN - indent.length);
      var tailMessage = format('%s │   %s', indent, tailPadding);
      logFlow(tailMessage);
    }
  },

  finished: function (depth, error, result) {
    var indent = depthPadding(depth);
    var resultString = '';
    if (displayDetailed) {
      var resultMessage = JSON.stringify(error || result);
      var resultSymbol = error ? ' ✕' : '';
      resultString = format('%s %s', resultSymbol, resultMessage);
    }
    var rhPadding = stringOfSize(TIMESTAMP_ALIGN - indent.length - resultString.length);
    var message = format('%s ┴%s  %s ', indent, resultString, rhPadding);
    logFlow(message);
  },

  callSkipped: function (depth, callDescriptor) { logMethods.callStarted(depth, callDescriptor, true); },

  callStarted: function (depth, callDescriptor, skipped) {
    if (callDescriptor.method == 'end') return;

    var resultSymbol = skipped ? '│⤸' : '├→' ;

    var indent = depthPadding(depth);
    var signature = '...';
    if (displayDetailed) {
      var args = (callDescriptor.args || []).map(function (arg) {
        return typeof arg.toLogString === 'function' ? arg.toLogString() : JSON.stringify(arg);
      });
      signature = args.join(', ');
    }
    var methodName = format('%s(%s)', callDescriptor.method, signature);
    var padding = stringOfSize(TIMESTAMP_ALIGN - indent.length - methodName.length - resultSymbol.length);
    var message = format('%s %s %s %s  ', indent, resultSymbol, methodName, padding);
    logFlow(message);

    if (skipped) {
      var tailPadding = stringOfSize(TIMESTAMP_ALIGN - indent.length);
      var tailMessage = format('%s │   %s', indent, tailPadding);
      logFlow(tailMessage);
    }
  },

  callFinished: function (depth, startTime, endTime, callDescriptor, error, result) {
    if (callDescriptor.method == 'end') {
      logMethods.finished(depth, error, result);
      return;
    }

    var timeMs = endTime - startTime;
    var time = timeMs > 800 ? ((timeMs / 1000).toFixed(2) + 's') : (timeMs + 'ms');
    var indent = depthPadding(depth);
    var output = '';
    var symbol = error ? '✕' : '←';

    if (displayDetailed && typeof result !== 'undefined') {
      output = JSON.stringify(error || result);
    }

    var padding = stringOfSize(TIMESTAMP_ALIGN - indent.length - symbol.length - time.length - output.length);
    var resultMessage = format('%s │%s %s %s', indent, symbol, output, padding, time);
    logFlow(resultMessage);

    if (displayDetailed) {
      var tailPadding = stringOfSize(TIMESTAMP_ALIGN - indent.length);
      var tailMessage = format('%s │   %s', indent, tailPadding);
      logFlow(tailMessage);
    }
  }
};

if (debug) {
  module.exports = logMethods;
} else {
  for (var k in logMethods) if (logMethods.hasOwnProperty(k)) module.exports[k] = function () { /* no-op */ };
}
