# chainBuilder.js [![Build Status](https://travis-ci.org/electronifie/chain-builder.svg)](https://travis-ci.org/electronifie/chain-builder)

Create chains out of your async functions.

**To install:** `npm install chainbuilder --save`

#### Write chains like this
```javascript
  var users = require('./users');
  users
    .find('user-bob')
    .getGames()
    .pluck('highScore')
    .end(cb);
```

#### With functions you provide like this
```javascript
  // users.js
  var chainBuilder = require('chainbuilder');
  module.exports = chainBuilder({
    methods: {
      find: function (userId, cb) { ... },
      getGames: function (cb) {
        var user = this.previousResult();
        ...
      },
      pluck: function (key, cb) { 
        var object = this.previousResult();
        cb(null, _.pluck(object, key)); 
      }
    }
  });
```

#### So you can abandon code that looks like this
```javascript
  var findUser = function (userId, cb) { ... };
  var getGames = function (gameIds, cb) { ... };

  findUser('user-bob', function (err, user) {
    if (err) return cb(err);
    getGames(user.gameIds, function (err, games) {
      if (err) return cb(err);
      var highScores = _.pluck(games, 'highScore');
      cb(null, highScores);
    });
  });
```

## Alternatively, use one file per function

You can keep things tidy with one file per function and [requireDir](https://www.npmjs.com/package/require-dir) (you'll need to `npm install require-dir --save`), like...
```
lib/
|- getHighScores.js
|- users/
   |- index.js
   |- find.js
   |- getGames.js
   |- pluck.js
```
```javascript
// lib/users/index.js
var chainBuilder = require('chainbuilder');
var requireDir = require('require-dir');
module.exports = chainBuilder({ methods: requireDir('.') });
```

## Mixins

Some common libraries are available as mixins. They're added to your chain via the `mixins` option:

```javascript
module.exports = chainBuilder({
  methods: {/* ... your methods ... */},
  mixins: [
    require('chainbuilder-lodash')(),   // Adds lodash methods like map, forEach, flatten etc...
    require('chainbuilder-request')(),  // Adds methods for making HTTP requests
    require('chainbuilder-retry')({     // Adds methods for retrying erroring calls
      retries: 3, maxTimeout: 100 
    }),
    require('chainbuilder-flow')()      // Adds flow methods like if, while, each and map
  ]
});
```

Known mixins:
 - [lodash](https://github.com/andrewpmckenzie/chainbuilder-lodash)
 - [request](https://github.com/andrewpmckenzie/chainbuilder-request)
 - [retry](https://github.com/andrewpmckenzie/chainbuilder-retry)
 - [flow](https://github.com/andrewpmckenzie/chainbuilder-flow)

## Blocks
Some mixins (like flow and retry) contain "block" functions that conditionally run, or re-run parts of a chain. Block methods come in pairs with `$begin` and `$end` prefixes. They're called like:
```javascript
myChain(3)
  .$beginWhile(function (value) { return value < 15 })
    .plus(1)
    .times(3)
  .$endWhile()
  .plus(1)
  .end(function (err, result) { console.log(result); /* > 40 */ });
```

## Troubleshooting

Install [debug](http://npmjs.com/package/debug), and set the following environmental variables to enable logging:
 - `DEBUG=chainbuilder:*` timing, flow and call success/failure
 - `CB_VERBOSE=true DEBUG=chainbuilder:*` same as above as well as call params and results

Example verbose output:  
```
┬ ⟸  3
│
├→ $beginWhile()
│ ┬ ⟸  3
│ │
│ ├→ plus(1)
│ │← 4                               0ms
│ │
│ ├→ times(3)
│ │← 12                              2ms
│ │
│ ┴ ⟹  12
│ ┬ ⟸  12
│ │
│ ├→ plus(1)
│ │← 13                              0ms
│ │
│ ├→ times(3)
│ │← 39                              2ms
│ │
│ ┴ ⟹  39
│← 39                                4ms
│
├→ plus(1)
│← 40                                0ms
│
┴ ⟹  40
```

**Key:**

| symbol           |  description                                       |
|------------------|----------------------------------------------------|
| `┬ ⟸ 12`        | initial value (of `12`)                            |
| `┴ ⟹  "onetwo"` | result (of `'onetwo'`)                             |
| `├→ plus(1)`     | call (of `plus(1)`)                                |
| `│⤸ plus(1)`     | skipped call (because a previous call errored)     |
| `│← 1`           | successful result (of 1)                           |
| `│✕ BANG`        | call resulted in an error (of `new Error('BANG')`) |

block call of `$beginMap`/`$endMap` with result `[4,6]`, and an iteration with initial value of `2`:
```
├→ $beginMap()
...
│ ┬ ⟸  2
│ ├→ plus(2)
│ │← 12
│ ┴ ⟹  4
...
│← [4,6]
```

# API
### `chainBuilder(options)`
Build a `Chain` class. The methods you provide will be present, along with some helpers detailed below. Returns a Chain factory function.  
_e.g._ 
```javascript
var request = chainBuilder({
  methods: {
    get: function (url, cb) { 
      http.get(url, function (response) {
        if (response.statusCode === 200) cb(null, response.body) else cb(response.statusMessage);
      }); 
    },
    getFromPreviousResult: function (cb) {
      this.getMethod('get')(this.previousResult(), cb);
    },
    asJson: function (cb) { 
      cb(null, JSON.stringify(this.previousResult().body));
    },
    ...
  }
});
```
**@param** `options.methods Object<string, function(..., function(\*,\*))>` a dictionary of functions that take a callback as their final parameter. The callback takes an error as the first parameter, and a result as the second. Each function is run with the currently running `Chain` as `this`, so will have access to methods like `previousResult()`.  
**@return** `function(options):Chain`

## `Chain`

### chaining methods
Methods you can use when constructing chains.

#### chain(initialValue) _constructor_
Create an instance of the chain. If initialValue is passed, the chain will start executing immediately. If not, it will wait for `#run()` to be called.  
**@param** `initialValue *` (optional) 

#### #yourMethod(...)
All methods you pass to `chainBuilder(...)` are available on the constructed chain, with the same signature except for the callback. Each method has access to the _context methods_ described below.   
_e.g._ 
```javascript 
request().get('http://jsonip.com').asJson()...
```

#### #tap(fn)
Peek at the current value in the chain. The passed function has access to _context methods_.  
_e.g._
```javascript 
request()
  .get('http://jsonip.com')
  .tap(function (err, result) { console.log('' + result); /* > {"ip":"123.123.101","about":"/about","Pro!":"http://getjsonip.com"} */ })
  .asJson()
  .tap(function (err, result) { console.log('' + result); /* > [object Object] */ })
  .run()
```  
**@param** `fn function(\*,\*)` a callback that receives an error as the first parameter or the last call's result as the second.

#### #inject(value)
Inject the value into the chain (so it's available as `.previousResult()` to the next call).  
_e.g._
```javascript 
request()
  .inject('foobar')
  .tap(function (err, result) { console.log(result); /* > 'foobar' */ })
  .run()
```  
**@param** `value *` the value to inject.

#### #transform(fn)
Alter the current value in the chain. Called when the previous call returned successfully, or if one of the previous calls errors. The passed function has acces to _context methods_.  
```javascript 
request()
  .get('http://jsonip.com')
  .asJson()
  .transform(function (err, result, cb) { cb(null, result.ip); })
  .tap(function (err, result) { console.log(result); /* > 123.123.101 */ })
  .run()
``` 
**@param** `fn function(\*,\*, function(\*,\*))` a function that receives an error as the first parameter or the last call's result as the second, and a callback as the final parameter that takes the transformed error or result.

#### #transformResult(fn)
Alter the current value in the chain. The transform function is passed the previousResult, and expected to return a new result. The passed function has acces to _context methods_.  
```javascript 
request()
  .get('http://jsonip.com')
  .asJson()
  .transformResult(function (result) { return result.ip; })
  .tap(function (err, result) { console.log(result); /* > 123.123.101 */ })
  .run()
``` 
**@param** `fn function(\*,\*, function(\*,\*))` a function that receives an error as the first parameter or the last call's result as the second, and a callback as the final parameter that takes the transformed error or result.

#### #recover(fn)
Recover from an error thrown by one of the previous calls in the chain. Similar to transform, but only called if one of the previous calls errored and is only passed the error and cb.
```javascript 
request()
  .get('INVALID')
  .asJson() // will not be called, as the above call threw an error
  .recover(function (err, cb) { cb(null, '0.0.0.0'); })
  .tap(function (err, result) { console.log(result); /* > 0.0.0.0 */ })
  .run()
``` 
**@param** `fn function(\*,\*, function(\*,\*))` a function that receives an error as the first parameter or the last call's result as the second, and a callback as the final parameter that takes the transformed error or result.

#### #run(initialValue, cb)
Run the chain from the beginning, with initialValue available to the first method via `previousResult()`.  
_e.g._  
```javascript 
var jsonParser = request()
  .getFromPreviousResult()
  .asJson();

jsonParser.run('http://jsonip.com', function (err, result) { console.log('' + result); /* > [object Object] */ });
```  
**@param** `initialValue *` (optional) initial value to start the chain with.  
**@param** `cb function(\*,\*, function(\*,\*))` (optional) execute a chain from the beginning.  

#### #clone()
Create a clone of the chain.

#### #end(fn)
Get the final result in the chain (really just a more final sounding alias of `#tap`).


## context methods
Methods you can use from within your functions.

#### this.previousResult()
The result provided by the previous call in the chain.  
**@return** `String`

#### this.getMethod(methodName)
Gets a method passed via the methods options.  
**@param** `String` **methodName** the name of the method  
**@return** `Function`  

#### this.newChain(initialValue)
Create a new chain object (will show in logs as a sub-chain).  
**@param** `String` **initialValue** the name of the method  
**@return** `Chain`  

## Creating mixins
A mixin is merely a map of functions like `methods`. Each function just needs to take a callback as its final parameter, and has access to all the _context methods_.

#### Block mixins 
Are created by defining a begin and end method with the `$beginSubchain`/`$endSubchain` set like so:
```javascript
var beginEach = function (done) { 
  // Pass the previous result on to the end method
  done(err, this.previousResult()); 
};
var endEach = function (chain, done) { 
  // Pass the previous result on to the end method
  var array = this.previousResult();
  var next = function (err) {
    if (err) return done(err);
    if (array.length === 0) return done();
    chain.run(array.pop(), next);
  };
};

beginEach.$beginSubchain = 'each';
endEach.$endSubchain = 'each';

module.exports = {
  $beginEach: beginEach,
  $endEach: endEach
};
```

The end method will be passed the subchain as its first parameter.

By convention, begin methods always start `$begin` and end methods with `$end`. They also need to have the `.$beginSubchain` and `.$endSubchain` values set to the same value (for identifying them as block methods and detection of unclosed / mismatched blocks). There are lots of examples of block mixins in the [chainbuilder-flow](https://github.com/andrewpmckenzie/chainbuilder-flow/tree/master/lib) mixin.

## Behavior

### Execution
 1. if a parameter is provided to the initial chain call, it will start executing immediately with that as the initial value. Otherwise,
    it will wait for `#run()` to be called.
 2. each call merely returns the original instance, not a clone, so breaking a chain won't create a new one (like it does for lodash). This can result in some confusing behavior such as:  

    ```javascript
    var a = mathChain();
    var b = a.add(2);
    var c = a.add(3);
    b.run(1, function (err, result) { /* result === 6 */ });
    c.run(1, function (err, result) { /* result === 6 */ });
     ```

    to create a clone at a certain point, call the clone() method. e.g:

     ```javascript
    var a = mathChain().initialNumber(1);
    var b = a.clone().add(2);
    var c = a.clone().add(3);
    b.run(1, function (err, result) { /* result === 3 */ });
    c.run(1, function (err, result) { /* result === 4 */ });
     ```

### Errors
 1. errors can be provided as the first argument of the callback or thrown
 2. if an error occurs, subsequent calls will be skipped until `end(...)`, `transform(...)` or `recover(...)` are encountered.

# Version History

#### 2015-12-31 v2.0.10
  - support mixin-provided context methods

#### 2015-12-30 v2.0.9
  - fix logging of objects with circular reference

#### 2015-12-30 v2.0.8
  - fix logging output for subchains within aggregate functions.

#### 2015-12-30 v2.0.7
  - add `#newChain()` context method.
  - tweak subchain logging output.

#### 2015-12-30 v2.0.6
  - improve logging.

#### 2015-12-29 v2.0.5
  - improve logging.

#### 2015-12-29 v2.0.4
  - add logging with optional dependency debug.

#### 2015-12-29 v2.0.3
  - add `#transformResult()`.

#### 2015-12-29 v2.0.1
  - add `#inject()`
  - make all `#run(initialValue, cb)` params optional.

#### 2015-12-29 v2.0.0
  - introduction of `#run(initialValue, cb)`, and deferred running of chain unless an initial value is provided.
  - introduction of `#clone()`.
  - support for subchains.
  - function context separated from chain object.
  - removal of `#eachResult()` and `#save()`/`#restore()`. They'll be readded later as mixins.
