/**
 * @mixin BaseMethods
 */

/**
 * @memberof BaseMethods
 * @function tap
 * @description
 *   Peek at the current value in the chain, then pass it on unchanged to the next call
 *   in the chain.
 * @instance
 * @param {Chain.ResultCallback} tapCallback - callback that receives the current result or error.
 * @this CallContext
 * @property {Boolean} $interceptErrors - true
 * @example
 * request()
 *   .get('http://jsonip.com')
 *   .tap(function (err, result) { console.log('' + result); })
 *     // > {"ip":"123.123.101","about":"/about","Pro!":"http://getjsonip.com"}
 *   .asJson()
 *   .tap(function (err, result) { console.log('' + result); })
 *     // > [object Object]
 *   .run()
 */
module.exports.tap = function (tapCallback, done) {
  tapCallback.call(this, this.previousError(), this.previousResult());
  this.skip(done);
};
module.exports.tap.$interceptErrors = true;

/**
 * @memberof BaseMethods
 * @function end
 * @description
 *   Get the final result in the chain. Operates identically to {@link BaseMethods#tap} (except for
 *   logging).
 * @instance
 * @param {Chain.ResultCallback} endCallback - callback that receives the current result or error.
 * @this CallContext
 * @property {Boolean} $interceptErrors - true
 * @example
 * request()
 *   .getFromPrevious()
 *   .end(function (err, result) { console.log('' + result); })
 *     // > {"ip":"123.123.101","about":"/about","Pro!":"http://getjsonip.com"}
 */
module.exports.end = function (endCallback, done) {
  // Call done first so logging output closes the chain before the final cb is processed.
  this.skip(done);
  endCallback.call(this, this.previousError(), this.previousResult());
};
module.exports.end.$interceptErrors = true;

/**
 * @memberof BaseMethods
 * @callback RecoverCallback
 * @param {Error|*}              error - the current error in the chain. May have come from any of the previous calls in the chain.
 * @param {Chain.ResultCallback} done  - receives the recovered result.
 * @this CallContext
 * @returns {undefined}
 */

/**
 * @memberof BaseMethods
 * @function recover
 * @description
 *   Recover from an error thrown by one of the previous calls in the chain. Similar to transform, but only called if
 *   one of the previous calls errored and is only passed the error and cb.
 * @instance
 * @param {BaseMethods.RecoverCallback} recoverCallback - takes an error and a callback to be passed the
 *                                                        recovered result or transformed error. Will only be
 *                                                        called if the chain is in an erroring state.
 * @this CallContext
 * @property {Boolean} $interceptErrors - true
 * @example
 * request()
 *   .get('INVALID')
 *   .asJson() // will not be called, as the above call threw an error
 *   .recover(function (err, cb) { cb(null, '0.0.0.0'); })
 *   .tap(function (err, result) { console.log(result); })
 *     // > 0.0.0.0
 *   .run()
 */
module.exports.recover = function (recoverCallback, done) {
  if (this.hasError()) {
    recoverCallback.call(this, this.previousError(), done);
  } else {
    this.skip(done);
  }
};
module.exports.recover.$interceptErrors = true;

/**
 * @memberof BaseMethods
 * @callback TransformCallback
 * @param {Error|*|undefined}    error  - the current error in the chain (if present). May have come from any of the previous calls in the chain.
 * @param {?*}                   result - the current result in the chain.
 * @param {Chain.ResultCallback} done   - receives the transformed result.
 * @this CallContext
 * @returns {undefined}
 */

/**
 * @memberof BaseMethods
 * @function transform
 * @description
 *   Alter the current value in the chain. Called when the previous call returned successfully, or if one of the
 *   previous calls errors.
 * @instance
 * @param {BaseMethods.TransformCallback} transformCallback - takes a result, error and a callback to be passed the
 *                                                            transformed result.
 * @this CallContext
 * @property {Boolean} $interceptErrors - true
 * @example
 * request()
 *   .get('http://jsonip.com')
 *   .asJson()
 *   .transform(function (err, result, cb) { cb(null, result.ip); })
 *   .tap(function (err, result) { console.log(result); }) // > 123.123.101
 *   .run()
 */
module.exports.transform = function (transformCallback, done) {
  transformCallback.call(this, this._currentError, this._currentResult, done);
};
module.exports.transform.$interceptErrors = true;

/**
 * @memberof BaseMethods
 * @function inject
 * @description
 *   Inject the static value into the chain.
 * @instance
 * @param {*} value - the value to inject.
 * @this CallContext
 * @example
 * request()
 *  .inject('foobar')
 *  .tap(function (err, result) { console.log(result); }) // > 'foobar'
 *  .run()
 */
module.exports.inject = function (value, done) { done(null, value); };

/**
 * @memberof BaseMethods
 * @callback TransformCallback
 * @param {?*}  result - the current result in the chain.
 * @this CallContext
 * @returns {*} the new result
 */

/**
 * @memberof BaseMethods
 * @function transformResult
 * @description
 *   Synchronously alter the current result in the chain (provided the chain isn't in
 *   an erroring state).
 * @instance
 * @param {BaseMethods.TransformCallback} transformCallback - method to transform the result
 * @this CallContext
 * @example
 * request()
 *   .get('http://jsonip.com')
 *   .asJson()
 *   .transformResult(function (result) { return result.ip; })
 *   .tap(function (err, result) { console.log(result); }) // > 123.123.101
 *   .run()
 */
module.exports.transformResult = function (transformCallback, done) { done(null, transformCallback(this.previousResult())); };
