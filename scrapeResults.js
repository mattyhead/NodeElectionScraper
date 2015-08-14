// testing election url
var //electionResultsWaybackUrl = 'https://web.archive.org/web/20110610093322/http://filter.phillyelectionresults.com/comprehensive.aspx',
  electionResultsStaticUrl = 'http://phillyelectionresults.com/Citywide_Election_Results.html',
  electionResultsFormUrl = 'http://filter.phillyelectionresults.com/comprehensive.aspx',
  //electionResultsTestUrl = 'http://whowon.fortuit.us/all_wards.html',
  electionResultsUrl = electionResultsFormUrl,
  outputFileName = 'results.json',
  LocalStorage = require('node-localstorage').LocalStorage,
  Fs = require("fs"),
  Events = require('events').EventEmitter,
  Nightmare = require('nightmare'),
  nm = new Nightmare(),
  Request = require('request'),
  wards=[],
  results=[],

/*   work out which wards are availableto pull,
  store wards for use
  uses: Nightmare, Events
*/
  getNavData = function() {
    nm
      .goto(electionResultsUrl)
      .evaluate(function(){
        var w = [];
        [].forEach.call(document.getElementById('cboGeography'), function(el, i) {
          w.push({id:el.index,value:el.innerText.trim()});
        });
        return w;
      },function(w) {
        wards=w;
      })
      .run(function(err, nightmare) {
        if (err) console.log("error:",err,'nightmare:',nightmare);
        else Emitter.emit('gotWards');
      });
  },

/*  pull an indivicual ward's votes
  uses: Nightmare
*/
  
  getResults = function() {
    var ward = wards.pop();
    nm
      .goto(electionResultsUrl)
      .type('#cboGeography',ward)
      .select('#cboGeography',ward.id)
      .wait()
      .click('input[name="btnNext"]')
      .wait()
      .evaluate(function() {
        // now we're executing inside the browser scope.
        var raceNames = document.querySelectorAll('form h3'),
          raceDetail = document.querySelectorAll('form table.results'),
          result = [],
          tempParty = '',
          raceType = '', // 'candidates', 'retentions', 'questions'
          tempProgress;

        for (var i = 0; i < raceNames.length; i++) {

          var tempProgress = raceNames[i].nextSibling.innerText,
            temp = raceNames[i].innerText.split(/-| |,/),
            tempParty = (['R','REP','REPUBLICAN'].indexOf(temp[temp.length-1].toUpperCase(),0) ===0 ? 'rep' : false ) || 
                  (['D','DEM','DEMOCRATIC'].indexOf(temp[temp.length-1].toUpperCase(),0) ===0 ? 'dem' : false ) ||
                  'all', // this is going to be dumped as part of a css selector

            temp = raceNames[i].innerText.split(/:/),
            tempRace = temp[temp.length-1].trim(),
            detail = [],
            firstColumnText = '',
            candidateQuery = raceDetail[i]; 
  
          if (tempProgress && tempProgress.indexOf('%')) {
            tempProgress = parseFloat(tempProgress.substring(0, tempProgress.indexOf('%')));
          }

          [].forEach.call(candidateQuery.querySelectorAll('tr'), function(el) {
            firstColumnText = el.firstChild.innerText;
            if ( ['Candidate Name', 'Decision'].indexOf(firstColumnText) < 0 ) {
              switch (raceNames[i].previousSibling.previousSibling.innerText.split(' ')[0]) {
                case 'Race': 
                  raceType = 'candidates';
                break;
                case 'Retention':
                  raceType = 'retentions';
                break;
                case 'Question':
                  raceType = 'questions';
                break;
              }

              switch (raceType) {
                case 'candidates':
                  detail.push({ // candidates
                    name: el.querySelectorAll('td')[0].innerText.replace(/[^\w\s\,\.]/gi, ''),
                    party: //el.querySelectorAll('td')[1].innerText.toUpperCase(),
                      (['R','REP','REPUBLICAN'].indexOf(el.querySelectorAll('td')[1].innerText.toUpperCase())>-1 ? 'rep' : false ) || 
                      (['D','DEM','DEMOCRATIC'].indexOf(el.querySelectorAll('td')[1].innerText.toUpperCase())>-1 ? 'dem' : false ) ||
                      'ind', // this is going to be dumped as part of a css selector
                    votes: parseInt(el.querySelectorAll('td')[2].innerText),
                    percentage: parseFloat(el.querySelectorAll('td')[3].innerText)
                  });
                break;
/*
                case 'retentions': // ignoring for now
                  detail.push({ // retentions
                    name: el.querySelectorAll('td')[0].innerText,
                    votes: parseInt(el.querySelectorAll('td')[1].innerText),
                    percentage: parseFloat(el.querySelectorAll('td')[2].innerText)
                  });
                break;
                case 'questions': // ignoring for now
                  detail.push({ // questions
                    name: el.querySelectorAll('td')[0].innerText,
                    votes: parseInt(el.querySelectorAll('td')[1].innerText),
                    percentage: parseFloat(el.querySelectorAll('td')[2].innerText)
                  });
                break;
*/
              }
            }
          });
          if (raceType === 'candidates') { // ignoring retentions and questions for now
            result.push({
              race: tempRace,
              progress: tempProgress,
              party: tempParty,
              candidates: detail
            });
          }
        }
        return result;
      },function(result) {
        var obj = {};
        obj[ward.value] = result;
        results.push(obj);
      })
      .run(function(err, nightmare) {
        if (err) console.log("error:",err,'nightmare:',nightmare);

        // If we still have wards to get results for call getResults again
        if (wards.length) {
          getResults();
        } else {
          Emitter.emit('gotVotes');
        }
      });
  },

/* 
  init
  uses Events, Fs
*/
  init = function() {

    Request.head(electionResultsStaticUrl, function(error, response, body) {
      var localStorage = new LocalStorage('./scratch'),
        lastModifiedDate = new Date(response.headers['last-modified']), // only exists on static page, so use 'electionResultsStaticUrl' on request.head ^
        lastRunDate = new Date(localStorage.getItem('lastRunDate'));

      // _______________ EVENTS
      Emitter.on('gotWards', getResults);
      
      // check if results are complete, store if so
      Emitter.on('gotVotes', function(){
        var toWrite={};toWrite.results={};
        results.forEach(function(result){
          for (var ward in result) {
            toWrite.results[ward] = result[ward];
          }
        });
        // Eenh, I thought this might be nice to have, but I haven't done diddly with it.
//          toWrite.index=wards;
        toWrite.lastModifiedDate=lastModifiedDate;
        Fs.writeFile(outputFileName, JSON.stringify(toWrite), "utf8", function() {
          console.log('Complete results are in...', 'wards: ' + wards.length, 'results: ' + results.length);
          localStorage.setItem('lastRunDate', lastModifiedDate);
          var scp = require('scp2'),
            config = require('./config');

          scp.scp(
            "results.json",config.uname+":"+config.password+"@"+config.domainname+":"+config.path,
            function(err) {
              if (err) console.log(err);
                else console.log('File transferred.')  
            }
          );
        });
      });

      console.log('Last Run Date: ', lastRunDate);
      console.log('Last Modified Date: ', lastModifiedDate);

      // get the ball rolling, by checking on the published wards fro this election
      if (lastRunDate < lastModifiedDate) {
        console.log('Running Update');
        getNavData();
      }
    });
  },

  // our actual emitter
  Emitter = new Events();

init();
