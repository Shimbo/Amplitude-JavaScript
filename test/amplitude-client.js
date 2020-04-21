import AmplitudeClient from '../src/amplitude-client.js';
import cookie from '../src/cookie.js';
import utils from '../src/utils.js';
import queryString from 'query-string';
import Identify from '../src/identify.js';
import constants from '../src/constants.js';

// maintain for testing backwards compatability
describe('AmplitudeClient', function() {
  var apiKey = '000000';
  var keySuffix = '_' + apiKey.slice(0,6);
  var userId = 'user';
  var amplitude;
  var server;

  beforeEach(function() {
    amplitude = new AmplitudeClient();
    server = sinon.fakeServer.create();
  });

  afterEach(function() {
    server.restore();
  });

  it('amplitude object should exist', function() {
    assert.isObject(amplitude);
  });

  function reset() {
    localStorage.clear();
    sessionStorage.clear();
    cookie.remove(amplitude.options.cookieName);
    cookie.remove(amplitude.options.cookieName + keySuffix);
    cookie.remove(amplitude.options.cookieName + '_new_app');
    cookie.reset();
  }

  describe('init', function() {
    beforeEach(function() {
      reset();
    });

    afterEach(function() {
      reset();
    });

    it('should make instanceName case-insensitive', function() {
      assert.equal(new AmplitudeClient('APP3')._instanceName, 'app3');
      assert.equal(new AmplitudeClient('$DEFAULT_INSTANCE')._instanceName, '$default_instance');
    });

    it('should invoke onInit callbacks', function() {
      let onInitCalled = false;
      let onInit2Called = false;
      amplitude.onInit(() => { onInitCalled = true; });
      amplitude.onInit(() => { onInit2Called = true; });

      amplitude.init(apiKey);
      assert.ok(onInitCalled);
      assert.ok(onInit2Called);
    });

    it('should not invoke onInit callbacks before init is called', function() {
      let onInitCalled = false;
      amplitude.onInit(() => { onInitCalled = true; });

      assert.ok(onInitCalled === false);
      amplitude.init(apiKey);
      assert.ok(onInitCalled);
    });

    it('should immediately invoke onInit callbacks if already initialized', function() {
      let onInitCalled = false;
      amplitude.init(apiKey);
      amplitude.onInit(() => { onInitCalled = true; });
      assert.ok(onInitCalled);
    });

    it('should clear the onInitQueue', function() {
      let onInitCalled = false;
      let onInit2Called = false;
      amplitude.onInit(() => { onInitCalled = true; });
      amplitude.onInit(() => { onInit2Called = true; });

      amplitude.init(apiKey);
      assert.lengthOf(amplitude._onInit, 0);
    });

    it('fails on invalid apiKeys', function() {
      amplitude.init(null);
      assert.equal(amplitude.options.apiKey, undefined);
      assert.equal(amplitude.options.deviceId, undefined);

      amplitude.init('');
      assert.equal(amplitude.options.apiKey, undefined);
      assert.equal(amplitude.options.deviceId, undefined);

      amplitude.init(apiKey);
      assert.equal(amplitude.options.apiKey, apiKey);
      assert.lengthOf(amplitude.options.deviceId, 22);
    });

    it('should accept userId', function() {
      amplitude.init(apiKey, userId);
      assert.equal(amplitude.options.userId, userId);
    });

    it('should accept numerical userIds', function() {
      amplitude.init(apiKey, 5);
      assert.equal(amplitude.options.userId, '5');
    });

    it('should generate a random deviceId', function() {
      amplitude.init(apiKey, userId);
      assert.lengthOf(amplitude.options.deviceId, 22);
    });

    it('should validate config values', function() {
      var config = {
          apiEndpoint: 100,  // invalid type
          batchEvents: 'True',  // invalid type
          cookieExpiration: -1,   // negative number
          cookieName: '',  // empty string
          eventUploadPeriodMillis: '30', // 30s
          eventUploadThreshold: 0,   // zero value
          bogusKey: false
      };

      amplitude.init(apiKey, userId, config);
      assert.equal(amplitude.options.apiEndpoint, 'api.amplitude.com');
      assert.equal(amplitude.options.batchEvents, false);
      assert.equal(amplitude.options.cookieExpiration, 3650);
      assert.equal(amplitude.options.cookieName, 'amplitude_id');
      assert.equal(amplitude.options.eventUploadPeriodMillis, 30000);
      assert.equal(amplitude.options.eventUploadThreshold, 30);
      assert.equal(amplitude.options.bogusKey, undefined);
    });

    it('should set the default log level', function() {
      const config = {};

      amplitude.init(apiKey, userId, config);
      assert.equal(utils.getLogLevel(), 2);
    });

    it('should set log levels', function() {
      const config = {
          logLevel: 'INFO',
      };

      amplitude.init(apiKey, userId, config);
      assert.equal(utils.getLogLevel(), 3);
    });

    it('should set cookie', function() {
      amplitude.init(apiKey, userId);
      var stored = cookie.get(amplitude.options.cookieName + '_' + apiKey);
      assert.property(stored, 'deviceId');
      assert.propertyVal(stored, 'userId', userId);
      assert.lengthOf(stored.deviceId, 22); // increase deviceId length by 1 for 'R' character
    });

    it('should set language', function() {
       amplitude.init(apiKey, userId);
       assert.property(amplitude.options, 'language');
       assert.isNotNull(amplitude.options.language);
    });

    it('should allow language override', function() {
      amplitude.init(apiKey, userId, {language: 'en-GB'});
      assert.propertyVal(amplitude.options, 'language', 'en-GB');
    });

    it ('should not run callback if invalid callback', function() {
      amplitude.init(apiKey, userId, null, 'invalid callback');
    });

    it ('should run valid callbacks', function() {
      var counter = 0;
      var callback = function() {
        counter++;
      };
      amplitude.init(apiKey, userId, null, callback);
      assert.equal(counter, 1);
    });

    it('should load device id from the cookie', function(){
      // deviceId and sequenceNumber not set, init should load value from localStorage
      var cookieData = {
        deviceId: 'current_device_id',
      }

      cookie.set(amplitude.options.cookieName + '_' + apiKey, cookieData);

      amplitude.init(apiKey);
      assert.equal(amplitude.options.deviceId, 'current_device_id');
    });

    it('should migrate device id from old non name spaced cookie name (pre 4.10)', function(){
      var now = new Date().getTime();

      var cookieData = {
        deviceId: 'old_device_id',
        optOut: false,
        sessionId: now,
        lastEventTime: now,
        eventId: 50,
        identifyId: 60
      }

      cookie.set(amplitude.options.cookieName, cookieData);

      amplitude.init(apiKey);
      assert.equal(amplitude.options.deviceId, 'old_device_id');
    });

    it('should merge tracking options during parseConfig', function() {
      var trackingOptions = {
        city: false,
        ip_address: false,
        language: false,
        region: true,
      };

      var amplitude2 = new AmplitudeClient('new_app');
      amplitude2.init(apiKey, null, {trackingOptions: trackingOptions});
      console.log(JSON.stringify(amplitude2.options.trackingOptions));

      // check config loaded correctly
      assert.deepEqual(amplitude2.options.trackingOptions, {
        city: false,
        country: true,
        carrier: true,
        device_manufacturer: true,
        device_model: true,
        dma: true,
        ip_address: false,
        language: false,
        os_name: true,
        os_version: true,
        platform: true,
        region: true,
        version_name: true
      });
    });

    it('should pregenerate tracking options for api properties', function() {
      var trackingOptions = {
        city: false,
        ip_address: false,
        language: false,
        region: true,
      };

      var amplitude2 = new AmplitudeClient('new_app');
      amplitude2.init(apiKey, null, {trackingOptions: trackingOptions});

      assert.deepEqual(amplitude2._apiPropertiesTrackingOptions, {tracking_options: {
        city: false,
        ip_address: false
      }});
    });
  });

  describe('runQueuedFunctions', function() {
    beforeEach(function() {
      amplitude.init(apiKey);
    });

    afterEach(function() {
      reset();
    });

    it('should run queued functions', function() {
      assert.equal(amplitude._unsentCount(), 0);
      assert.lengthOf(server.requests, 0);
      var userId = 'testUserId'
      var eventType = 'test_event'
      var functions = [
        ['setUserId', userId],
        ['logEvent', eventType]
      ];
      amplitude._q = functions;
      assert.lengthOf(amplitude._q, 2);
      amplitude.runQueuedFunctions();

      assert.equal(amplitude.options.userId, userId);
      assert.equal(amplitude._unsentCount(), 1);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);
      assert.equal(events[0].event_type, eventType);

      assert.lengthOf(amplitude._q, 0);
    });
  });

  describe('setUserProperties', function() {
    beforeEach(function() {
      amplitude.init(apiKey);
    });

    afterEach(function() {
      reset();
    });

    it('should log identify call from set user properties', function() {
      assert.equal(amplitude._unsentCount(), 0);
      amplitude.setUserProperties({'prop': true, 'key': 'value'});

      assert.lengthOf(amplitude._unsentEvents, 0);
      assert.lengthOf(amplitude._unsentIdentifys, 1);
      assert.equal(amplitude._unsentCount(), 1);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);
      assert.equal(events[0].event_type, '$identify');
      assert.deepEqual(events[0].event_properties, {});

      var expected = {
        '$set': {
          'prop': true,
          'key': 'value'
        }
      };
      assert.deepEqual(events[0].user_properties, expected);
    });
  });

  describe('clearUserProperties', function() {
    beforeEach(function() {
      amplitude.init(apiKey);
    });

    afterEach(function() {
      reset();
    });

    it('should log identify call from clear user properties', function() {
      assert.equal(amplitude._unsentCount(), 0);
      amplitude.clearUserProperties();

      assert.lengthOf(amplitude._unsentEvents, 0);
      assert.lengthOf(amplitude._unsentIdentifys, 1);
      assert.equal(amplitude._unsentCount(), 1);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);
      assert.equal(events[0].event_type, '$identify');
      assert.deepEqual(events[0].event_properties, {});

      var expected = {
        '$clearAll': '-'
      };
      assert.deepEqual(events[0].user_properties, expected);
    });
  });

  describe('setGroup', function() {
    beforeEach(function() {
      reset();
      amplitude.init(apiKey);
    });

    afterEach(function() {
      reset();
    });

    it('should generate an identify event with groups set', function() {
      amplitude.setGroup('orgId', 15);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);

      // verify identify event
      var identify = events[0];
      assert.equal(identify.event_type, '$identify');
      assert.deepEqual(identify.user_properties, {
        '$set': {'orgId': 15},
      });
      assert.deepEqual(identify.event_properties, {});
      assert.deepEqual(identify.groups, {
        'orgId': '15',
      });
    });

    it('should ignore empty string groupTypes', function() {
      amplitude.setGroup('', 15);
      assert.lengthOf(server.requests, 0);
    });

    it('should ignore non-string groupTypes', function() {
      amplitude.setGroup(10, 10);
      amplitude.setGroup([], 15);
      amplitude.setGroup({}, 20);
      amplitude.setGroup(true, false);
      assert.lengthOf(server.requests, 0);
    });
  });


