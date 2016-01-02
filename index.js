var builtInMethods = require('./lib/methods/builtInMethods');
var chainFactory = require('./lib/chainFactory');

/** @module chainbuilder */

/**
 * @callback ChainConstructor
 * @param {*} [initialValue] - value to start the chain with. If provided the chain will start executing immediately,
 *                             otherwise {@link Chain#run} will need to be called.
 * @returns {Chain}
 */

/**
 * @memberof module:chainbuilder
 * @exports chainbuilder
 *
 * @function
 * @param {Object}               options
 * @param {MethodCallback[]}     options.methods - custom methods for this chain
 * @param {Mixin[]}              options.mixins  - mixins for this chain
 * @returns {module:chainbuilder~ChainConstructor}
 *
 * @example
 * var chainbuilder = require('chainbuilder');
 * var myChain = chainbuilder({
 *   methods: {
 *     add: function (number, done) { done(null, number + this.previousResult()); }
 *   }
 * });
 *
 * myChain(3)
 *   .add(2)
 *   .end(function (err, result) {
 *     result == 5;
 *   });
 *
 * myChain()
 *   .add(2)
 *   .add(5)
 *   .run(3, function (err, result) {
 *     result == 10;
 *   })
 */
module.exports = function (options) {
  if (! (options.methods || options.mixins)) throw new Error('options.methods or options.mixins must be provided.');
  var passedMethods = options.methods;
  var passedMixins = options.mixins;

  var contextMethods = {};
  var contextMethodSources = {};
  var methods = {};
  var methodSources = {};

  var addMethod = function (name, method, source) {
    if (methods[name]) throw new Error('Method "' + name + '" was provided by "' + methodSources[name] + '" and "' + source + '".');
    methods[name] = method;
    methodSources[name] = source;
  };

  var addContextMethod = function (name, method, source) {
    if (contextMethods[name]) throw new Error('Method "' + name + '" was provided by "' + contextMethodSources[name] + '" and "' + source + '".');
    contextMethods[name] = method;
    contextMethodSources[name] = source;
  };

  var addMethods = function (methodMap, source, forceContextMethod) {
    var name, method;
    for (name in methodMap) {
      if (!methodMap.hasOwnProperty(name)) continue;
      method = methodMap[name];
      (method.$contextMethod || forceContextMethod ? addContextMethod : addMethod)(name, method, source);
    }
  };

  addMethods(builtInMethods, 'builtInMethods');
  addMethods(passedMethods, 'methods');
  for (var i = 0; i < (passedMixins || []).length; i++) addMethods(passedMixins[i], 'mixin #' + i);

  var Chain = chainFactory(methods, contextMethods);

  // Return a constructor for the chain
  return function (initialResult) {
    if (initialResult) {
      return new Chain({ initialResult: initialResult });
    } else {
      return new Chain();
    }
  };
};
