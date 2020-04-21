import Amplitude from '../src/amplitude.js';
import cookie from '../src/cookie.js';
import queryString from 'query-string';
import Identify from '../src/identify.js';

// maintain for testing backwards compatability
describe('Amplitude', function() {
  var apiKey = '000000';
  var keySuffix = '_' + apiKey.slice(0,6);
  var userId = 'user';
  var amplitude;
  var server;

  beforeEach(function() {
    amplitude = new Amplitude();
    server = sinon.fakeServer.create();
  });

  afterEach(function() {
    server.restore();
  });

  it('amplitude object should exist', function() {
    assert.isObject(amplitude);
  });

  function reset() {
    sessionStorage.clear();
    cookie.remove(amplitude.options.cookieName);
    cookie.remove(amplitude.options.cookieName + keySuffix);
    cookie.remove(amplitude.options.cookieName + '_' + apiKey);
    cookie.remove(amplitude.options.cookieName + '_1_app1');
    cookie.remove(amplitude.options.cookieName + '_2_app2');
    cookie.reset();
  }

  describe('getInstance', function() {
    beforeEach(function() {
      reset();
    });

    afterEach(function() {
      reset();
    });

    it('should map no instance to default instance', function() {
      amplitude.init(apiKey);
      assert.equal(amplitude.options.apiKey, apiKey);
      assert.equal(amplitude.options, amplitude.options);
      assert.equal(amplitude.getInstance('$default_instance').options.apiKey, apiKey);
      assert.equal(amplitude.getInstance(), amplitude.getInstance('$default_instance'));
      assert.equal(amplitude.options.deviceId, amplitude.options.deviceId);

      // test for case insensitivity
      assert.equal(amplitude.getInstance(), amplitude.getInstance('$DEFAULT_INSTANCE'));
      assert.equal(amplitude.getInstance(), amplitude.getInstance('$DEFAULT_instance'));
    });

    it('should create two separate instances', function() {
      var app1 = amplitude.getInstance('app1');
      app1.init('1');
      var app2 = amplitude.getInstance('app2');
      app2.init('2');

      assert.notEqual(app1, app2);
      assert.equal(app1.options.apiKey, '1');
      assert.equal(app2.options.apiKey, '2');

      assert.equal(app1, amplitude.getInstance('app1'));
      assert.equal(app1, amplitude.getInstance('APP1'));
      assert.equal(app1, amplitude.getInstance('aPp1'));
      assert.equal(app2, amplitude.getInstance('app2'));
      assert.equal(app2, amplitude.getInstance('APP2'));
      assert.equal(app2, amplitude.getInstance('aPp2'));

      assert.equal(amplitude.getInstance('APP3')._instanceName, 'app3');
    });

    it('should return the same instance for same key', function() {
      var app = amplitude.getInstance('app');
      app.init('1');
      assert.equal(app, amplitude.getInstance('app'));
      assert.equal(amplitude.getInstance('app').options.apiKey, '1');
    });

    it('instances should have separate event queues and settings', function() {
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 2});
      var app1 = amplitude.getInstance('app1');
      app1.init('1');
      var app2 = amplitude.getInstance('app2');
      app2.init('2');

      assert.notEqual(amplitude.options.deviceId, app1.options.deviceId);
      assert.notEqual(amplitude.options.deviceId, app2.options.deviceId);
      assert.notEqual(app1.options.deviceId, app2.options.deviceId);

      amplitude.logEvent('amplitude event');
      amplitude.logEvent('amplitude event2');
      var identify = new Identify().set('key', 'value');
      app1.identify(identify);
      app2.logEvent('app2 event');

      assert.lengthOf(amplitude.getInstance()._unsentEvents, 2);
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 0);

      assert.lengthOf(app1._unsentEvents, 0);
      assert.lengthOf(app1._unsentIdentifys, 1);
      assert.lengthOf(app2._unsentEvents, 1);
      assert.lengthOf(app2._unsentIdentifys, 0);

      assert.deepEqual(amplitude.getInstance()._unsentEvents[0].event_type, 'amplitude event');
      assert.deepEqual(amplitude.getInstance()._unsentEvents[1].event_type, 'amplitude event2');
      assert.deepEqual(amplitude.getInstance()._unsentIdentifys, []);
      assert.deepEqual(app1._unsentEvents, []);
      assert.deepEqual(app1._unsentIdentifys[0].user_properties, {'$set':{'key':'value'}});
      assert.deepEqual(app2._unsentEvents[0].event_type, 'app2 event');
      assert.deepEqual(app2._unsentIdentifys, []);

      assert.equal(amplitude.getInstance()._eventId, 2);
      assert.equal(amplitude.getInstance()._identifyId, 0);
      assert.equal(amplitude.getInstance()._sequenceNumber, 2);
      assert.equal(app1._eventId, 0);
      assert.equal(app1._identifyId, 1);
      assert.equal(app1._sequenceNumber, 1);
      assert.equal(app2._eventId, 1);
      assert.equal(app2._identifyId, 0);
      assert.equal(app2._sequenceNumber, 1);

      // verify separate apiKeys in server requests
      assert.lengthOf(server.requests, 3);
      assert.equal(JSON.parse(queryString.parse(server.requests[1].requestBody).client), 1);
      assert.equal(JSON.parse(queryString.parse(server.requests[2].requestBody).client), 2);

      // verify separate cookie data
      var cookieData = cookie.get(amplitude.options.cookieName + '_' + apiKey);
      assert.equal(cookieData.deviceId, amplitude.options.deviceId);

      var cookieData1 = cookie.get(app1.options.cookieName + '_1_app1');
      assert.equal(cookieData1.deviceId, app1.options.deviceId);

      var cookieData2 = cookie.get(app2.options.cookieName + '_2_app2');
      assert.equal(cookieData2.deviceId, app2.options.deviceId);
    });

    it('new instances should not load historical cookie data', function() {
      var now = new Date().getTime();

      var cookieData = {
        deviceId: 'test_device_id',
        userId: 'test_user_id',
        optOut: true,
        sessionId: now-500,
        lastEventTime: now-500,
        eventId: 50,
        identifyId: 60,
        sequenceNumber: 70
      }
      cookie.set(amplitude.options.cookieName + '_' + apiKey, cookieData);

      // default instance loads from existing cookie
      var app = amplitude.getInstance();
      app.init(apiKey);
      assert.equal(app.options.deviceId, 'test_device_id');
      assert.equal(app.options.userId, 'test_user_id');
      assert.isTrue(app.options.optOut);
      assert.equal(app._sessionId, now-500);
      assert.isTrue(app._lastEventTime >= now);
      assert.equal(app._eventId, 50);
      assert.equal(app._identifyId, 60);
      assert.equal(app._sequenceNumber, 70);

      var app1 = amplitude.getInstance('app1');
      app1.init('1');
      assert.notEqual(app1.options.deviceId, 'test_device_id');
      assert.isNull(app1.options.userId);
      assert.isFalse(app1.options.optOut);
      assert.isTrue(app1._sessionId >= now);
      assert.isTrue(app1._lastEventTime >= now);
      assert.equal(app1._eventId, 0);
      assert.equal(app1._identifyId, 0);
      assert.equal(app1._sequenceNumber, 0);

      var app2 = amplitude.getInstance('app2');
      app2.init('2');
      assert.notEqual(app2.options.deviceId, 'test_device_id');
      assert.isNull(app2.options.userId);
      assert.isFalse(app2.options.optOut);
      assert.isTrue(app2._sessionId >= now);
      assert.isTrue(app2._lastEventTime >= now);
      assert.equal(app2._eventId, 0);
      assert.equal(app2._identifyId, 0);
      assert.equal(app2._sequenceNumber, 0);
    });
  });

  describe('init', function() {
    beforeEach(function() {
      reset();
    });

    afterEach(function() {
      reset();
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

    it('should set cookie', function() {
      amplitude.init(apiKey, userId);
      var stored = cookie.get(amplitude.options.cookieName + '_' + apiKey);
      assert.property(stored, 'deviceId');
      assert.propertyVal(stored, 'userId', userId);
      assert.lengthOf(stored.deviceId, 22);
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

    it('should load sessionId, eventId from cookie and ignore the one in localStorage', function() {
      var sessionIdKey = 'amplitude_sessionId';
      var lastEventTimeKey = 'amplitude_lastEventTime';
      var eventIdKey = 'amplitude_lastEventId';
      var identifyIdKey = 'amplitude_lastIdentifyId';
      var sequenceNumberKey = 'amplitude_lastSequenceNumber';
      var amplitude2 = new Amplitude();

      var clock = sinon.useFakeTimers();
      clock.tick(1000);
      var sessionId = new Date().getTime();

      // the following values in localStorage will all be ignored
      localStorage.clear();
      localStorage.setItem(sessionIdKey, 3);
      localStorage.setItem(lastEventTimeKey, 4);
      localStorage.setItem(eventIdKey, 5);
      localStorage.setItem(identifyIdKey, 6);
      localStorage.setItem(sequenceNumberKey, 7);

      var cookieData = {
        deviceId: 'test_device_id',
        userId: 'test_user_id',
        optOut: true,
        sessionId: sessionId,
        lastEventTime: sessionId,
        eventId: 50,
        identifyId: 60,
        sequenceNumber: 70
      }
      cookie.set(amplitude2.options.cookieName, cookieData);

      clock.tick(10);
      amplitude2.init(apiKey);
      clock.restore();

      assert.equal(amplitude2.getInstance()._sessionId, sessionId);
      assert.equal(amplitude2.getInstance()._lastEventTime, sessionId + 10);
      assert.equal(amplitude2.getInstance()._eventId, 50);
      assert.equal(amplitude2.getInstance()._identifyId, 60);
      assert.equal(amplitude2.getInstance()._sequenceNumber, 70);
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
      assert.equal(amplitude.getInstance()._unsentCount(), 0);
      assert.lengthOf(server.requests, 0);
      var userId = 'testUserId'
      var eventType = 'test_event'
      var functions = [
        ['setUserId', userId],
        ['logEvent', eventType]
      ];
      amplitude.getInstance()._q = functions;
      assert.lengthOf(amplitude.getInstance()._q, 2);
      amplitude.runQueuedFunctions();

      assert.equal(amplitude.options.userId, userId);
      assert.equal(amplitude.getInstance()._unsentCount(), 1);
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 1);
      assert.equal(events[0].event_type, eventType);

      assert.lengthOf(amplitude.getInstance()._q, 0);
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
      assert.equal(amplitude.getInstance()._unsentCount(), 0);
      amplitude.setUserProperties({'prop': true, 'key': 'value'});

      assert.lengthOf(amplitude.getInstance()._unsentEvents, 0);
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 1);
      assert.equal(amplitude.getInstance()._unsentCount(), 1);
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
      assert.equal(amplitude.getInstance()._unsentCount(), 0);
      amplitude.clearUserProperties();

      assert.lengthOf(amplitude.getInstance()._unsentEvents, 0);
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 1);
      assert.equal(amplitude.getInstance()._unsentCount(), 1);
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
      assert.equal(amplitude.getInstance()._unsentEvents[0].version_name, 'testVersionName1');

      // should ignore non-string values
      amplitude.setVersionName(15000);
      amplitude.logEvent('testEvent2');
      assert.equal(amplitude.getInstance()._unsentEvents[1].version_name, 'testVersionName1');
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

  describe('identify', function() {
    var clock;

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
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.identify(150);
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.identify(['test']);
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.identify({'user_prop': true});
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);
    });

    it('should generate an event from the identify object', function() {
      var identify = new Identify().set('prop1', 'value1').unset('prop2').add('prop3', 3).setOnce('prop4', true);
      amplitude.identify(identify);

      assert.lengthOf(amplitude.getInstance()._unsentEvents, 0);
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 1);
      assert.equal(amplitude.getInstance()._unsentCount(), 1);
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
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);
    });

    it('should ignore empty proxy identify objects', function() {
      amplitude.identify({'_q': {}});
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 0);
      assert.lengthOf(server.requests, 0);

      amplitude.identify({});
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 0);
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

      assert.lengthOf(amplitude.getInstance()._unsentEvents, 0);
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 1);
      assert.equal(amplitude.getInstance()._unsentCount(), 1);
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
      new Amplitude().identify(identify, callback);

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

    it('should accept properties', function() {
      amplitude.logEvent('Event Type 5', {prop: true});
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.deepEqual(events[0].event_properties, {prop: true});
    });

    it('should queue events', function() {
      amplitude.getInstance()._sending = true;
      amplitude.logEvent('Event', {index: 1});
      amplitude.logEvent('Event', {index: 2});
      amplitude.logEvent('Event', {index: 3});
      amplitude.getInstance()._sending = false;

      amplitude.logEvent('Event', {index: 100});

      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 4);
      assert.deepEqual(events[0].event_properties, {index: 1});
      assert.deepEqual(events[3].event_properties, {index: 100});
    });

    it('should remove only sent events', function() {
      amplitude.getInstance()._sending = true;
      amplitude.logEvent('Event', {index: 1});
      amplitude.logEvent('Event', {index: 2});
      amplitude.getInstance()._sending = false;
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

      var amplitude2 = new Amplitude();
      amplitude2.init(apiKey);
      assert.deepEqual(amplitude2.getInstance()._unsentEvents, []);
    });

    it('should limit events sent', function() {
      amplitude.init(apiKey, null, {uploadBatchSize: 10});

      amplitude.getInstance()._sending = true;
      for (var i = 0; i < 15; i++) {
        amplitude.logEvent('Event', {index: i});
      }
      amplitude.getInstance()._sending = false;

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
      var unsentEvents = amplitude.getInstance()._unsentEvents;
      assert.lengthOf(unsentEvents, 5);
      assert.deepEqual(unsentEvents[4].event_properties, {index: 14});

      // remaining 5 events should be sent by the delayed sendEvent call
      clock.tick(eventUploadPeriodMillis);
      assert.lengthOf(server.requests, 2);
      server.respondWith('success');
      server.respond();
      assert.lengthOf(amplitude.getInstance()._unsentEvents, 0);
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
      assert.lengthOf(amplitude.getInstance()._unsentEvents, 1);
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
      assert.lengthOf(amplitude.getInstance()._unsentEvents, 2);
      assert.lengthOf(server.requests, 1);
      server.respondWith('success');
      server.respond();
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.lengthOf(events, 2);
      assert.deepEqual(events[1].event_type, 'Event2');

      // saveEvent should be called after delay, but no request made
      assert.lengthOf(amplitude.getInstance()._unsentEvents, 0);
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
      assert.lengthOf(amplitude.getInstance()._unsentEvents, 2);
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

      amplitude.getInstance()._sending = true;
      for (var i = 0; i < 15; i++) {
        amplitude.logEvent('Event', {index: i});
      }
      amplitude.getInstance()._sending = false;

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

      amplitude.getInstance()._sending = true;
      for (var i = 0; i < 10; i++) {
        amplitude.logEvent('Event', {index: i});
      }
      amplitude.getInstance()._sending = false;
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

    it ('should run callback if batchEvents but under threshold', function () {
      var eventUploadPeriodMillis = 5*1000;
      amplitude.init(apiKey, null, {
        batchEvents: true,
        eventUploadThreshold: 2,
        eventUploadPeriodMillis: eventUploadPeriodMillis
      });
      var counter = 0;
      var value = -1;
      var message = '';
      var callback = function (status, response) {
        counter++;
        value = status;
        message = response;
      };
      amplitude.logEvent('test', null, callback);
      assert.lengthOf(server.requests, 0);
      assert.equal(counter, 1);
      assert.equal(value, 0);
      assert.equal(message, 'No request sent');

      // check that request is made after delay, but callback is not run a second time
      clock.tick(eventUploadPeriodMillis);
      assert.lengthOf(server.requests, 1);
      server.respondWith('success');
      server.respond();
      assert.equal(counter, 1);
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
      amplitude.getInstance()._sending = true;
      for (var i = 0; i < 15; i++) {
        amplitude.logEvent('Event', {index: i});
      }
      amplitude.getInstance()._sending = false;

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
      amplitude.getInstance()._sending = true;
      for (var i = 0; i < 15; i++) {
        amplitude.logEvent('Event', {index: i});
      }
      amplitude.getInstance()._sending = false;

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

    it('should properly coalesce events and identify events into a request', function() {
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 6});
      assert.equal(amplitude.getInstance()._unsentCount(), 0);

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
      assert.equal(amplitude.getInstance()._eventId, 4);
      assert.equal(amplitude.getInstance()._identifyId, 2);
      assert.equal(amplitude.getInstance()._unsentCount(), 6);
      assert.lengthOf(amplitude.getInstance()._unsentEvents, 4);
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 2);

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
      assert.equal(amplitude.getInstance()._unsentCount(), 0);
      assert.lengthOf(amplitude.getInstance()._unsentEvents, 0);
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 0);
    });

    it('should merged events supporting backwards compatability', function() {
      // events logged before v2.5.0 won't have sequence number, should get priority
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 3});
      assert.equal(amplitude.getInstance()._unsentCount(), 0);

      amplitude.identify(new Identify().add('photoCount', 1));
      amplitude.logEvent('test');
      delete amplitude.getInstance()._unsentEvents[0].sequence_number; // delete sequence number to simulate old event
      amplitude.getInstance()._sequenceNumber = 1; // reset sequence number
      amplitude.identify(new Identify().add('photoCount', 2));

      // verify some internal counters
      assert.equal(amplitude.getInstance()._eventId, 1);
      assert.equal(amplitude.getInstance()._identifyId, 2);
      assert.equal(amplitude.getInstance()._unsentCount(), 3);
      assert.lengthOf(amplitude.getInstance()._unsentEvents, 1);
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 2);

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
      assert.equal(amplitude.getInstance()._unsentCount(), 0);
      assert.lengthOf(amplitude.getInstance()._unsentEvents, 0);
      assert.lengthOf(amplitude.getInstance()._unsentIdentifys, 0);
    });

    it('should drop event and keep identify on 413 response', function() {
      amplitude.init(apiKey, null, {batchEvents: true, eventUploadThreshold: 2});
      amplitude.logEvent('test');
      clock.tick(1);
      amplitude.identify(new Identify().add('photoCount', 1));

      assert.equal(amplitude.getInstance()._unsentCount(), 2);
      assert.lengthOf(server.requests, 1);
      server.respondWith([413, {}, '']);
      server.respond();

      // backoff and retry
      assert.equal(amplitude.options.uploadBatchSize, 1);
      assert.equal(amplitude.getInstance()._unsentCount(), 2);
      assert.lengthOf(server.requests, 2);
      server.respondWith([413, {}, '']);
      server.respond();

      // after dropping massive event, only 1 event left
      assert.equal(amplitude.options.uploadBatchSize, 1);
      assert.equal(amplitude.getInstance()._unsentCount(), 1);
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

      assert.equal(amplitude.getInstance()._unsentCount(), 2);
      assert.lengthOf(server.requests, 1);
      server.respondWith([413, {}, '']);
      server.respond();

      // backoff and retry
      assert.equal(amplitude.options.uploadBatchSize, 1);
      assert.equal(amplitude.getInstance()._unsentCount(), 2);
      assert.lengthOf(server.requests, 2);
      server.respondWith([413, {}, '']);
      server.respond();

      // after dropping massive event, only 1 event left
      assert.equal(amplitude.options.uploadBatchSize, 1);
      assert.equal(amplitude.getInstance()._unsentCount(), 1);
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

      assert.lengthOf(amplitude.getInstance()._unsentEvents, 5);
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

    it('should validate user propeorties', function() {
      var identify = new Identify().set(10, 10);
      amplitude.init(apiKey, null, {batchEvents: true});
      amplitude.identify(identify);

      assert.deepEqual(amplitude.getInstance()._unsentIdentifys[0].user_properties, {'$set': {'10': 10}});
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

      amplitude.getInstance()._sending = false;
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
      var amplitude = new Amplitude();
      amplitude.init(apiKey);
      assert.strictEqual(amplitude.options.optOut, false);

      amplitude.setOptOut(true);

      var amplitude2 = new Amplitude();
      amplitude2.init(apiKey);
      assert.strictEqual(amplitude2.options.optOut, true);
    });
  });

  describe('gatherReferrer', function() {
    var clock;
    beforeEach(function() {
      clock = sinon.useFakeTimers();
      amplitude.init(apiKey);
    });

    afterEach(function() {
      clock.restore();
      reset();
    });

    it('should not send referrer data when the includeReferrer flag is false', function() {
      clock.tick(30 * 60 * 1000 + 1);
      amplitude.init(apiKey, undefined, {});

      amplitude.setUserProperties({user_prop: true});
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.equal(events[0].user_properties.referrer, undefined);
      assert.equal(events[0].user_properties.referring_domain, undefined);
    });
  });

  describe('sessionId', function() {
    var clock;
    beforeEach(function() {
      clock = sinon.useFakeTimers();
      amplitude.init(apiKey);
    });

    afterEach(function() {
      reset();
      clock.restore();
    });

    it('should create new session IDs on timeout', function() {
      var sessionId = amplitude.getInstance()._sessionId;
      clock.tick(30 * 60 * 1000 + 1);
      amplitude.logEvent('Event Type 1');
      assert.lengthOf(server.requests, 1);
      var events = JSON.parse(queryString.parse(server.requests[0].requestBody).e);
      assert.equal(events.length, 1);
      assert.notEqual(events[0].session_id, sessionId);
      assert.notEqual(amplitude.getInstance()._sessionId, sessionId);
      assert.equal(events[0].session_id, amplitude.getInstance()._sessionId);
    });

    it('should be fetched correctly by getSessionId', function() {
      var timestamp = 1000;
      clock.tick(timestamp);
      var amplitude2 = new Amplitude();
      amplitude2.init(apiKey);
      assert.equal(amplitude2.getInstance()._sessionId, timestamp);
      assert.equal(amplitude2.getSessionId(), timestamp);
      assert.equal(amplitude2.getSessionId(), amplitude2.getInstance()._sessionId);
    });
  });
});
