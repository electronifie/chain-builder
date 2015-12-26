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

You can keep things tidy with one file per function and requireDir (you'll need to `npm install require-dir --save`), like...
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
    require('chainbuilder-lodash')()
  ]
});
```

Known mixins:
 - [lodash](https://github.com/andrewpmckenzie/chainbuilder-lodash)
 - [request](https://github.com/andrewpmckenzie/chainbuilder-request)

## Behavior

### Execution
 1. the chain starts executing immediately, i.e. it does not wait for end() to be called.
 2. each call merely returns the original instance, not a clone, so breaking a chain won't create a new one (like it does for lodash). This can result in some confusing behavior such as:  

     ```javascript
    var a = mathChain().initialNumber(1);
    var b = a.add(2);
    var c = a.add(3);
    c.end(function (err, result) { /* result === 6 */ });
     ```

### Errors
 1. errors can be provided as the first argument of the callback or thrown
 2. if an error occurs, subsequent calls will be skipped until `end(...)`, `transform(...)` or `recover(...)` are encountered.

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

#### #yourMethod(...)
All methods you pass to `chainBuilder(...)` are available on the constructed chain, with the same signature except for the callback. Each method can make use of the _contextual methods_ described below.   
_e.g._ 
```javascript 
request().get('http://jsonip.com').asJson()...
```

#### #tap(fn)
Peek at the current value in the chain.  
_e.g._
```javascript 
request()
  .get('http://jsonip.com')
  .tap(function (err, result) { console.log('' + result); /* > {"ip":"123.123.101","about":"/about","Pro!":"http://getjsonip.com"} */ })
  .asJson()
  .tap(function (err, result) { console.log('' + result); /* > [object Object] */ })
```  
**@param** `fn function(\*,\*)` a callback that receives an error as the first parameter or the last call's result as the second.

#### #transform(fn)
Alter the current value in the chain. Called when the previous call returned successfully, or if one of the previous calls 
```javascript 
request()
  .get('http://jsonip.com')
  .asJson()
  .transform(function (err, result, cb) { cb(null, result.ip); })
  .tap(function (err, result) { console.log(result); /* > 123.123.101 */ })
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
``` 
**@param** `fn function(\*,\*, function(\*,\*))` a function that receives an error as the first parameter or the last call's result as the second, and a callback as the final parameter that takes the transformed error or result.

#### #save(string), #restore(string)
Save the result of the previous call, and restore it later in the chain. Calling restore without an argument will return an object with all saved values. Saved values can also be accessed from within your functions with this.getSaved().
```javascript 
request()
  .get('http://jsonip.com')
  .save('resultAsString')
  .asJson()
  .transform(function (err, result, cb) { cb(null, result.ip); })
  .tap(function (err, result) { console.log(result); /* > 123.123.101 */ })
  .restore('resultAsJson')
  .tap(function (err, result) { console.log(result); /* > {"ip":"123.123.101","about":"/about","Pro!":"http://getjsonip.com"} */ })
``` 
**@param** `String` (optional for #restore) the name of the variable.

#### #mapResult(), #eachResult()
Map the next item on the chain over the results of the previous item. Expects the previous item in the chain to return an array (or a nullable object).
The next call in the chain will be used to iterate over the array, with this.previousResult() returning the current item in the array.  
```javascript 
request()
  .get('http://myco.com/users')
  .tap(function (err, result) { console.log(result); /* > [{ name: 'Sue', websiteUrl: 'http://sueswebsite.com' }, { name: 'Harry', websiteUrl: 'http://harryswebsite.com' }] */ });
  .mapResult().transform(function (err, result, cb) { return result.websiteUrl });
  .tap(function (err, result) { console.log(result); /* > ['http://sueswebsite.com', 'http://sueswebsite.com'] */ });
  .mapResult().getFromPreviousResult();
  .tap(function (err, result) { console.log(result); /* > ['<html><body>Sue\'s website!</body></html>', '<html><body>Harry\'s website!</body></html>'] */ });
``` 

#### #end(fn)
Get the final result in the chain (really just a more final sounding alias of `#tap`).

### contextual methods
Methods you can use from within your functions. They shouldn't be used when construction chains as they break the flow and will give you a world of async pain.

#### this.previousResult()
The result provided by the previous call in the chain.  
**@return** `String`

#### this.getMethod(string)
Gets a method passed via the methods options.  
**@param** `String` the name of the method  
**@return** `Function`  

#### this.getSaved(string)
The result provided by the previous call in the chain.  
**@param** `String` (optional) the name of the variable. If blank, will return a name-indexed map of saved values.  
**@return** `*`
