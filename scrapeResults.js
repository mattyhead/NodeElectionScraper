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
	Request = require('request'),
	wards=[],
	results=[],

/* 	work out which wards are availableto pull,
	store wards for use
	uses: Nightmare, Events
*/
	getNavData = function() {
		new Nightmare()
			.goto(electionResultsUrl)
			.evaluate(function(){
				var w = [];
				[].forEach.call(document.getElementById('cboGeography'), function(el) {
					w.push(el.innerText.trim());
				});
				return w;
			},function(w) {
				wards=w;
				Emitter.emit('gotWards');
			})
			.run(function(err, nightmare) {
				if (err) console.log("error:",err,'nightmare:',nightmare);
			});
	},

/*	pull an indivicual ward's votes
	uses: Nightmare
*/
	getResult = function(callback, ward) {
		new Nightmare()
			.goto(electionResultsUrl)
	     	.type('#cboGeography',ward)
			.wait()
			.click('input[name="btnNext"]')
			.wait()
			.evaluate(function() {
				// now we're executing inside the browser scope.
				var raceRows = document.querySelectorAll('form h3'),
					result = [],
					tempParty = '',
					raceType = '', // 'candidates', 'retentions', 'questions'
					tempProgress;
	
				for (var i = 0; i < raceRows.length; i++) {
	
					var tempProgress = raceRows[i].nextSibling.innerText,
						temp = raceRows[i].innerText.split(/-| |,/),
						tempParty = (['R','REP','REPUBLICAN'].indexOf(temp[temp.length-1].toUpperCase(),0) ===0 ? 'rep' : false ) || 
									(['D','DEM','DEMOCRATIC'].indexOf(temp[temp.length-1].toUpperCase(),0) ===0 ? 'dem' : false ) ||
									'all',
	
						temp = raceRows[i].innerText.split(/:/),
						tempRace = temp[temp.length-1].trim(),
						detail = [],
						firstColumnText = '',
						// candidates and retentions
						candidateQuery = raceRows[i].nextSibling.nextSibling.nextSibling.nextSibling.nextSibling.nextSibling; 
						// if none, this is a question
						candidateQuery= (candidateQuery.querySelectorAll('tr').length === 0) ? candidateQuery.nextSibling : candidateQuery;
	
					if (tempProgress && tempProgress.indexOf('%')) {
						tempProgress = parseFloat(tempProgress.substring(0, tempProgress.indexOf('%')));
					}
	
					[].forEach.call(candidateQuery.querySelectorAll('tr'), function(el) {
						firstColumnText = el.firstChild.innerText;
						if ( ['Candidate Name', 'Decision'].indexOf(firstColumnText) < 0 ) {
							switch (raceRows[i].previousSibling.previousSibling.innerText.split(' ')[0]) {
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
											'ind',
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
				if (callback) {
					callback(result);
				}
			})
			.run(function(err, nightmare) {
				if (err) console.log("error:",err,'nightmare:',nightmare);
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
			// im only definning these in here because I'd rather die than add *another* global, just to get a date in the final file.
			// once we have wards, go get results
			Emitter.on('gotWards', 
				function (){
					wards.forEach(function (ward){
						getResult(function(result) {
							var obj = {};
							obj[ward] = result;
							results.push(obj);
							Emitter.emit('gotVotes');
						},ward)
					});
				}
			);
			
			// check if results are complete, store if so
			Emitter.on('gotVotes', function(){
				var toWrite={};toWrite.results={};
				if (results.length === wards.length){
					// we have one set of results per ward, write the file.
					results.forEach(function(result){
						for (var ward in result) {
							toWrite.results[ward] = result[ward];
						}
					});
					// Eenh, I thought this might be nice to have, but I haven't done diddly with it.
//					toWrite.index=wards;
					toWrite.lastModifiedDate=lastModifiedDate;
					Fs.writeFile(outputFileName, JSON.stringify(toWrite), "utf8", function() {
						console.log('Complete results are in...', 'wards: ' + wards.length, 'results: ' + results.length);
						localStorage.setItem('lastRunDate', lastModifiedDate);
						var scp = require('scp2'),
							config = require('./config');
							console.log(config,config.uname+":"+config.password+"@"+config.domainname+":"+config.path);
						scp.scp(
							"results.json",config.uname+":"+config.password+"@"+config.domainname+":"+config.path,
							function(err) {
								if (err) console.log(err);
  								else console.log('File transferred.')	
							}
						);
					});
				} else {
					// nothing to do yet.  Say so.
					console.log('Results in, but not complete yet...', 'wards: ' + wards.length, 'results: ' + results.length);
				}
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
