/*
 * Cookie data
 */

import Base64 from './base64';
import baseCookie from './base-cookie';


var _options = {
  expirationDays: undefined,
  path: '/',
};


var reset = function() {
  _options = {
    expirationDays: undefined,
    path: '/',
  };
};


var options = function(opts) {
  if (arguments.length === 0) {
    return _options;
  }

  opts = opts || {};

  _options.expirationDays = opts.expirationDays;
  _options.secure = opts.secure;
  _options.path = opts.path;

  return _options;
};


var get = function(name) {
  var nameEq = name + '=';
  const value = baseCookie.get(nameEq);

  try {
    if (value) {
      return JSON.parse(Base64.decode(value));
    }
  } catch (e) {
    return null;
  }

  return null;
};


var set = function(name, value) {
  try {
    baseCookie.set(name, Base64.encode(JSON.stringify(value)), _options);
    return true;
  } catch (e) {
    return false;
  }
};


var remove = function(name) {
  try {
    baseCookie.set(name, null, _options);
    return true;
  } catch (e) {
    return false;
  }
};

export default {
  reset,
  options,
  get,
  set,
  remove
};
