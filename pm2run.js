var pm2 = require('pm2');
setInterval(function() {
    pm2.connect(function() {
      pm2.start({
        script    : 'scrapeResults.js',         // Script to be run
        exec_mode : 'cluster',        // Allow your app to be clustered
      }, function(err, apps) {
        console.log(err, apps);
        pm2.disconnect();
      });
    });
}, 180000);
