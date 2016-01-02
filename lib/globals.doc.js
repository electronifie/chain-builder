// Class hacks - define blank global constructors to present a clean public interface
/**
 * @class Chain
 * @mixes BaseMethods
 */

/**
 * @class CallContext
 */

/**
 * @typedef {Object.<String, MethodCallback>} MethodMap
 * @description
 *   A collection of methods to be made chainable. The methods will be attached to
 *   the chain with the name given as index.
 */

/**
 * @typedef {MethodMap} Mixin
 * @description
 *   There's nothing special about Mixins - they are just bundled up methods like {@link MethodMap}.
 */

/**
 * @callback MethodCallback
 * @description
 *   A method to be made chainable.
 *
 *   Will be called with `this` set to {@link CallContext}.
 * @property {String}      [$beginSubchain]         - the method marks the beginning of a subchain. The string should
 *                                                    uniquely identify the subchain (is used to ensure it's properly
 *                                                    closed).
 * @property {String}      [$endSubchain]           - the method marks the end of a subchain. The string should match
 *                                                    the name provided by the corresponding $beginSubchain method.
 *                                                    The method will be passed the subchain as its first argument.
 * @property {Boolean}     [$interceptErrors=false] - the method should be called if the chain is in an erroring state
 * @param {...*}           args                     - method arguments
 * @param {ResultCallback} cb                       - done callback
 * @this CallContext
 * @returns {undefined}
 */

/**
 * @callback ContextMethod
 * @description
 *   A custom method to be attached to a chain method's context (`this`).
 * @param {...*}           args - method arguments
 * @returns {*}
 */

/**
 * @memberof Chain
 * @callback ResultCallback
 * @param {?(Error|*)} error  - the error (if one occured).
 * @param {?*}         result - the result of the last link in the chain to execute (or null if an error is present).
 * @returns {undefined}
 */
