var libs = {};
var loadedModules = {};

['child_process', 'http', 'https', 'url', 'querystring', 'needle'].forEach((lib) => {
  Object.defineProperty(libs, lib, {
    get: function() {
      if (!loadedModules[lib]) {
        loadedModules[lib] = require(lib);
      }
      return loadedModules[lib];
    }
  });
});

global.HerokuClient = {
  app_id: 'da22247b-a5b0-498e-8110-5812d65f74c3',
  secret: '76358182-8fbc-40c7-81b8-9f5d3a6c6673',
  apiUrl: 'https://api.heroku.com',

  makeAuthUrl: function () {
    var url = 'https://id.heroku.com/oauth/authorize?client_id={app_id}&response_type=code&scope=global&state={rand}';
    return url.replace('{app_id}', this.app_id).replace('{rand}', new Date().getTime().toString());
  },

  setRequestToken: function (value) {
    window.localStorage.herokuRequestToken = value;
  },

  getRequestToken: function () {
    return window.localStorage.herokuRequestToken;
  },

  clearRequestToken: function () {
    delete window.localStorage.herokuRequestToken;
  },

  getAccessToken: function () {
    if (window.localStorage.herokuAccessToken) {
      var token = JSON.parse(window.localStorage.herokuAccessToken);

      // check if token expired
      var expiresAt = new Date(Date.parse(token.createdAt) + token.expires_in * 1000);
      if (new Date() > expiresAt) {
        this.clearAccessToken();
        return false;
      }

      return token;
    } else {
      return false;
    }
  },

  setAccessToken: function (accessToken) {
    accessToken.createdAt = new Date;
    return window.localStorage.herokuAccessToken = JSON.stringify(accessToken);
  },

  clearAccessToken: function () {
    delete window.localStorage.herokuAccessToken;
  },

  auth: function (callback, options) {
    if (!options) options = {};
    //console.log('auth started');
    options.onAccessTokenStart && options.onAccessTokenStart();
    this.fetchRequestToken(() => {
      options.onAccessTokenDone && options.onAccessTokenDone()
      options.onRequestTokenStart && options.onRequestTokenStart()
      //console.log('got request token ' + _this.getRequestToken());
      this.fetchAccessToken(() => {
        options.onRequestTokenDone && options.onRequestTokenDone()
        console.log(this.getAccessToken());
        callback();
      }, options);
    }, options);
  },

  authAndGetApps: function(callback, options) {
    this.auth(() => {
      options.onGetAppsStarted && options.onGetAppsStarted();
      this.getApps((apps) => {
        if (apps.id == 'unauthorized') {
          if (options.retry) {
            callback([]);
            return;
          }
          options.retry = true;
          this.clearRequestToken();
          this.clearAccessToken();
          this.auth(() => {
            this.authAndGetApps(callback, options);
          }, options);
        } else {
          options.onGetAppsDone && options.onGetAppsDone();
          callback(apps)
        }
      });
    }, options);
  },

  fetchRequestToken: function(callback) {
    if (this.getRequestToken()) {
      callback();
    } else {
      var url = this.makeAuthUrl();
      if (this.catcher) this.catcher.stop();
      this.catcher = new HerokuCatcher(() => {
        electron.remote.app.mainWindow.focus();
        callback();
      });
      this.catcher.start();
      console.log("Opening url " + url);
      electron.remote.shell.openExternal(url);
      //libs.child_process.spawn('open', [url]);
    }
  },

  fetchAccessToken: function (callback, callbackOoptions) {
    if (this.getAccessToken()) {
      callback();
    } else {
      var params = {
        grant_type: 'authorization_code',
        code: this.getRequestToken(),
        client_secret: this.secret
      };

      var options = { ssl: true, timeout: 30 * 1000 };
      console.log("POST", 'https://id.heroku.com/oauth/token', libs.querystring.stringify(params));

      libs.needle.post('https://id.heroku.com/oauth/token', params, options, (err, resp) => {
        console.log(err, resp);
        if (resp.body.id == "unauthorized") {
          this.clearRequestToken();
          this.auth(() => {
            this.fetchAccessToken(callback);
          }, callbackOoptions);
        } else {
          this.setAccessToken(resp.body);
          callback();
        }
      });
    }
  },

  getApps: function (callback) {
    this.getApiData('/apps', callback);
  },

  getAddons: function (app_id, callback) {
    this.getApiData('/apps/' + app_id + '/addons', callback);
  },

  getConfigVars: function (app_id, callback) {
    this.getApiData('/apps/' + app_id + '/config-vars', callback);
  },

  getDatabaseUrl: function(app_id, callback) {
    this.getConfigVars(app_id, (data) => {
      callback(data['DATABASE_URL']);
    });
  },

  getApiData: function (uri, callback) {
    var token = this.getAccessToken();
    var options = {
      ssl: true,
      timeout: 30 * 1000,
      headers: {
        'Authorization': [token.token_type, token.access_token].join(" "),
        'Accept': 'application/vnd.heroku+json; version=3'
      }
    };
    var url = this.apiUrl + uri;
    console.log("GET " + url, options);
    libs.needle.get(url, options, (err, resp) => {
      //console.log('response', err, resp);
      if (resp) {
        callback ? callback(resp.body) : console.log(resp.body);
      } else {
        callback && callback();
      }
    });
  },
};

class HerokuCatcher {

  constructor (doneCallback) {
    this.isRunning = false;
    this.doneCallback = doneCallback;
    this.server = libs.http.createServer((request, response) => {
      //console.dir(request);

      var parsed = libs.url.parse(request.url);
      var query = libs.querystring.parse(parsed.query);
      //console.log(query.code);
      HerokuClient.setRequestToken(query.code);
      this.doneCallback();

      response.writeHead(200, {"Content-Type": "text/html"});
      response.end("<script type='text/javascript'>window.close();</script>");

      setTimeout(() => {
        this.stop();
      }, 100);
    });
  }

  start () {
    this.isRunning = true;
    console.log('server started at http://localhost:12001/');
    this.server.listen(12001);
  }

  stop () {
    if (this.isRunning) {
      console.log("Stopping server");
      this.server.close();
      this.isRunning = false;
    }
  }
}

global.HerokuCatcher = HerokuCatcher;