describe('setVersionName', function() {
    beforeEach(function() {
      reset();
    });

    afterEach(function() {
      reset();
    });

    it('should set version name', function() {
      amplitude.init(apiKey, null, {batchEvents: true});
      amplitude.setVersionName('testVersionName1');
      amplitude.logEvent('testEvent1');
      assert.equal(amplitude._unsentEvents[0].version_name, 'testVersionName1');

      // should ignore non-string values
      amplitude.setVersionName(15000);
      amplitude.logEvent('testEvent2');
      assert.equal(amplitude._unsentEvents[1].version_name, 'testVersionName1');
    });
  });

  describe('regenerateDeviceId', function() {
    beforeEach(function() {
      reset();
    });

    afterEach(function() {
      reset();
    });

    it('should regenerate the deviceId', function() {
      var deviceId = 'oldDeviceId';
      amplitude.init(apiKey, null, {'deviceId': deviceId});
      amplitude.regenerateDeviceId();
      assert.notEqual(amplitude.options.deviceId, deviceId);
      assert.lengthOf(amplitude.options.deviceId, 22);
    });
  });

  describe('setDeviceId', function() {

    beforeEach(function() {
      reset();
    });

    afterEach(function() {
      reset();
    });

    it('should change device id', function() {
      amplitude.init(apiKey, null, {'deviceId': 'fakeDeviceId'});
      amplitude.setDeviceId('deviceId');
      assert.equal(amplitude.options.deviceId, 'deviceId');
    });

    it('should not change device id if empty', function() {
      amplitude.init(apiKey, null, {'deviceId': 'deviceId'});
      amplitude.setDeviceId('');
      assert.notEqual(amplitude.options.deviceId, '');
      assert.equal(amplitude.options.deviceId, 'deviceId');
    });

    it('should not change device id if null', function() {
      amplitude.init(apiKey, null, {'deviceId': 'deviceId'});
      amplitude.setDeviceId(null);
      assert.notEqual(amplitude.options.deviceId, null);
      assert.equal(amplitude.options.deviceId, 'deviceId');
    });

    it('should store device id in cookie', function() {
      amplitude.init(apiKey, null, {'deviceId': 'fakeDeviceId'});
      amplitude.setDeviceId('deviceId');
      var stored = cookie.get(amplitude.options.cookieName + '_' + apiKey);
      assert.propertyVal(stored, 'deviceId', 'deviceId');
    });
  });

  describe('resetSessionId', function() {
    let clock;

    beforeEach(function() {
      clock = sinon.useFakeTimers();
    });

    afterEach(function() {
      reset();
      clock.restore();
    });

    it('should reset the session Id', function() {
      clock.tick(10);
      amplitude.init(apiKey);

      clock.tick(100);
      amplitude.resetSessionId();

      clock.tick(200);

      assert.equal(amplitude._sessionId, 110);
    });
  });

  describe('identify', function() {
    let clock;

    beforeEach(function() {
      clock = sinon.useFakeTimers();
      amplitude.init(apiKey);
    });

    afterEach(function() {
      reset();
      clock.restore();
    });

    it('should ignore inputs that are not identify objects', function() {
      amplitude.identify('This is a test');
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.identify(150);
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.identify(['test']);
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.identify({'user_prop': true});
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);
    });

    it('should generate an event from the identify object', function() {
      var identify = new Identify().set('prop1', 'value1').unset('prop2').add('prop3', 3).setOnce('prop4', true);
      amplitude.identify(identify);

      assert.lengthOf(amplitude._unsentEvents, 0);
      assert.lengthOf(amplitude._unsentIdentifys, 1);
      assert.equal(amplitude._unsentCount(), 1);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);
      assert.equal(events[0].event_type, '$identify');
      assert.deepEqual(events[0].event_properties, {});
      assert.deepEqual(events[0].user_properties, {
        '$set': {
          'prop1': 'value1'
        },
        '$unset': {
          'prop2': '-'
        },
        '$add': {
          'prop3': 3
        },
        '$setOnce': {
          'prop4': true
        }
      });
    });

    it('should ignore empty identify objects', function() {
      amplitude.identify(new Identify());
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);
    });

    it('should ignore empty proxy identify objects', function() {
      amplitude.identify({'_q': {}});
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.identify({});
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);
    });

    it('should generate an event from a proxy identify object', function() {
      var proxyObject = {'_q':[
        ['setOnce', 'key2', 'value4'],
        ['unset', 'key1'],
        ['add', 'key1', 'value1'],
        ['set', 'key2', 'value3'],
        ['set', 'key4', 'value5'],
        ['prepend', 'key5', 'value6']
      ]};
      amplitude.identify(proxyObject);

      assert.lengthOf(amplitude._unsentEvents, 0);
      assert.lengthOf(amplitude._unsentIdentifys, 1);
      assert.equal(amplitude._unsentCount(), 1);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);
      assert.equal(events[0].event_type, '$identify');
      assert.deepEqual(events[0].event_properties, {});
      assert.deepEqual(events[0].user_properties, {
        '$setOnce': {'key2': 'value4'},
        '$unset': {'key1': '-'},
        '$set': {'key4': 'value5'},
        '$prepend': {'key5': 'value6'}
      });
    });

    it('should run the callback after making the identify call', function() {
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      }
      var identify = new amplitude.Identify().set('key', 'value');
      amplitude.identify(identify, callback);

      // before server responds, callback should not fire
      assert.lengthOf(server.requests, 1);
      assert.equal(counter, 0);
      assert.equal(value, -1);
      assert.equal(message, '');

      // after server response, fire callback
      server.respondWith('success');
      server.respond();
      assert.equal(counter, 1);
      assert.equal(value, 200);
      assert.equal(message, 'success');
    });

    it('should run the callback even if client not initialized with apiKey', function() {
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      }
      var identify = new amplitude.Identify().set('key', 'value');
      new AmplitudeClient().identify(identify, callback);

      // verify callback fired
      assert.equal(counter, 1);
      assert.equal(value, 0);
      assert.equal(message, 'No request sent');
    });

    it('should run the callback even with an invalid identify object', function() {
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      }
      amplitude.identify(null, callback);

      // verify callback fired
      assert.equal(counter, 1);
      assert.equal(value, 0);
      assert.equal(message, 'No request sent');
    });
  });

  describe('groupIdentify', function() {
    let clock;
    let group_type;
    let group_name;

    beforeEach(function() {
      clock = sinon.useFakeTimers();
      group_type = 'test group type';
      group_name = 'test group name';
      amplitude.init(apiKey);
    });

    afterEach(function() {
      reset();
      clock.restore();
    });

    it('should ignore inputs that are not identify objects', function() {
      amplitude.groupIdentify(group_type, group_name, 'This is a test');
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.groupIdentify(group_type, group_name, 150);
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.groupIdentify(group_type, group_name, ['test']);
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.groupIdentify(group_type, group_name, {'user_prop': true});
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);
    });

    it('should generate an event from the identify object', function() {
      var identify = new Identify().set('prop1', 'value1').unset('prop2').add('prop3', 3).setOnce('prop4', true);
      amplitude.groupIdentify(group_type, group_name, identify);

      assert.lengthOf(amplitude._unsentEvents, 0);
      assert.lengthOf(amplitude._unsentIdentifys, 1);
      assert.equal(amplitude._unsentCount(), 1);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);
      assert.equal(events[0].event_type, '$groupidentify');
      assert.deepEqual(events[0].event_properties, {});
      assert.deepEqual(events[0].user_properties, {});
      assert.deepEqual(events[0].group_properties, {
        '$set': {
          'prop1': 'value1'
        },
        '$unset': {
          'prop2': '-'
        },
        '$add': {
          'prop3': 3
        },
        '$setOnce': {
          'prop4': true
        }
      });
      assert.deepEqual(events[0].groups, {'test group type': 'test group name'});
    });

    it('should ignore empty identify objects', function() {
      amplitude.groupIdentify(group_type, group_name, new Identify());
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);
    });

    it('should ignore empty proxy identify objects', function() {
      amplitude.groupIdentify(group_type, group_name, {'_q': {}});
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.groupIdentify(group_type, group_name, {});
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);
    });

    it('should generate an event from a proxy identify object', function() {
      var proxyObject = {'_q':[
        ['setOnce', 'key2', 'value4'],
        ['unset', 'key1'],
        ['add', 'key1', 'value1'],
        ['set', 'key2', 'value3'],
        ['set', 'key4', 'value5'],
        ['prepend', 'key5', 'value6']
      ]};
      amplitude.groupIdentify(group_type, group_name, proxyObject);

      assert.lengthOf(amplitude._unsentEvents, 0);
      assert.lengthOf(amplitude._unsentIdentifys, 1);
      assert.equal(amplitude._unsentCount(), 1);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);
      assert.equal(events[0].event_type, '$groupidentify');
      assert.deepEqual(events[0].event_properties, {});
      assert.deepEqual(events[0].user_properties, {});
      assert.deepEqual(events[0].group_properties, {
        '$setOnce': {'key2': 'value4'},
        '$unset': {'key1': '-'},
        '$set': {'key4': 'value5'},
        '$prepend': {'key5': 'value6'}
      });
      assert.deepEqual(events[0].groups, {'test group type': 'test group name'});
    });

    it('should run the callback after making the identify call', function() {
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      }
      var identify = new amplitude.Identify().set('key', 'value');
      amplitude.groupIdentify(group_type, group_name, identify, callback);

      // before server responds, callback should not fire
      assert.lengthOf(server.requests, 1);
      assert.equal(counter, 0);
      assert.equal(value, -1);
      assert.equal(message, '');

      // after server response, fire callback
      server.respondWith('success');
      server.respond();
      assert.equal(counter, 1);
      assert.equal(value, 200);
      assert.equal(message, 'success');
    });

    it('should run the callback even if client not initialized with apiKey', function() {
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      }
      var identify = new amplitude.Identify().set('key', 'value');
      new AmplitudeClient().groupIdentify(group_type, group_name, identify, callback);

      // verify callback fired
      assert.equal(counter, 1);
      assert.equal(value, 0);
      assert.equal(message, 'No request sent');
    });

    it('should run the callback even with an invalid identify object', function() {
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      }
      amplitude.groupIdentify(group_type, group_name, null, callback);

      // verify callback fired
      assert.equal(counter, 1);
      assert.equal(value, 0);
      assert.equal(message, 'No request sent');
    });
  });

  describe('logEvent with tracking options', function() {

    var clock;

    beforeEach(function() {
      clock = sinon.useFakeTimers();
      var trackingOptions = {
        city: false,
        country: true,
        ip_address: false,
        language: false,
        platform: false,
        region: true
      };
      amplitude.init(apiKey, null, {trackingOptions: trackingOptions});
    });

    afterEach(function() {
      reset();
      clock.restore();
    });

    it('should not track language or platform', function() {
      assert.equal(amplitude.options.trackingOptions.language, false);
      assert.equal(amplitude.options.trackingOptions.platform, false);
      amplitude.logEvent('Event Type 1');
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.equal(events[0].language, null);
      assert.equal(events[0].platform, null);
    });

    it('should send trackingOptions in api properties', function() {
      amplitude.logEvent('Event Type 2');
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);

      // verify country is not sent since it matches the default value of true
      assert.deepEqual(events[0].api_properties, {
        tracking_options: {
          city: false,
          ip_address: false,
        }
      });
    });
  });

  describe('logEvent', function() {

    var clock;

    beforeEach(function() {
      clock = sinon.useFakeTimers();
      amplitude.init(apiKey);
    });

    afterEach(function() {
      reset();
      clock.restore();
    });

    it('should send request', function() {
      amplitude.options.forceHttps = false;
      amplitude.logEvent('Event Type 1');
      assert.lengthOf(server.requests, 1);
      assert.equal(server.requests[0].url, 'http://api.amplitude.com');
      assert.equal(server.requests[0].method, 'POST');
      assert.equal(server.requests[0].async, true);
    });

    it('should send https request', function() {
      amplitude.options.forceHttps = true;
      amplitude.logEvent('Event Type 1');
      assert.lengthOf(server.requests, 1);
      assert.equal(server.requests[0].url, 'https://api.amplitude.com');
      assert.equal(server.requests[0].method, 'POST');
      assert.equal(server.requests[0].async, true);
    });

    it('should send https request by configuration', function() {
      amplitude.init(apiKey, null, { forceHttps: true });
      amplitude.logEvent('Event Type 1');
      assert.lengthOf(server.requests, 1);
      assert.equal(server.requests[0].url, 'https://api.amplitude.com');
      assert.equal(server.requests[0].method, 'POST');
      assert.equal(server.requests[0].async, true);
    });

    it('should reject empty event types', function() {
      amplitude.logEvent();
      assert.lengthOf(server.requests, 0);
    });

    it('should send api key', function() {
      amplitude.logEvent('Event Type 2');
      assert.lengthOf(server.requests, 1);
      assert.equal(queryString.parse(server.requests[0].requestBody).client, apiKey);
    });

    it('should send api version', function() {
      amplitude.logEvent('Event Type 3');
      assert.lengthOf(server.requests, 1);
      assert.equal(queryString.parse(server.requests[0].requestBody).v, '2');
    });

    it('should send event JSON', function() {
      amplitude.logEvent('Event Type 4');
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.equal(events.length, 1);
      assert.equal(events[0].event_type, 'Event Type 4');
    });

    it('should send language', function() {
      amplitude.logEvent('Event Should Send Language');
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.equal(events.length, 1);
      assert.isNotNull(events[0].language);
    });

    it('should not send trackingOptions in api properties', function() {
      amplitude.logEvent('Event Should Not Send Tracking Properties');
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.equal(events.length, 1);
      assert.deepEqual(events[0].api_properties, {});
    });

    it('should send platform', function() {
      amplitude.logEvent('Event Should Send Platform');
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.equal(events.length, 1);
      assert.equal(events[0].platform, 'Web');
    });

    it('should accept properties', function() {
      amplitude.logEvent('Event Type 5', {prop: true});
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.deepEqual(events[0].event_properties, {prop: true});
    });

    it('should queue events', function() {
      amplitude._sending = true;
      amplitude.logEvent('Event', {index: 1});
      amplitude.logEvent('Event', {index: 2});
      amplitude.logEvent('Event', {index: 3});
      amplitude._sending = false;

      amplitude.logEvent('Event', {index: 100});

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 4);
      assert.deepEqual(events[0].event_properties, {index: 1});
      assert.deepEqual(events[3].event_properties, {index: 100});
    });

    it('should remove only sent events', function() {
      amplitude._sending = true;
      amplitude.logEvent('Event', {index: 1});
      amplitude.logEvent('Event', {index: 2});
      amplitude._sending = false;
      amplitude.logEvent('Event', {index: 3});

      server.respondWith('success');
      server.respond();

      amplitude.logEvent('Event', {index: 4});

      assert.lengthOf(server.requests, 2);
      var events = JSON.parse(queryString.parse(server.requests[1].requestBody).e);
      assert.lengthOf(events, 1);
      assert.deepEqual(events[0].event_properties, {index: 4});
    });

    it('should not save events', function() {
      amplitude.init(apiKey, null, {saveEvents: false});
      amplitude.logEvent('Event', {index: 1});
      amplitude.logEvent('Event', {index: 2});
      amplitude.logEvent('Event', {index: 3});

      var amplitude2 = new AmplitudeClient();
      amplitude2.init(apiKey);
      assert.deepEqual(amplitude2._unsentEvents, []);
    });

    it('should limit events sent', function() {
      amplitude.init(apiKey, null, {uploadBatchSize: 10});

      amplitude._sending = true;
      for (var i = 0; i < 15; i++) {
        amplitude.logEvent('Event', {index: i});
      }
      amplitude._sending = false;

      amplitude.logEvent('Event', {index: 100});

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 10);
      assert.deepEqual(events[0].event_properties, {index: 0});
      assert.deepEqual(events[9].event_properties, {index: 9});

      server.respondWith('success');
      server.respond();

      assert.lengthOf(server.requests, 2);
      var events = JSON.parse(queryString.parse(server.requests[1].requestBody).e);
      assert.lengthOf(events, 6);
      assert.deepEqual(events[0].event_properties, {index: 10});
      assert.deepEqual(events[5].event_properties, {index: 100});
    });

    it('should batch events sent', function() {
      var eventUploadPeriodMillis = 10*1000;
      amplitude.init(apiKey, null, {
        batchEvents: true,
        eventUploadThreshold: 10,
        eventUploadPeriodMillis: eventUploadPeriodMillis
      });

      for (var i = 0; i < 15; i++) {
        amplitude.logEvent('Event', {index: i});
      }

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 10);
      assert.deepEqual(events[0].event_properties, {index: 0});
      assert.deepEqual(events[9].event_properties, {index: 9});

      server.respondWith('success');
      server.respond();

      assert.lengthOf(server.requests, 1);
      var unsentEvents = amplitude._unsentEvents;
      assert.lengthOf(unsentEvents, 5);
      assert.deepEqual(unsentEvents[4].event_properties, {index: 14});

      // remaining 5 events should be sent by the delayed sendEvent call
      clock.tick(eventUploadPeriodMillis);
      assert.lengthOf(server.requests, 2);
      server.respondWith('success');
      server.respond();
      assert.lengthOf(amplitude._unsentEvents, 0);
      var events = JSON.parse(queryString.parse(server.requests[1].requestBody).e);
      assert.lengthOf(events, 5);
      assert.deepEqual(events[4].event_properties, {index: 14});
    });

    it('should send events after a delay', function() {
      var eventUploadPeriodMillis = 10*1000;
      amplitude.init(apiKey, null, {
        batchEvents: true,
        eventUploadThreshold: 2,
        eventUploadPeriodMillis: eventUploadPeriodMillis
      });
      amplitude.logEvent('Event');

      // saveEvent should not have been called yet
      assert.lengthOf(amplitude._unsentEvents, 1);
      assert.lengthOf(server.requests, 0);

      // saveEvent should be called after delay
      clock.tick(eventUploadPeriodMillis);
      assert.lengthOf(server.requests, 1);
      server.respondWith('success');
      server.respond();
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);
      assert.deepEqual(events[0].event_type, 'Event');
    });

    it('should not send events after a delay if no events to send', function() {
      var eventUploadPeriodMillis = 10*1000;
      amplitude.init(apiKey, null, {
        batchEvents: true,
        eventUploadThreshold: 2,
        eventUploadPeriodMillis: eventUploadPeriodMillis
      });
      amplitude.logEvent('Event1');
      amplitude.logEvent('Event2');

      // saveEvent triggered by 2 event batch threshold
      assert.lengthOf(amplitude._unsentEvents, 2);
      assert.lengthOf(server.requests, 1);
      server.respondWith('success');
      server.respond();
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 2);
      assert.deepEqual(events[1].event_type, 'Event2');

      // saveEvent should be called after delay, but no request made
      assert.lengthOf(amplitude._unsentEvents, 0);
      clock.tick(eventUploadPeriodMillis);
      assert.lengthOf(server.requests, 1);
    });

    it('should not schedule more than one upload', function() {
      var eventUploadPeriodMillis = 5*1000; // 5s
      amplitude.init(apiKey, null, {
        batchEvents: true,
        eventUploadThreshold: 30,
        eventUploadPeriodMillis: eventUploadPeriodMillis
      });

      // log 2 events, 1 millisecond apart, second event should not schedule upload
      amplitude.logEvent('Event1');
      clock.tick(1);
      amplitude.logEvent('Event2');
      assert.lengthOf(amplitude._unsentEvents, 2);
      assert.lengthOf(server.requests, 0);

      // advance to upload period millis, and should have 1 server request
      // from the first scheduled upload
      clock.tick(eventUploadPeriodMillis-1);
      assert.lengthOf(server.requests, 1);
      server.respondWith('success');
      server.respond();

      // log 3rd event, advance 1 more millisecond, verify no 2nd server request
      amplitude.logEvent('Event3');
      clock.tick(1);
      assert.lengthOf(server.requests, 1);

      // the 3rd event, however, should have scheduled another upload after 5s
      clock.tick(eventUploadPeriodMillis-2);
      assert.lengthOf(server.requests, 1);
      clock.tick(1);
      assert.lengthOf(server.requests, 2);
    });

    it('should back off on 413 status', function() {
      amplitude.init(apiKey, null, {uploadBatchSize: 10});

      amplitude._sending = true;
      for (var i = 0; i < 15; i++) {
        amplitude.logEvent('Event', {index: i});
      }
      amplitude._sending = false;

      amplitude.logEvent('Event', {index: 100});

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 10);
      assert.deepEqual(events[0].event_properties, {index: 0});
      assert.deepEqual(events[9].event_properties, {index: 9});

      server.respondWith([413, {}, '']);
      server.respond();

      assert.lengthOf(server.requests, 2);
      var events = JSON.parse(queryString.parse(server.requests[1].requestBody).e);
      assert.lengthOf(events, 5);
      assert.deepEqual(events[0].event_properties, {index: 0});
      assert.deepEqual(events[4].event_properties, {index: 4});
    });

    it('should back off on 413 status all the way to 1 event with drops', function() {
      amplitude.init(apiKey, null, {uploadBatchSize: 9});

      amplitude._sending = true;
      for (var i = 0; i < 10; i++) {
        amplitude.logEvent('Event', {index: i});
      }
      amplitude._sending = false;
      amplitude.logEvent('Event', {index: 100});

      for (var i = 0; i < 6; i++) {
        assert.lengthOf(server.requests, i+1);
        server.respondWith([413, {}, '']);
        server.respond();
      }

      var events = JSON.parse(queryString.parse(server.requests[6].requestBody).e);
      assert.lengthOf(events, 1);
      assert.deepEqual(events[0].event_properties, {index: 2});
    });

    it ('should run callback if no eventType', function () {
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      }
      amplitude.logEvent(null, null, callback);
      assert.equal(counter, 1);
      assert.equal(value, 0);
      assert.equal(message, 'No request sent');
    });

    it ('should run callback if optout', function () {
      amplitude.setOptOut(true);
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      };
      amplitude.logEvent('test', null, callback);
      assert.equal(counter, 1);
      assert.equal(value, 0);
      assert.equal(message, 'No request sent');
    });

    it ('should not run callback if invalid callback and no eventType', function () {
      amplitude.logEvent(null, null, 'invalid callback');
    });

    it ('should run callback after logging event', function () {
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      };
      amplitude.logEvent('test', null, callback);

      // before server responds, callback should not fire
      assert.lengthOf(server.requests, 1);
      assert.equal(counter, 0);
      assert.equal(value, -1);
      assert.equal(message, '');

      // after server response, fire callback
      server.respondWith('success');
      server.respond();
      assert.equal(counter, 1);
      assert.equal(value, 200);
      assert.equal(message, 'success');
    });

    it ('should run callback once and only after all events are uploaded', function () {
      amplitude.init(apiKey, null, {uploadBatchSize: 10});
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      };

      // queue up 15 events, since batchsize 10, need to send in 2 batches
      amplitude._sending = true;
      for (var i = 0; i < 15; i++) {
        amplitude.logEvent('Event', {index: i});
      }
      amplitude._sending = false;

      amplitude.logEvent('Event', {index: 100}, callback);

      assert.lengthOf(server.requests, 1);
      server.respondWith('success');
      server.respond();

      // after first response received, callback should not have fired
      assert.equal(counter, 0);
      assert.equal(value, -1);
      assert.equal(message, '');

      assert.lengthOf(server.requests, 2);
      server.respondWith('success');
      server.respond();

      // after last response received, callback should fire
      assert.equal(counter, 1);
      assert.equal(value, 200);
      assert.equal(message, 'success');
    });

    it ('should run callback once and only after 413 resolved', function () {
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      };

      // queue up 15 events
      amplitude._sending = true;
      for (var i = 0; i < 15; i++) {
        amplitude.logEvent('Event', {index: i});
      }
      amplitude._sending = false;

      // 16th event with 413 will backoff to batches of 8
      amplitude.logEvent('Event', {index: 100}, callback);

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 16);

      // after 413 response received, callback should not have fired
      server.respondWith([413, {}, '']);
      server.respond();
      assert.equal(counter, 0);
      assert.equal(value, -1);
      assert.equal(message, '');

      // after sending first backoff batch, callback still should not have fired
      assert.lengthOf(server.requests, 2);
      var events = JSON.parse(queryString.parse(server.requests[1].requestBody).e);
      assert.lengthOf(events, 8);
      server.respondWith('success');
      server.respond();
      assert.equal(counter, 0);
      assert.equal(value, -1);
      assert.equal(message, '');

      // after sending second backoff batch, callback should fire
      assert.lengthOf(server.requests, 3);
      var events = JSON.parse(queryString.parse(server.requests[1].requestBody).e);
      assert.lengthOf(events, 8);
      server.respondWith('success');
      server.respond();
      assert.equal(counter, 1);
      assert.equal(value, 200);
      assert.equal(message, 'success');
    });

    it ('should run callback if server returns something other than 200 and 413', function () {
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      };

      amplitude.logEvent('test', null, callback);
      server.respondWith([404, {}, 'Not found']);
      server.respond();
      assert.equal(counter, 1);
      assert.equal(value, 404);
      assert.equal(message, 'Not found');
    });

    it('should send 3 identify events', function() {
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 3});
      assert.equal(amplitude._unsentCount(), 0);

      amplitude.identify(new Identify().add('photoCount', 1));
      amplitude.identify(new Identify().add('photoCount', 1).set('country', 'USA'));
      amplitude.identify(new Identify().add('photoCount', 1));

      // verify some internal counters
      assert.equal(amplitude._eventId, 0);
      assert.equal(amplitude._identifyId, 3);
      assert.equal(amplitude._unsentCount(), 3);
      assert.lengthOf(amplitude._unsentEvents, 0);
      assert.lengthOf(amplitude._unsentIdentifys, 3);

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 3);
      for (var i = 0; i < 3; i++) {
        assert.equal(events[i].event_type, '$identify');
        assert.isTrue('$add' in events[i].user_properties);
        assert.deepEqual(events[i].user_properties['$add'], {'photoCount': 1});
        assert.equal(events[i].event_id, i+1);
        assert.equal(events[i].sequence_number, i+1);
      }

      // send response and check that remove events works properly
      server.respondWith('success');
      server.respond();
      assert.equal(amplitude._unsentCount(), 0);
      assert.lengthOf(amplitude._unsentIdentifys, 0);
    });

    it('should send 3 events', function() {
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 3});
      assert.equal(amplitude._unsentCount(), 0);

      amplitude.logEvent('test');
      amplitude.logEvent('test');
      amplitude.logEvent('test');

      // verify some internal counters
      assert.equal(amplitude._eventId, 3);
      assert.equal(amplitude._identifyId, 0);
      assert.equal(amplitude._unsentCount(), 3);
      assert.lengthOf(amplitude._unsentEvents, 3);
      assert.lengthOf(amplitude._unsentIdentifys, 0);

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 3);
      for (var i = 0; i < 3; i++) {
        assert.equal(events[i].event_type, 'test');
        assert.equal(events[i].event_id, i+1);
        assert.equal(events[i].sequence_number, i+1);
      }

      // send response and check that remove events works properly
      server.respondWith('success');
      server.respond();
      assert.equal(amplitude._unsentCount(), 0);
      assert.lengthOf(amplitude._unsentEvents, 0);
    });

    it('should send 1 event and 1 identify event', function() {
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 2});
      assert.equal(amplitude._unsentCount(), 0);

      amplitude.logEvent('test');
      amplitude.identify(new Identify().add('photoCount', 1));

      // verify some internal counters
      assert.equal(amplitude._eventId, 1);
      assert.equal(amplitude._identifyId, 1);
      assert.equal(amplitude._unsentCount(), 2);
      assert.lengthOf(amplitude._unsentEvents, 1);
      assert.lengthOf(amplitude._unsentIdentifys, 1);

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 2);

      // event should come before identify - maintain order using sequence number
      assert.equal(events[0].event_type, 'test');
      assert.equal(events[0].event_id, 1);
      assert.deepEqual(events[0].user_properties, {});
      assert.equal(events[0].sequence_number, 1);
      assert.equal(events[1].event_type, '$identify');
      assert.equal(events[1].event_id, 1);
      assert.isTrue('$add' in events[1].user_properties);
      assert.deepEqual(events[1].user_properties['$add'], {'photoCount': 1});
      assert.equal(events[1].sequence_number, 2);

      // send response and check that remove events works properly
      server.respondWith('success');
      server.respond();
      assert.equal(amplitude._unsentCount(), 0);
      assert.lengthOf(amplitude._unsentEvents, 0);
      assert.lengthOf(amplitude._unsentIdentifys, 0);
    });

    it('should properly coalesce events and identify events into a request', function() {
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 6});
      assert.equal(amplitude._unsentCount(), 0);

      amplitude.logEvent('test1');
      clock.tick(1);
      amplitude.identify(new Identify().add('photoCount', 1));
      clock.tick(1);
      amplitude.logEvent('test2');
      clock.tick(1);
      amplitude.logEvent('test3');
      clock.tick(1);
      amplitude.logEvent('test4');
      amplitude.identify(new Identify().add('photoCount', 2));

      // verify some internal counters
      assert.equal(amplitude._eventId, 4);
      assert.equal(amplitude._identifyId, 2);
      assert.equal(amplitude._unsentCount(), 6);
      assert.lengthOf(amplitude._unsentEvents, 4);
      assert.lengthOf(amplitude._unsentIdentifys, 2);

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 6);

      // verify the correct coalescing
      assert.equal(events[0].event_type, 'test1');
      assert.deepEqual(events[0].user_properties, {});
      assert.equal(events[0].sequence_number, 1);
      assert.equal(events[1].event_type, '$identify');
      assert.isTrue('$add' in events[1].user_properties);
      assert.deepEqual(events[1].user_properties['$add'], {'photoCount': 1});
      assert.equal(events[1].sequence_number, 2);
      assert.equal(events[2].event_type, 'test2');
      assert.deepEqual(events[2].user_properties, {});
      assert.equal(events[2].sequence_number, 3);
      assert.equal(events[3].event_type, 'test3');
      assert.deepEqual(events[3].user_properties, {});
      assert.equal(events[3].sequence_number, 4);
      assert.equal(events[4].event_type, 'test4');
      assert.deepEqual(events[4].user_properties, {});
      assert.equal(events[4].sequence_number, 5);
      assert.equal(events[5].event_type, '$identify');
      assert.isTrue('$add' in events[5].user_properties);
      assert.deepEqual(events[5].user_properties['$add'], {'photoCount': 2});
      assert.equal(events[5].sequence_number, 6);

      // send response and check that remove events works properly
      server.respondWith('success');
      server.respond();
      assert.equal(amplitude._unsentCount(), 0);
      assert.lengthOf(amplitude._unsentEvents, 0);
      assert.lengthOf(amplitude._unsentIdentifys, 0);
    });

    it('should merged events supporting backwards compatability', function() {
      // events logged before v2.5.0 won't have sequence number, should get priority
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 3});
      assert.equal(amplitude._unsentCount(), 0);

      amplitude.identify(new Identify().add('photoCount', 1));
      amplitude.logEvent('test');
      delete amplitude._unsentEvents[0].sequence_number; // delete sequence number to simulate old event
      amplitude._sequenceNumber = 1; // reset sequence number
      amplitude.identify(new Identify().add('photoCount', 2));

      // verify some internal counters
      assert.equal(amplitude._eventId, 1);
      assert.equal(amplitude._identifyId, 2);
      assert.equal(amplitude._unsentCount(), 3);
      assert.lengthOf(amplitude._unsentEvents, 1);
      assert.lengthOf(amplitude._unsentIdentifys, 2);

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 3);

      // event should come before identify - prioritize events with no sequence number
      assert.equal(events[0].event_type, 'test');
      assert.equal(events[0].event_id, 1);
      assert.deepEqual(events[0].user_properties, {});
      assert.isFalse('sequence_number' in events[0]);

      assert.equal(events[1].event_type, '$identify');
      assert.equal(events[1].event_id, 1);
      assert.isTrue('$add' in events[1].user_properties);
      assert.deepEqual(events[1].user_properties['$add'], {'photoCount': 1});
      assert.equal(events[1].sequence_number, 1);

      assert.equal(events[2].event_type, '$identify');
      assert.equal(events[2].event_id, 2);
      assert.isTrue('$add' in events[2].user_properties);
      assert.deepEqual(events[2].user_properties['$add'], {'photoCount': 2});
      assert.equal(events[2].sequence_number, 2);

      // send response and check that remove events works properly
      server.respondWith('success');
      server.respond();
      assert.equal(amplitude._unsentCount(), 0);
      assert.lengthOf(amplitude._unsentEvents, 0);
      assert.lengthOf(amplitude._unsentIdentifys, 0);
    });

    it('should drop event and keep identify on 413 response', function() {
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 2});
      amplitude.logEvent('test');
      clock.tick(1);
      amplitude.identify(new Identify().add('photoCount', 1));

      assert.equal(amplitude._unsentCount(), 2);
      assert.lengthOf(server.requests, 1);
      server.respondWith([413, {}, '']);
      server.respond();

      // backoff and retry
      assert.equal(amplitude.options.uploadBatchSize, 1);
      assert.equal(amplitude._unsentCount(), 2);
      assert.lengthOf(server.requests, 2);
      server.respondWith([413, {}, '']);
      server.respond();

      // after dropping massive event, only 1 event left
      assert.equal(amplitude.options.uploadBatchSize, 1);
      assert.equal(amplitude._unsentCount(), 1);
      assert.lengthOf(server.requests, 3);

      var events = JSON.parse(queryString.parse(server.requests[2].requestBody).e);
      assert.lengthOf(events, 1);
      assert.equal(events[0].event_type, '$identify');
      assert.isTrue('$add' in events[0].user_properties);
      assert.deepEqual(events[0].user_properties['$add'], {'photoCount': 1});
    });

    it('should drop identify if 413 and uploadBatchSize is 1', function() {
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 2});
      amplitude.identify(new Identify().add('photoCount', 1));
      clock.tick(1);
      amplitude.logEvent('test');

      assert.equal(amplitude._unsentCount(), 2);
      assert.lengthOf(server.requests, 1);
      server.respondWith([413, {}, '']);
      server.respond();

      // backoff and retry
      assert.equal(amplitude.options.uploadBatchSize, 1);
      assert.equal(amplitude._unsentCount(), 2);
      assert.lengthOf(server.requests, 2);
      server.respondWith([413, {}, '']);
      server.respond();

      // after dropping massive event, only 1 event left
      assert.equal(amplitude.options.uploadBatchSize, 1);
      assert.equal(amplitude._unsentCount(), 1);
      assert.lengthOf(server.requests, 3);

      var events = JSON.parse(queryString.parse(server.requests[2].requestBody).e);
      assert.lengthOf(events, 1);
      assert.equal(events[0].event_type, 'test');
      assert.deepEqual(events[0].user_properties, {});
    });

    it('should truncate long event property strings', function() {
      var longString = new Array(5000).join('a');
      amplitude.logEvent('test', {'key': longString});
      var event = JSON.parse(queryString.parse(server.requests[0].requestBody).e)[0];

      assert.isTrue('key' in event.event_properties);
      assert.lengthOf(event.event_properties['key'], 4096);
    });

    it('should truncate long user property strings', function() {
      var longString = new Array(5000).join('a');
      amplitude.identify(new Identify().set('key', longString));
      var event = JSON.parse(queryString.parse(server.requests[0].requestBody).e)[0];

      assert.isTrue('$set' in event.user_properties);
      assert.lengthOf(event.user_properties['$set']['key'], 4096);
    });

    it('should validate event properties', function() {
      var e = new Error('oops');
      clock.tick(1);
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 5});
      clock.tick(1);
      amplitude.logEvent('String event properties', '{}');
      clock.tick(1);
      amplitude.logEvent('Bool event properties', true);
      clock.tick(1);
      amplitude.logEvent('Number event properties', 15);
      clock.tick(1);
      amplitude.logEvent('Array event properties', [1, 2, 3]);
      clock.tick(1);
      amplitude.logEvent('Object event properties', {
        10: 'false', // coerce key
        'bool': true,
        'null': null, // should be ignored
        'function': console.log, // should be ignored
        'regex': /afdg/, // should be ignored
        'error': e, // coerce value
        'string': 'test',
        'array': [0, 1, 2, '3'],
        'nested_array': ['a', {'key': 'value'}, ['b']],
        'object': {'key':'value', 15: e},
        'nested_object': {'k':'v', 'l':[0,1], 'o':{'k2':'v2', 'l2': ['e2', {'k3': 'v3'}]}}
      });
      clock.tick(1);

      assert.lengthOf(amplitude._unsentEvents, 5);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 5);

      assert.deepEqual(events[0].event_properties, {});
      assert.deepEqual(events[1].event_properties, {});
      assert.deepEqual(events[2].event_properties, {});
      assert.deepEqual(events[3].event_properties, {});
      assert.deepEqual(events[4].event_properties, {
        '10': 'false',
        'bool': true,
        'error': 'Error: oops',
        'string': 'test',
        'array': [0, 1, 2, '3'],
        'nested_array': ['a', {'key': 'value'}],
        'object': {'key':'value', '15':'Error: oops'},
        'nested_object': {'k':'v', 'l':[0,1], 'o':{'k2':'v2', 'l2': ['e2', {'k3': 'v3'}]}}
      });
    });

    it('should validate user properties', function() {
      var identify = new Identify().set(10, 10);
      amplitude.init(apiKey, null, {batchEvents: true});
      amplitude.identify(identify);

      assert.deepEqual(amplitude._unsentIdentifys[0].user_properties, {'$set': {'10': 10}});
    });

    it('should ignore event and user properties with too many items', function() {
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 2});
      var eventProperties = {};
      var userProperties = {};
      var identify = new Identify();
      for (var i = 0; i < constants.MAX_PROPERTY_KEYS + 1; i++) {
        eventProperties[i] = i;
        userProperties[i*2] = i*2;
        identify.set(i, i);
      }

      // verify that setUserProperties ignores the dict completely
      amplitude.setUserProperties(userProperties);
      assert.lengthOf(amplitude._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      // verify that the event properties and user properties are scrubbed
      amplitude.logEvent('test event', eventProperties);
      amplitude.identify(identify);

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 2);

      assert.equal(events[0].event_type, 'test event');
      assert.deepEqual(events[0].event_properties, {});
      assert.deepEqual(events[0].user_properties, {});
      assert.equal(events[1].event_type, '$identify');
      assert.deepEqual(events[1].event_properties, {});
      assert.deepEqual(events[1].user_properties, {'$set': {}});
    });

    it('should handle groups input', function() {
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      };

      var eventProperties = {
        'key': 'value'
      };

      var groups = {
        10: 1.23,  // coerce numbers to strings
        'array': ['test2', false, ['test', 23, null], null],  // should ignore nested array and nulls
        'dictionary': {160: 'test3'},  // should ignore dictionaries
        'null': null, // ignore null values
      }

      amplitude.logEventWithGroups('Test', eventProperties, groups, callback);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);

      // verify event is correctly formatted
      var event = events[0];
      assert.equal(event.event_type, 'Test');
      assert.equal(event.event_id, 1);
      assert.deepEqual(event.user_properties, {});
      assert.deepEqual(event.event_properties, eventProperties);
      assert.deepEqual(event.groups, {
        '10': '1.23',
        'array': ['test2', 'false'],
      });

      // verify callback behavior
      assert.equal(counter, 0);
      assert.equal(value, -1);
      assert.equal(message, '');
      server.respondWith('success');
      server.respond();
      assert.equal(counter, 1);
      assert.equal(value, 200);
      assert.equal(message, 'success');
    });

    it('should track the raw user agent string', function() {
      // Unit test UA is set by phantomJS test environment, should be constant for all tests
      var userAgentString = navigator.userAgent;
      assert.isTrue(amplitude._userAgent.indexOf(userAgentString) > -1);

      // log an event and verify UA field is filled out
      amplitude.logEvent('testEvent');
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);
      assert.equal(events[0].event_type, 'testEvent');
      assert.isTrue(events[0].user_agent.indexOf(userAgentString) > -1);
    });

    it('should allow logging event with custom timestamp', function() {
      var timestamp = 2000;
      amplitude.logEventWithTimestamp('test', null, timestamp, null);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);

      // verify the event is correct
      var event = events[0];
      assert.equal(event.event_type, 'test');
      assert.equal(event.event_id, 1);
      assert.equal(event.timestamp, timestamp);
    });

    it('should use current time if timestamp is null', function() {
      var timestamp = 5000;
      clock.tick(timestamp);
      amplitude.logEventWithTimestamp('test', null, null, null);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);

      // verify the event is correct
      var event = events[0];
      assert.equal(event.event_type, 'test');
      assert.equal(event.event_id, 1);
      assert.isTrue(event.timestamp >= timestamp);
    });

    it('should use current time if timestamp is not valid form', function() {
      var timestamp = 6000;
      clock.tick(timestamp);
      amplitude.logEventWithTimestamp('test', null, 'invalid', null);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);

      // verify the event is correct
      var event = events[0];
      assert.equal(event.event_type, 'test');
      assert.equal(event.event_id, 1);
      assert.isTrue(event.timestamp >= timestamp);
    });
  });

  describe('optOut', function() {
    beforeEach(function() {
      amplitude.init(apiKey);
    });

    afterEach(function() {
      reset();
    });

    it('should not send events while enabled', function() {
      amplitude.setOptOut(true);
      amplitude.logEvent('Event Type 1');
      assert.lengthOf(server.requests, 0);
    });

    it('should not send saved events while enabled', function() {
      amplitude.logEvent('Event Type 1');
      assert.lengthOf(server.requests, 1);

      amplitude._sending = false;
      amplitude.setOptOut(true);
      amplitude.init(apiKey);
      assert.lengthOf(server.requests, 1);
    });

    it('should start sending events again when disabled', function() {
      amplitude.setOptOut(true);
      amplitude.logEvent('Event Type 1');
      assert.lengthOf(server.requests, 0);

      amplitude.setOptOut(false);
      amplitude.logEvent('Event Type 1');
      assert.lengthOf(server.requests, 1);

      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);
    });

    it('should have state be persisted in the cookie', function() {
      var amplitude = new AmplitudeClient();
      amplitude.init(apiKey);
      assert.strictEqual(amplitude.options.optOut, false);

      amplitude.setOptOut(true);

      var amplitude2 = new AmplitudeClient();
      amplitude2.init(apiKey);
      assert.strictEqual(amplitude2.options.optOut, true);
    });

    it('should favor the config optOut setting over cookie optOut if the config optOut is set to true', function() {
      var amplitude = new AmplitudeClient();
      cookie.set(amplitude.options.cookieName, { optOut: false });
      amplitude.init(apiKey, null, { optOut: true });

      assert.strictEqual(amplitude.options.optOut, true);
    });
  });

  describe('sessionId', function() {
    var clock;
    beforeEach(function() {
      reset();
      clock = sinon.useFakeTimers();
      amplitude.init(apiKey);
    });

    afterEach(function() {
      reset();
      clock.restore();
    });

    it('should create new session IDs on timeout', function() {
      var sessionId = amplitude._sessionId;
      clock.tick(30 * 60 * 1000 + 1);
      amplitude.logEvent('Event Type 1');
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.equal(events.length, 1);
      assert.notEqual(events[0].session_id, sessionId);
      assert.notEqual(amplitude._sessionId, sessionId);
      assert.equal(events[0].session_id, amplitude._sessionId);
    });

    it('should be fetched correctly by getSessionId', function() {
      var timestamp = 1000;
      clock.tick(timestamp);
      var amplitude2 = new AmplitudeClient();
      amplitude2.init(apiKey);
      assert.equal(amplitude2._sessionId, timestamp);
      assert.equal(amplitude2.getSessionId(), timestamp);
      assert.equal(amplitude2.getSessionId(), amplitude2._sessionId);
    });

    it('should ignore bad session id values', function() {
      var timestamp = 1000;
      clock.tick(timestamp);
      var amplitude2 = new AmplitudeClient();
      amplitude2.init(apiKey);
      assert.equal(amplitude2._sessionId, timestamp);
      assert.equal(amplitude2.getSessionId(), timestamp);
      assert.equal(amplitude2.getSessionId(), amplitude2._sessionId);

      amplitude2.setSessionId('invalid session id');
      assert.equal(amplitude2._sessionId, timestamp);
      assert.equal(amplitude2.getSessionId(), timestamp);
      assert.equal(amplitude2.getSessionId(), amplitude2._sessionId);
    });
  });

  describe('deferInitialization config', function () {
    it('should keep tracking users who already have an amplitude cookie', function () {
      var now = new Date().getTime();
      var cookieData = {
        userId: 'test_user_id',
        optOut: false,
        sessionId: now,
        lastEventTime: now,
        eventId: 50,
        identifyId: 60
      }

      cookie.set(amplitude.options.cookieName + keySuffix, cookieData);
      amplitude.init(apiKey, null, { cookieExpiration: 365, deferInitialization: true });
      amplitude.identify(new Identify().set('prop1', 'value1'));

      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(server.requests, 1, 'should have sent a request to Amplitude');
      assert.equal(events[0].event_type, '$identify');
    });
    describe('prior to opting into analytics', function () {
      beforeEach(function () {
        reset();
        amplitude.init(apiKey, null, { cookieExpiration: 365, deferInitialization: true });
      });
      it('should not initially drop a cookie if deferInitialization is set to true', function () {
        var cookieData = cookie.get(amplitude.options.cookieName + '_' + apiKey);
        assert.isNull(cookieData);
      });
      it('should not send anything to amplitude', function () {
        amplitude.identify(new Identify().set('prop1', 'value1'));
        amplitude.logEvent('Event Type 1');
        amplitude.setUserId(123456);
        amplitude.setGroup('orgId', 15);
        amplitude.setOptOut(true);
        amplitude.regenerateDeviceId();
        amplitude.setDeviceId('deviceId');
        amplitude.setUserProperties({'prop': true, 'key': 'value'});
        amplitude.clearUserProperties();
        amplitude.groupIdentify(null, null, new amplitude.Identify().set('key', 'value'));
        amplitude.setVersionName('testVersionName1');
        amplitude.logEventWithTimestamp('test', null, 2000, null);
        amplitude.logEventWithGroups('Test', {'key': 'value' }, {group: 'abc'});

        assert.lengthOf(server.requests, 0, 'should not send any requests to amplitude');
        assert.lengthOf(amplitude._unsentEvents, 0, 'should not queue events to be sent')
      });
    });

    describe('upon opting into analytics', function () {
      beforeEach(function () {
        reset();
        amplitude.init(apiKey, null, { cookieExpiration: 365, deferInitialization: true });
      });
      it('should drop a cookie', function () {
        amplitude.enableTracking();
        var cookieData = cookie.get(amplitude.options.cookieName + '_' + apiKey);
        assert.isNotNull(cookieData);
      });
      it('should send pending calls and events', function () {
        amplitude.identify(new Identify().set('prop1', 'value1'));
        amplitude.logEvent('Event Type 1');
        amplitude.logEvent('Event Type 2');
        amplitude.logEventWithTimestamp('test', null, 2000, null);
        assert.lengthOf(amplitude._unsentEvents, 0, 'should not have any pending events to be sent');
        amplitude.enableTracking();

        assert.lengthOf(server.requests, 1, 'should have sent a request to Amplitude');
        var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
        assert.lengthOf(events, 1, 'should have sent a request to Amplitude');
        assert.lengthOf(amplitude._unsentEvents, 3, 'should have saved the remaining events')
      });
      it('should send new events', function () {
        assert.lengthOf(amplitude._unsentEvents, 0, 'should start with no pending events to be sent');
        amplitude.identify(new Identify().set('prop1', 'value1'));
        amplitude.logEvent('Event Type 1');
        amplitude.logEvent('Event Type 2');
        amplitude.logEventWithTimestamp('test', null, 2000, null);
        assert.lengthOf(amplitude._unsentEvents, 0, 'should not have any pending events to be sent');

        amplitude.enableTracking();
        assert.lengthOf(amplitude._unsentEvents, 3, 'should have saved the remaining events')

        amplitude.logEvent('Event Type 3');
        assert.lengthOf(amplitude._unsentEvents, 4, 'should save the new events')
      });
      it('should not continue to deferInitialization if an amplitude cookie exists', function () {
        amplitude.enableTracking();
        amplitude.init(apiKey, null, { cookieExpiration: 365, deferInitialization: true });
        amplitude.logEvent('Event Type 1');

        var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
        assert.lengthOf(events, 1, 'should have sent a request to Amplitude');
      });
    });
  });
});
