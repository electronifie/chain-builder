var IGNORE_REGEX = /(chain-?builder\/lib\/|Domain.run)/;

/**
 * Returns a stack of the current call, untainted by chainbuilder calls.
 *
 * @returns {Function}
 */
module.exports = function () {
  return new Error().stack.split('\n').slice(1).filter(function (s) { return !IGNORE_REGEX.test(s) });
};
