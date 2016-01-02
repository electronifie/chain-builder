// Inspired by https://medium.com/@kbrainwave/currying-in-javascript-ce6da2d324fe#.ykq2c689i

/**
 * Curries a function with the provided parameters. Like _.bind but without altering
 * the context (this).
 *
 * @param {Function} fn the function to curry
 * @returns {Function}
 */
module.exports = function (fn) {
  var baseArgs = Array.prototype.slice.call(arguments, 1);

  return function () {
    var callArgs = Array.prototype.slice.call(arguments, 0);
    return fn.apply(this, baseArgs.concat(callArgs))
  };
};
